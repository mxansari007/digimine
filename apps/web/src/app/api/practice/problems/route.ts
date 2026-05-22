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
        const limit = Math.max(1, Math.min(300, parseInt(searchParams.get("limit") || "200", 10) || 200));

        let q: FirebaseFirestore.Query = adminDb.collection(PROBLEMS).where("status", "==", "published");
        if (kind === "dsa" || kind === "sql") q = q.where("kind", "==", kind);
        if (pattern) q = q.where("primaryPattern", "==", pattern);

        const snap = await q.limit(limit).get();
        let items = snap.docs.map((d) => serializeProblemSummary(d.id, d.data() || {}));

        if (difficulty) items = items.filter((p) => p.difficulty === difficulty);
        if (tag) items = items.filter((p) => p.tags.some((t: string) => t.toLowerCase() === tag));
        if (search) items = items.filter((p) => p.title.toLowerCase().includes(search));

        // Stable sort: featured first, then difficulty, then title.
        const diffRank: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
        items.sort((a, b) => {
            if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
            const dr = (diffRank[a.difficulty] ?? 1) - (diffRank[b.difficulty] ?? 1);
            if (dr !== 0) return dr;
            return a.title.localeCompare(b.title);
        });

        return NextResponse.json({ items, count: items.length });
    } catch (error: any) {
        console.error("List practice problems failed:", error);
        return NextResponse.json({ items: [], count: 0 });
    }
}
