/**
 * GET /api/search?q=...&type=...&limit=...
 *
 * Public search proxy in front of Meilisearch. The master key never leaves
 * this server route, so the browser only sees results — not credentials.
 *
 *   q     required, the user's query
 *   type  optional, one of article|problem|test|quiz|contest|course|product
 *         (omit for "everything")
 *   limit optional, capped at 20
 *
 * Returns:
 *   { hits: [{id, type, title, description, url, ...}], total, took }
 *
 * Returns 503 if Meilisearch is unconfigured (env vars missing) so the UI
 * can degrade gracefully. The route is cheap to run even at high QPS — it's
 * just a thin wrapper, and Meilisearch is fast.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMeili, isSearchConfigured, SEARCH_INDEX, type SearchDoc } from "@/lib/server/meilisearch";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<SearchDoc["type"]>([
    "article",
    "problem",
    "test",
    "quiz",
    "contest",
    "course",
    "product",
]);

export async function GET(req: NextRequest) {
    if (!isSearchConfigured()) {
        return NextResponse.json(
            { error: "Search is currently unavailable.", hits: [], total: 0 },
            { status: 503 }
        );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) {
        return NextResponse.json({ hits: [], total: 0, took: 0 });
    }

    const typeParam = (searchParams.get("type") || "").toLowerCase();
    const type = VALID_TYPES.has(typeParam as SearchDoc["type"])
        ? (typeParam as SearchDoc["type"])
        : null;

    const limit = Math.min(
        Math.max(parseInt(searchParams.get("limit") || "10", 10) || 10, 1),
        20
    );

    try {
        const index = getMeili().index<SearchDoc>(SEARCH_INDEX);
        const result = await index.search(q, {
            limit,
            filter: type ? [`type = ${type}`] : undefined,
            attributesToRetrieve: [
                "id",
                "type",
                "title",
                "description",
                "url",
                "tags",
                "category",
                "isFree",
            ],
            // Highlight the matched span so the UI can bold it.
            attributesToHighlight: ["title", "description"],
            highlightPreTag: "<mark>",
            highlightPostTag: "</mark>",
        });

        return NextResponse.json({
            hits: result.hits,
            total: result.estimatedTotalHits,
            took: result.processingTimeMs,
        });
    } catch (error) {
        console.error("[search] query failed:", error);
        // Don't leak the Meilisearch URL or other infra details.
        return NextResponse.json(
            { error: "Search failed.", hits: [], total: 0 },
            { status: 500 }
        );
    }
}
