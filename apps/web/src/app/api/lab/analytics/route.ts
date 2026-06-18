import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveClassLabRole } from "@/lib/server/labStore";
import { computeClassAnalytics } from "@/lib/server/labAnalytics";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/analytics?classId=... — the teacher "Lab insights" roll-up across
 * a class's lab sessions, folded on-read from each session's events + roster (no
 * persisted analytics, no new writes).
 *
 * TEACHER-ONLY. Like the single-session analytics, this exposes every student's
 * engagement so it requires the `teacher` role for the class — a student gets
 * 403 (students read their own figures via /api/lab/gamification instead). Gate
 * mirrors the sibling lab routes: verify token → require classId → resolve role
 * (403 unless teacher).
 *
 * Returns: {
 *   sessions: LabSessionAnalytics[]  // newest first
 *   students: LabStudentStats[]      // class-summed per-student totals
 *   role: "teacher"
 * }
 */
export async function GET(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json(
                { error: auth.error, code: auth.code },
                { status: auth.status }
            );
        }

        const url = new URL(req.url);
        const classId = (url.searchParams.get("classId") || "").trim();
        if (!classId) {
            return NextResponse.json({ error: "classId is required." }, { status: 400 });
        }

        // C1: throttle the class-wide fold (up to 200 sessions × roster+events
        // per call, recomputed every request). Keyed per caller+class. Fail-open
        // if Redis is down.
        const rl = await rateLimit("lab-analytics", `${auth.userId}:${classId}`, {
            limit: 20,
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

        // Teacher-only gate on the class.
        const resolved = await resolveClassLabRole(classId, auth.userId);
        if (!resolved || resolved.role !== "teacher") {
            return NextResponse.json(
                { error: "Only the class teacher can view lab insights." },
                { status: 403 }
            );
        }

        const { sessions, students } = await computeClassAnalytics(classId);
        return NextResponse.json({ sessions, students, role: resolved.role });
    } catch (error: any) {
        console.error("Lab class analytics failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load lab analytics" },
            { status: 500 }
        );
    }
}
