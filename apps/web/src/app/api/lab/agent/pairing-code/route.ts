import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    getLabSessionById,
    labParticipantRef,
    resolveClassLabRole,
} from "@/lib/server/labStore";
import { createPairingCode } from "@/lib/server/labAgentPairing";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lab/agent/pairing-code — a signed-in lab member mints a short-lived
 * pairing code so they can connect their installable desktop agent to THIS
 * session as their own desktop.
 *
 * Body: { sessionId: string }
 * Auth: Bearer <Firebase ID token>; caller must be a member of the session's
 *       class (resolveClassLabRole). The code is bound to { sessionId, callerUid }
 *       server-side, so a code can only ever pair the caller's own desktop.
 */
export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        // Throttle: a code mint is cheap but shouldn't be spammable.
        const rl = await rateLimit("lab-agent-code", auth.userId, {
            limit: 10,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many requests. Please wait a moment.", code: "rate_limited" },
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
            return NextResponse.json(
                { error: "This lab session isn't live." },
                { status: 409 }
            );
        }

        // Membership gate — only a member of the session's class may pair a device.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        // Label the agent presence with the member's display name (best-effort
        // from their roster row, set when they joined).
        let studentName = "Student";
        try {
            const partSnap = await labParticipantRef(sessionId, auth.userId).get();
            const dn = partSnap.exists ? partSnap.data()?.displayName : null;
            if (typeof dn === "string" && dn.trim()) studentName = dn.trim();
        } catch {
            /* best-effort label */
        }

        const { code, expiresInSec } = await createPairingCode(
            sessionId,
            auth.userId,
            studentName
        );
        return NextResponse.json({ code, expiresInSec });
    } catch (error: any) {
        console.error("Create pairing code failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to create a pairing code" },
            { status: 500 }
        );
    }
}
