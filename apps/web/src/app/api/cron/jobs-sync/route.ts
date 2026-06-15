/**
 * GET /api/cron/jobs-sync
 *
 * Vercel Cron entrypoint — pulls the free job sources and upserts into
 * `jobOpenings`. Same auth pattern as the search reindex cron: the request
 * carries `Authorization: Bearer <CRON_SECRET>` (Vercel injects it). Locally,
 * set CRON_SECRET in .env.local and call with the matching header to test.
 * Idempotent (dedupes by source:externalId), so replays are safe.
 */
import { NextRequest, NextResponse } from "next/server";
import { syncJobOpenings } from "@/lib/server/jobs/sync";

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
        const result = await syncJobOpenings();
        console.log("[cron/jobs-sync]", JSON.stringify(result));
        return NextResponse.json(result);
    } catch (error) {
        console.error("[cron/jobs-sync] failed:", error);
        const message = error instanceof Error ? error.message : "Sync failed.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
