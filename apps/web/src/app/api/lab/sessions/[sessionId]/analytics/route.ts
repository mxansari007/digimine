import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { getLabSessionById, resolveClassLabRole } from "@/lib/server/labStore";
import { computeSessionAnalytics } from "@/lib/server/labAnalytics";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/sessions/[sessionId]/analytics — the teacher "Lab insights"
 * drill-down for ONE session, folded on-read from that session's events +
 * participant roster (no persisted analytics, no new writes).
 *
 * TEACHER-ONLY. The per-student breakdown reveals every learner's engagement,
 * so unlike the membership-gated sessions/recordings reads this requires the
 * `teacher` role for the session's class — a student gets 403. Gate order
 * mirrors the sibling `[sessionId]` route: verify token → load session (404 if
 * gone) → resolve role on the session's `classId` (403 unless teacher).
 *
 * Returns: { analytics: LabSessionAnalytics, role: "teacher" }
 */
export async function GET(
    req: Request,
    { params }: { params: { sessionId: string } }
) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json(
                { error: auth.error, code: auth.code },
                { status: auth.status }
            );
        }

        const sessionId = (params.sessionId || "").trim();
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
        }

        // C1: throttle the per-session fold (roster + full events log). Keyed per
        // caller+session. Fail-open if Redis is down.
        const rl = await rateLimit("lab-session-analytics", `${auth.userId}:${sessionId}`, {
            limit: 30,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                {
                    error: "You're refreshing too fast. Please wait a few seconds and try again.",
                    code: "rate_limited",
                },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        // Load the session first so we can gate on ITS class (the path carries no
        // classId). 404 when missing — never leak existence past the gate.
        const session = await getLabSessionById(sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Teacher-only: must resolve to `teacher` for the session's class.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved || resolved.role !== "teacher") {
            return NextResponse.json(
                { error: "Only the class teacher can view lab insights." },
                { status: 403 }
            );
        }

        const analytics = await computeSessionAnalytics(sessionId);
        if (!analytics) {
            // Re-check after the fold in case the doc vanished mid-request.
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        return NextResponse.json({ analytics, role: resolved.role });
    } catch (error: any) {
        console.error("Lab session analytics failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load session analytics" },
            { status: 500 }
        );
    }
}
