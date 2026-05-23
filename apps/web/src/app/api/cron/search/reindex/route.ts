/**
 * GET /api/cron/search/reindex
 *
 * Vercel Cron entrypoint. Vercel hits this on the schedule defined in
 * `apps/web/vercel.json` (daily at 22:30 UTC = 4 AM IST). The request
 * carries `Authorization: Bearer <CRON_SECRET>` automatically — Vercel
 * generates the secret per project and injects it both into the cron
 * request and as an env var on the running function.
 *
 * Auth: verifies the bearer matches `CRON_SECRET`. Locally, you can set
 * `CRON_SECRET` in `.env.local` and call this endpoint with the matching
 * header to test the cron path without going through Vercel.
 *
 * Idempotent: runs the same `runFullReindex` the admin button uses, so a
 * double-fire or manual replay is safe.
 */
import { NextRequest, NextResponse } from "next/server";
import { isSearchConfigured } from "@/lib/server/meilisearch";
import { runFullReindex } from "@/lib/server/searchSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    // Vercel cron auth — see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        // No secret set → refuse rather than fail open. Either Vercel hasn't
        // provisioned the env yet, or someone removed it. Either way the
        // safer default is "don't run the unauthenticated rebuild".
        return NextResponse.json(
            { error: "Cron secret not configured." },
            { status: 503 }
        );
    }
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${expected}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSearchConfigured()) {
        return NextResponse.json(
            { error: "Search is not configured. Set MEILISEARCH_URL and MEILISEARCH_MASTER_KEY." },
            { status: 503 }
        );
    }

    try {
        const result = await runFullReindex();
        // Log to Vercel function logs so you can spot-check the cron in the
        // dashboard ("Functions" tab) without needing to query Meilisearch.
        console.log("[cron/search/reindex]", JSON.stringify(result));
        return NextResponse.json(result);
    } catch (error) {
        console.error("[cron/search/reindex] failed:", error);
        const message = error instanceof Error ? error.message : "Reindex failed.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
