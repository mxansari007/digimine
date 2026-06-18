import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    getLabSessionById,
    labPolicyFromSession,
    labSessionRef,
    resolveClassLabRole,
    serializeLabSession,
} from "@/lib/server/labStore";
import { deleteLabRoom, updateLabRoomMetadata } from "@/lib/server/livekit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/sessions/[sessionId] — fetch one session. Visible to any member
 * of the session's class (teacher or actively-enrolled student); the caller's
 * resolved `role` is returned alongside so the client knows what it may do.
 */
export async function GET(
    req: Request,
    { params }: { params: { sessionId: string } }
) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const session = await getLabSessionById(params.sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Gate on membership of the session's class.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        return NextResponse.json({
            session: serializeLabSession(session),
            role: resolved.role,
        });
    } catch (error: any) {
        console.error("Get lab session failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load session" },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/lab/sessions/[sessionId] — teacher-only session control. Teacher
 * means the session's `teacherId` or a teacher of the class (resolveClassLabRole
 * → 'teacher'). Two actions:
 *
 *   { action: 'end' } — end the session: transition to `ended`, stamp `endedAt`,
 *      and tear down the LiveKit room (best-effort — an already-gone room is not
 *      surfaced as an error).
 *   { action: 'settings', settings: { allowPeerShare?, allowChat? } } — flip the
 *      live policy mid-session. Merges the boolean(s) onto the session doc AND
 *      re-stamps the SERVER-AUTHORITATIVE room metadata so the new gate reaches
 *      every connected client (incl. late joiners) via RoomMetadataChanged
 *      WITHOUT re-minting tokens. Only valid while the session is `live`.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { sessionId: string } }
) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const session = await getLabSessionById(params.sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Teacher-only: must resolve to the `teacher` role for this class. This
        // is the choke point for BOTH actions — a student can never end a
        // session nor flip its policy.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved || resolved.role !== "teacher") {
            return NextResponse.json(
                { error: "Only the class teacher can change this session." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const action = typeof body.action === "string" ? body.action : "end";
        if (action !== "end" && action !== "settings") {
            return NextResponse.json(
                { error: "Unsupported action. Use 'end' or 'settings'." },
                { status: 400 }
            );
        }

        // ── settings: flip the live policy + re-stamp room metadata ─────────
        if (action === "settings") {
            // Only meaningful on a live session; an ended room is torn down.
            if (session.status !== "live") {
                return NextResponse.json(
                    { error: "Settings can only be changed while the session is live." },
                    { status: 409 }
                );
            }
            const raw =
                body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
                    ? (body.settings as Record<string, unknown>)
                    : {};
            // Start from the session's current policy and only override the
            // booleans explicitly supplied (so a partial PATCH doesn't reset the
            // other toggle). autoRecord is not flippable here (recording is its
            // own consent-gated flow) — we never touch it.
            const current = labPolicyFromSession(session);
            const nextPolicy = {
                allowPeerShare:
                    typeof raw.allowPeerShare === "boolean"
                        ? raw.allowPeerShare
                        : current.allowPeerShare,
                allowChat:
                    typeof raw.allowChat === "boolean" ? raw.allowChat : current.allowChat,
            };

            const now = Timestamp.now();
            await labSessionRef(params.sessionId).set(
                {
                    settings: {
                        allowPeerShare: nextPolicy.allowPeerShare,
                        allowChat: nextPolicy.allowChat,
                    },
                    updatedAt: now,
                },
                { merge: true }
            );

            // Push the new policy to the live SFU room so every client picks it
            // up immediately. Best-effort: a metadata write to a room the SFU has
            // already reclaimed shouldn't fail the settings write that already
            // landed in Firestore (the next token mint re-stamps it anyway).
            try {
                await updateLabRoomMetadata(session.livekitRoom, nextPolicy);
            } catch (e: any) {
                console.warn("LiveKit room metadata update (non-fatal):", e?.message || e);
            }

            const updated = await getLabSessionById(params.sessionId);
            return NextResponse.json({ session: serializeLabSession(updated) });
        }

        // ── end: close the session + tear down the room ─────────────────────
        // Already ended → return the current state idempotently.
        if (session.status === "ended") {
            return NextResponse.json({ session: serializeLabSession(session) });
        }

        const now = Timestamp.now();
        await labSessionRef(params.sessionId).set(
            { status: "ended", endedAt: now, updatedAt: now },
            { merge: true }
        );

        // Tear down the LiveKit room so everyone is disconnected and billing
        // stops. Best-effort — never fail the end-session call on a room that's
        // already been reclaimed by the SFU.
        try {
            await deleteLabRoom(session.livekitRoom);
        } catch (e: any) {
            console.warn("LiveKit room teardown (non-fatal):", e?.message || e);
        }

        const updated = await getLabSessionById(params.sessionId);
        return NextResponse.json({ session: serializeLabSession(updated) });
    } catch (error: any) {
        console.error("Patch lab session failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to update session" },
            { status: 500 }
        );
    }
}
