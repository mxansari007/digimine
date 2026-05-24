/**
 * Shared reindex logic — used by both the admin "Rebuild search index" button
 * (`/api/admin/search/reindex`) and the daily Vercel Cron
 * (`/api/cron/search/reindex`). Keeping it in one place means the cron and
 * the admin button stay in lockstep: same collections, same gate, same field
 * shapes, same Meilisearch ID format.
 */
import { adminDb } from "@/lib/firebase/admin";
import {
    clearIndex,
    configureIndex,
    indexDocs,
    type SearchDoc,
} from "@/lib/server/meilisearch";

export type ReindexCounts = Partial<Record<SearchDoc["type"], number>>;

export type ReindexResult = {
    ok: true;
    total: number;
    counts: ReindexCounts;
    durationMs: number;
};

function str(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}
function arr<T = string>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}
function toMillis(v: unknown): number {
    if (!v) return 0;
    const x = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof x.toMillis === "function") return x.toMillis();
    if (typeof x.toDate === "function") return x.toDate().getTime();
    if (typeof x.seconds === "number") return x.seconds * 1000;
    if (typeof v === "string" || typeof v === "number") {
        const t = new Date(v as string | number).getTime();
        return Number.isFinite(t) ? t : 0;
    }
    return 0;
}

/**
 * Public-catalog gate — mirrors the predicate from `slugCache` so we never
 * index teacher-private or unpublished content.
 */
function isPublic(raw: Record<string, unknown>): boolean {
    if ((raw as { isDeleted?: boolean }).isDeleted === true) return false;
    if ((raw as { status?: string }).status !== "published") return false;
    const teacherId = typeof raw.teacherId === "string" ? (raw.teacherId as string).trim() : "";
    if (!teacherId) return true;
    return (raw as { visibility?: string }).visibility === "published";
}

async function buildAll(): Promise<{ docs: SearchDoc[]; counts: ReindexCounts }> {
    const counts: ReindexCounts = {};
    const docs: SearchDoc[] = [];

    const [
        articlesSnap,
        problemsSnap,
        testsSnap,
        quizzesSnap,
        contestsSnap,
        coursesSnap,
        productsSnap,
    ] = await Promise.all([
        adminDb.collection("articles").where("status", "==", "published").get(),
        adminDb.collection("practiceProblems").where("status", "==", "published").get(),
        adminDb.collection("tests").where("status", "==", "published").get(),
        adminDb.collection("quizzes").where("status", "==", "published").get(),
        adminDb.collection("contests").where("status", "==", "published").get(),
        adminDb.collection("courses").where("status", "==", "published").get(),
        adminDb.collection("products").where("status", "==", "published").get(),
    ]);

    for (const d of articlesSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        docs.push({
            id: `article__${slug}`,
            type: "article",
            title: str(x.title),
            description: str(x.excerpt),
            content: str(x.body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 5000),
            slug,
            url: `/articles/${slug}`,
            tags: arr<string>(x.tags),
            category: str(x.category),
            publishedAtMs: toMillis((x as { publishedAt?: unknown }).publishedAt),
            isFree: true,
        });
    }
    counts.article = docs.filter((d) => d.type === "article").length;

    for (const d of problemsSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        const num = typeof x.problemNumber === "number" ? x.problemNumber : null;
        const titleText = str(x.title);
        // Prepend "#N" to the search title so the number is BOTH visible in
        // results and searchable by typing the digits ("1" → matches "#1").
        // Meilisearch's default tokenizer treats # as a separator, so "#1"
        // becomes the token "1" — typing either form finds the problem.
        const title = num != null ? `#${num} ${titleText}` : titleText;
        // Also push the raw number + "#N" form as tags. This gives an
        // explicit boost when the user queries by number alone, and is
        // future-proof if we move number search to a filter later.
        const tags = [
            ...arr<string>(x.tags),
            str(x.primaryPattern),
            num != null ? String(num) : "",
            num != null ? `#${num}` : "",
        ].filter(Boolean);
        docs.push({
            id: `problem__${slug}`,
            type: "problem",
            title,
            description: `${str(x.kind, "DSA").toUpperCase()} · ${str(x.difficulty, "easy")}`,
            content: str(x.statementHtml).replace(/<[^>]+>/g, " ").slice(0, 3000),
            slug,
            url: `/practice/problems/${slug}`,
            tags,
            category: str(x.primaryPattern),
            publishedAtMs: toMillis(x.createdAt),
            isFree: true,
        });
    }
    counts.problem = docs.filter((d) => d.type === "problem").length;

    for (const d of testsSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        docs.push({
            id: `test__${slug}`,
            type: "test",
            title: str(x.title),
            description: str(x.shortDescription),
            slug,
            url: `/tests/${slug}`,
            tags: arr<string>(x.tags),
            category: str(x.category),
            publishedAtMs: toMillis(x.createdAt),
            isFree: str(x.accessType) === "free",
        });
    }
    counts.test = docs.filter((d) => d.type === "test").length;

    for (const d of quizzesSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        docs.push({
            id: `quiz__${slug}`,
            type: "quiz",
            title: str(x.title),
            description: str(x.shortDescription),
            slug,
            url: `/quizzes/${slug}`,
            tags: arr<string>(x.tags),
            category: str(x.category),
            publishedAtMs: toMillis(x.createdAt),
            isFree: str(x.accessType) === "free",
        });
    }
    counts.quiz = docs.filter((d) => d.type === "quiz").length;

    for (const d of contestsSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        docs.push({
            id: `contest__${slug}`,
            type: "contest",
            title: str(x.title),
            description: str(x.shortDescription) || str(x.description),
            slug,
            url: `/contests/${slug}`,
            tags: arr<string>(x.tags),
            category: str(x.category),
            publishedAtMs: toMillis((x as { startTime?: unknown }).startTime),
            isFree: true,
        });
    }
    counts.contest = docs.filter((d) => d.type === "contest").length;

    for (const d of coursesSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        docs.push({
            id: `course__${slug}`,
            type: "course",
            title: str(x.title),
            description: str(x.shortDescription),
            slug,
            url: `/courses/${slug}`,
            tags: arr<string>(x.tags),
            category: str(x.category) || str(x.subject),
            publishedAtMs: toMillis(x.createdAt),
            isFree: str(x.accessType) === "free",
        });
    }
    counts.course = docs.filter((d) => d.type === "course").length;

    for (const d of productsSnap.docs) {
        const x = d.data() || {};
        if (!isPublic(x)) continue;
        const slug = str(x.slug, d.id);
        docs.push({
            id: `product__${slug}`,
            type: "product",
            title: str(x.name),
            description: str(x.shortDescription) || str(x.description),
            slug,
            url: `/products/${slug}`,
            tags: arr<string>(x.tags),
            category: str(x.type),
            publishedAtMs: toMillis(x.createdAt),
            isFree: Number(x.price) === 0,
        });
    }
    counts.product = docs.filter((d) => d.type === "product").length;

    return { docs, counts };
}

/**
 * Wipe Meilisearch and rebuild every catalog index from Firestore.
 *
 * Chunked at 500 docs per request to stay under Meilisearch's default 10MB
 * payload cap even when articles ship with long bodies. Returns counts +
 * timing so the caller can log / surface them.
 */
export async function runFullReindex(): Promise<ReindexResult> {
    const started = Date.now();
    await configureIndex();
    await clearIndex();

    const { docs, counts } = await buildAll();

    const CHUNK = 500;
    for (let i = 0; i < docs.length; i += CHUNK) {
        await indexDocs(docs.slice(i, i + CHUNK));
    }

    return {
        ok: true,
        total: docs.length,
        counts,
        durationMs: Date.now() - started,
    };
}
