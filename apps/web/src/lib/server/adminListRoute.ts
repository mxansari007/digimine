/**
 * Shared handler for admin "list" API routes consumed by the admin app.
 *
 * Wraps the repeated boilerplate: requireAdmin auth, CORS (the admin app calls
 * these cross-origin), build a filtered+ordered admin Query, paginate it
 * server-side (one page at a time), and JSON the standard envelope. Each route
 * just provides a `build(searchParams)` that returns the Firestore Query.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { withCors } from "@/lib/server/adminCors";
import { parsePageParams, paginateQuery, type Paginated } from "@/lib/server/pagination";

export async function handleAdminList<T = unknown>(
    req: NextRequest,
    build: (searchParams: URLSearchParams) => Query,
    options: {
        map?: (doc: QueryDocumentSnapshot) => T;
        defaultPageSize?: number;
        maxPageSize?: number;
    } = {}
): Promise<NextResponse> {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return withCors(req, auth);

    try {
        const sp = new URL(req.url).searchParams;
        const query = build(sp);
        const params = parsePageParams(req, {
            defaultPageSize: options.defaultPageSize,
            maxPageSize: options.maxPageSize,
        });
        const result: Paginated<T> = await paginateQuery<T>(query, params, options.map);
        return withCors(req, NextResponse.json(result));
    } catch (error) {
        const e = error as Error;
        console.error("[admin list] failed:", e);
        return withCors(
            req,
            NextResponse.json({ error: e.message || "Failed to load" }, { status: 500 })
        );
    }
}
