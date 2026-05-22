/**
 * Cached read helpers for the public, SEO-facing practice pages.
 *
 * Two layers: shared Redis (cross-instance — collapses Firestore reads across
 * the whole Vercel fleet and crawler traffic) in front of per-instance
 * `unstable_cache` (the fallback when REDIS_URL isn't set). SSR + indexable
 * HTML stays; per-request Firestore load becomes effectively flat.
 *
 * Cache invalidates on its TTL; admin edits surface within that window.
 * (Returned values must be plain/serializable — no Firestore Timestamps.)
 */
import { unstable_cache } from "next/cache";
import { listPublishedProblemSummaries, loadProblemBySlug } from "@/lib/server/practice";
import { cachedJson } from "@/lib/server/cache";

const PRACTICE_TAG = "practice-problems";
const SUMMARIES_TTL = 600; // 10 min
const META_TTL = 3600; // 1 hour

const summariesLocal = unstable_cache(
    async () => listPublishedProblemSummaries(),
    ["practice:problem-summaries:v1"],
    { revalidate: SUMMARIES_TTL, tags: [PRACTICE_TAG] }
);

/** Full published catalog (summaries). */
export const getCachedProblemSummaries = () =>
    cachedJson("practice:problem-summaries:v1", SUMMARIES_TTL, summariesLocal);

const metaLocal = unstable_cache(
    async (slug: string) => {
        const p = (await loadProblemBySlug(slug)) as any;
        if (!p || p.status !== "published") return null;
        return {
            title: String(p.title || ""),
            kind: p.kind === "sql" ? "sql" : "dsa",
            difficulty: String(p.difficulty || ""),
            statementHtml: String(p.statementHtml || ""),
        };
    },
    ["practice:problem-meta:v1"],
    { revalidate: META_TTL, tags: [PRACTICE_TAG] }
);

/** Minimal, serializable fields for a problem's <head> metadata (per slug). */
export const getCachedProblemMeta = (slug: string) =>
    cachedJson(`practice:problem-meta:v1:${slug}`, META_TTL, () => metaLocal(slug));
