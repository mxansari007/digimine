import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { assertClassTeacher } from "@/lib/server/classes";
import { resolveClassLabRole } from "@/lib/server/labStore";
import {
    LAB_SESSIONS,
    serializeLabSession,
} from "@/lib/server/labStore";
import { createLabRoom } from "@/lib/server/livekit";
import { LAB_LIMITS, type LabSessionSettings } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short, URL-safe room suffix so two sessions in the same class never collide
 * on the LiveKit room name. Lower-case alnum keeps the room name clean.
 */
function shortId(len = 6): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
}

/** Coerce the optional settings payload into the boolean-only contract shape. */
function parseSettings(raw: any): LabSessionSettings {
    const s = raw && typeof raw === "object" ? raw : {};
    return {
        // Peer share + chat default ON; auto-record defaults OFF (consent-first).
        allowPeerShare: s.allowPeerShare !== false,
        allowChat: s.allowChat !== false,
        autoRecord: s.autoRecord === true,
    };
}

/**
 * POST /api/lab/sessions — a teacher starts a lab session for one of their
 * classes. Verifies the caller is the class teacher (owner or assigned subject
 * teacher), provisions the LiveKit room, and writes the `labSessions` doc
 * straight to `live` (v1 is "start now"; the scheduled→open split lands with
 * the teacher control panel).
 *
 * Body: { classId: string, title?: string, settings?: LabSessionSettings }
 */
export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const body = await req.json().catch(() => ({}));
        const classId = typeof body.classId === "string" ? body.classId.trim() : "";
        if (!classId) {
            return NextResponse.json({ error: "classId is required." }, { status: 400 });
        }

        // Only the class teacher (owner OR assigned subject teacher) may open a
        // lab. assertClassTeacher re-reads the class doc and checks ownership.
        const owner = await assertClassTeacher(req, classId);
        if (!owner.ok) {
            return NextResponse.json({ error: owner.error }, { status: owner.status });
        }
        // Per-class opt-in: a class can only host a lab if its teacher enabled it.
        if (owner.classDoc?.labEnabled !== true) {
            return NextResponse.json(
                { error: "Virtual Lab is not enabled for this class. Enable it in class settings first." },
                { status: 403 }
            );
        }

        const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
        const title =
            (rawTitle || `${owner.classDoc?.name || "Lab"} session`).slice(
                0,
                LAB_LIMITS.titleMaxLength
            );
        const settings = parseSettings(body.settings);

        const now = Timestamp.now();
        const ref = adminDb.collection(LAB_SESSIONS).doc();
        // Room name like lab_<classId>_<short> — stable for the session's life
        // and what the minted token is scoped to.
        const livekitRoom = `lab_${classId}_${shortId()}`;

        // Provision the LiveKit room up front so capacity/empty-timeout are
        // pinned AND the session policy is stamped into the room metadata. The
        // room metadata is the SERVER-AUTHORITATIVE home of the peer-share /
        // chat gate: every client reads it off the SFU (incl. late joiners),
        // and only the server can change it (PATCH ?settings → updateRoomMetadata).
        // Best-effort: if LiveKit isn't configured or the create fails, surface
        // a clear 502 rather than persisting an unusable session.
        try {
            await createLabRoom({
                room: livekitRoom,
                maxParticipants: LAB_LIMITS.maxParticipants,
                policy: {
                    allowPeerShare: settings.allowPeerShare,
                    allowChat: settings.allowChat,
                },
            });
        } catch (e: any) {
            console.error("LiveKit room provision failed:", e);
            return NextResponse.json(
                { error: e?.message || "Could not start the live room. Try again." },
                { status: 502 }
            );
        }

        const data = {
            classId,
            teacherId: owner.teacherId,
            title,
            status: "live" as const,
            livekitRoom,
            startedAt: now,
            settings,
            stats: { peakParticipants: 0 },
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);

        return NextResponse.json(
            { session: serializeLabSession({ id: ref.id, ...data }) },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Create lab session failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to start session" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/lab/sessions?classId=... — list a class's lab sessions, live first
 * then most-recent. Visible to any class member (teacher or actively-enrolled
 * student); membership is resolved via `resolveClassLabRole`.
 */
export async function GET(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const url = new URL(req.url);
        const classId = (url.searchParams.get("classId") || "").trim();
        if (!classId) {
            return NextResponse.json({ error: "classId is required." }, { status: 400 });
        }

        // Class-membership gate: teacher or enrolled student of this class only.
        const resolved = await resolveClassLabRole(classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        const snap = await adminDb
            .collection(LAB_SESSIONS)
            .where("classId", "==", classId)
            .orderBy("startedAt", "desc")
            .limit(50)
            .get();

        const sessions = snap.docs
            .map((d) => serializeLabSession(d))
            .filter(Boolean) as ReturnType<typeof serializeLabSession>[];
        // Live sessions float to the top; the rest stay newest-first by startedAt.
        sessions.sort((a, b) => {
            const aLive = a!.status === "live" ? 0 : 1;
            const bLive = b!.status === "live" ? 0 : 1;
            return aLive - bLive;
        });

        return NextResponse.json({ sessions, role: resolved.role });
    } catch (error: any) {
        console.error("List lab sessions failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to list sessions" },
            { status: 500 }
        );
    }
}
