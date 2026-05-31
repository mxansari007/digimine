/**
 * GET /api/cron/ai-interview/reap
 *
 * Periodic sweep that transitions stale AI-interview sessions — abandoned
 * `in_progress` (browser closed mid-interview) and no-show `scheduled`
 * bookings — to free the slot capacity they hold and (for bookings) refund the
 * weekly quota. Per-user lazy reaping already keeps each student's own gating
 * correct on every entry point; this cron just self-heals the GLOBAL slot
 * counts for users who never come back.
 *
 * Auth: Vercel cron Bearer `CRON_SECRET` (same pattern as cron/search/reindex).
 * Idempotent — re-running only acts on sessions still past their expiry.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSchedulingConfig, reapAllStale } from "@/lib/server/aiInterviewScheduling";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        return NextResponse.json({ error: "Cron secret not configured." }, { status: 503 });
    }
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${expected}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const cfg = await getSchedulingConfig();
        const reaped = await reapAllStale(cfg);
        const result = { reaped };
        console.log("[cron/ai-interview/reap]", JSON.stringify(result));
        return NextResponse.json(result);
    } catch (error) {
        const e = error as Error;
        console.error("[cron/ai-interview/reap] failed:", e);
        return NextResponse.json({ error: e.message || "Reap failed" }, { status: 500 });
    }
}
