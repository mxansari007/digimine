import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import { DEFAULT_ARTICLE_SEO } from "@digimine/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function serializeFullArticle(id: string, raw: any) {
    return {
        id,
        slug: raw.slug || "",
        title: raw.title || "",
        subtitle: raw.subtitle ?? null,
        excerpt: raw.excerpt || "",
        body: raw.body || "",
        coverImageUrl: raw.coverImageUrl ?? null,
        coverCaption: raw.coverCaption ?? null,
        category: raw.category || "guide",
        subject: raw.subject ?? null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        status: raw.status || "draft",
        author: {
            userId: raw.author?.userId || "",
            name: raw.author?.name || "Editorial",
            avatarUrl: raw.author?.avatarUrl ?? null,
            bio: raw.author?.bio ?? null,
            twitter: raw.author?.twitter ?? null,
            linkedin: raw.author?.linkedin ?? null,
        },
        reading: {
            wordCount: raw.reading?.wordCount ?? 0,
            readingMinutes: raw.reading?.readingMinutes ?? 1,
        },
        seo: { ...DEFAULT_ARTICLE_SEO, ...(raw.seo || {}) },
        publishedAt: toIsoDate(raw.publishedAt),
        scheduledFor: toIsoDate(raw.scheduledFor),
        isFeatured: Boolean(raw.isFeatured),
        viewCount: raw.viewCount ?? 0,
        createdAt: toIsoDate(raw.createdAt),
        updatedAt: toIsoDate(raw.updatedAt),
    };
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
    try {
        const slug = decodeURIComponent(params.slug || "");
        if (!slug) return NextResponse.json({ error: "Slug required" }, { status: 400 });

        const snap = await adminDb
            .collection("articles")
            .where("slug", "==", slug)
            .limit(1)
            .get();
        if (snap.empty) return NextResponse.json({ error: "Article not found" }, { status: 404 });

        const docSnap = snap.docs[0];
        const data = docSnap.data() || {};
        if ((data.status || "draft") !== "published") {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        // Fire-and-forget view counter — never blocks the response.
        docSnap.ref.update({ viewCount: FieldValue.increment(1) }).catch(() => {
            /* best-effort */
        });

        return NextResponse.json({ article: serializeFullArticle(docSnap.id, data) });
    } catch (error: any) {
        console.error("Get article failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
