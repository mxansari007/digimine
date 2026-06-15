import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { syncJobOpenings } from "@/lib/server/jobs/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST — admin-triggered manual pull from the free job sources (same job the cron runs). */
export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const result = await syncJobOpenings();
        console.log("[admin/job-openings/sync]", JSON.stringify(result));
        return NextResponse.json(result);
    } catch (e: any) {
        console.error("[admin/job-openings/sync] failed:", e);
        return NextResponse.json({ error: e?.message || "Sync failed" }, { status: 500 });
    }
}
