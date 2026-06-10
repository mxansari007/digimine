/**
 * Server-side, cached readers for the public catalog LISTING pages
 * (courses / tests / quizzes / products / contests).
 *
 * These let the listing pages render every item link in the initial HTML
 * (crawlable) instead of fetching client-side. Reads go through the Firebase
 * Admin SDK and are wrapped in `unstable_cache`, so the queries run at most
 * once per revalidation window and are shared across all requests/crawls.
 *
 * Returned objects are plain/serializable (no Firestore Timestamps) so they
 * can be passed into client components.
 */
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson } from "@/lib/server/cache";

/**
 * Two-layer cache: shared Redis (cross-instance, kills duplicate Firestore
 * reads across the whole Vercel fleet) in front of per-instance unstable_cache
 * (the fallback when REDIS_URL isn't set). `key` is reused for both layers.
 */
function shared<T>(key: string, inner: () => Promise<T>): () => Promise<T> {
    return () => cachedJson(key, TTL, inner);
}

const CATALOG_TAG = "catalog";
const TTL = 600; // 10 minutes

function str(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function arr<T = string>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Public-catalog visibility gate — MUST match isPublicCatalog* in
 * lib/firestore/{courses,tests,quizzes,contests}. A published doc is public on
 * the open catalog iff:
 *   - it is platform/admin-authored (no teacherId), OR
 *   - it is teacher-authored AND admin-approved (visibility === "published").
 * This keeps classroom-/institute-private content out of public listings.
 * (Callers already restrict to status === "published" and drop isDeleted.)
 */
function isPublicCatalogDoc(x: Record<string, unknown>): boolean {
    if (x.isDeleted === true) return false;
    const teacherId = typeof x.teacherId === "string" ? x.teacherId : "";
    if (!teacherId) return true;
    return str(x.visibility) === "published";
}

export type CourseCard = {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    category: string;
    tags: string[];
    accessType: string;
    price: number;
    difficulty: string;
    thumbnailURL: string;
    chapterCount: number;
    subtopicCount: number;
    testCount: number;
};

async function fetchPublishedCourses(): Promise<CourseCard[]> {
    const snap = await adminDb.collection("courses").where("status", "==", "published").get();
    return snap.docs
        .map((d) => ({ id: d.id, x: d.data() || {} }))
        .filter((r) => isPublicCatalogDoc(r.x))
        .map(({ id, x }) => ({
            id,
            slug: str(x.slug, id),
            title: str(x.title, "Untitled course"),
            shortDescription: str(x.shortDescription),
            category: str(x.category),
            tags: arr<string>(x.tags),
            accessType: str(x.accessType, "free"),
            price: num(x.price),
            difficulty: str(x.difficulty),
            thumbnailURL: str(x.thumbnailURL),
            chapterCount: num(x.notesSummary?.chapterCount),
            subtopicCount: num(x.notesSummary?.subtopicCount),
            testCount: arr(x.linkedTestSeriesIds).length,
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
}

export const getCachedCourses = shared("catalog:courses:v1", unstable_cache(fetchPublishedCourses, ["catalog:courses:v1"], {
    revalidate: TTL,
    tags: [CATALOG_TAG],
}));

function toMillis(v: unknown): number {
    if (v && typeof (v as any).toMillis === "function") return (v as any).toMillis();
    if (typeof v === "number") return v;
    return 0;
}

export type TestCard = {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    tags: string[];
    category: string;
    accessType: string;
    price: number;
    compareAtPrice: number;
    totalTests: number;
    totalQuestions: number;
    thumbnailURL: string;
    createdAtMs: number;
};

async function fetchPublishedTests(): Promise<TestCard[]> {
    const snap = await adminDb.collection("tests").where("status", "==", "published").get();
    return snap.docs
        .map((d) => ({ id: d.id, x: d.data() || {} }))
        .filter((r) => isPublicCatalogDoc(r.x))
        .map(({ id, x }) => ({
            id,
            slug: str(x.slug, id),
            title: str(x.title, "Untitled test series"),
            shortDescription: str(x.shortDescription),
            tags: arr<string>(x.tags),
            category: str(x.category),
            accessType: str(x.accessType, "free"),
            price: num(x.price),
            compareAtPrice: num(x.compareAtPrice),
            totalTests: num(x.totalTests),
            totalQuestions: num(x.totalQuestions),
            thumbnailURL: str(x.thumbnailURL),
            createdAtMs: toMillis(x.createdAt),
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export const getCachedTests = shared("catalog:tests:v1", unstable_cache(fetchPublishedTests, ["catalog:tests:v1"], {
    revalidate: TTL,
    tags: [CATALOG_TAG],
}));

export type ContestCard = {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    description: string;
    category: string;
    sourceType: string;
    seriesTitle: string;
    thumbnailURL: string;
    startTimeMs: number;
    endTimeMs: number;
    totalQuestions: number;
    totalMarks: number;
};

async function fetchPublishedContests(): Promise<ContestCard[]> {
    const snap = await adminDb.collection("contests").where("status", "==", "published").get();
    return snap.docs
        .map((d) => ({ id: d.id, x: d.data() || {} }))
        .filter((r) => isPublicCatalogDoc(r.x))
        .map(({ id, x }) => ({
            id,
            slug: str(x.slug, id),
            title: str(x.title, "Untitled contest"),
            shortDescription: str(x.shortDescription),
            description: str(x.description),
            category: str(x.category),
            sourceType: str(x.sourceType),
            seriesTitle: str(x.seriesTitle),
            thumbnailURL: str(x.thumbnailURL),
            startTimeMs: toMillis(x.startTime),
            endTimeMs: toMillis(x.endTime),
            totalQuestions: num(x.totalQuestions),
            totalMarks: num(x.totalMarks),
        }));
}

export const getCachedContests = shared("catalog:contests:v1", unstable_cache(fetchPublishedContests, ["catalog:contests:v1"], {
    revalidate: TTL,
    tags: [CATALOG_TAG],
}));

export type QuizItem = {
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    category: string;
    tags: string[];
    accessType: string;
    totalQuestions: number;
    timeLimitMinutes: number;
    thumbnailURL: string;
};

async function fetchPublishedQuizzes(): Promise<QuizItem[]> {
    const snap = await adminDb.collection("quizzes").where("status", "==", "published").get();
    return snap.docs
        .map((d) => ({ id: d.id, x: d.data() || {} }))
        .filter((r) => isPublicCatalogDoc(r.x))
        .map(({ id, x }) => ({
            id,
            slug: str(x.slug, id),
            title: str(x.title, "Untitled quiz"),
            shortDescription: str(x.shortDescription),
            category: str(x.category),
            tags: arr<string>(x.tags),
            accessType: str(x.accessType, "free"),
            totalQuestions: num(x.totalQuestions),
            timeLimitMinutes: num(x.timeLimitMinutes),
            thumbnailURL: str(x.thumbnailURL),
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
}

export const getCachedQuizzes = shared("catalog:quizzes:v2", unstable_cache(fetchPublishedQuizzes, ["catalog:quizzes:v2"], {
    revalidate: TTL,
    tags: [CATALOG_TAG],
}));

/**
 * A plain, serializable shape carrying only the fields the products grid +
 * filters + ProductCard actually read (no Firestore Timestamps). Combines the
 * `products` collection with published test series (mapped to product-like).
 */
export type StoreCardItem = {
    id: string;
    name: string;
    slug: string;
    description: string;
    shortDescription: string;
    price: number;
    compareAtPrice: number;
    type: string;
    purchaseType: string;
    thumbnailURL: string;
    instantAccess: boolean;
    tags: string[];
    createdAtMs: number;
};

async function fetchStoreItems(): Promise<StoreCardItem[]> {
    const [prodSnap, tests] = await Promise.all([
        adminDb.collection("products").where("status", "==", "published").get(),
        getCachedTests(),
    ]);

    const products: StoreCardItem[] = prodSnap.docs
        .map((d) => ({ id: d.id, x: d.data() || {} }))
        .filter((r) => isPublicCatalogDoc(r.x))
        .map(({ id, x }) => ({
            id,
            name: str(x.name, "Untitled"),
            slug: str(x.slug, id),
            description: str(x.description),
            shortDescription: str(x.shortDescription),
            price: num(x.price),
            compareAtPrice: num(x.compareAtPrice),
            type: str(x.type, "product"),
            purchaseType: str(x.purchaseType, "downloadable"),
            thumbnailURL: str(x.thumbnailURL),
            instantAccess: x.instantAccess !== false,
            tags: arr<string>(x.tags),
            createdAtMs: toMillis(x.createdAt),
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const mappedTests: StoreCardItem[] = tests.map((t) => ({
        id: t.id,
        name: t.title,
        slug: t.slug,
        description: t.shortDescription,
        shortDescription: t.shortDescription,
        price: t.price,
        compareAtPrice: t.compareAtPrice,
        type: "test_series",
        purchaseType: "downloadable",
        thumbnailURL: t.thumbnailURL,
        instantAccess: true,
        tags: t.tags,
        createdAtMs: t.createdAtMs,
    }));

    return [...products, ...mappedTests];
}

export const getCachedStoreItems = shared("catalog:store:v1", unstable_cache(fetchStoreItems, ["catalog:store:v1"], {
    revalidate: TTL,
    tags: [CATALOG_TAG],
}));

/**
 * Lightweight article summary for the homepage "What's new" block. We avoid
 * pulling the article body or seo blob — just the few fields the card needs.
 */
export type HomeArticleCard = {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverImageUrl: string | null;
    category: string;
    readingMinutes: number;
    publishedAtMs: number;
};

async function fetchHomeArticles(): Promise<HomeArticleCard[]> {
    // Don't `orderBy("publishedAt")` — Firestore drops docs missing it. Fetch
    // a small batch of published articles and sort in JS (article volumes are
    // small enough that this is cheap).
    const snap = await adminDb
        .collection("articles")
        .where("status", "==", "published")
        .limit(24)
        .get();
    const items: HomeArticleCard[] = snap.docs
        .map((d) => ({ id: d.id, x: d.data() || {} }))
        .filter((r) => str(r.x.slug) && str(r.x.title))
        .map(({ id, x }) => ({
            id,
            slug: str(x.slug),
            title: str(x.title),
            excerpt: str(x.excerpt),
            coverImageUrl: typeof x.coverImageUrl === "string" ? x.coverImageUrl : null,
            category: str(x.category, "guide"),
            readingMinutes: num(x.reading?.readingMinutes, 1),
            publishedAtMs: toMillis(x.publishedAt) || toMillis(x.createdAt),
        }))
        .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
        .slice(0, 4);
    return items;
}

export const getCachedHomeArticles = shared(
    "catalog:home-articles:v1",
    unstable_cache(fetchHomeArticles, ["catalog:home-articles:v1"], {
        revalidate: TTL,
        tags: [CATALOG_TAG],
    })
);
