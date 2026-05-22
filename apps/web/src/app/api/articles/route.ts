import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "@digimine/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_CATEGORIES = new Set<ArticleCategory>(ARTICLE_CATEGORIES.map((c) => c.id));

function serializeArticleSummary(id: string, raw: any) {
    return {
        id,
        slug: raw.slug || "",
        title: raw.title || "",
        subtitle: raw.subtitle ?? null,
        excerpt: raw.excerpt || "",
        coverImageUrl: raw.coverImageUrl ?? null,
        category: raw.category || "guide",
        subject: raw.subject ?? null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        author: {
            name: raw.author?.name || "Editorial",
            avatarUrl: raw.author?.avatarUrl ?? null,
        },
        reading: {
            wordCount: raw.reading?.wordCount ?? 0,
            readingMinutes: raw.reading?.readingMinutes ?? 1,
        },
        publishedAt: toIsoDate(raw.publishedAt),
        isFeatured: Boolean(raw.isFeatured),
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const category = (searchParams.get("category") || "").toLowerCase();
        const subject = (searchParams.get("subject") || "").trim();
        const tag = (searchParams.get("tag") || "").trim().toLowerCase();
        const featuredOnly = searchParams.get("featured") === "1";
        const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "20", 10) || 20));

        let q: FirebaseFirestore.Query = adminDb.collection("articles").where("status", "==", "published");
        if (category && ALLOWED_CATEGORIES.has(category as ArticleCategory)) {
            q = q.where("category", "==", category);
        }
        if (featuredOnly) {
            q = q.where("isFeatured", "==", true);
        }

        const snap = await q.orderBy("publishedAt", "desc").limit(limit * 2).get();
        let items = snap.docs.map((d) => serializeArticleSummary(d.id, d.data() || {}));

        // Subject/tag filters done in JS — adding indexes for every combo
        // would balloon the index list. Articles volumes are small.
        if (subject) {
            items = items.filter((a) => (a.subject || "").toLowerCase() === subject.toLowerCase());
        }
        if (tag) {
            items = items.filter((a) => a.tags.some((t: string) => t.toLowerCase() === tag));
        }

        return NextResponse.json({
            items: items.slice(0, limit),
            count: items.length,
        });
    } catch (error: any) {
        console.error("List articles failed:", error);
        return NextResponse.json({ items: [], count: 0 });
    }
}
