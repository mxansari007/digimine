/**
 * Server-side (admin-SDK) numbered pagination — the single source of truth for
 * how list endpoints page their data, so the client only ever fetches ONE page
 * at a time instead of the whole collection.
 *
 * Uses Firestore's `.count()` aggregation for the total and `.offset().limit()`
 * for the slice (offset is admin-SDK only — the web client SDK can't do this,
 * which is exactly why this lives behind an API route). Returns the same
 * `{ items, total, page, pageSize, totalPages }` envelope the existing
 * /api/practice/problems route already uses, so the client stays consistent.
 */
import type { Query, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";

export interface PageParams {
    page: number;
    pageSize: number;
}

export interface Paginated<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

/** Parse `?page=&pageSize=` from a request, clamped to sane bounds. */
export function parsePageParams(
    req: Request,
    opts: { defaultPageSize?: number; maxPageSize?: number } = {}
): PageParams {
    const { defaultPageSize = 20, maxPageSize = 100 } = opts;
    const sp = new URL(req.url).searchParams;
    const rawPage = Number(sp.get("page"));
    const rawSize = Number(sp.get("pageSize"));
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const pageSize =
        Number.isFinite(rawSize) && rawSize >= 1
            ? Math.min(Math.floor(rawSize), maxPageSize)
            : defaultPageSize;
    return { page, pageSize };
}

/**
 * Page through a filtered + ordered admin `Query`. The query you pass MUST
 * already have its `where`/`orderBy` applied; this only adds the count + slice.
 */
export async function paginateQuery<T = DocumentData>(
    query: Query,
    { page, pageSize }: PageParams,
    map?: (doc: QueryDocumentSnapshot) => T
): Promise<Paginated<T>> {
    const size = Math.max(1, Math.floor(pageSize));
    const requested = Math.max(1, Math.floor(page));

    // Total via the count aggregation (cheap; one billed read per 1000 matched).
    let total: number | null = null;
    try {
        total = (await query.count().get()).data().count;
    } catch {
        total = null; // count unavailable → best-effort total from the fetched slice
    }

    // Clamp the requested page to the last real page when we know the total.
    let safePage = requested;
    if (total !== null) {
        const pages = Math.max(1, Math.ceil(total / size));
        safePage = Math.min(requested, pages);
    }

    const offset = (safePage - 1) * size;
    const snap = await query.offset(offset).limit(size).get();
    const items = snap.docs.map((d) =>
        map ? map(d) : ({ id: d.id, ...(d.data() as DocumentData) } as T)
    );

    const resolvedTotal = total ?? offset + items.length;
    const totalPages = Math.max(1, Math.ceil(resolvedTotal / size));
    return { items, total: resolvedTotal, page: safePage, pageSize: size, totalPages };
}
