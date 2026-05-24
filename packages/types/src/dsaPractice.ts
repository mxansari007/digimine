/**
 * DSA + SQL practice module ("Mastery Engine").
 *
 * What makes this different from a plain problem bank:
 *
 *   1. Revision Radar  — spaced repetition (forgetting-curve scheduling) so
 *      solved problems resurface right before you'd forget them.
 *   2. Pattern Lens    — classify a problem's underlying PATTERN before the
 *      editorial; recognition accuracy is tracked separately from coding
 *      accuracy and rolled up into a per-pattern Mastery Map.
 *   3. Mentor Rescue   — stuck students flag a problem; a teacher sees their
 *      real attempts + failing tests and leaves a targeted hint.
 *
 * Collections:
 *   practiceProblems        — the problem bank (admin-authored)
 *   practiceSheets          — curated, ordered problem lists (DSA/SQL sheets)
 *   practiceSubmissions     — every run/submit a user makes
 *   practiceProgress        — per (user, problem): status + SM-2 revision state
 *   practiceMastery         — per (user, pattern): mastery rollup
 *   practiceRescueRequests  — "I'm stuck" flags routed to mentors
 */

import type { CodeLanguage, CodeStarter, CodeTestCase } from "./test";

// ─────────────────────────────────────────────────────────────────────
// Patterns — the ~25 core DSA patterns + SQL skill buckets
// ─────────────────────────────────────────────────────────────────────

export type DsaPattern =
    | "arrays-hashing"
    | "two-pointers"
    | "sliding-window"
    | "stack"
    | "binary-search"
    | "linked-list"
    | "trees"
    | "tries"
    | "heap-priority-queue"
    | "backtracking"
    | "graphs"
    | "advanced-graphs"
    | "dp-1d"
    | "dp-2d"
    | "greedy"
    | "intervals"
    | "math-geometry"
    | "bit-manipulation"
    | "recursion"
    | "divide-conquer"
    | "union-find"
    | "monotonic-stack"
    | "prefix-sum"
    | "matrix";

export type SqlPattern =
    | "sql-select-filter"
    | "sql-joins"
    | "sql-aggregation"
    | "sql-group-having"
    | "sql-subqueries"
    | "sql-window-functions"
    | "sql-cte"
    | "sql-set-ops"
    | "sql-string-date"
    | "sql-advanced";

export type PracticePattern = DsaPattern | SqlPattern;

export interface PatternMeta {
    id: PracticePattern;
    kind: "dsa" | "sql";
    label: string;
    blurb: string;
    /** Rough learning order — used to suggest the next pattern to pick up. */
    order: number;
}

export const DSA_PATTERNS: PatternMeta[] = [
    { id: "arrays-hashing", kind: "dsa", label: "Arrays & Hashing", blurb: "Frequency maps, dedup, lookups in O(1).", order: 1 },
    { id: "two-pointers", kind: "dsa", label: "Two Pointers", blurb: "Converge from both ends or fast/slow.", order: 2 },
    { id: "sliding-window", kind: "dsa", label: "Sliding Window", blurb: "Contiguous sub-array/string optimisation.", order: 3 },
    { id: "stack", kind: "dsa", label: "Stack", blurb: "LIFO, matching, evaluation.", order: 4 },
    { id: "binary-search", kind: "dsa", label: "Binary Search", blurb: "Search the answer space, not just arrays.", order: 5 },
    { id: "linked-list", kind: "dsa", label: "Linked List", blurb: "Pointer surgery, cycle detection.", order: 6 },
    { id: "trees", kind: "dsa", label: "Trees", blurb: "DFS/BFS, recursion on structure.", order: 7 },
    { id: "tries", kind: "dsa", label: "Tries", blurb: "Prefix trees for word problems.", order: 8 },
    { id: "heap-priority-queue", kind: "dsa", label: "Heap / Priority Queue", blurb: "Top-K, streaming medians, scheduling.", order: 9 },
    { id: "backtracking", kind: "dsa", label: "Backtracking", blurb: "Build candidates, prune, undo.", order: 10 },
    { id: "graphs", kind: "dsa", label: "Graphs", blurb: "Traversal, connectivity, shortest path.", order: 11 },
    { id: "advanced-graphs", kind: "dsa", label: "Advanced Graphs", blurb: "Dijkstra, MST, topo-sort.", order: 12 },
    { id: "dp-1d", kind: "dsa", label: "1-D DP", blurb: "Linear states, take/skip.", order: 13 },
    { id: "dp-2d", kind: "dsa", label: "2-D DP", blurb: "Grids, two sequences, intervals.", order: 14 },
    { id: "greedy", kind: "dsa", label: "Greedy", blurb: "Locally optimal → globally optimal.", order: 15 },
    { id: "intervals", kind: "dsa", label: "Intervals", blurb: "Merge, overlap, sweep.", order: 16 },
    { id: "math-geometry", kind: "dsa", label: "Math & Geometry", blurb: "Number theory, coordinate tricks.", order: 17 },
    { id: "bit-manipulation", kind: "dsa", label: "Bit Manipulation", blurb: "XOR tricks, masks, counting.", order: 18 },
    { id: "recursion", kind: "dsa", label: "Recursion", blurb: "Self-similar decomposition.", order: 19 },
    { id: "divide-conquer", kind: "dsa", label: "Divide & Conquer", blurb: "Split, solve, combine.", order: 20 },
    { id: "union-find", kind: "dsa", label: "Union-Find", blurb: "Disjoint sets, connectivity.", order: 21 },
    { id: "monotonic-stack", kind: "dsa", label: "Monotonic Stack", blurb: "Next greater/smaller element.", order: 22 },
    { id: "prefix-sum", kind: "dsa", label: "Prefix Sum", blurb: "Range queries in O(1).", order: 23 },
    { id: "matrix", kind: "dsa", label: "Matrix", blurb: "Rotation, spiral, in-place tricks.", order: 24 },
];

export const SQL_PATTERNS: PatternMeta[] = [
    { id: "sql-select-filter", kind: "sql", label: "SELECT & Filter", blurb: "WHERE, DISTINCT, ORDER, LIMIT.", order: 1 },
    { id: "sql-joins", kind: "sql", label: "Joins", blurb: "INNER/LEFT/SELF joins.", order: 2 },
    { id: "sql-aggregation", kind: "sql", label: "Aggregation", blurb: "COUNT/SUM/AVG/MIN/MAX.", order: 3 },
    { id: "sql-group-having", kind: "sql", label: "Group & Having", blurb: "GROUP BY + HAVING filters.", order: 4 },
    { id: "sql-subqueries", kind: "sql", label: "Subqueries", blurb: "Scalar, IN, EXISTS, correlated.", order: 5 },
    { id: "sql-window-functions", kind: "sql", label: "Window Functions", blurb: "ROW_NUMBER, RANK, running totals.", order: 6 },
    { id: "sql-cte", kind: "sql", label: "CTEs", blurb: "WITH clauses, recursive CTEs.", order: 7 },
    { id: "sql-set-ops", kind: "sql", label: "Set Operations", blurb: "UNION, INTERSECT, EXCEPT.", order: 8 },
    { id: "sql-string-date", kind: "sql", label: "String & Date", blurb: "Formatting, extraction, intervals.", order: 9 },
    { id: "sql-advanced", kind: "sql", label: "Advanced SQL", blurb: "Pivots, gaps & islands, dedup.", order: 10 },
];

export const ALL_PATTERNS: PatternMeta[] = [...DSA_PATTERNS, ...SQL_PATTERNS];

export function patternMeta(id: PracticePattern): PatternMeta | undefined {
    return ALL_PATTERNS.find((p) => p.id === id);
}

// ─────────────────────────────────────────────────────────────────────
// Problems
// ─────────────────────────────────────────────────────────────────────

export type PracticeKind = "dsa" | "sql";
export type PracticeDifficulty = "easy" | "medium" | "hard";
export type PracticeStatus = "draft" | "published" | "archived";

/** A worked hint revealed progressively (Pattern Lens scaffolding). */
export interface PracticeHint {
    id: string;
    /** Order in the progressive-reveal ladder (0 = gentlest nudge). */
    order: number;
    text: string;
}

/** SQL problems carry a seed schema + expected result set instead of test cases. */
export interface SqlDataset {
    /** DDL + INSERT statements that seed the in-memory SQLite. */
    schemaSql: string;
    /** Reference solution query (used to recompute expected output / for editorial). */
    solutionSql: string;
    /** Whether row order matters when comparing the user's result to expected. */
    orderMatters: boolean;
    /** Pre-computed expected rows (header + rows) — hidden from the user. */
    expectedColumns: string[];
    expectedRows: Array<Array<string | number | null>>;
}

export interface PracticeProblem {
    id: string;
    slug: string;
    kind: PracticeKind;
    title: string;
    /** Rich HTML statement (RichTextEditor output). */
    statementHtml: string;
    difficulty: PracticeDifficulty;
    /** Every problem maps to exactly one PRIMARY pattern (drives the Mastery Map). */
    primaryPattern: PracticePattern;
    /** Optional secondary patterns for tagging/search. */
    secondaryPatterns: PracticePattern[];
    /** Topic tags (company names, "neetcode-150", etc.). */
    tags: string[];
    /** Pattern-Lens distractors: which patterns to offer as wrong answers. */
    patternChoices: PracticePattern[];

    // DSA-specific
    languages: CodeLanguage[];
    starters: CodeStarter[];
    testCases: CodeTestCase[];
    /** Sample I/O shown to the user (subset of testCases that aren't hidden). */
    constraintsHtml: string | null;
    timeLimitMs: number;
    memoryLimitMb: number;

    // SQL-specific (null for DSA)
    sql: SqlDataset | null;

    // Editorial
    editorialHtml: string | null;
    hints: PracticeHint[];
    /** Optional canonical solution per language. */
    solutions: CodeStarter[];

    // Meta
    status: PracticeStatus;
    /** Free vs requires login vs premium. */
    access: "free" | "login" | "premium";
    /** Aggregate stats (eventually consistent). */
    totalSubmissions: number;
    totalSolved: number;
    isFeatured: boolean;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface PracticeProblemSummary {
    id: string;
    slug: string;
    kind: PracticeKind;
    title: string;
    difficulty: PracticeDifficulty;
    primaryPattern: PracticePattern;
    tags: string[];
    access: PracticeProblem["access"];
    totalSolved: number;
    isFeatured: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Sheets — curated, ordered problem lists
// ─────────────────────────────────────────────────────────────────────

export interface PracticeSheetItem {
    problemId: string;
    /** Optional grouping within the sheet, e.g. "Day 1" or "Step 3". */
    section: string | null;
    order: number;
}

/**
 * A section within a sheet — a sub-journey within the broader sheet's
 * journey. Optionally references a `PracticeTopic` so the section header
 * can link to the topic's umbrella page (and inherit metadata from it).
 *
 *  - `problemSlugs` is the ordered list of problems in this section. Slugs
 *    (not IDs) for portability — a sheet survives a doc rename, the
 *    renderer drops slugs whose problems were unpublished without breaking.
 *  - `topicSlug` is optional. When set, the section header links to
 *    `/practice/topics/{topicSlug}` so users can dive deeper.
 *  - `title` always wins — even when a topic is referenced, the sheet
 *    author can override the heading to fit the sheet's narrative
 *    (e.g. "Day 1 — Warm up" rather than the topic's "Two pointers").
 */
export interface PracticeSheetSection {
    topicSlug: string | null;
    title: string;
    summary: string | null;
    problemSlugs: string[];
}

export type PracticeSheetDifficulty = "beginner" | "intermediate" | "advanced";

export interface PracticeSheetSeo {
    metaTitle: string | null;
    metaDescription: string | null;
    ogImageUrl: string | null;
    noIndex: boolean;
}

export const DEFAULT_PRACTICE_SHEET_SEO: PracticeSheetSeo = {
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
    noIndex: false,
};

export interface PracticeSheet {
    id: string;
    slug: string;
    kind: PracticeKind | "mixed";
    title: string;
    /** Short tagline shown under the title in lists + sheet hero. */
    subtitle: string | null;
    description: string;
    coverImageUrl: string | null;
    /**
     * LEGACY: flat ordered problem list with a free-text `section` string.
     * Kept for backwards compatibility with sheets created before the
     * sections-with-topics model. Renderers prefer `sections[]` if present
     * and fall back to grouping `items[]` by `section` when not.
     */
    items: PracticeSheetItem[];
    /** NEW: rich sections — each with optional topic reference + ordered problems. */
    sections: PracticeSheetSection[];
    difficulty: PracticeSheetDifficulty | null;
    /** Rough total time investment in hours (rendered as "≈X hrs"). */
    estimatedHours: number | null;
    tags: string[];
    isOfficial: boolean;
    isFeatured: boolean;
    status: PracticeStatus;
    seo: PracticeSheetSeo;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreatePracticeSheetInput {
    slug?: string;
    title: string;
    kind: PracticeKind | "mixed";
    subtitle?: string | null;
    description?: string;
    coverImageUrl?: string | null;
    sections?: PracticeSheetSection[];
    difficulty?: PracticeSheetDifficulty | null;
    estimatedHours?: number | null;
    tags?: string[];
    isOfficial?: boolean;
    isFeatured?: boolean;
    status?: PracticeStatus;
    seo?: Partial<PracticeSheetSeo>;
    createdBy?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Topics — canonical "umbrella" pages per pattern (e.g. /practice/topics/two-pointers)
// ─────────────────────────────────────────────────────────────────────

/**
 * A canonical, backlinkable page that teaches one pattern (two-pointers,
 * sliding-window, joins, etc.) and lists every published problem that uses
 * it. Distinct from a sheet — a sheet is a *journey* (ordered, multi-topic);
 * a topic is the *reference page* for one pattern.
 *
 *  - Public route: `/practice/topics/{slug}`
 *  - Auto-pulls all published problems where `primaryPattern === topic.pattern`,
 *    plus any explicitly pinned problems via `pinnedProblemIds`.
 *  - Doc ID is the slug (matches the articles / courses pattern), so detail
 *    pages do O(1) reads via `doc(slug)` with no index lookup.
 */
export interface PracticeTopicSeo {
    metaTitle: string | null;
    metaDescription: string | null;
    ogImageUrl: string | null;
    /** When true, emit <meta name="robots" content="noindex">. */
    noIndex: boolean;
}

export interface PracticeTopic {
    id: string;
    slug: string;
    kind: PracticeKind;
    /** One of the pattern IDs from ALL_PATTERNS — the link to the problem catalog. */
    pattern: PracticePattern;
    title: string;
    subtitle: string | null;
    /** Short blurb shown in lists + at top of the topic page. */
    summary: string;
    /** Rich HTML — "what is this pattern, when do you use it". */
    introHtml: string;
    /** Rich HTML — mental model, when-to-use, traps, related patterns. */
    mentalModelHtml: string;
    coverImageUrl: string | null;
    /** Quiz slug (links to existing `quizzes` collection) for a warm-up. */
    warmupQuizSlug: string | null;
    /** Slugs of topics a learner should know first. */
    prerequisiteTopicSlugs: string[];
    /** Slugs of related topics shown at the bottom ("what to learn next"). */
    relatedTopicSlugs: string[];
    /** Optionally pin specific problems (slug list). Otherwise auto-fill by `pattern`. */
    pinnedProblemSlugs: string[];
    tags: string[];
    isFeatured: boolean;
    status: PracticeStatus;
    seo: PracticeTopicSeo;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export const DEFAULT_PRACTICE_TOPIC_SEO: PracticeTopicSeo = {
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
    noIndex: false,
};

export interface CreatePracticeTopicInput {
    slug?: string;
    title: string;
    kind: PracticeKind;
    pattern: PracticePattern;
    subtitle?: string | null;
    summary?: string;
    introHtml?: string;
    mentalModelHtml?: string;
    coverImageUrl?: string | null;
    warmupQuizSlug?: string | null;
    prerequisiteTopicSlugs?: string[];
    relatedTopicSlugs?: string[];
    pinnedProblemSlugs?: string[];
    tags?: string[];
    isFeatured?: boolean;
    status?: PracticeStatus;
    seo?: Partial<PracticeTopicSeo>;
    createdBy?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Submissions
// ─────────────────────────────────────────────────────────────────────

export type SubmissionVerdict =
    | "accepted"
    | "wrong_answer"
    | "runtime_error"
    | "compile_error"
    | "time_limit_exceeded"
    | "pending";

export type SubmissionMode = "run" | "submit";

export interface PracticeSubmission {
    id: string;
    userId: string;
    problemId: string;
    kind: PracticeKind;
    mode: SubmissionMode;
    language: CodeLanguage | "sql";
    code: string;
    verdict: SubmissionVerdict;
    passedCount: number;
    totalCount: number;
    /** Per-test results (hidden tests are masked on read). */
    results: Array<{
        index: number;
        passed: boolean;
        isHidden: boolean;
        input?: string;
        expectedOutput?: string;
        actualOutput?: string;
    }>;
    runtimeMs: number | null;
    createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Progress + spaced repetition (Revision Radar) — per (user, problem)
// ─────────────────────────────────────────────────────────────────────

export type ProblemUserStatus = "todo" | "attempted" | "solved";

/**
 * SM-2-lite scheduling fields. `grade` 0..5 is derived from solve
 * performance (see engine). Doc id is `${userId}_${problemId}`.
 */
export interface PracticeProgress {
    id: string;
    userId: string;
    problemId: string;
    kind: PracticeKind;
    primaryPattern: PracticePattern;
    difficulty: PracticeDifficulty;

    status: ProblemUserStatus;
    attempts: number;
    solvedAt: Date | null;
    solvedFirstTry: boolean;
    usedHints: boolean;
    bestRuntimeMs: number | null;

    // Pattern Lens
    recognitionAnswered: boolean;
    recognitionCorrect: boolean;

    // Spaced repetition (SM-2 lite)
    ease: number; // default 2.5
    intervalDays: number; // current interval
    repetitions: number; // consecutive good recalls
    lastGrade: number; // 0..5
    dueAt: Date | null; // when this resurfaces in Revision Radar
    lastReviewedAt: Date | null;

    starred: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Mastery — per (user, pattern). Doc id `${userId}_${pattern}`.
// ─────────────────────────────────────────────────────────────────────

export type MasteryLevel = "novice" | "learning" | "proficient" | "mastered";

export interface PracticeMastery {
    id: string;
    userId: string;
    pattern: PracticePattern;
    kind: PracticeKind;

    attempted: number;
    solved: number;
    solvedFirstTry: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;

    recognitionCorrect: number;
    recognitionTotal: number;

    /** 0..100 composite. See engine.computeMasteryScore. */
    masteryScore: number;
    level: MasteryLevel;
    lastPracticedAt: Date | null;
    updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Mentor Rescue
// ─────────────────────────────────────────────────────────────────────

export type RescueStatus = "open" | "answered" | "resolved";

export interface PracticeRescueRequest {
    id: string;
    userId: string;
    userName: string;
    problemId: string;
    problemTitle: string;
    /** The student's latest failing submission id for context. */
    submissionId: string | null;
    message: string;
    /** Routed to a specific teacher (their classroom mentor) or open pool. */
    teacherId: string | null;
    status: RescueStatus;
    mentorReply: string | null;
    mentorId: string | null;
    createdAt: Date;
    answeredAt: Date | null;
}

// ─────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────

export interface CreatePracticeProblemInput {
    slug?: string;
    kind: PracticeKind;
    title: string;
    statementHtml: string;
    difficulty: PracticeDifficulty;
    primaryPattern: PracticePattern;
    secondaryPatterns?: PracticePattern[];
    tags?: string[];
    patternChoices?: PracticePattern[];
    languages?: CodeLanguage[];
    starters?: CodeStarter[];
    testCases?: CodeTestCase[];
    constraintsHtml?: string | null;
    timeLimitMs?: number;
    memoryLimitMb?: number;
    sql?: SqlDataset | null;
    editorialHtml?: string | null;
    hints?: PracticeHint[];
    solutions?: CodeStarter[];
    status?: PracticeStatus;
    access?: PracticeProblem["access"];
    isFeatured?: boolean;
}
