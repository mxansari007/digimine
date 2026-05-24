/**
 * Bulk import + template for practice topics.
 *
 * Topics are mostly content blobs (intro / mental-model HTML) plus a few
 * structural fields — JSON is the right shape. Accepts either a bare
 * array or `{ "topics": [...] }`.
 */
import type { CreatePracticeTopicInput } from "@digimine/types";

export interface TopicsParseResult {
    ok: boolean;
    topics: CreatePracticeTopicInput[];
    errors: string[];
    warnings: string[];
}

const VALID_KINDS = new Set(["dsa", "sql"]);
const VALID_STATUS = new Set(["draft", "published", "archived"]);

export function parseTopicsJson(text: string): TopicsParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        return {
            ok: false,
            topics: [],
            errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
            warnings,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] | null = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.topics)
          ? raw.topics
          : null;
    if (!arr) {
        return {
            ok: false,
            topics: [],
            errors: ['Expected a JSON array or { "topics": [...] }.'],
            warnings,
        };
    }

    const topics: CreatePracticeTopicInput[] = [];
    arr.forEach((t, i) => {
        const label = t?.title || `#${i + 1}`;
        if (!t || typeof t !== "object") {
            errors.push(`Item ${i + 1}: not an object.`);
            return;
        }
        if (!t.title) errors.push(`"${label}": missing title.`);
        if (!VALID_KINDS.has(t.kind))
            errors.push(`"${label}": kind must be "dsa" or "sql".`);
        if (!t.pattern) errors.push(`"${label}": missing pattern.`);
        if (t.status && !VALID_STATUS.has(t.status))
            errors.push(`"${label}": status must be draft/published/archived.`);
        if (!t.introHtml && !t.summary)
            warnings.push(`"${label}": no introHtml or summary — page will be sparse.`);

        topics.push({
            slug: t.slug || undefined,
            title: String(t.title || ""),
            kind: t.kind,
            pattern: t.pattern,
            subtitle: t.subtitle ?? null,
            summary: t.summary || "",
            introHtml: t.introHtml || "",
            mentalModelHtml: t.mentalModelHtml || "",
            coverImageUrl: t.coverImageUrl ?? null,
            warmupQuizSlug: t.warmupQuizSlug ?? null,
            prerequisiteTopicSlugs: Array.isArray(t.prerequisiteTopicSlugs)
                ? t.prerequisiteTopicSlugs
                : [],
            relatedTopicSlugs: Array.isArray(t.relatedTopicSlugs) ? t.relatedTopicSlugs : [],
            pinnedProblemSlugs: Array.isArray(t.pinnedProblemSlugs) ? t.pinnedProblemSlugs : [],
            tags: Array.isArray(t.tags) ? t.tags : [],
            isFeatured: Boolean(t.isFeatured),
            status: t.status || "draft",
            seo: t.seo || undefined,
        });
    });

    return { ok: errors.length === 0, topics, errors, warnings };
}

const TOPIC_JSON_TEMPLATE = JSON.stringify(
    {
        topics: [
            {
                title: "Two pointers",
                slug: "two-pointers",
                kind: "dsa",
                pattern: "two-pointers",
                subtitle: "The fastest way to traverse sorted arrays.",
                summary:
                    "Use two indices moving toward each other to solve array problems in O(n) instead of O(n²).",
                introHtml:
                    "<p>Two pointers is a technique where you maintain two indices into the same array and move them based on the data you see.</p><p>It shines for problems where the array is sorted (or can be sorted) and you're looking for pairs that satisfy a constraint.</p>",
                mentalModelHtml:
                    "<h3>When to recognize it</h3><ul><li>Sorted input + pair/triplet search</li><li>Palindrome / reversal questions</li><li>Container / area maximization</li></ul><h3>Common traps</h3><ul><li>Off-by-one when both pointers move at once</li><li>Forgetting to skip duplicates in 3-sum variants</li></ul>",
                coverImageUrl: null,
                warmupQuizSlug: null,
                prerequisiteTopicSlugs: ["arrays-hashing"],
                relatedTopicSlugs: ["sliding-window", "fast-slow-pointers"],
                pinnedProblemSlugs: ["two-sum", "three-sum", "container-with-most-water"],
                tags: ["arrays", "pointers"],
                isFeatured: true,
                status: "published",
                seo: {
                    metaTitle: "Two Pointers Pattern — DSA Practice Problems",
                    metaDescription:
                        "Learn the two-pointer technique with worked examples and hand-picked practice problems.",
                    ogImageUrl: null,
                    noIndex: false,
                },
            },
        ],
    },
    null,
    2
);

export function downloadTopicTemplate(filename = "practice-topics-template.json") {
    if (typeof window === "undefined") return;
    const blob = new Blob([TOPIC_JSON_TEMPLATE], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
