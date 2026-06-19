import { NextResponse } from "next/server";
import {
    getLabSessionById,
    labPolicyFromSession,
    sanitizeDisplayName,
} from "@/lib/server/labStore";
import { redeemPairingCode } from "@/lib/server/labAgentPairing";
import { mintLabToken, getLiveKitWsUrl } from "@/lib/server/livekit";
import { rateLimit, clientIp } from "@/lib/server/ratelimit";
import { labAgentIdentity } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lab/agent/pair — the installable desktop agent redeems a pairing
 * code (PUBLIC: the agent has no Firebase login; the code IS the bearer of
 * trust). On success it mints a short-lived LiveKit token for the student's
 * DESKTOP-AGENT identity (`<uid>__agent`, a distinct participant from their
 * browser) with the student grant, so the agent can join the room + publish the
 * desktop and the teacher can view/control it.
 *
 * Body: { code: string }
 * Returns: { token, url, room, identity, role, sessionId, studentUid, studentName }
 *
 * Security: the code is single-use + 10-min TTL (redeemPairingCode burns it in a
 * transaction); rate-limited by IP to defang brute force; the agent identity +
 * grant are derived SERVER-side from the code's bound { sessionId, studentUid },
 * never from the request.
 */
export async function POST(req: Request) {
    try {
        const rl = await rateLimit("lab-agent-pair", clientIp(req), {
            limit: 20,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many attempts. Please wait a moment.", code: "rate_limited" },
                { status: 429, headers: { "Retry-After": "15" } }
            );
        }

        const body = await req.json().catch(() => ({}));
        const code = typeof body.code === "string" ? body.code : "";

        let redeemed: { sessionId: string; studentUid: string; studentName: string };
        try {
            redeemed = await redeemPairingCode(code);
        } catch (e: any) {
            // Invalid / used / expired → 400 with the friendly reason.
            return NextResponse.json(
                { error: e?.message || "That pairing code is invalid or has expired." },
                { status: 400 }
            );
        }

        const session = await getLabSessionById(redeemed.sessionId);
        if (!session) {
            return NextResponse.json({ error: "The lab session no longer exists." }, { status: 404 });
        }
        if (session.status !== "live") {
            return NextResponse.json(
                { error: "The lab session has ended." },
                { status: 409 }
            );
        }

        const identity = labAgentIdentity(redeemed.studentUid);
        // Re-sanitize the redeemed name before it lands on the token's display
        // name — strip control / zero-width / bidi chars, collapse, hard-cap.
        const displayName = sanitizeDisplayName(redeemed.studentName);
        const token = await mintLabToken({
            room: session.livekitRoom,
            identity,
            name: displayName,
            // The desktop agent publishes the student's screen + handles control —
            // the student grant (publish cam/screen + data, no admin) is exactly right.
            role: "student",
            policy: labPolicyFromSession(session),
            // Mark this as the agent presence so clients can label/route it.
            metadata: {
                sessionId: redeemed.sessionId,
                role: "student",
                agent: true,
                studentUid: redeemed.studentUid,
            },
        });

        return NextResponse.json({
            token,
            url: getLiveKitWsUrl(),
            role: "student" as const,
            identity,
            room: session.livekitRoom,
            sessionId: redeemed.sessionId,
            studentUid: redeemed.studentUid,
            studentName: redeemed.studentName,
        });
    } catch (error: any) {
        console.error("Agent pair failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to pair the device" },
            { status: 500 }
        );
    }
}
