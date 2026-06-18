import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    LAB_PARTICIPANTS,
    allocateSeat,
    bumpPeakParticipants,
    getLabSessionById,
    labParticipantRef,
    labPolicyFromSession,
    labSessionRef,
    resolveClassLabRole,
    sanitizeDisplayName,
} from "@/lib/server/labStore";
import { mintLabToken, getLiveKitWsUrl } from "@/lib/server/livekit";
import { rateLimit } from "@/lib/server/ratelimit";
import type { LabTokenResponse } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lab/token — mint a LiveKit access token for the caller to join a
 * session's room. THE security choke point of the media plane:
 *
 *   1. Verify the bearer token (requireVerifiedUser).
 *   2. Load the session; it must exist and be `live`.
 *   3. Re-resolve the caller's role from class membership (owner/subject
 *      teacher → teacher; active enrollment → student). NEVER trust a role
 *      from the body — this runs on every join so a revoked enrollment can't
 *      keep minting tokens.
 *   4. Upsert the participant roster row (seat held across rejoins; identity =
 *      Firebase uid) — the durable mirror of who's in the room.
 *   5. Sign a role-derived grant and return LabTokenResponse.
 *
 * Body: LabTokenRequest = { sessionId: string }
 */
export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        // Throttle mint: each call does several Firestore reads + a full roster
        // scan + a JWT sign, so an un-throttled client could turn /token into a
        // cost/DoS lever. A generous per-user budget still allows normal
        // join/rejoin/reconnect churn. Fail-open (Redis down → allowed).
        const rl = await rateLimit("lab-token", auth.userId, {
            limit: 12,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: "You're joining too frequently. Please wait a moment.", code: "rate_limited" },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        const body = await req.json().catch(() => ({}));
        const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
        }

        const session = await getLabSessionById(sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }
        if (session.status !== "live") {
            // No token for a scheduled (not yet open) or ended (torn down) room.
            return NextResponse.json(
                { error: "This session is not live." },
                { status: 409 }
            );
        }

        // Re-resolve role from membership of the session's class on EVERY call.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }
        const role = resolved.role;

        // Display name: prefer the user's profile name, fall back to email
        // local-part, then a short uid. Denormalised onto the roster row so the
        // live map renders without N user reads. The profile fields are
        // user-controlled, so sanitize (strip control/bidi chars, cap length)
        // before it lands on the roster, the token, and the analytics rows;
        // fall back to a server-generated uid label when nothing usable remains.
        const userSnap = await adminDb.collection("users").doc(auth.userId).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const displayName: string =
            sanitizeDisplayName(
                userData.displayName ||
                    userData.name ||
                    (typeof userData.email === "string" ? userData.email.split("@")[0] : "")
            ) || `User ${auth.userId.slice(0, 6)}`;

        // Upsert the participant roster row. A returning participant keeps their
        // seat + joinedAt; a first-timer gets a fresh seat and a `join` stamp.
        const partRef = labParticipantRef(sessionId, auth.userId);
        const partSnap = await partRef.get();
        const now = Timestamp.now();

        if (partSnap.exists) {
            // Rejoin: refresh role (membership may have changed tier) + clear any
            // stale leftAt, but preserve the held seat and original joinedAt.
            await partRef.set(
                {
                    role,
                    displayName,
                    leftAt: null,
                    updatedAt: now,
                },
                { merge: true }
            );
        } else {
            const seat = await allocateSeat(sessionId, role);
            await partRef.set({
                uid: auth.userId,
                sessionId,
                role,
                displayName,
                seat,
                status: "on_task",
                sharingTo: [],
                handRaisedAt: null,
                joinedAt: now,
                createdAt: now,
                updatedAt: now,
            });
        }

        // Update the peak-participants high-water mark from the live roster size.
        const rosterSnap = await labSessionRef(sessionId)
            .collection(LAB_PARTICIPANTS)
            .get();
        const liveCount = rosterSnap.docs.filter((d) => !d.data()?.leftAt).length;
        await bumpPeakParticipants(sessionId, liveCount);

        // Mint the token with grants derived from the resolved role AND the
        // server-side session policy. The policy pins the student's publishable
        // sources to an explicit allow-list (the seam moderation narrows); it is
        // read off the same session doc the room metadata was stamped from, so
        // the grant and the SFU metadata never disagree. The SFU identity is the
        // Firebase uid so the roster row and the LiveKit participant line up 1:1.
        const token = await mintLabToken({
            room: session.livekitRoom,
            identity: auth.userId,
            name: displayName,
            role,
            policy: labPolicyFromSession(session),
            metadata: { sessionId, role },
        });

        const response: LabTokenResponse = {
            token,
            url: getLiveKitWsUrl(),
            role,
            identity: auth.userId,
            room: session.livekitRoom,
        };
        return NextResponse.json(response);
    } catch (error: any) {
        console.error("Mint lab token failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to mint token" },
            { status: 500 }
        );
    }
}
