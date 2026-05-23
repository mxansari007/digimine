/**
 * POST /api/admin/search/reindex
 *
 * Rebuilds the entire Meilisearch catalog index from Firestore. Use this
 * after deploying the Heroku Meilisearch container (its filesystem is
 * ephemeral on Eco, so every restart wipes the index) or whenever you
 * want a fresh snapshot.
 *
 * Auth: admin / super_admin via `requireAdmin`. Safe to call repeatedly —
 * it drops everything and re-adds, so duplicates are impossible.
 *
 * Returns counts per content type so you can sanity-check it picked up
 * everything you expected.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { corsPreflight, withCors } from "@/lib/server/adminCors";
import {
    clearIndex,
    configureIndex,
    indexDocs,
    isSearchConfigured,
    type SearchDoc,
} from "@/lib/server/meilisearch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Preflight handler — required so cross-origin admin POSTs aren't rejected. */
export const OPTIONS = corsPreflight;

type Counts = Partial<Record<SearchDoc["type"], number>>;

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
 * Public-catalog gate — mirrors the predicate from slugCache so we don't
 * accidentally index teacher-private or unpublished content.
 */
function isPublic(raw: Record<string, unknown>): boolean {
    if ((raw as { isDeleted?: boolean }).isDeleted === true) return false;
    if ((raw as { status?: string }).status !== "published") return false;
    const teacherId = typeof raw.teacherId === "string" ? (raw.teacherId as string).trim() : "";
    if (!teacherId) return true;
    return (raw as { visibility?: string }).visibility === "published";
}

async function buildAll(): Promise<{ docs: SearchDoc[]; counts: Counts }> {
    const counts: Counts = {};
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
        adminDb
            .collection("practiceProblems")
            .where("status", "==", "published")
            .get(),
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
            // Strip HTML tags from the body so we don't bloat the index.
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
        docs.push({
            id: `problem__${slug}`,
            type: "problem",
            title: str(x.title),
            description: `${str(x.kind, "DSA").toUpperCase()} · ${str(x.difficulty, "easy")}`,
            content: str(x.statementHtml).replace(/<[^>]+>/g, " ").slice(0, 3000),
            slug,
            url: `/practice/problems/${slug}`,
            tags: [...arr<string>(x.tags), str(x.primaryPattern)].filter(Boolean),
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

export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    // `requireAdmin` returns its own NextResponse on failure; wrap with CORS
    // so the admin browser actually receives the 401/403 instead of opaque
    // network error.
    if (auth instanceof NextResponse) return withCors(req, auth);

    if (!isSearchConfigured()) {
        return withCors(
            req,
            NextResponse.json(
                { error: "Search is not configured. Set MEILISEARCH_URL and MEILISEARCH_MASTER_KEY." },
                { status: 503 }
            )
        );
    }

    const started = Date.now();
    try {
        await configureIndex();
        await clearIndex();

        const { docs, counts } = await buildAll();

        // Chunked to keep individual HTTP payloads under Meilisearch's default
        // 10MB limit even on long-bodied articles.
        const CHUNK = 500;
        for (let i = 0; i < docs.length; i += CHUNK) {
            await indexDocs(docs.slice(i, i + CHUNK));
        }

        return withCors(
            req,
            NextResponse.json({
                ok: true,
                total: docs.length,
                counts,
                durationMs: Date.now() - started,
            })
        );
    } catch (error) {
        console.error("[search/reindex] failed:", error);
        const message = error instanceof Error ? error.message : "Reindex failed.";
        return withCors(req, NextResponse.json({ error: message }, { status: 500 }));
    }
}
