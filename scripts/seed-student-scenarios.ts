/**
 * Comprehensive student-scenario seed.
 *
 * Creates ~20 persona accounts, each one a canonical example of a specific
 * student-side state of the app, so QA can log in as a persona and see that
 * feature working end-to-end without having to build the state by hand.
 *
 * Invoked from scripts/seed-emulators.ts — see seedStudentScenarios() at
 * the bottom for the entrypoint. Idempotent: every doc uses a deterministic
 * id, every persona uid is fixed, and the auth user is deleted+recreated
 * each run so passwords reset to the seed value.
 *
 * What gets covered (one persona per row unless noted):
 *
 *   rookie               brand new, no activity (empty-state UI)
 *   explorer             5 problems attempted, 2 solved (partial state)
 *   active               healthy power user — 15 solved, 6 patterns, 7-day streak
 *   streaker             30-day continuous solve streak
 *   lapsed               was active, now 12 overdue revision items
 *   struggler            many WA/TLE submissions, low solve rate
 *   firsttry             12 first-try solves → "mastered" tier
 *   sqlonly              only SQL problems solved
 *   polyglot             same problems solved in python/js/cpp/java
 *   paid-pro             active pro subscription, premium problems unlocked
 *   trial-pro            pro trial (5 days left)
 *   expired-pro          pro expired 10 days ago
 *   promo                pro via promo grant
 *   community            posts discussions + solutions with upvotes
 *   rescue               1 open + 1 answered + 1 resolved mentor request
 *   course-active        enrolled in DSA Foundations course
 *   multiclass           enrolled in BOTH classA and classB
 *   quiz-resume          one in-progress quiz attempt (resume state)
 *   test-resume          one in-progress mock test attempt (resume state)
 *   test-failed          one failed mock test attempt (result page)
 *
 * Implementation notes:
 *  - The "submit pipeline" (recordSubmission) is simulated directly via
 *    Firestore writes — same shape as practiceSubmissions, practiceProgress,
 *    practiceMastery — so the data looks indistinguishable from real submits
 *    once seeded.
 *  - Mastery score + level are computed using inlined copies of the engine
 *    helpers (kept in @digimine/types) so re-importing the workspace package
 *    isn't required from this script.
 *  - SM-2 scheduling uses the same formula as practiceEngine.scheduleRevision.
 */

/* eslint-disable no-console */

import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

const PASSWORD = "Test1234!";
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Time helpers ─────────────────────────────────────────────────────

const now = () => Timestamp.now();
const daysAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * DAY_MS);
const daysFromNow = (n: number) => Timestamp.fromMillis(Date.now() + n * DAY_MS);

// ─── Inlined mastery / SM-2 engine ────────────────────────────────────
// Kept in sync with packages/types/src/practiceEngine.ts. Re-implementing
// rather than importing keeps the seed script free of workspace deps.

const DIFFICULTY_WEIGHT = { easy: 1, medium: 2, hard: 3 } as const;
type Difficulty = keyof typeof DIFFICULTY_WEIGHT;

interface MasteryInputs {
    attempted: number;
    solved: number;
    solvedFirstTry: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;
    recognitionCorrect: number;
    recognitionTotal: number;
    lastPracticedAtMs?: number | null;
}

function computeMasteryScore(m: MasteryInputs, ref: number = Date.now()): number {
    if (m.attempted === 0) return 0;
    const solveRate = m.solved / Math.max(1, m.attempted);
    const firstTryRate = m.solved > 0 ? m.solvedFirstTry / m.solved : 0;
    const weighted =
        m.easySolved * DIFFICULTY_WEIGHT.easy +
        m.mediumSolved * DIFFICULTY_WEIGHT.medium +
        m.hardSolved * DIFFICULTY_WEIGHT.hard;
    const coverage = Math.min(1, weighted / 8);
    const recognition = m.recognitionTotal > 0 ? m.recognitionCorrect / m.recognitionTotal : 0.5;
    let recency = 0;
    if (m.lastPracticedAtMs) {
        const days = (ref - m.lastPracticedAtMs) / DAY_MS;
        recency = days <= 14 ? 1 : Math.max(0, 1 - (days - 14) / 106);
    }
    const score = solveRate * 35 + firstTryRate * 20 + coverage * 20 + recognition * 15 + recency * 10;
    return Math.round(score);
}

function masteryLevel(score: number): "novice" | "learning" | "proficient" | "mastered" {
    if (score >= 80) return "mastered";
    if (score >= 55) return "proficient";
    if (score >= 25) return "learning";
    return "novice";
}

interface RevisionState {
    ease: number;
    intervalDays: number;
    repetitions: number;
}

function scheduleRevision(prev: RevisionState, grade: number, ref: number): RevisionState & { dueAtMs: number } {
    const MIN_EASE = 1.3;
    let { ease, intervalDays, repetitions } = prev;
    if (grade < 3) {
        repetitions = 0;
        intervalDays = 1;
    } else {
        repetitions += 1;
        if (repetitions === 1) intervalDays = 1;
        else if (repetitions === 2) intervalDays = 6;
        else intervalDays = Math.round(intervalDays * ease);
        ease = Math.max(MIN_EASE, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    }
    return { ease, intervalDays, repetitions, dueAtMs: ref + intervalDays * DAY_MS };
}

function deriveGrade(opts: {
    solved: boolean;
    attemptsThisSession: number;
    usedHints: boolean;
    recognitionCorrect: boolean | null;
}): number {
    if (!opts.solved) return opts.attemptsThisSession > 1 ? 1 : 0;
    let g = 5;
    if (opts.attemptsThisSession >= 4) g -= 2;
    else if (opts.attemptsThisSession >= 2) g -= 1;
    if (opts.usedHints) g -= 1;
    if (opts.recognitionCorrect === false) g -= 1;
    return Math.max(2, Math.min(5, g));
}

// ─── Problem catalog (mirrors seed/practice-problems*.json) ──────────
// Only the metadata we need to fabricate progress/mastery — not the full
// problem doc, which is seeded separately by seedPracticeProblems().

type CatalogEntry = {
    slug: string;
    kind: "dsa" | "sql";
    difficulty: Difficulty;
    pattern: string;
    access: "free" | "login" | "premium";
};

const CATALOG: CatalogEntry[] = [
    { slug: "sum-of-an-array", kind: "dsa", difficulty: "easy", pattern: "arrays-hashing", access: "free" },
    { slug: "contains-duplicate", kind: "dsa", difficulty: "easy", pattern: "arrays-hashing", access: "free" },
    { slug: "reverse-a-string", kind: "dsa", difficulty: "easy", pattern: "two-pointers", access: "free" },
    { slug: "valid-palindrome", kind: "dsa", difficulty: "easy", pattern: "two-pointers", access: "free" },
    { slug: "trapping-rain-water", kind: "dsa", difficulty: "hard", pattern: "two-pointers", access: "premium" },
    { slug: "longest-substring-without-repeating", kind: "dsa", difficulty: "medium", pattern: "sliding-window", access: "free" },
    { slug: "valid-parentheses", kind: "dsa", difficulty: "easy", pattern: "stack", access: "login" },
    { slug: "daily-temperatures", kind: "dsa", difficulty: "medium", pattern: "monotonic-stack", access: "free" },
    { slug: "binary-search-index", kind: "dsa", difficulty: "medium", pattern: "binary-search", access: "free" },
    { slug: "reverse-linked-list", kind: "dsa", difficulty: "easy", pattern: "linked-list", access: "free" },
    { slug: "tree-height-parent-array", kind: "dsa", difficulty: "easy", pattern: "trees", access: "login" },
    { slug: "kth-largest-element", kind: "dsa", difficulty: "medium", pattern: "heap-priority-queue", access: "free" },
    { slug: "top-k-frequent-elements", kind: "dsa", difficulty: "medium", pattern: "heap-priority-queue", access: "free" },
    { slug: "generate-parentheses", kind: "dsa", difficulty: "medium", pattern: "backtracking", access: "premium" },
    { slug: "number-of-islands", kind: "dsa", difficulty: "medium", pattern: "graphs", access: "premium" },
    { slug: "climbing-stairs", kind: "dsa", difficulty: "easy", pattern: "dp-1d", access: "free" },
    { slug: "maximum-subarray-sum", kind: "dsa", difficulty: "medium", pattern: "dp-1d", access: "premium" },
    { slug: "unique-paths", kind: "dsa", difficulty: "medium", pattern: "dp-2d", access: "premium" },
    { slug: "jump-game", kind: "dsa", difficulty: "medium", pattern: "greedy", access: "free" },
    { slug: "merge-intervals", kind: "dsa", difficulty: "medium", pattern: "intervals", access: "free" },
    { slug: "reverse-integer", kind: "dsa", difficulty: "easy", pattern: "math-geometry", access: "free" },
    { slug: "single-number", kind: "dsa", difficulty: "easy", pattern: "bit-manipulation", access: "free" },
    { slug: "subarray-sum-equals-k", kind: "dsa", difficulty: "medium", pattern: "prefix-sum", access: "premium" },
    { slug: "high-earning-employees", kind: "sql", difficulty: "easy", pattern: "sql-select-filter", access: "free" },
    { slug: "customers-with-orders", kind: "sql", difficulty: "easy", pattern: "sql-joins", access: "free" },
    { slug: "total-revenue", kind: "sql", difficulty: "easy", pattern: "sql-aggregation", access: "free" },
    { slug: "big-spenders", kind: "sql", difficulty: "medium", pattern: "sql-group-having", access: "premium" },
    { slug: "employees-earning-more-than-manager", kind: "sql", difficulty: "easy", pattern: "sql-joins", access: "free" },
    { slug: "top-earner-per-department", kind: "sql", difficulty: "medium", pattern: "sql-subqueries", access: "free" },
    { slug: "second-highest-salary", kind: "sql", difficulty: "medium", pattern: "sql-subqueries", access: "free" },
    { slug: "running-total", kind: "sql", difficulty: "medium", pattern: "sql-window-functions", access: "premium" },
];

function problem(slug: string): CatalogEntry {
    const p = CATALOG.find((c) => c.slug === slug);
    if (!p) throw new Error(`Unknown problem slug in seed catalog: ${slug}`);
    return p;
}

// ─── Persona definitions ──────────────────────────────────────────────

interface Persona {
    uid: string;
    email: string;
    displayName: string;
    scenario: string;
    /** One-line description shown in the seed summary. */
    summary: string;
}

const PERSONAS: Persona[] = [
    { uid: "seed-p-rookie",        email: "rookie@test.com",        displayName: "Rookie Riya",        scenario: "rookie",        summary: "Brand new — no activity. Empty-state UI." },
    { uid: "seed-p-explorer",      email: "explorer@test.com",      displayName: "Explorer Esha",      scenario: "explorer",      summary: "5 problems attempted, 2 solved. Partial state." },
    { uid: "seed-p-active",        email: "active@test.com",        displayName: "Active Aman",        scenario: "active",        summary: "15 solved across 6 patterns, 7-day streak, mature SM-2." },
    { uid: "seed-p-streaker",      email: "streaker@test.com",      displayName: "Streaker Sneha",     scenario: "streaker",      summary: "30-day continuous solve streak." },
    { uid: "seed-p-lapsed",        email: "lapsed@test.com",        displayName: "Lapsed Lakshay",     scenario: "lapsed",        summary: "12 overdue revision items, idle 14 days." },
    { uid: "seed-p-struggler",     email: "struggler@test.com",     displayName: "Struggler Sahil",    scenario: "struggler",     summary: "40+ failed attempts, only 6 solves. Low mastery." },
    { uid: "seed-p-firsttry",      email: "firsttry@test.com",      displayName: "First-try Farah",    scenario: "firsttry",      summary: "12 first-try solves. Mastered tier." },
    { uid: "seed-p-sqlonly",       email: "sqlonly@test.com",       displayName: "SQL-only Sara",      scenario: "sqlonly",       summary: "Only SQL problems solved." },
    { uid: "seed-p-polyglot",      email: "polyglot@test.com",      displayName: "Polyglot Param",     scenario: "polyglot",      summary: "Same problems solved across python/js/cpp/java." },
    { uid: "seed-p-paid-pro",      email: "paid-pro@test.com",      displayName: "Paid-Pro Pranav",    scenario: "paid-pro",      summary: "Pro active. Solved premium problems." },
    { uid: "seed-p-trial-pro",     email: "trial-pro@test.com",     displayName: "Trial-Pro Tara",     scenario: "trial-pro",     summary: "Pro trialing — 5 days left." },
    { uid: "seed-p-expired-pro",   email: "expired-pro@test.com",   displayName: "Expired Eshan",      scenario: "expired-pro",   summary: "Pro expired 10 days ago. Upgrade nudge." },
    { uid: "seed-p-promo",         email: "promo@test.com",         displayName: "Promo Priya",        scenario: "promo",         summary: "Pro via promo grant." },
    { uid: "seed-p-community",     email: "community@test.com",     displayName: "Community Kavya",    scenario: "community",     summary: "Posts discussions + solutions. Has upvotes." },
    { uid: "seed-p-rescue",        email: "rescue@test.com",        displayName: "Rescue Rahul",       scenario: "rescue",        summary: "Open + answered + resolved rescue requests." },
    { uid: "seed-p-course-active", email: "course-active@test.com", displayName: "Course Charu",       scenario: "course-active", summary: "Enrolled in DSA Foundations course." },
    { uid: "seed-p-multiclass",    email: "multiclass@test.com",    displayName: "Multiclass Manav",   scenario: "multiclass",    summary: "Enrolled in BOTH class A and class B." },
    { uid: "seed-p-quiz-resume",   email: "quiz-resume@test.com",   displayName: "Quiz-Resume Qadir",  scenario: "quiz-resume",   summary: "Has an in-progress quiz attempt." },
    { uid: "seed-p-test-resume",   email: "test-resume@test.com",   displayName: "Test-Resume Tanvi",  scenario: "test-resume",   summary: "Has an in-progress mock test attempt." },
    { uid: "seed-p-test-failed",   email: "test-failed@test.com",   displayName: "Test-Failed Vivaan", scenario: "test-failed",   summary: "Completed a mock test below passing." },
];

// ─── Auth + user doc upsert ───────────────────────────────────────────

async function upsertPersona(auth: Auth, db: Firestore, p: Persona) {
    try { await auth.deleteUser(p.uid); } catch { /* not found */ }
    await auth.createUser({
        uid: p.uid,
        email: p.email,
        password: PASSWORD,
        emailVerified: true,
        displayName: p.displayName,
    });
    await db.collection("users").doc(p.uid).set({
        id: p.uid,
        email: p.email,
        displayName: p.displayName,
        firstName: p.displayName.split(" ")[0],
        lastName: p.displayName.split(" ").slice(1).join(" "),
        phoneNumber: null,
        role: "customer",
        onboardingStep: "complete",
        createdAt: daysAgo(45),
        updatedAt: now(),
    });
}

// ─── Per-write helpers (mirror recordSubmission) ──────────────────────

interface SolveArgs {
    daysAgo: number;
    attempts?: number;            // attempts in this session before solving
    language?: string;
    usedHints?: boolean;
    recognitionCorrect?: boolean | null;
    /** Override the natural SM-2 progression — useful for "lapsed" / "mature" scenarios. */
    sm2?: { ease: number; intervalDays: number; repetitions: number; dueAtDaysFromNow: number };
    starred?: boolean;
    /** Bypass the deterministic ID — if false, multiple solves on the same (user,problem) deduplicate. */
    submissionIndex?: number;
}

/**
 * In-memory rollup of mastery per (userId, pattern) so we batch-write at the
 * end of a persona's solves rather than re-reading after every solve. Keys
 * are `${userId}__${pattern}`.
 */
const MASTERY_BUFFER = new Map<string, MasteryInputs & { kind: "dsa" | "sql"; pattern: string; userId: string; lastPracticedAtMs: number }>();

function bumpMastery(opts: {
    userId: string;
    pattern: string;
    kind: "dsa" | "sql";
    difficulty: Difficulty;
    solved: boolean;
    firstTry: boolean;
    practicedAtMs: number;
}) {
    const key = `${opts.userId}__${opts.pattern}`;
    const m = MASTERY_BUFFER.get(key) || {
        userId: opts.userId,
        pattern: opts.pattern,
        kind: opts.kind,
        attempted: 0,
        solved: 0,
        solvedFirstTry: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
        recognitionCorrect: 0,
        recognitionTotal: 0,
        lastPracticedAtMs: 0,
    };
    m.attempted += 1;
    if (opts.solved) {
        m.solved += 1;
        if (opts.firstTry) m.solvedFirstTry += 1;
        if (opts.difficulty === "easy") m.easySolved += 1;
        else if (opts.difficulty === "medium") m.mediumSolved += 1;
        else m.hardSolved += 1;
    }
    m.lastPracticedAtMs = Math.max(m.lastPracticedAtMs, opts.practicedAtMs);
    MASTERY_BUFFER.set(key, m);
}

async function flushMastery(db: Firestore) {
    if (MASTERY_BUFFER.size === 0) return;
    const batch = db.batch();
    for (const [key, m] of MASTERY_BUFFER.entries()) {
        const score = computeMasteryScore(m);
        const docId = `${m.userId}_${m.pattern}`;
        batch.set(
            db.collection("practiceMastery").doc(docId),
            {
                id: docId,
                userId: m.userId,
                pattern: m.pattern,
                kind: m.kind,
                attempted: m.attempted,
                solved: m.solved,
                solvedFirstTry: m.solvedFirstTry,
                easySolved: m.easySolved,
                mediumSolved: m.mediumSolved,
                hardSolved: m.hardSolved,
                recognitionCorrect: m.recognitionCorrect,
                recognitionTotal: m.recognitionTotal,
                masteryScore: score,
                level: masteryLevel(score),
                lastPracticedAtMs: m.lastPracticedAtMs,
                lastPracticedAt: Timestamp.fromMillis(m.lastPracticedAtMs),
                updatedAt: now(),
            },
            { merge: false }
        );
    }
    await batch.commit();
    MASTERY_BUFFER.clear();
}

async function simulateSolve(db: Firestore, userId: string, slug: string, args: SolveArgs) {
    const p = problem(slug);
    const attempts = Math.max(1, args.attempts ?? 1);
    const completedAtMs = Date.now() - args.daysAgo * DAY_MS;
    const completedAt = Timestamp.fromMillis(completedAtMs);
    const language = args.language ?? (p.kind === "sql" ? "sql" : "python");

    // Write `attempts` submissions: the first (attempts-1) are wrong_answer,
    // the last is accepted. Deterministic ids so re-runs are idempotent.
    for (let i = 0; i < attempts; i += 1) {
        const isLast = i === attempts - 1;
        const verdict = isLast ? "accepted" : "wrong_answer";
        const subId = `seed-sub-${userId}-${slug}-${args.submissionIndex ?? 0}-${i}`;
        await db.collection("practiceSubmissions").doc(subId).set({
            id: subId,
            userId,
            problemId: slug,
            kind: p.kind,
            mode: "submit",
            language,
            code: `# seed solution for ${slug} attempt ${i + 1}\nreturn null;`,
            verdict,
            passedCount: isLast ? 5 : 2,
            totalCount: 5,
            results: [],
            runtimeMs: isLast ? 80 + Math.floor(Math.random() * 200) : null,
            createdAt: Timestamp.fromMillis(completedAtMs - (attempts - 1 - i) * 90_000),
        });
    }

    // SM-2 progression
    const firstTry = attempts === 1;
    const grade = deriveGrade({
        solved: true,
        attemptsThisSession: attempts,
        usedHints: Boolean(args.usedHints),
        recognitionCorrect: args.recognitionCorrect ?? null,
    });
    let sm2: { ease: number; intervalDays: number; repetitions: number; dueAtMs: number };
    if (args.sm2) {
        sm2 = {
            ease: args.sm2.ease,
            intervalDays: args.sm2.intervalDays,
            repetitions: args.sm2.repetitions,
            dueAtMs: Date.now() + args.sm2.dueAtDaysFromNow * DAY_MS,
        };
    } else {
        const sched = scheduleRevision({ ease: 2.5, intervalDays: 0, repetitions: 0 }, grade, completedAtMs);
        sm2 = sched;
    }

    const progressId = `${userId}_${slug}`;
    await db.collection("practiceProgress").doc(progressId).set({
        id: progressId,
        userId,
        problemId: slug,
        kind: p.kind,
        primaryPattern: p.pattern,
        difficulty: p.difficulty,
        status: "solved",
        attempts,
        sessionAttempts: 0,
        solvedAt: completedAt,
        solvedFirstTry: firstTry,
        usedHints: Boolean(args.usedHints),
        bestRuntimeMs: 80 + Math.floor(Math.random() * 200),
        recognitionAnswered: args.recognitionCorrect !== null && args.recognitionCorrect !== undefined,
        recognitionCorrect: Boolean(args.recognitionCorrect),
        ease: sm2.ease,
        intervalDays: sm2.intervalDays,
        repetitions: sm2.repetitions,
        lastGrade: grade,
        dueAt: Timestamp.fromMillis(sm2.dueAtMs),
        lastReviewedAt: completedAt,
        starred: Boolean(args.starred),
        createdAt: daysAgo(args.daysAgo + 1),
        updatedAt: completedAt,
    });

    bumpMastery({
        userId,
        pattern: p.pattern,
        kind: p.kind,
        difficulty: p.difficulty,
        solved: true,
        firstTry,
        practicedAtMs: completedAtMs,
    });
}

async function simulateFailedAttempt(
    db: Firestore,
    userId: string,
    slug: string,
    verdict: "wrong_answer" | "time_limit_exceeded" | "runtime_error" | "compile_error",
    args: { daysAgo: number; submissionIndex?: number; language?: string }
) {
    const p = problem(slug);
    const tsMs = Date.now() - args.daysAgo * DAY_MS;
    const subId = `seed-sub-${userId}-${slug}-fail-${args.submissionIndex ?? 0}`;
    await db.collection("practiceSubmissions").doc(subId).set({
        id: subId,
        userId,
        problemId: slug,
        kind: p.kind,
        mode: "submit",
        language: args.language ?? (p.kind === "sql" ? "sql" : "python"),
        code: `# seed failing attempt — ${verdict}`,
        verdict,
        passedCount: verdict === "compile_error" ? 0 : 1,
        totalCount: 5,
        results: [],
        runtimeMs: null,
        createdAt: Timestamp.fromMillis(tsMs),
    });

    // Upsert progress doc as "attempted" without bumping solve totals.
    const progressId = `${userId}_${slug}`;
    const snap = await db.collection("practiceProgress").doc(progressId).get();
    const prev = snap.exists ? (snap.data() || {}) : {};
    if (prev.status === "solved") return; // don't downgrade a real solve
    await db.collection("practiceProgress").doc(progressId).set({
        id: progressId,
        userId,
        problemId: slug,
        kind: p.kind,
        primaryPattern: p.pattern,
        difficulty: p.difficulty,
        status: "attempted",
        attempts: (prev.attempts ?? 0) + 1,
        sessionAttempts: (prev.sessionAttempts ?? 0) + 1,
        solvedAt: prev.solvedAt ?? null,
        solvedFirstTry: false,
        usedHints: prev.usedHints ?? false,
        bestRuntimeMs: null,
        recognitionAnswered: prev.recognitionAnswered ?? false,
        recognitionCorrect: prev.recognitionCorrect ?? false,
        ease: prev.ease ?? 2.5,
        intervalDays: prev.intervalDays ?? 0,
        repetitions: prev.repetitions ?? 0,
        lastGrade: 0,
        dueAt: prev.dueAt ?? null,
        lastReviewedAt: Timestamp.fromMillis(tsMs),
        starred: prev.starred ?? false,
        createdAt: prev.createdAt ?? daysAgo(args.daysAgo + 1),
        updatedAt: Timestamp.fromMillis(tsMs),
    });

    // Failed attempts still count toward `attempted` in mastery but not `solved`.
    bumpMastery({
        userId,
        pattern: p.pattern,
        kind: p.kind,
        difficulty: p.difficulty,
        solved: false,
        firstTry: false,
        practicedAtMs: tsMs,
    });
}

// ─── Subscription helper ──────────────────────────────────────────────

async function setSubscription(
    db: Firestore,
    userId: string,
    opts: {
        planCode: string;
        status: "active" | "trialing" | "expired" | "cancelled" | "none";
        source: "paid" | "promo" | "grant" | "trial";
        expiresInDays: number | null;
        promoCode?: string;
    }
) {
    const expiresAt = opts.expiresInDays === null ? null : daysFromNow(opts.expiresInDays);
    await db.collection("userSubscriptions").doc(userId).set({
        id: userId,
        userId,
        planCode: opts.planCode,
        status: opts.status,
        source: opts.source,
        startedAt: daysAgo(opts.status === "expired" ? 60 : 5),
        expiresAt,
        autoRenew: opts.status === "active",
        promoCode: opts.promoCode ?? null,
        updatedAt: now(),
    });
}

// ─── Scenario builders ────────────────────────────────────────────────

async function scenarioRookie(_db: Firestore, p: Persona) {
    console.log(`         · ${p.email.padEnd(28)} — no extra data (empty-state persona)`);
}

async function scenarioExplorer(db: Firestore, p: Persona) {
    // 5 problems attempted, 2 solved. Mix of easy + medium.
    await simulateSolve(db, p.uid, "sum-of-an-array", { daysAgo: 4 });
    await simulateSolve(db, p.uid, "contains-duplicate", { daysAgo: 2, attempts: 2 });
    await simulateFailedAttempt(db, p.uid, "valid-parentheses", "wrong_answer", { daysAgo: 3 });
    await simulateFailedAttempt(db, p.uid, "reverse-a-string", "wrong_answer", { daysAgo: 5 });
    await simulateFailedAttempt(db, p.uid, "binary-search-index", "time_limit_exceeded", { daysAgo: 1 });
}

async function scenarioActive(db: Firestore, p: Persona) {
    // 15 solved, 6 patterns, one solve per day for the last 7 days (active streak),
    // plus older solves to populate the heatmap and mastery levels.
    const solves: Array<[string, number]> = [
        // Recent — drives the current streak (one per day, last 7 days):
        ["sum-of-an-array",                    0],
        ["valid-palindrome",                   1],
        ["climbing-stairs",                    2],
        ["valid-parentheses",                  3],
        ["binary-search-index",                4],
        ["merge-intervals",                    5],
        ["reverse-linked-list",                6],
        // Older — provide depth across patterns + difficulty for mastery rollups:
        ["contains-duplicate",                 9],
        ["reverse-a-string",                   11],
        ["longest-substring-without-repeating",13],
        ["daily-temperatures",                 15],
        ["jump-game",                          17],
        ["single-number",                      18],
        ["top-k-frequent-elements",            19],
        ["maximum-subarray-sum",               20],
    ];
    let idx = 0;
    for (const [slug, days] of solves) {
        await simulateSolve(db, p.uid, slug, {
            daysAgo: days,
            attempts: days < 7 ? 1 : (idx % 3 === 0 ? 2 : 1),
            recognitionCorrect: days < 7 ? true : null,
            starred: idx % 5 === 0,
            submissionIndex: idx,
        });
        idx += 1;
    }
}

async function scenarioStreaker(db: Firestore, p: Persona) {
    // 30 solves, one per day for 30 days. Cycle through 8 problems so each
    // (user, problem) pair only gets one progress doc — additional solves
    // bump SM-2 in-place. For seed simplicity, write 30 DISTINCT (problem,
    // dayOffset) tuples by rotating across the catalog; that yields 30
    // progress docs across 30 different problems.
    const pool = CATALOG.filter((c) => c.kind === "dsa" && c.access !== "premium").map((c) => c.slug);
    for (let d = 0; d < 30; d += 1) {
        const slug = pool[d % pool.length] + (d < pool.length ? "" : ""); // single-use slug per loop
        if (d < pool.length) {
            await simulateSolve(db, p.uid, pool[d], { daysAgo: d, attempts: 1, submissionIndex: d });
        } else {
            // ran out of unique problems — write another submission on an
            // already-solved one to push the heatmap day but keep progress as-is.
            await db.collection("practiceSubmissions").doc(`seed-sub-${p.uid}-streak-extra-${d}`).set({
                userId: p.uid,
                problemId: pool[d % pool.length],
                kind: "dsa",
                mode: "submit",
                language: "python",
                code: "# streak filler",
                verdict: "accepted",
                passedCount: 5,
                totalCount: 5,
                results: [],
                runtimeMs: 100,
                createdAt: Timestamp.fromMillis(Date.now() - d * DAY_MS),
            });
        }
    }
}

async function scenarioLapsed(db: Firestore, p: Persona) {
    // 12 problems solved 21-28 days ago. SM-2 schedule pinned so dueAt is
    // 7-14 days in the past — Revision Radar shows them all as overdue.
    const slugs = [
        "sum-of-an-array",
        "contains-duplicate",
        "reverse-a-string",
        "valid-palindrome",
        "valid-parentheses",
        "climbing-stairs",
        "single-number",
        "binary-search-index",
        "reverse-linked-list",
        "tree-height-parent-array",
        "longest-substring-without-repeating",
        "merge-intervals",
    ];
    for (let i = 0; i < slugs.length; i += 1) {
        await simulateSolve(db, p.uid, slugs[i], {
            daysAgo: 21 + (i % 8),
            attempts: 1,
            recognitionCorrect: true,
            sm2: {
                ease: 2.5,
                intervalDays: 6,
                repetitions: 2,
                dueAtDaysFromNow: -(7 + (i % 8)), // overdue by 7-14 days
            },
            submissionIndex: i,
        });
    }
}

async function scenarioStruggler(db: Firestore, p: Persona) {
    // ~40 failed attempts across 8 problems, 6 successful solves.
    const targets = [
        "sum-of-an-array",
        "contains-duplicate",
        "reverse-a-string",
        "valid-palindrome",
        "climbing-stairs",
        "single-number",
        "longest-substring-without-repeating",
        "binary-search-index",
    ];
    const verdicts: Array<"wrong_answer" | "time_limit_exceeded" | "runtime_error"> = [
        "wrong_answer",
        "wrong_answer",
        "time_limit_exceeded",
        "runtime_error",
        "wrong_answer",
    ];
    let subIdx = 0;
    // 40 failed attempts across the 8 problems, scattered over 14 days.
    for (let i = 0; i < 40; i += 1) {
        const slug = targets[i % targets.length];
        const v = verdicts[i % verdicts.length];
        await simulateFailedAttempt(db, p.uid, slug, v, { daysAgo: 14 - Math.floor(i / 3), submissionIndex: subIdx });
        subIdx += 1;
    }
    // 6 eventual solves after many attempts — show the persistence.
    for (let i = 0; i < 6; i += 1) {
        await simulateSolve(db, p.uid, targets[i], {
            daysAgo: 2 + i,
            attempts: 4 + (i % 3),       // many attempts before success
            usedHints: true,
            submissionIndex: 100 + i,
        });
    }
}

async function scenarioFirstTry(db: Firestore, p: Persona) {
    // 12 solves, all first-try, across multiple patterns. Mastery elite.
    const slugs = [
        "sum-of-an-array",
        "contains-duplicate",
        "reverse-a-string",
        "valid-palindrome",
        "climbing-stairs",
        "single-number",
        "reverse-linked-list",
        "tree-height-parent-array",
        "binary-search-index",
        "merge-intervals",
        "jump-game",
        "daily-temperatures",
    ];
    for (let i = 0; i < slugs.length; i += 1) {
        await simulateSolve(db, p.uid, slugs[i], {
            daysAgo: i,
            attempts: 1,
            recognitionCorrect: true,
            submissionIndex: i,
        });
    }
}

async function scenarioSqlOnly(db: Firestore, p: Persona) {
    const slugs = [
        "high-earning-employees",
        "customers-with-orders",
        "total-revenue",
        "employees-earning-more-than-manager",
        "top-earner-per-department",
        "second-highest-salary",
    ];
    for (let i = 0; i < slugs.length; i += 1) {
        await simulateSolve(db, p.uid, slugs[i], {
            daysAgo: i * 2,
            attempts: i === 4 ? 2 : 1,
            language: "sql",
            recognitionCorrect: true,
            submissionIndex: i,
        });
    }
}

async function scenarioPolyglot(db: Firestore, p: Persona) {
    // 4 problems solved + 4 extra submissions per problem in different languages.
    const slugs = ["sum-of-an-array", "contains-duplicate", "reverse-a-string", "climbing-stairs"];
    const langs = ["python", "javascript", "cpp", "java"];
    for (let i = 0; i < slugs.length; i += 1) {
        const slug = slugs[i];
        // canonical solve
        await simulateSolve(db, p.uid, slug, { daysAgo: i + 1, attempts: 1, language: langs[i], submissionIndex: i });
        // 3 extra submissions in the other 3 languages, as "submit" mode, all accepted.
        const others = langs.filter((l) => l !== langs[i]);
        for (let j = 0; j < others.length; j += 1) {
            const subId = `seed-sub-${p.uid}-${slug}-lang-${others[j]}`;
            await db.collection("practiceSubmissions").doc(subId).set({
                userId: p.uid,
                problemId: slug,
                kind: "dsa",
                mode: "submit",
                language: others[j],
                code: `// ${slug} in ${others[j]}`,
                verdict: "accepted",
                passedCount: 5,
                totalCount: 5,
                results: [],
                runtimeMs: 90 + Math.floor(Math.random() * 200),
                createdAt: Timestamp.fromMillis(Date.now() - (i + 1 + j) * DAY_MS),
            });
        }
    }
}

async function scenarioPaidPro(db: Firestore, p: Persona) {
    await setSubscription(db, p.uid, { planCode: "pro", status: "active", source: "paid", expiresInDays: 25 });
    // Solve a few premium problems so the "unlocked" state is visible.
    await simulateSolve(db, p.uid, "maximum-subarray-sum", { daysAgo: 4, attempts: 1, submissionIndex: 0 });
    await simulateSolve(db, p.uid, "subarray-sum-equals-k", { daysAgo: 2, attempts: 2, submissionIndex: 1 });
    await simulateSolve(db, p.uid, "number-of-islands", { daysAgo: 1, attempts: 1, submissionIndex: 2 });
}

async function scenarioTrialPro(db: Firestore, p: Persona) {
    await setSubscription(db, p.uid, { planCode: "pro", status: "trialing", source: "trial", expiresInDays: 5 });
    await simulateSolve(db, p.uid, "sum-of-an-array", { daysAgo: 1, attempts: 1, submissionIndex: 0 });
}

async function scenarioExpiredPro(db: Firestore, p: Persona) {
    await setSubscription(db, p.uid, { planCode: "pro", status: "expired", source: "paid", expiresInDays: -10 });
    // Has a history of premium problem solves from when they were active.
    await simulateSolve(db, p.uid, "maximum-subarray-sum", { daysAgo: 25, attempts: 1, submissionIndex: 0 });
    await simulateSolve(db, p.uid, "unique-paths", { daysAgo: 20, attempts: 2, submissionIndex: 1 });
}

async function scenarioPromo(db: Firestore, p: Persona) {
    await setSubscription(db, p.uid, {
        planCode: "pro",
        status: "active",
        source: "promo",
        expiresInDays: 90,
        promoCode: "LAUNCH-50",
    });
    await simulateSolve(db, p.uid, "generate-parentheses", { daysAgo: 3, attempts: 1, submissionIndex: 0 });
}

async function scenarioCommunity(db: Firestore, p: Persona) {
    // Has solved some problems, then posted about them.
    const solves = ["valid-parentheses", "merge-intervals", "kth-largest-element"];
    for (let i = 0; i < solves.length; i += 1) {
        await simulateSolve(db, p.uid, solves[i], { daysAgo: 7 + i, attempts: 1, submissionIndex: i });
    }
    const author = { userId: p.uid, name: p.displayName, avatarUrl: null };
    // 4 discussions
    const discussions = [
        { id: "seed-disc-1", slug: "valid-parentheses", title: "Why the stack approach is cleaner than counters", tags: ["hint", "interview"], up: 23 },
        { id: "seed-disc-2", slug: "merge-intervals",   title: "Edge case: single-element list",                  tags: ["edge-case"],         up: 12 },
        { id: "seed-disc-3", slug: "kth-largest-element", title: "Heap vs quickselect — when to pick which",      tags: ["hint"],              up: 41 },
        { id: "seed-disc-4", slug: "merge-intervals",   title: "Sorting first vs scanning twice",                 tags: ["approach"],          up: 7 },
    ];
    for (const d of discussions) {
        await db.collection("practiceDiscussions").doc(d.id).set({
            id: d.id,
            problemId: d.slug,
            problemSlug: d.slug,
            author,
            title: d.title,
            bodyHtml: `<p>${d.title}. Seeded discussion body for testing.</p>`,
            tags: d.tags,
            upvotes: d.up,
            replyCount: 0,
            createdAt: daysAgo(6),
            updatedAt: daysAgo(6),
        });
    }
    // 3 solution write-ups
    const solutions = [
        { id: "seed-sol-1", slug: "valid-parentheses",     title: "O(n) stack walkthrough",       lang: "python",     up: 38, tc: "O(n)", sc: "O(n)" },
        { id: "seed-sol-2", slug: "merge-intervals",       title: "Sort + sweep in 12 lines",     lang: "javascript", up: 15, tc: "O(n log n)", sc: "O(n)" },
        { id: "seed-sol-3", slug: "kth-largest-element",   title: "Min-heap of size k, explained", lang: "python",    up: 60, tc: "O(n log k)", sc: "O(k)" },
    ];
    for (const s of solutions) {
        await db.collection("practiceSolutions").doc(s.id).set({
            id: s.id,
            problemId: s.slug,
            problemSlug: s.slug,
            author,
            title: s.title,
            bodyHtml: `<p>${s.title}. Seeded solution body.</p>`,
            language: s.lang,
            timeComplexity: s.tc,
            spaceComplexity: s.sc,
            tags: ["seed"],
            upvotes: s.up,
            createdAt: daysAgo(5),
            updatedAt: daysAgo(5),
        });
    }
}

async function scenarioRescue(db: Firestore, p: Persona, teacherId: string) {
    // Solve+fail history for context, then 3 rescue requests in different states.
    await simulateFailedAttempt(db, p.uid, "trapping-rain-water", "wrong_answer", { daysAgo: 2, submissionIndex: 0 });
    await simulateFailedAttempt(db, p.uid, "number-of-islands", "time_limit_exceeded", { daysAgo: 4, submissionIndex: 1 });
    await simulateSolve(db, p.uid, "valid-parentheses", { daysAgo: 6, attempts: 2, submissionIndex: 2 });

    const rescues = [
        {
            id: "seed-rescue-open",
            slug: "trapping-rain-water",
            title: "Trapping Rain Water",
            message: "I tried two pointers but my answer is off by 1 on the sample. Hint?",
            status: "open" as const,
            answer: null,
            answeredAt: null,
        },
        {
            id: "seed-rescue-answered",
            slug: "number-of-islands",
            title: "Number of Islands",
            message: "BFS times out on the 8th case. Am I revisiting cells?",
            status: "answered" as const,
            answer: "Check that you mark a cell as visited the moment you ENQUEUE it, not when you dequeue it — otherwise the same cell gets pushed multiple times.",
            answeredAt: daysAgo(1),
        },
        {
            id: "seed-rescue-resolved",
            slug: "valid-parentheses",
            title: "Valid Parentheses",
            message: "Why does my counter approach fail on `)(`?",
            status: "resolved" as const,
            answer: "Counters lose order. Use a stack so you can verify the most recent open bracket actually matches the close bracket you're looking at.",
            answeredAt: daysAgo(5),
        },
    ];
    for (const r of rescues) {
        await db.collection("practiceRescueRequests").doc(r.id).set({
            id: r.id,
            userId: p.uid,
            userName: p.displayName,
            problemId: r.slug,
            problemTitle: r.title,
            submissionId: null,
            message: r.message,
            teacherId,
            status: r.status,
            mentorReply: r.answer,
            mentorId: r.status === "open" ? null : teacherId,
            createdAt: daysAgo(r.status === "open" ? 1 : r.status === "answered" ? 2 : 6),
            answeredAt: r.answeredAt,
        });
    }
}

async function scenarioCourseActive(db: Firestore, p: Persona, courseId: string) {
    const enrollmentId = `${p.uid}_${courseId}`;
    await db.collection("courseEnrollments").doc(enrollmentId).set({
        id: enrollmentId,
        userId: p.uid,
        courseId,
        status: "active",
        enrolledAt: daysAgo(10),
        orderId: `seed-order-${p.uid}`,
        paymentId: `seed-payment-${p.uid}`,
        price: 0,
        createdAt: daysAgo(10),
        updatedAt: now(),
    });
}

async function scenarioMulticlass(
    db: Firestore,
    p: Persona,
    classes: Array<{ classId: string; teacherId: string }>
) {
    for (const c of classes) {
        const ref = db.collection("classes").doc(c.classId).collection("students").doc(p.uid);
        await ref.set({
            classId: c.classId,
            teacherId: c.teacherId,
            studentId: p.uid,
            studentEmail: p.email,
            studentName: p.displayName,
            rollNumber: null,
            status: "active",
            enrolledAt: daysAgo(15),
            lastActiveAt: daysAgo(2),
            totalAttempts: 0,
        });
        // denormalised memberships on the student's user doc
        await db.collection("users").doc(p.uid).set(
            {
                enrolledTeacherIds: FieldValue.arrayUnion(c.teacherId),
                classMemberships: FieldValue.arrayUnion({
                    classId: c.classId,
                    teacherId: c.teacherId,
                    status: "active",
                    joinedAt: daysAgo(15),
                }),
                updatedAt: now(),
            },
            { merge: true }
        );
    }
}

async function scenarioQuizResume(
    db: Firestore,
    p: Persona,
    opts: { quizId: string; quizTitle: string; category: string }
) {
    // An in-progress quiz attempt (not yet completed).
    const attemptId = `seed-${opts.quizId}-${p.uid}`;
    await db.collection("quizAttempts").doc(attemptId).set({
        userId: p.uid,
        quizId: opts.quizId,
        contentId: opts.quizId,
        contentTitle: opts.quizTitle,
        title: opts.quizTitle,
        category: opts.category,
        status: "in_progress",
        attemptNumber: 1,
        startedAt: Timestamp.fromMillis(Date.now() - 8 * 60_000),
        currentQuestionIndex: 2,
        answers: [
            { questionId: "q1", answer: "q1-o0" },
            { questionId: "q2", answer: "q2-o2" },
        ],
        totalScore: 0,
        maxPossibleScore: 5,
        correctAnswers: 0,
        wrongAnswers: 0,
        unattempted: 5,
        percentage: 0,
        remainingTime: 7 * 60,
        createdAt: Timestamp.fromMillis(Date.now() - 8 * 60_000),
        updatedAt: Timestamp.fromMillis(Date.now() - 60_000),
    });
}

async function scenarioTestResume(
    db: Firestore,
    p: Persona,
    opts: { seriesId: string; subtestId: string; title: string; durationMinutes: number }
) {
    // An in-progress mock test attempt the student can resume.
    const attemptId = `seed-test-${opts.seriesId}-${p.uid}`;
    await db.collection("testAttempts").doc(attemptId).set({
        userId: p.uid,
        testId: opts.subtestId,
        seriesId: opts.seriesId,
        title: opts.title,
        status: "in_progress",
        attemptNumber: 1,
        startedAt: Timestamp.fromMillis(Date.now() - 12 * 60_000),
        currentQuestionIndex: 4,
        durationMinutes: opts.durationMinutes,
        totalTimeSpent: 12 * 60,
        remainingTime: (opts.durationMinutes - 12) * 60,
        totalScore: 0,
        maxPossibleScore: 50,
        percentage: 0,
        passed: null,
        answers: [],
        createdAt: Timestamp.fromMillis(Date.now() - 12 * 60_000),
        updatedAt: Timestamp.fromMillis(Date.now() - 60_000),
    });
}

async function scenarioTestFailed(
    db: Firestore,
    p: Persona,
    opts: { seriesId: string; subtestId: string; title: string; durationMinutes: number }
) {
    const attemptId = `seed-test-${opts.seriesId}-${p.uid}`;
    const completedAt = daysAgo(2);
    await db.collection("testAttempts").doc(attemptId).set({
        userId: p.uid,
        testId: opts.subtestId,
        seriesId: opts.seriesId,
        title: opts.title,
        status: "completed",
        attemptNumber: 1,
        startedAt: Timestamp.fromMillis(Date.now() - 2 * DAY_MS - opts.durationMinutes * 60_000),
        completedAt,
        durationMinutes: opts.durationMinutes,
        totalTimeSpent: opts.durationMinutes * 60,
        totalScore: 18,
        maxPossibleScore: 50,
        correctAnswers: 9,
        wrongAnswers: 16,
        unattempted: 0,
        percentage: 36,
        passed: false,
        passingPercentage: 40,
        answers: [],
        questionResults: [],
        createdAt: completedAt,
        updatedAt: completedAt,
    });
}

// ─── Top-level entrypoint ─────────────────────────────────────────────

export interface SeedStudentScenariosOpts {
    auth: Auth;
    db: Firestore;
    teacherId: string;
    /** Pass the first quiz id from QUIZ_IDS in seed-emulators.ts. */
    quizId: string;
    quizTitle: string;
    quizCategory: string;
    /** Pass the first test series id from TEST_IDS. */
    testSeriesId: string;
    /** Subtest id under the series (e.g. "s1"). */
    testSubtestId: string;
    testTitle: string;
    testDurationMinutes: number;
    /** Course id to enrol the course-active persona into. */
    courseId: string;
    /** Both class IDs for the multiclass persona. */
    classA: { classId: string; teacherId: string };
    classB: { classId: string; teacherId: string };
}

export async function seedStudentScenarios(opts: SeedStudentScenariosOpts) {
    const { auth, db } = opts;

    console.log(`\n[seed] Creating ${PERSONAS.length} persona accounts…`);
    for (const p of PERSONAS) {
        await upsertPersona(auth, db, p);
    }

    console.log(`\n[seed] Building scenarios per persona…`);
    for (const p of PERSONAS) {
        MASTERY_BUFFER.clear(); // each persona's mastery is independent

        switch (p.scenario) {
            case "rookie":
                await scenarioRookie(db, p);
                break;
            case "explorer":
                await scenarioExplorer(db, p);
                break;
            case "active":
                await scenarioActive(db, p);
                break;
            case "streaker":
                await scenarioStreaker(db, p);
                break;
            case "lapsed":
                await scenarioLapsed(db, p);
                break;
            case "struggler":
                await scenarioStruggler(db, p);
                break;
            case "firsttry":
                await scenarioFirstTry(db, p);
                break;
            case "sqlonly":
                await scenarioSqlOnly(db, p);
                break;
            case "polyglot":
                await scenarioPolyglot(db, p);
                break;
            case "paid-pro":
                await scenarioPaidPro(db, p);
                break;
            case "trial-pro":
                await scenarioTrialPro(db, p);
                break;
            case "expired-pro":
                await scenarioExpiredPro(db, p);
                break;
            case "promo":
                await scenarioPromo(db, p);
                break;
            case "community":
                await scenarioCommunity(db, p);
                break;
            case "rescue":
                await scenarioRescue(db, p, opts.teacherId);
                break;
            case "course-active":
                await scenarioCourseActive(db, p, opts.courseId);
                break;
            case "multiclass":
                await scenarioMulticlass(db, p, [opts.classA, opts.classB]);
                break;
            case "quiz-resume":
                await scenarioQuizResume(db, p, {
                    quizId: opts.quizId,
                    quizTitle: opts.quizTitle,
                    category: opts.quizCategory,
                });
                break;
            case "test-resume":
                await scenarioTestResume(db, p, {
                    seriesId: opts.testSeriesId,
                    subtestId: opts.testSubtestId,
                    title: opts.testTitle,
                    durationMinutes: opts.testDurationMinutes,
                });
                break;
            case "test-failed":
                await scenarioTestFailed(db, p, {
                    seriesId: opts.testSeriesId,
                    subtestId: opts.testSubtestId,
                    title: opts.testTitle,
                    durationMinutes: opts.testDurationMinutes,
                });
                break;
            default:
                throw new Error(`Unknown scenario: ${p.scenario}`);
        }

        await flushMastery(db);
        console.log(`         ✓ ${p.email.padEnd(28)} ${p.scenario.padEnd(14)} ${p.summary}`);
    }
}

export function printPersonaSummary() {
    console.log(`\n  Persona logins (all use password ${PASSWORD}):`);
    console.log("  ─────────────────────────────────────────────────────────────");
    for (const p of PERSONAS) {
        console.log(`    ${p.email.padEnd(28)} ${p.scenario.padEnd(14)} ${p.summary}`);
    }
    console.log("  ─────────────────────────────────────────────────────────────");
}
