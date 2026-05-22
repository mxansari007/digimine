import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { SHEETS } from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const snap = await adminDb.collection(SHEETS).where("status", "==", "published").limit(100).get();
        const items = snap.docs.map((d) => {
            const raw = d.data() || {};
            return {
                id: d.id,
                slug: raw.slug || "",
                kind: raw.kind || "mixed",
                title: raw.title || "",
                description: raw.description || "",
                coverImageUrl: raw.coverImageUrl ?? null,
                problemCount: Array.isArray(raw.items) ? raw.items.length : 0,
                tags: Array.isArray(raw.tags) ? raw.tags : [],
                isOfficial: Boolean(raw.isOfficial),
            };
        });
        items.sort((a, b) => (a.isOfficial === b.isOfficial ? 0 : a.isOfficial ? -1 : 1));
        return NextResponse.json({ items, count: items.length });
    } catch (error: any) {
        console.error("Sheets list failed:", error);
        return NextResponse.json({ items: [], count: 0 });
    }
}
