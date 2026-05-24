/**
 * Bulk import + template for practice sheets.
 *
 * Sheets are structural (sections with problem-slug arrays) — JSON is the
 * right shape. Accepts either a bare array or `{ "sheets": [...] }`.
 *
 * Each section's `problemSlugs` must reference EXISTING published problem
 * slugs — the importer doesn't validate this (problems may be in flight),
 * but the public sheet page silently drops unknown slugs.
 */
import type {
    CreatePracticeSheetInput,
    PracticeSheetSection,
} from "@digimine/types";

export interface SheetsParseResult {
    ok: boolean;
    sheets: CreatePracticeSheetInput[];
    errors: string[];
    warnings: string[];
}

const VALID_KINDS = new Set(["dsa", "sql", "mixed"]);
const VALID_DIFFICULTY = new Set(["beginner", "intermediate", "advanced"]);
const VALID_STATUS = new Set(["draft", "published", "archived"]);

export function parseSheetsJson(text: string): SheetsParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        return {
            ok: false,
            sheets: [],
            errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
            warnings,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] | null = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.sheets)
          ? raw.sheets
          : null;
    if (!arr) {
        return {
            ok: false,
            sheets: [],
            errors: ['Expected a JSON array or { "sheets": [...] }.'],
            warnings,
        };
    }

    const sheets: CreatePracticeSheetInput[] = [];
    arr.forEach((s, i) => {
        const label = s?.title || `#${i + 1}`;
        if (!s || typeof s !== "object") {
            errors.push(`Item ${i + 1}: not an object.`);
            return;
        }
        if (!s.title) errors.push(`"${label}": missing title.`);
        if (!VALID_KINDS.has(s.kind))
            errors.push(`"${label}": kind must be "dsa", "sql", or "mixed".`);
        if (s.difficulty && !VALID_DIFFICULTY.has(s.difficulty))
            errors.push(
                `"${label}": difficulty must be beginner/intermediate/advanced.`
            );
        if (s.status && !VALID_STATUS.has(s.status))
            errors.push(`"${label}": status must be draft/published/archived.`);

        // Sections — accept either the modern shape or a flat `problemSlugs`
        // top-level array (single-section sheet) as a convenience.
        let sections: PracticeSheetSection[] = [];
        if (Array.isArray(s.sections) && s.sections.length > 0) {
            sections = s.sections.map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (sec: any, j: number) => {
                    if (!sec.title)
                        warnings.push(
                            `"${label}" section ${j + 1}: missing title — will display as "Untitled section".`
                        );
                    return {
                        topicSlug: sec.topicSlug || null,
                        title: String(sec.title || ""),
                        summary: sec.summary || null,
                        problemSlugs: Array.isArray(sec.problemSlugs)
                            ? sec.problemSlugs.filter(Boolean)
                            : [],
                    };
                }
            );
        } else if (Array.isArray(s.problemSlugs)) {
            sections = [
                {
                    topicSlug: null,
                    title: s.title || "Problems",
                    summary: null,
                    problemSlugs: s.problemSlugs.filter(Boolean),
                },
            ];
        } else {
            warnings.push(`"${label}": no sections — sheet will render empty.`);
        }

        sheets.push({
            slug: s.slug || undefined,
            title: String(s.title || ""),
            kind: s.kind,
            subtitle: s.subtitle ?? null,
            description: s.description || "",
            coverImageUrl: s.coverImageUrl ?? null,
            sections,
            difficulty: s.difficulty || null,
            estimatedHours:
                typeof s.estimatedHours === "number" ? s.estimatedHours : null,
            tags: Array.isArray(s.tags) ? s.tags : [],
            isOfficial: Boolean(s.isOfficial),
            isFeatured: Boolean(s.isFeatured),
            status: s.status || "draft",
            seo: s.seo || undefined,
        });
    });

    return { ok: errors.length === 0, sheets, errors, warnings };
}

const SHEET_JSON_TEMPLATE = JSON.stringify(
    {
        sheets: [
            {
                title: "TCS NQT 30-day plan",
                slug: "tcs-nqt-30-day-plan",
                kind: "mixed",
                subtitle: "From zero to placement-ready in 4 weeks.",
                description:
                    "Day-by-day journey covering arrays, hashing, two-pointers, sliding window, and core SQL — built on real TCS NQT papers from the last 4 years.",
                coverImageUrl: null,
                difficulty: "beginner",
                estimatedHours: 40,
                tags: ["tcs", "nqt", "placement"],
                isOfficial: true,
                isFeatured: true,
                status: "published",
                sections: [
                    {
                        title: "Week 1 — Foundations",
                        topicSlug: "arrays-hashing",
                        summary: "Build the muscle memory for array operations.",
                        problemSlugs: ["two-sum", "valid-anagram", "group-anagrams"],
                    },
                    {
                        title: "Week 2 — Two pointers",
                        topicSlug: "two-pointers",
                        summary: "Solve in O(n) what you used to brute-force in O(n²).",
                        problemSlugs: ["three-sum", "container-with-most-water", "trapping-rain-water"],
                    },
                    {
                        title: "Week 3 — Sliding window",
                        topicSlug: "sliding-window",
                        summary: null,
                        problemSlugs: ["best-time-to-buy-and-sell-stock", "longest-substring-without-repeat"],
                    },
                    {
                        title: "Week 4 — SQL must-knows",
                        topicSlug: "joins",
                        summary: "JOINs, GROUP BY, HAVING — the ones interviewers actually test.",
                        problemSlugs: ["second-highest-salary", "department-top-three"],
                    },
                ],
                seo: {
                    metaTitle: "TCS NQT 30-day plan — full DSA + SQL practice sheet",
                    metaDescription:
                        "Crack TCS NQT in 4 weeks. Section-by-section DSA + SQL practice sheet built on real exam papers.",
                    ogImageUrl: null,
                    noIndex: false,
                },
            },
        ],
    },
    null,
    2
);

export function downloadSheetTemplate(filename = "practice-sheets-template.json") {
    if (typeof window === "undefined") return;
    const blob = new Blob([SHEET_JSON_TEMPLATE], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
