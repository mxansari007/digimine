/**
 * Mastery Engine — the pure logic behind the practice module's USP.
 *
 * Kept in @digimine/types (zero deps) so both the server APIs and the
 * client UI compute the same numbers. Three concerns:
 *
 *   1. deriveGrade()        — turn a solve attempt into an SM-2 grade 0..5.
 *   2. scheduleRevision()   — SM-2-lite forgetting-curve scheduling.
 *   3. computeMastery*()    — per-pattern mastery score + level.
 *   4. pickNextProblems()   — adaptive "what to solve next".
 */

import type {
    MasteryLevel,
    PracticeDifficulty,
    PracticeMastery,
    PracticePattern,
    PracticeProblemSummary,
    PracticeProgress,
} from "./dsaPractice";

// ─────────────────────────────────────────────────────────────────────
// 1. Grade derivation
// ─────────────────────────────────────────────────────────────────────

export interface SolveSignal {
    solved: boolean;
    /** Submissions made for THIS solve session (1 = first try). */
    attemptsThisSession: number;
    usedHints: boolean;
    /** Whether the user correctly classified the pattern (Pattern Lens). */
    recognitionCorrect: boolean | null;
}

/**
 * Map a solve attempt to an SM-2 grade (0..5). Higher = recalled more
 * cleanly, which lengthens the next revision interval.
 *
 *   5  solved first try, no hints, recognised the pattern
 *   4  solved first try (hints OR missed recognition)
 *   3  solved within a few tries
 *   2  solved but messy (many tries / hints)
 *   1  failed but engaged
 *   0  failed
 */
export function deriveGrade(signal: SolveSignal): number {
    if (!signal.solved) {
        return signal.attemptsThisSession > 1 ? 1 : 0;
    }
    let grade = 5;
    if (signal.attemptsThisSession >= 4) grade -= 2;
    else if (signal.attemptsThisSession >= 2) grade -= 1;
    if (signal.usedHints) grade -= 1;
    if (signal.recognitionCorrect === false) grade -= 1;
    return Math.max(2, Math.min(5, grade));
}

// ─────────────────────────────────────────────────────────────────────
// 2. SM-2-lite scheduling (Revision Radar)
// ─────────────────────────────────────────────────────────────────────

export interface RevisionState {
    ease: number;
    intervalDays: number;
    repetitions: number;
}

export interface RevisionUpdate extends RevisionState {
    grade: number;
    /** ms timestamp the item is next due. */
    dueAtMs: number;
}

const MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Standard SM-2 with a floor on ease and a "relearn tomorrow" reset on
 * grades below 3. `now` is injectable for testing.
 */
export function scheduleRevision(
    prev: RevisionState,
    grade: number,
    now: number = Date.now()
): RevisionUpdate {
    let { ease, intervalDays, repetitions } = prev;
    ease = ease || 2.5;

    if (grade < 3) {
        // Lapse — relearn tomorrow, keep some ease penalty.
        repetitions = 0;
        intervalDays = 1;
    } else {
        if (repetitions === 0) intervalDays = 1;
        else if (repetitions === 1) intervalDays = 6;
        else intervalDays = Math.round(intervalDays * ease);
        repetitions += 1;
    }

    // SM-2 ease adjustment.
    ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (ease < MIN_EASE) ease = MIN_EASE;

    // Cap runaway intervals at ~1 year.
    intervalDays = Math.min(intervalDays, 365);

    return {
        ease: Math.round(ease * 100) / 100,
        intervalDays,
        repetitions,
        grade,
        dueAtMs: now + intervalDays * DAY_MS,
    };
}

/** True when a progress row is due for revision (or overdue). */
export function isDueForRevision(p: Pick<PracticeProgress, "status" | "dueAt">, now: number = Date.now()): boolean {
    if (p.status !== "solved") return false;
    if (!p.dueAt) return false;
    const due = p.dueAt instanceof Date ? p.dueAt.getTime() : new Date(p.dueAt).getTime();
    return Number.isFinite(due) && due <= now;
}

// ─────────────────────────────────────────────────────────────────────
// 3. Mastery scoring
// ─────────────────────────────────────────────────────────────────────

const DIFFICULTY_WEIGHT: Record<PracticeDifficulty, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
};

export interface MasteryInputs {
    attempted: number;
    solved: number;
    solvedFirstTry: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;
    recognitionCorrect: number;
    recognitionTotal: number;
    lastPracticedAtMs: number | null;
}

/**
 * Composite 0..100 mastery for one pattern. Blend of:
 *   - solve rate            (did you get it right?)         35%
 *   - first-try rate        (did you get it right *clean*?) 20%
 *   - difficulty coverage   (did you tackle hard ones?)     20%
 *   - pattern recognition   (Pattern Lens accuracy)         15%
 *   - recency               (decays if you haven't touched it) 10%
 *
 * Coverage is normalised against a target weighted-solve count so a pattern
 * you've barely touched can't read as "mastered".
 */
export function computeMasteryScore(m: MasteryInputs, now: number = Date.now()): number {
    if (m.attempted === 0) return 0;

    const solveRate = m.solved / Math.max(1, m.attempted);
    const firstTryRate = m.solved > 0 ? m.solvedFirstTry / m.solved : 0;

    const weightedSolved =
        m.easySolved * DIFFICULTY_WEIGHT.easy +
        m.mediumSolved * DIFFICULTY_WEIGHT.medium +
        m.hardSolved * DIFFICULTY_WEIGHT.hard;
    // Target: ~ a couple of mediums + a hard. 8 weighted points ≈ full coverage.
    const coverage = Math.min(1, weightedSolved / 8);

    const recognition = m.recognitionTotal > 0 ? m.recognitionCorrect / m.recognitionTotal : 0.5;

    let recency = 1;
    if (m.lastPracticedAtMs) {
        const days = (now - m.lastPracticedAtMs) / DAY_MS;
        // Full credit < 14 days, decays to 0 by ~120 days.
        recency = days <= 14 ? 1 : Math.max(0, 1 - (days - 14) / 106);
    } else {
        recency = 0;
    }

    const score =
        solveRate * 35 +
        firstTryRate * 20 +
        coverage * 20 +
        recognition * 15 +
        recency * 10;

    return Math.round(Math.max(0, Math.min(100, score)));
}

export function masteryLevel(score: number): MasteryLevel {
    if (score >= 80) return "mastered";
    if (score >= 55) return "proficient";
    if (score >= 25) return "learning";
    return "novice";
}

// ─────────────────────────────────────────────────────────────────────
// 4. Adaptive next-problem picker
// ─────────────────────────────────────────────────────────────────────

export interface NextPickInputs {
    masteryByPattern: Record<string, Pick<PracticeMastery, "masteryScore" | "level" | "pattern">>;
    /** problemId -> user status, so we skip solved ones. */
    statusByProblem: Record<string, "todo" | "attempted" | "solved">;
    candidates: PracticeProblemSummary[];
}

const DIFFICULTY_RANK: Record<PracticeDifficulty, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * Adaptive recommendation: surface problems on the user's WEAKEST patterns,
 * at a difficulty just above their current comfort, skipping solved ones.
 *
 * The "edge of ability" heuristic:
 *   - novice/learning patterns → prefer easy/medium
 *   - proficient patterns      → prefer medium/hard
 *   - mastered patterns        → deprioritise entirely
 */
export function pickNextProblems(input: NextPickInputs, limit = 10): PracticeProblemSummary[] {
    const scoreFor = (p: PracticeProblemSummary): number => {
        if (input.statusByProblem[p.id] === "solved") return -Infinity;

        const mastery = input.masteryByPattern[p.primaryPattern];
        const masteryScore = mastery?.masteryScore ?? 0;

        // Weakness: lower mastery → higher priority.
        const weakness = 100 - masteryScore;

        // Difficulty fit relative to mastery.
        let targetRank: number;
        if (masteryScore < 25) targetRank = DIFFICULTY_RANK.easy;
        else if (masteryScore < 55) targetRank = DIFFICULTY_RANK.medium;
        else targetRank = DIFFICULTY_RANK.hard;
        const fit = 30 - Math.abs(DIFFICULTY_RANK[p.difficulty] - targetRank) * 18;

        // Mastered patterns get a strong penalty so we keep pushing breadth.
        const masteredPenalty = masteryScore >= 80 ? -40 : 0;

        // Lightly prefer untouched over attempted.
        const freshness = input.statusByProblem[p.id] === "attempted" ? -5 : 0;

        return weakness + fit + masteredPenalty + freshness;
    };

    return [...input.candidates]
        .map((p) => ({ p, s: scoreFor(p) }))
        .filter((x) => x.s > -Infinity)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.p);
}

// ─────────────────────────────────────────────────────────────────────
// Helpers shared with UI
// ─────────────────────────────────────────────────────────────────────

export function slugifyProblemTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 80);
}

/** Normalise output for comparing judged stdout (trailing ws, CRLF). */
export function normalizeOutput(s: string): string {
    return s
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/\s+$/g, ""))
        .join("\n")
        .replace(/\n+$/g, "")
        .trim();
}
