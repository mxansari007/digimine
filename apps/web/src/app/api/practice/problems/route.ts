import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { PROBLEMS, serializeProblemSummary } from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const kind = (searchParams.get("kind") || "").toLowerCase();
        const pattern = (searchParams.get("pattern") || "").trim();
        const difficulty = (searchParams.get("difficulty") || "").toLowerCase();
        const tag = (searchParams.get("tag") || "").trim().toLowerCase();
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        // Bumped the cap to support 1000+ problem catalog. Cursor pagination
        // is left to the client (Load More) for now — the payload is small
        // (~200 B per summary) so even the full catalog is manageable.
        const limit = Math.max(1, Math.min(2000, parseInt(searchParams.get("limit") || "2000", 10) || 2000));
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
        const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") || "0", 10) || 0));

        let q: FirebaseFirestore.Query = adminDb.collection(PROBLEMS).where("status", "==", "published");
        if (kind === "dsa" || kind === "sql") q = q.where("kind", "==", kind);
        if (pattern) q = q.where("primaryPattern", "==", pattern);

        const snap = await q.limit(limit).get();
        let items = snap.docs.map((d) => serializeProblemSummary(d.id, d.data() || {}));

        if (difficulty) items = items.filter((p) => p.difficulty === difficulty);
        if (tag) items = items.filter((p) => p.tags.some((t: string) => t.toLowerCase() === tag));
        if (search) items = items.filter((p) => p.title.toLowerCase().includes(search));

        // LeetCode-style sort: numbered problems first in ascending order,
        // ties broken by title. Featured remains a visual badge — not a
        // sort key — so the list reads as a stable catalog.
        items.sort((a, b) => {
            const an = typeof a.problemNumber === "number" ? a.problemNumber : Number.POSITIVE_INFINITY;
            const bn = typeof b.problemNumber === "number" ? b.problemNumber : Number.POSITIVE_INFINITY;
            if (an !== bn) return an - bn;
            return a.title.localeCompare(b.title);
        });

        const total = items.length;
        // Optional server-side pagination — set `pageSize` to opt in.
        // Useful for the heatmap left panel where we want bounded payloads.
        if (pageSize > 0) {
            const start = (page - 1) * pageSize;
            items = items.slice(start, start + pageSize);
        }

        return NextResponse.json({
            items,
            count: items.length,
            total,
            page,
            pageSize: pageSize || items.length,
            totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
        });
    } catch (error: any) {
        console.error("List practice problems failed:", error);
        return NextResponse.json({ items: [], count: 0 });
    }
}
