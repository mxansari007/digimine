/**
 * Cached article-by-slug reader.
 *
 * Two big wins over the previous `where("slug","==",slug).limit(1)` query:
 *
 *   1. **Doc-ID fast path.** Try `doc(slug).get()` first. If the article was
 *      created with the slug as its document ID, this is a single-key read —
 *      cheaper, faster, and no Firestore index involved. Falls back to the
 *      slug query only for legacy docs that used random IDs.
 *
 *   2. **Redis cache.** Wraps the read in `cachedJson` with a 10-minute TTL,
 *      so even on cold Firestore, the whole Vercel fleet + crawler traffic
 *      hits the cached blob. Per-request Firestore cost goes to zero for the
 *      hot articles.
 *
 * Returned object is plain/serializable (ISO date strings, no Firestore
 * Timestamps) — safe for Redis JSON storage and for the consumer page to
 * `new Date(...)` on the fields it actually uses.
 */
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson } from "@/lib/server/cache";

export type CachedArticle = {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    excerpt: string;
    body: string;
    coverImageUrl: string | null;
    coverCaption: string | null;
    category: string;
    subject: string | null;
    tags: string[];
    status: string;
    isFeatured: boolean;
    viewCount: number;
    publishedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    author: {
        userId: string;
        name: string;
        avatarUrl: string | null;
        bio: string | null;
        twitter: string | null;
        linkedin: string | null;
    };
    reading: { wordCount: number; readingMinutes: number };
    seo: Record<string, unknown>;
};

const ARTICLE_TAG = "articles";
const ARTICLE_TTL = 600; // 10 minutes

function isoOrNull(v: unknown): string | null {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (v instanceof Date) return v.toISOString();
    const maybeTs = v as { toDate?: () => Date };
    if (typeof maybeTs.toDate === "function") return maybeTs.toDate().toISOString();
    return null;
}

function mapDoc(id: string, raw: Record<string, unknown>): CachedArticle | null {
    const status = (raw.status as string | undefined) || "draft";
    // Public consumer expects only published, non-deleted articles. We do the
    // gate here so the cached value is already "safe to render"; a missed
    // status check (the cause of "I published but can't see it") becomes a
    // very visible null at the call site instead of silent data leakage.
    if (status !== "published") return null;
    if (raw.isDeleted === true) return null;

    const author = (raw.author as Record<string, unknown> | undefined) || {};
    const reading = (raw.reading as Record<string, unknown> | undefined) || {};
    return {
        id,
        slug: String(raw.slug || ""),
        title: String(raw.title || ""),
        subtitle: (raw.subtitle as string | null) ?? null,
        excerpt: String(raw.excerpt || ""),
        body: String(raw.body || ""),
        coverImageUrl: (raw.coverImageUrl as string | null) ?? null,
        coverCaption: (raw.coverCaption as string | null) ?? null,
        category: String(raw.category || "guide"),
        subject: (raw.subject as string | null) ?? null,
        tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
        status: "published",
        isFeatured: Boolean(raw.isFeatured),
        viewCount: Number(raw.viewCount || 0),
        publishedAt: isoOrNull(raw.publishedAt),
        createdAt: isoOrNull(raw.createdAt),
        updatedAt: isoOrNull(raw.updatedAt),
        author: {
            userId: String(author.userId || ""),
            name: String(author.name || "Editorial"),
            avatarUrl: (author.avatarUrl as string | null) ?? null,
            bio: (author.bio as string | null) ?? null,
            twitter: (author.twitter as string | null) ?? null,
            linkedin: (author.linkedin as string | null) ?? null,
        },
        reading: {
            wordCount: Number(reading.wordCount || 0),
            readingMinutes: Number(reading.readingMinutes || 1),
        },
        seo: (raw.seo as Record<string, unknown>) || {},
    };
}

/** Uncached fetch — two-shot: try doc(slug) first, then where("slug",…). */
async function fetchArticleBySlug(slug: string): Promise<CachedArticle | null> {
    if (!slug) return null;

    // Fast path: slug-as-doc-id (single key read, no index).
    const direct = await adminDb.collection("articles").doc(slug).get();
    if (direct.exists) {
        const mapped = mapDoc(direct.id, direct.data() || {});
        if (mapped) return mapped;
    }

    // Legacy fallback: random doc IDs. One indexed query, limit 1.
    const snap = await adminDb
        .collection("articles")
        .where("slug", "==", slug)
        .limit(1)
        .get();
    if (snap.empty) return null;
    return mapDoc(snap.docs[0].id, snap.docs[0].data() || {});
}

/**
 * Cached entry point. Use this from the public article page + metadata; one
 * call hits Redis first, falls through to Firestore only on cache miss.
 *
 * After publishing/editing an article, call `revalidateTag("articles")` in
 * your admin save path if you want zero-lag freshness — otherwise the cache
 * TTL bounds staleness to 10 minutes.
 */
export const getCachedArticleBySlug = (slug: string) =>
    cachedJson<CachedArticle | null>(
        `article:by-slug:v1:${slug}`,
        ARTICLE_TTL,
        () => fetchArticleBySlug(slug)
    );

// (ARTICLE_TAG is retained for future tag-based invalidation; cachedJson
// uses per-key invalidation today via invalidateCache(key).)
void ARTICLE_TAG;
