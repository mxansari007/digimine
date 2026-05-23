/**
 * POST /api/admin/search/reindex
 *
 * Manual rebuild — wired to the "Rebuild search index" button in the admin
 * Settings page. Verifies an admin / super_admin via Firebase ID token, then
 * runs the same `runFullReindex` the daily Vercel Cron does.
 *
 * Use this after a deploy, after a content batch publish, or whenever you
 * suspect the Meilisearch index is stale.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { corsPreflight, withCors } from "@/lib/server/adminCors";
import { isSearchConfigured } from "@/lib/server/meilisearch";
import { runFullReindex } from "@/lib/server/searchSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Preflight handler — required so cross-origin admin POSTs aren't rejected. */
export const OPTIONS = corsPreflight;

export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    // `requireAdmin` returns its own NextResponse on failure; wrap with CORS
    // so the admin browser actually receives the 401/403 instead of an opaque
    // network error.
    if (auth instanceof NextResponse) return withCors(req, auth);

    if (!isSearchConfigured()) {
        return withCors(
            req,
            NextResponse.json(
                { error: "Search is not configured. Set MEILISEARCH_URL and MEILISEARCH_MASTER_KEY." },
                { status: 503 }
            )
        );
    }

    try {
        const result = await runFullReindex();
        return withCors(req, NextResponse.json(result));
    } catch (error) {
        console.error("[search/reindex] failed:", error);
        const message = error instanceof Error ? error.message : "Reindex failed.";
        return withCors(req, NextResponse.json({ error: message }, { status: 500 }));
    }
}
