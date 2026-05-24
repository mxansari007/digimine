/**
 * Builders for `/api/og` URLs — the dynamic OG image route.
 *
 * Centralises the query-string shape so callers don't have to think about
 * encoding rules. Use `ogImageUrl(...)` directly when you want a custom
 * card, or rely on `articleOgImage`, `practiceOgImage`, `testOgImage` for
 * domain-specific defaults.
 *
 *   import { ogImageUrl } from "@/lib/seo";
 *
 *   const og = ogImageUrl({
 *       title: "TCS NQT 2026: Complete Pattern & Cutoffs",
 *       subtitle: "Pattern · Syllabus · Cutoffs · Sample paper",
 *       category: "Placement 2026",
 *       accent: "blue",
 *       stats: [
 *           { label: "Duration", value: "95 min" },
 *           { label: "Sections", value: "5 parts" },
 *           { label: "Cutoff", value: "60–70%" },
 *           { label: "Package", value: "₹3.36 LPA+" },
 *       ],
 *   });
 */
import { siteOrigin } from "./index";

export type OgAccent = "blue" | "green" | "amber" | "rose" | "slate";

export interface OgImageStat {
    label: string;
    value: string;
}

export interface OgImageParams {
    /** The main headline. Required. Trimmed to ~95 chars by the route. */
    title: string;
    /** Optional dek shown under the title in the accent colour. */
    subtitle?: string;
    /** Optional all-caps pill at the top (e.g. "TUTORIAL", "PLACEMENT 2026"). */
    category?: string;
    /** Colour theme. Defaults to "blue" — match site primary. */
    accent?: OgAccent;
    /**
     * Up to 4 stat cards across the bottom. The LAST card uses the solid
     * accent fill for emphasis when 2+ stats are supplied.
     */
    stats?: OgImageStat[];
}

/**
 * Build a fully-qualified URL to the dynamic OG image route. Pass the result
 * to `metadata.openGraph.images` / `metadata.twitter.images`.
 */
export function ogImageUrl(params: OgImageParams): string {
    const u = new URL("/api/og", siteOrigin());
    u.searchParams.set("title", params.title);
    if (params.subtitle) u.searchParams.set("subtitle", params.subtitle);
    if (params.category) u.searchParams.set("category", params.category);
    if (params.accent) u.searchParams.set("accent", params.accent);
    if (params.stats && params.stats.length > 0) {
        // `stats` is a comma-separated list of "LABEL:VALUE" pairs. Strip
        // commas/colons from inputs so the encoding stays unambiguous.
        const encoded = params.stats
            .slice(0, 4)
            .map((s) => {
                const label = s.label.replace(/[,:]/g, " ").trim();
                const value = s.value.replace(/[,]/g, " ").trim();
                return `${label}:${value}`;
            })
            .join(",");
        u.searchParams.set("stats", encoded);
    }
    return u.toString();
}

// ─── Domain-specific shortcuts ───────────────────────────────────────

/**
 * Article OG image with sensible defaults — the category becomes the chip,
 * the subtitle becomes the dek. Use this in article page `generateMetadata`.
 */
export function articleOgImage(input: {
    title: string;
    excerpt?: string;
    category?: string;
}): string {
    return ogImageUrl({
        title: input.title,
        subtitle: input.excerpt,
        category: input.category,
        accent: "blue",
    });
}

/**
 * Practice-problem OG image — surfaces difficulty + pattern + problem number
 * as stats so the share card actually previews the metadata that matters.
 */
export function practiceOgImage(input: {
    title: string;
    problemNumber?: number | null;
    difficulty?: string;
    pattern?: string;
}): string {
    const stats: OgImageStat[] = [];
    if (input.problemNumber != null) stats.push({ label: "Problem", value: `#${input.problemNumber}` });
    if (input.difficulty) stats.push({ label: "Difficulty", value: input.difficulty });
    if (input.pattern) stats.push({ label: "Pattern", value: input.pattern });
    return ogImageUrl({
        title: input.title,
        category: "DSA Practice",
        accent: "blue",
        stats,
    });
}

/**
 * Mock test OG image — shows duration and question count up front.
 */
export function testOgImage(input: {
    title: string;
    durationMinutes?: number;
    totalQuestions?: number;
    category?: string;
}): string {
    const stats: OgImageStat[] = [];
    if (input.durationMinutes) stats.push({ label: "Duration", value: `${input.durationMinutes} min` });
    if (input.totalQuestions) stats.push({ label: "Questions", value: String(input.totalQuestions) });
    return ogImageUrl({
        title: input.title,
        category: input.category || "Mock Test",
        accent: "amber",
        stats,
    });
}
