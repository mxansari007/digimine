import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit as fbLimit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import {
    DEFAULT_ARTICLE_SEO,
    computeReadingMeta,
    deriveArticleExcerpt,
    slugifyArticleTitle,
    type Article,
    type ArticleCategory,
    type ArticleSeo,
    type ArticleStatus,
    type CreateArticleInput,
    type UpdateArticleInput,
} from "@digimine/types";
import { db } from "@/lib/firebase/client";

const articlesCol = () => collection(db, "articles");

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof (value as any)?.toDate === "function") return (value as any).toDate();
    if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof (value as any)?.seconds === "number") {
        return new Date((value as any).seconds * 1000);
    }
    return null;
}

function mapArticle(id: string, raw: any): Article {
    return {
        id,
        slug: raw.slug || "",
        title: raw.title || "",
        subtitle: raw.subtitle ?? null,
        excerpt: raw.excerpt || "",
        body: raw.body || "",
        coverImageUrl: raw.coverImageUrl ?? null,
        coverCaption: raw.coverCaption ?? null,
        category: (raw.category as ArticleCategory) || "guide",
        subject: raw.subject ?? null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        status: (raw.status as ArticleStatus) || "draft",
        publishedAt: toDate(raw.publishedAt),
        scheduledFor: toDate(raw.scheduledFor),
        author: {
            userId: raw.author?.userId || "",
            name: raw.author?.name || "Admin",
            avatarUrl: raw.author?.avatarUrl ?? null,
            bio: raw.author?.bio ?? null,
            twitter: raw.author?.twitter ?? null,
            linkedin: raw.author?.linkedin ?? null,
        },
        reading: {
            wordCount: raw.reading?.wordCount ?? 0,
            readingMinutes: raw.reading?.readingMinutes ?? 1,
        },
        seo: {
            ...DEFAULT_ARTICLE_SEO,
            ...(raw.seo || {}),
        },
        isFeatured: Boolean(raw.isFeatured),
        viewCount: raw.viewCount ?? 0,
        createdAt: toDate(raw.createdAt) || new Date(),
        updatedAt: toDate(raw.updatedAt) || new Date(),
    };
}

export async function listArticles(opts?: {
    status?: ArticleStatus | "all";
    category?: ArticleCategory | "all";
    limit?: number;
}): Promise<Article[]> {
    const constraints: any[] = [];
    if (opts?.status && opts.status !== "all") constraints.push(where("status", "==", opts.status));
    if (opts?.category && opts.category !== "all") constraints.push(where("category", "==", opts.category));
    constraints.push(orderBy("updatedAt", "desc"));
    if (opts?.limit) constraints.push(fbLimit(opts.limit));
    const snap = await getDocs(query(articlesCol(), ...constraints));
    return snap.docs.map((d) => mapArticle(d.id, d.data() || {}));
}

export async function getArticle(id: string): Promise<Article | null> {
    const ref = doc(articlesCol(), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return mapArticle(snap.id, snap.data() || {});
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
    const snap = await getDocs(query(articlesCol(), where("slug", "==", slug), fbLimit(1)));
    if (snap.empty) return null;
    const d = snap.docs[0];
    return mapArticle(d.id, d.data() || {});
}

/**
 * Allocate a unique slug. If the requested slug collides, suffix with -2,
 * -3, … until we find a free one.
 */
async function allocateUniqueSlug(desired: string, excludeId?: string): Promise<string> {
    const base = slugifyArticleTitle(desired) || "article";
    let candidate = base;
    let n = 2;
    // Up to 20 attempts — well above any practical collision rate.
    for (let i = 0; i < 20; i += 1) {
        const snap = await getDocs(query(articlesCol(), where("slug", "==", candidate), fbLimit(2)));
        const taken = snap.docs.some((d) => d.id !== excludeId);
        if (!taken) return candidate;
        candidate = `${base}-${n}`;
        n += 1;
    }
    return `${base}-${Date.now().toString(36)}`;
}

function normalizeStatusForWrite(status: ArticleStatus | undefined, existing?: Article | null): ArticleStatus {
    if (status) return status;
    if (existing?.status) return existing.status;
    return "draft";
}

export async function createArticle(
    input: CreateArticleInput,
    authorMeta: { userId: string; name: string; avatarUrl: string | null }
): Promise<string> {
    // Resolve the slug FIRST (with dedupe), then use it as the document ID.
    // This makes future reads a single key-value lookup via `doc(slug)` — no
    // index, no query. The collision loop in `allocateUniqueSlug` covers both
    // legacy random-ID docs and the new slug-keyed ones.
    const slug = await allocateUniqueSlug(input.slug || input.title || "article");
    const id = slug;
    const body = input.body || "";
    const excerpt = input.excerpt && input.excerpt.trim() ? input.excerpt.trim() : deriveArticleExcerpt(body);
    const reading = computeReadingMeta(body);
    const status = normalizeStatusForWrite(input.status);
    const now = Timestamp.now();

    const seo: ArticleSeo = {
        ...DEFAULT_ARTICLE_SEO,
        ...(input.seo || {}),
        metaTitle: input.seo?.metaTitle || input.title,
        metaDescription: input.seo?.metaDescription || excerpt,
    };

    const payload: any = {
        slug,
        title: input.title.trim(),
        subtitle: input.subtitle?.trim() || null,
        excerpt,
        body,
        coverImageUrl: input.coverImageUrl || null,
        coverCaption: input.coverCaption || null,
        category: input.category,
        subject: input.subject || null,
        tags: input.tags?.filter(Boolean) || [],
        status,
        publishedAt: status === "published" ? now : null,
        scheduledFor: input.scheduledFor ? Timestamp.fromDate(input.scheduledFor) : null,
        author: {
            userId: authorMeta.userId,
            name: input.author?.name || authorMeta.name,
            avatarUrl: input.author?.avatarUrl ?? authorMeta.avatarUrl,
            bio: input.author?.bio ?? null,
            twitter: input.author?.twitter ?? null,
            linkedin: input.author?.linkedin ?? null,
        },
        reading,
        seo,
        isFeatured: Boolean(input.isFeatured),
        viewCount: 0,
        createdAt: now,
        updatedAt: now,
    };

    await setDoc(doc(articlesCol(), id), payload);
    return id;
}

export async function updateArticle(
    id: string,
    input: UpdateArticleInput,
    options?: { authorMeta?: { userId: string; name: string; avatarUrl: string | null } }
): Promise<void> {
    const existing = await getArticle(id);
    if (!existing) throw new Error("Article not found");

    const next: Record<string, any> = { updatedAt: serverTimestamp() };

    if (input.title !== undefined) next.title = input.title.trim();
    if (input.subtitle !== undefined) next.subtitle = input.subtitle?.trim() || null;
    if (input.coverImageUrl !== undefined) next.coverImageUrl = input.coverImageUrl || null;
    if (input.coverCaption !== undefined) next.coverCaption = input.coverCaption || null;
    if (input.category !== undefined) next.category = input.category;
    if (input.subject !== undefined) next.subject = input.subject || null;
    if (input.tags !== undefined) next.tags = input.tags.filter(Boolean);
    if (input.isFeatured !== undefined) next.isFeatured = Boolean(input.isFeatured);
    if (input.scheduledFor !== undefined)
        next.scheduledFor = input.scheduledFor ? Timestamp.fromDate(input.scheduledFor) : null;

    if (input.slug !== undefined && input.slug !== existing.slug) {
        next.slug = await allocateUniqueSlug(input.slug, id);
    }

    let nextBody = existing.body;
    if (input.body !== undefined) {
        next.body = input.body;
        nextBody = input.body;
    }
    if (input.body !== undefined) {
        next.reading = computeReadingMeta(nextBody);
    }
    if (input.excerpt !== undefined) {
        next.excerpt = input.excerpt?.trim() || deriveArticleExcerpt(nextBody);
    } else if (input.body !== undefined && !existing.excerpt) {
        next.excerpt = deriveArticleExcerpt(nextBody);
    }

    if (input.seo) {
        next.seo = {
            ...existing.seo,
            ...input.seo,
        };
    }

    if (input.author && options?.authorMeta) {
        next.author = {
            ...existing.author,
            ...input.author,
            userId: existing.author.userId || options.authorMeta.userId,
        };
    }

    if (input.status !== undefined) {
        next.status = input.status;
        // Stamp publishedAt the first time the article goes live; never
        // overwrite an existing publishedAt on re-publish.
        if (input.status === "published" && !existing.publishedAt) {
            next.publishedAt = serverTimestamp();
        }
    }

    await updateDoc(doc(articlesCol(), id), next);
}

export async function deleteArticle(id: string): Promise<void> {
    await deleteDoc(doc(articlesCol(), id));
}
