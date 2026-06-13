/**
 * AI Coding Interview + Behaviour Tracker — premium student feature.
 *
 * A session is the interview lifecycle (mirrors the TestAttempt model):
 * `in_progress` → `completed`. The interviewer is grounded in a real
 * `practiceProblem` (its statement, expected pattern, hints, test cases),
 * so questions and feedback are never hallucinated — code correctness is
 * judged by the existing Piston/Judge0 pipeline, and the behaviour
 * scorecard is produced by the LLM from the transcript + judge result.
 *
 * Dates are stored as ISO strings throughout (Firestore-safe inside the
 * `transcript` array, and lexicographically sortable for `orderBy`), so no
 * Timestamp serialization dance is needed for this collection.
 *
 * Collections:
 *   aiInterviewSessions     — one document per interview
 *   aiInterviewReadiness    — per-user rolling "interview readiness" rollup
 */
import type { CodeLanguage } from "./test";
import type {
    PracticeDifficulty,
    PracticePattern,
    SubmissionVerdict,
} from "./dsaPractice";

/**
 * Interview lifecycle status.
 *   scheduled   — a future slot is booked; not yet begun.
 *   in_progress — live (consuming infra).
 *   completed   — finished, scorecard produced.
 *   abandoned   — was in_progress but reaped (browser closed / ran past maxRuntime).
 *   cancelled   — the student cancelled a booking before it began.
 *   expired     — a booking that was never joined within its start window (no-show).
 */
export type AIInterviewStatus =
    | "scheduled"
    | "in_progress"
    | "completed"
    | "abandoned"
    | "cancelled"
    | "expired";

/** Statuses that count as "the student is holding a live/reserved interview". */
export const AI_INTERVIEW_ACTIVE_STATUSES: AIInterviewStatus[] = ["scheduled", "in_progress"];

/**
 * The kind of interview being conducted. "dsa" and "sql" are the "coding"
 * types — they ground on a real problem, reveal a live editor on the
 * interviewer's cue, and are graded by the automated judge. The rest are
 * conversation-only.
 */
export type InterviewType = "dsa" | "sql" | "technical" | "behavioral" | "system_design";

/**
 * What the editor can be set to during an interview. SQL interviews use the
 * single "sql" mode; DSA interviews use one of the executable code languages.
 * Mirrors `PracticeSubmission.language` (CodeLanguage | "sql").
 */
export type InterviewLanguage = CodeLanguage | "sql";

export interface InterviewTypeMeta {
    key: InterviewType;
    label: string;
    blurb: string;
    /** Whether this type reveals a live code editor + runs a judge. */
    needsEditor: boolean;
    /** Whether this type is grounded on a practiceProblem. */
    needsProblem: boolean;
    /** Target interview length in minutes (hard cap auto-ends at this point). */
    durationMin: number;
    /**
     * lucide-react icon name for this interview type. The web app maps this
     * to the actual component (keeps this package React-free). Replaces the
     * old `emoji` field — emojis read amateur in a video-call-style product.
     */
    iconName: string;
}

export const INTERVIEW_TYPES: InterviewTypeMeta[] = [
    {
        key: "dsa",
        label: "DSA / Coding",
        blurb: "Solve a data-structures & algorithms problem in a live code editor.",
        needsEditor: true,
        needsProblem: true,
        durationMin: 20,
        iconName: "Code2",
    },
    {
        key: "sql",
        label: "SQL / Database",
        blurb: "Write SQL queries against a real schema in a live editor.",
        needsEditor: true,
        needsProblem: true,
        durationMin: 15,
        iconName: "Database",
    },
    {
        key: "technical",
        label: "Technical (CS Fundamentals)",
        blurb: "OOP, DBMS, OS & networks — explain core CS concepts aloud. No coding.",
        needsEditor: false,
        needsProblem: false,
        durationMin: 12,
        iconName: "BrainCircuit",
    },
    {
        key: "behavioral",
        label: "HR / Behavioral",
        blurb: "Tell-me-about-yourself, strengths, and STAR situations.",
        needsEditor: false,
        needsProblem: false,
        durationMin: 8,
        iconName: "Handshake",
    },
    {
        key: "system_design",
        label: "System Design",
        blurb: "Design a scalable system end-to-end by talking it through.",
        needsEditor: false,
        needsProblem: false,
        durationMin: 20,
        iconName: "Network",
    },
];

export function interviewTypeMeta(key: InterviewType): InterviewTypeMeta {
    return INTERVIEW_TYPES.find((t) => t.key === key) || INTERVIEW_TYPES[0];
}

/**
 * Single source of truth for "does this interview reveal a live editor?" —
 * driven by the metadata flag rather than hardcoded `=== "dsa"` checks, so
 * adding an editor-backed type (e.g. SQL) lights it up everywhere at once.
 */
export function interviewNeedsEditor(key: InterviewType): boolean {
    return interviewTypeMeta(key).needsEditor;
}

/** Whether this interview is grounded on a real practice problem + judge. */
export function interviewNeedsProblem(key: InterviewType): boolean {
    return interviewTypeMeta(key).needsProblem;
}

// ─────────────────────────────────────────────────────────────────────
// Slot scheduling + concurrency protection
//
// Live interviews are expensive (an LLM call per message, a code-judge per
// run, plus TTS/STT per spoken turn). To keep infrastructure solid when many
// students want to interview at once we (a) cap how many interviews may run
// concurrently via fixed-length time SLOTS with a capacity, and (b) allow at
// most one active (scheduled OR in_progress) interview per student.
// ─────────────────────────────────────────────────────────────────────

export interface AIInterviewSchedulingConfig {
    /** Slot length in minutes. Kept longer than the longest interview so a
     *  session that starts in a slot finishes within it. */
    slotMinutes: number;
    /** Max interviews bookable per slot ≈ the concurrency ceiling. */
    slotCapacity: number;
    /** How far ahead a student may book. */
    bookingHorizonHours: number;
    /** A booked slot may be joined this many minutes before its start. */
    joinGraceMin: number;
    /** A booked slot must be begun within this many minutes after its start,
     *  otherwise it is a no-show and expires (freeing capacity + refunding the
     *  weekly quota). */
    joinWindowMin: number;
    /** Hard backstop on simultaneously-live interviews, independent of slot
     *  accounting — protects infra even if a session overruns its slot. */
    maxConcurrentGlobal: number;
    /** An in_progress session older than this (no completion) is reaped as
     *  abandoned so it stops occupying the student's one active slot. */
    maxRuntimeMin: number;
}

export const DEFAULT_AI_INTERVIEW_SCHEDULING: AIInterviewSchedulingConfig = {
    slotMinutes: 30,
    slotCapacity: 5,
    bookingHorizonHours: 72,
    joinGraceMin: 5,
    joinWindowMin: 20,
    maxConcurrentGlobal: 5,
    maxRuntimeMin: 45,
};

/**
 * Deterministic slot key for the grid-aligned slot that contains `d`.
 * UTC, e.g. `2026-05-31T1430` for a 30-minute grid. Same instant + same
 * slotMinutes always yields the same key, so it doubles as the Firestore
 * document id for `aiInterviewSlots` (one doc per window, no duplicates).
 */
export function interviewSlotKey(d: Date, slotMinutes: number): string {
    const ms = slotMinutes * 60_000;
    const aligned = new Date(Math.floor(d.getTime() / ms) * ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return (
        `${aligned.getUTCFullYear()}-${p(aligned.getUTCMonth() + 1)}-${p(aligned.getUTCDate())}` +
        `T${p(aligned.getUTCHours())}${p(aligned.getUTCMinutes())}`
    );
}

/** Start Date of the grid-aligned slot that contains `d`. */
export function interviewSlotStart(d: Date, slotMinutes: number): Date {
    const ms = slotMinutes * 60_000;
    return new Date(Math.floor(d.getTime() / ms) * ms);
}

export type InterviewTurnRole = "interviewer" | "candidate" | "system";
export type InterviewTurnKind = "message" | "code" | "run_result";

export interface AIInterviewTurn {
    role: InterviewTurnRole;
    kind: InterviewTurnKind;
    content: string;
    /** ISO timestamp. */
    at: string;
    meta?: {
        verdict?: SubmissionVerdict;
        passedCount?: number;
        totalCount?: number;
        language?: InterviewLanguage;
    };
}

export interface AIInterviewConfig {
    interviewType: InterviewType;
    /** Optional target company (e.g. "amazon") — matched against problem tags / used as context. */
    company: string | null;
    /** DSA + SQL: optional target pattern/skill — matched against the problem's primary pattern. */
    pattern: PracticePattern | null;
    /** Technical / system-design focus area (e.g. "DBMS", "URL shortener"). */
    topic: string | null;
    difficulty: PracticeDifficulty;
}

// ─────────────────────────────────────────────────────────────────────
// Behaviour scorecard
// ─────────────────────────────────────────────────────────────────────

export type BehaviourDimensionKey =
    | "communication"
    | "structure"
    | "technical"
    | "pace"
    | "problemSolving";

export interface BehaviourDimensionMeta {
    key: BehaviourDimensionKey;
    label: string;
    blurb: string;
    /** Weight in the readiness composite (the five + correctness sum to 1). */
    weight: number;
}

/**
 * Fair, behaviour-based dimensions — what the candidate *did*, never how
 * they "seemed". No accent/face/voice-confidence scoring (biased + weak).
 */
export const BEHAVIOUR_DIMENSIONS: BehaviourDimensionMeta[] = [
    {
        key: "communication",
        label: "Communication",
        blurb: "Clarity, conciseness, thinking out loud, fewer fillers.",
        weight: 0.15,
    },
    {
        key: "structure",
        label: "Structure",
        blurb: "Stated the approach before coding; logical, organised flow.",
        weight: 0.15,
    },
    {
        key: "technical",
        label: "Technical articulation",
        blurb: "Complexity analysis, edge cases, correct reasoning.",
        weight: 0.2,
    },
    {
        key: "pace",
        label: "Pace & composure",
        blurb: "Steady progress, handled hints and follow-ups calmly.",
        weight: 0.05,
    },
    {
        key: "problemSolving",
        label: "Problem solving",
        blurb: "Clarifying questions, testing own code, recovering when stuck.",
        weight: 0.05,
    },
];

/** Correctness (from the judge) carries the remaining weight. */
export const CORRECTNESS_WEIGHT = 0.4;

export interface BehaviourScorecard {
    /** 0–100 per behaviour dimension. */
    dimensions: Record<BehaviourDimensionKey, number>;
    /** 0–100 code correctness (hidden + visible tests passed / total). */
    correctness: number;
    /** 0–100 composite. See computeReadiness. */
    readiness: number;
    /** Objective filler-word count from the candidate's spoken/typed turns. */
    fillerWords: number;
    strengths: string[];
    improvements: string[];
    /** Short overall coaching summary (coaching tone, never judgmental). */
    notes: string;
    verdict: SubmissionVerdict | null;
    passedCount: number;
    totalCount: number;
}

/**
 * Composite "interview readiness" from the behaviour dimensions + code
 * correctness. Correctness dominates (you have to actually solve it), but
 * communication/structure/technical matter — that's what real interviews
 * grade beyond a passing solution.
 */
export function computeReadiness(
    dimensions: Record<BehaviourDimensionKey, number>,
    correctness: number
): number {
    let sum = correctness * CORRECTNESS_WEIGHT;
    for (const d of BEHAVIOUR_DIMENSIONS) {
        const v = typeof dimensions[d.key] === "number" ? dimensions[d.key] : 0;
        sum += clamp01to100(v) * d.weight;
    }
    return Math.round(clamp01to100(sum));
}

function clamp01to100(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

// ─────────────────────────────────────────────────────────────────────
// Session + readiness rollup
// ─────────────────────────────────────────────────────────────────────

export interface AIInterviewSession {
    id: string;
    userId: string;
    status: AIInterviewStatus;
    interviewType: InterviewType;
    config: AIInterviewConfig;

    /** Empty for non-DSA interviews (which aren't grounded on a problem). */
    problemId: string;
    problemSlug: string;
    /** Human-facing title (problem title for DSA, otherwise the interview topic). */
    problemTitle: string;
    /** Null for non-DSA interviews. */
    primaryPattern: PracticePattern | null;
    difficulty: PracticeDifficulty;

    /** "sql" for SQL interviews; an executable code language for DSA. */
    language: InterviewLanguage;
    transcript: AIInterviewTurn[];
    latestCode: string;
    /** The code editor stays hidden (video-call only) until the interviewer
     *  signals it's time to write code; then this flips true for the session. */
    codingUnlocked: boolean;

    scorecard: BehaviourScorecard | null;

    /** Reserved slot key (see `interviewSlotKey`). Null for legacy sessions
     *  created before scheduling existed. */
    slotId: string | null;
    /** ISO start of the reserved slot — set for `scheduled` sessions. */
    scheduledAt: string | null;
    /** ISO deadline after which the reaper transitions this session:
     *  for `scheduled` → `expired` (slot start + joinWindow); for `in_progress`
     *  → `abandoned` (startedAt + maxRuntime). Null when not applicable. */
    expiresAt: string | null;

    /** AI credits debited for this interview (at booking / instant start).
     *  Cancel / no-show refunds return exactly this amount. Absent or 0 when
     *  the credit system was disabled at charge time. */
    creditsCharged?: number;

    /** For a `scheduled` session that hasn't begun, `startedAt` is "" until the
     *  student joins (begins) it. */
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Lightweight row for the dashboard list. */
export interface AIInterviewSessionSummary {
    id: string;
    status: AIInterviewStatus;
    interviewType: InterviewType;
    problemTitle: string;
    primaryPattern: PracticePattern | null;
    difficulty: PracticeDifficulty;
    readiness: number | null;
    verdict: SubmissionVerdict | null;
    /** ISO slot start for `scheduled` rows (so the list can show "Scheduled for…"). */
    scheduledAt: string | null;
    startedAt: string;
    completedAt: string | null;
}

export interface ReadinessHistoryPoint {
    /** Source session id — used to make the rollup idempotent per session. */
    sessionId: string;
    at: string;
    readiness: number;
    problemTitle: string;
    pattern: PracticePattern | null;
}

export interface AIInterviewReadiness {
    userId: string;
    totalSessions: number;
    completedSessions: number;
    avgReadiness: number;
    lastReadiness: number;
    /** Running average of code-correctness across completed sessions. */
    correctnessAverage: number;
    dimensionAverages: Record<BehaviourDimensionKey, number>;
    /** Lowest-scoring areas to focus on. May include "correctness" alongside behaviour keys. */
    weakDimensions: string[];
    /** Most recent completed sessions (capped), oldest → newest for the trend. */
    history: ReadinessHistoryPoint[];
    updatedAt: string;
}
