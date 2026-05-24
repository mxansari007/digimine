import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
    computeMasteryScore,
    deriveGrade,
    masteryLevel,
    scheduleRevision,
    type PracticeDifficulty,
    type PracticeProblem,
} from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const PROBLEMS = "practiceProblems";
export const SHEETS = "practiceSheets";
export const SUBMISSIONS = "practiceSubmissions";
export const PROGRESS = "practiceProgress";
export const MASTERY = "practiceMastery";

export function progressId(userId: string, problemId: string) {
    return `${userId}_${problemId}`;
}

// ─── SQL dataset (de)serialization ───────────────────────────────────
// Firestore forbids arrays-of-arrays, so a SQL problem's `expectedRows`
// (a 2-D array) is stored as an array of { cells: [...] } maps. Encode on
// write, decode on read so the rest of the app keeps the clean 2-D shape.
export function encodeSqlForStore(sql: any) {
    if (!sql) return null;
    const rows = Array.isArray(sql.expectedRows) ? sql.expectedRows : [];
    return {
        schemaSql: sql.schemaSql || "",
        solutionSql: sql.solutionSql || "",
        orderMatters: Boolean(sql.orderMatters),
        expectedColumns: Array.isArray(sql.expectedColumns) ? sql.expectedColumns : [],
        expectedRows: rows.map((r: any) => ({ cells: Array.isArray(r) ? r : [] })),
    };
}

export function decodeSqlFromStore(sql: any) {
    if (!sql) return null;
    const rows = Array.isArray(sql.expectedRows) ? sql.expectedRows : [];
    return {
        schemaSql: sql.schemaSql || "",
        solutionSql: sql.solutionSql || "",
        orderMatters: Boolean(sql.orderMatters),
        expectedColumns: Array.isArray(sql.expectedColumns) ? sql.expectedColumns : [],
        // Tolerate both the encoded ({cells}) and any legacy 2-D shape.
        expectedRows: rows.map((r: any) => (r && Array.isArray(r.cells) ? r.cells : Array.isArray(r) ? r : [])),
    };
}
export function masteryId(userId: string, pattern: string) {
    return `${userId}_${pattern}`;
}

// ─── Serializers ─────────────────────────────────────────────────────

export function serializeProblemSummary(id: string, raw: any) {
    return {
        id,
        slug: raw.slug || "",
        kind: raw.kind || "dsa",
        problemNumber: typeof raw.problemNumber === "number" ? raw.problemNumber : null,
        title: raw.title || "",
        difficulty: raw.difficulty || "easy",
        primaryPattern: raw.primaryPattern || "arrays-hashing",
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        access: raw.access || "free",
        totalSolved: raw.totalSolved ?? 0,
        totalSubmissions: raw.totalSubmissions ?? 0,
        isFeatured: Boolean(raw.isFeatured),
    };
}

/**
 * Public-safe problem view: strips hidden test-case I/O and the SQL
 * expected result set so the answer key never leaves the server.
 */
export function serializeProblemPublic(id: string, raw: any) {
    const testCases = Array.isArray(raw.testCases) ? raw.testCases : [];
    const visibleSamples = testCases
        .filter((t: any) => !t.isHidden)
        .map((t: any) => ({ input: t.input, expectedOutput: t.expectedOutput, explanation: t.explanation || null }));
    return {
        id,
        slug: raw.slug || "",
        kind: raw.kind || "dsa",
        problemNumber: typeof raw.problemNumber === "number" ? raw.problemNumber : null,
        title: raw.title || "",
        statementHtml: raw.statementHtml || "",
        difficulty: raw.difficulty || "easy",
        primaryPattern: raw.primaryPattern || "arrays-hashing",
        secondaryPatterns: Array.isArray(raw.secondaryPatterns) ? raw.secondaryPatterns : [],
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        patternChoices: Array.isArray(raw.patternChoices) ? raw.patternChoices : [],
        languages: Array.isArray(raw.languages) ? raw.languages : ["python", "javascript", "cpp", "java"],
        starters: Array.isArray(raw.starters) ? raw.starters : [],
        samples: visibleSamples,
        constraintsHtml: raw.constraintsHtml ?? null,
        timeLimitMs: raw.timeLimitMs ?? 5000,
        memoryLimitMb: raw.memoryLimitMb ?? 256,
        // SQL: expose the schema (so the user can see the tables) but never
        // the expected rows or reference solution.
        sql: raw.sql
            ? {
                  schemaSql: raw.sql.schemaSql || "",
                  orderMatters: Boolean(raw.sql.orderMatters),
              }
            : null,
        editorialHtml: raw.editorialHtml ?? null,
        editorialAccess: raw.editorialAccess === "premium" ? "premium" : "free",
        hints: Array.isArray(raw.hints) ? raw.hints : [],
        access: raw.access || "free",
        totalSolved: raw.totalSolved ?? 0,
        totalSubmissions: raw.totalSubmissions ?? 0,
    };
}

export function serializeProgress(id: string, raw: any) {
    return {
        id,
        problemId: raw.problemId || "",
        kind: raw.kind || "dsa",
        primaryPattern: raw.primaryPattern || null,
        difficulty: raw.difficulty || "easy",
        status: raw.status || "todo",
        attempts: raw.attempts ?? 0,
        solvedAt: toIsoDate(raw.solvedAt),
        solvedFirstTry: Boolean(raw.solvedFirstTry),
        usedHints: Boolean(raw.usedHints),
        recognitionAnswered: Boolean(raw.recognitionAnswered),
        recognitionCorrect: Boolean(raw.recognitionCorrect),
        ease: raw.ease ?? 2.5,
        intervalDays: raw.intervalDays ?? 0,
        repetitions: raw.repetitions ?? 0,
        lastGrade: raw.lastGrade ?? 0,
        dueAt: toIsoDate(raw.dueAt),
        lastReviewedAt: toIsoDate(raw.lastReviewedAt),
        starred: Boolean(raw.starred),
    };
}

export function serializeMastery(id: string, raw: any) {
    return {
        id,
        pattern: raw.pattern,
        kind: raw.kind || "dsa",
        attempted: raw.attempted ?? 0,
        solved: raw.solved ?? 0,
        solvedFirstTry: raw.solvedFirstTry ?? 0,
        easySolved: raw.easySolved ?? 0,
        mediumSolved: raw.mediumSolved ?? 0,
        hardSolved: raw.hardSolved ?? 0,
        recognitionCorrect: raw.recognitionCorrect ?? 0,
        recognitionTotal: raw.recognitionTotal ?? 0,
        masteryScore: raw.masteryScore ?? 0,
        level: raw.level || "novice",
        lastPracticedAt: toIsoDate(raw.lastPracticedAt),
    };
}

// ─── The big one: record a submission and update progress + mastery ──

interface RecordArgs {
    userId: string;
    problem: PracticeProblem & { id: string };
    mode: "run" | "submit";
    language: string;
    code: string;
    judge: {
        verdict: string;
        passedCount: number;
        totalCount: number;
        runtimeMs: number;
        results: any[];
    };
}

/**
 * Persist the submission. On a graded "submit", advance SM-2 scheduling on
 * the per-problem progress doc and roll the result into per-pattern mastery.
 * "run" mode just stores the submission and bumps attempts.
 */
export async function recordSubmission(args: RecordArgs) {
    const { userId, problem, mode, language, code, judge } = args;
    const now = Timestamp.now();
    const nowMs = now.toMillis();
    const accepted = judge.verdict === "accepted";

    // 1. Write the submission row. Strip any `undefined` — Firestore rejects it.
    const safeResults = (Array.isArray(judge.results) ? judge.results : []).map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
            if (v !== undefined) out[k] = v;
        }
        return out;
    });
    const subRef = adminDb.collection(SUBMISSIONS).doc();
    await subRef.set({
        userId,
        problemId: problem.id,
        kind: problem.kind,
        mode,
        language,
        code: code.slice(0, 50000),
        verdict: judge.verdict,
        passedCount: judge.passedCount,
        totalCount: judge.totalCount,
        results: safeResults,
        runtimeMs: judge.runtimeMs ?? null,
        createdAt: now,
    });

    // "run" doesn't affect scheduling/mastery — only bump attempts lightly.
    const progRef = adminDb.collection(PROGRESS).doc(progressId(userId, problem.id));
    const progSnap = await progRef.get();
    const prev = progSnap.exists ? progSnap.data() || {} : {};
    const priorStatus = prev.status || "todo";
    const wasSolved = priorStatus === "solved";
    const priorAttempts = prev.attempts ?? 0;

    if (mode === "run") {
        await progRef.set(
            {
                userId,
                problemId: problem.id,
                kind: problem.kind,
                primaryPattern: problem.primaryPattern,
                difficulty: problem.difficulty,
                status: wasSolved ? "solved" : priorStatus === "todo" ? "attempted" : priorStatus,
                attempts: priorAttempts,
                updatedAt: now,
                createdAt: prev.createdAt || now,
            },
            { merge: true }
        );
        return { submissionId: subRef.id };
    }

    // ── submit mode ──
    const attemptsThisSession = (prev.sessionAttempts ?? 0) + 1;
    const newAttempts = priorAttempts + 1;
    const firstTry = accepted && !wasSolved && attemptsThisSession === 1;

    // Derive SM-2 grade + next schedule (only meaningful once solved).
    const grade = deriveGrade({
        solved: accepted,
        attemptsThisSession,
        usedHints: Boolean(prev.usedHints),
        recognitionCorrect: prev.recognitionAnswered ? Boolean(prev.recognitionCorrect) : null,
    });

    let revision = {
        ease: prev.ease ?? 2.5,
        intervalDays: prev.intervalDays ?? 0,
        repetitions: prev.repetitions ?? 0,
        dueAtMs: prev.dueAt?.toMillis ? prev.dueAt.toMillis() : nowMs,
    };
    if (accepted) {
        const sched = scheduleRevision(
            { ease: prev.ease ?? 2.5, intervalDays: prev.intervalDays ?? 0, repetitions: prev.repetitions ?? 0 },
            grade,
            nowMs
        );
        revision = { ease: sched.ease, intervalDays: sched.intervalDays, repetitions: sched.repetitions, dueAtMs: sched.dueAtMs };
    }

    const nextStatus = accepted ? "solved" : "attempted";
    await progRef.set(
        {
            userId,
            problemId: problem.id,
            kind: problem.kind,
            primaryPattern: problem.primaryPattern,
            difficulty: problem.difficulty,
            status: nextStatus,
            attempts: newAttempts,
            sessionAttempts: accepted ? 0 : attemptsThisSession, // reset on solve
            solvedAt: accepted ? prev.solvedAt || now : prev.solvedAt || null,
            solvedFirstTry: wasSolved ? Boolean(prev.solvedFirstTry) : firstTry,
            lastGrade: grade,
            ease: revision.ease,
            intervalDays: revision.intervalDays,
            repetitions: revision.repetitions,
            dueAt: accepted ? Timestamp.fromMillis(revision.dueAtMs) : prev.dueAt || null,
            lastReviewedAt: now,
            updatedAt: now,
            createdAt: prev.createdAt || now,
        },
        { merge: true }
    );

    // 3. Roll into pattern mastery — only the first time a problem flips to
    //    solved do we count it toward solve totals, but every submit refreshes
    //    recency + recognition.
    const newlySolved = accepted && !wasSolved;
    if (newlySolved || !wasSolved) {
        const mRef = adminDb.collection(MASTERY).doc(masteryId(userId, problem.primaryPattern));
        const mSnap = await mRef.get();
        const m = mSnap.exists ? mSnap.data() || {} : {};

        const diff = problem.difficulty as PracticeDifficulty;
        const next = {
            attempted: (m.attempted ?? 0) + (priorStatus === "todo" ? 1 : 0),
            solved: (m.solved ?? 0) + (newlySolved ? 1 : 0),
            solvedFirstTry: (m.solvedFirstTry ?? 0) + (newlySolved && firstTry ? 1 : 0),
            easySolved: (m.easySolved ?? 0) + (newlySolved && diff === "easy" ? 1 : 0),
            mediumSolved: (m.mediumSolved ?? 0) + (newlySolved && diff === "medium" ? 1 : 0),
            hardSolved: (m.hardSolved ?? 0) + (newlySolved && diff === "hard" ? 1 : 0),
            recognitionCorrect: m.recognitionCorrect ?? 0,
            recognitionTotal: m.recognitionTotal ?? 0,
        };
        const score = computeMasteryScore({ ...next, lastPracticedAtMs: nowMs }, nowMs);
        await mRef.set(
            {
                userId,
                pattern: problem.primaryPattern,
                kind: problem.kind,
                ...next,
                masteryScore: score,
                level: masteryLevel(score),
                lastPracticedAt: now,
                updatedAt: now,
            },
            { merge: true }
        );
    }

    // 4. Bump problem aggregate stats.
    await adminDb
        .collection(PROBLEMS)
        .doc(problem.id)
        .update({
            totalSubmissions: FieldValue.increment(1),
            ...(newlySolved ? { totalSolved: FieldValue.increment(1) } : {}),
        })
        .catch(() => {});

    return { submissionId: subRef.id, grade, accepted, newlySolved };
}

/**
 * List all published problem summaries, sorted (featured → difficulty → title).
 * Used by the server-rendered /practice/problems catalog page so the full list
 * is in the initial HTML (indexable), not fetched client-side.
 */
export async function listPublishedProblemSummaries(max = 2000) {
    const snap = await adminDb
        .collection(PROBLEMS)
        .where("status", "==", "published")
        .limit(max)
        .get();
    const items = snap.docs.map((d) => serializeProblemSummary(d.id, d.data() || {}));
    // Catalog sort: numbered problems ascending (LeetCode-style), then any
    // unnumbered ones alphabetically. Featured is shown as a badge in the
    // UI but does NOT jumble the list — predictability beats novelty here.
    items.sort((a, b) => {
        const an = typeof a.problemNumber === "number" ? a.problemNumber : Number.POSITIVE_INFINITY;
        const bn = typeof b.problemNumber === "number" ? b.problemNumber : Number.POSITIVE_INFINITY;
        if (an !== bn) return an - bn;
        return a.title.localeCompare(b.title);
    });
    return items;
}

/** Load a published problem by slug (full doc — server only). */
export async function loadProblemBySlug(slug: string): Promise<(PracticeProblem & { id: string }) | null> {
    if (!slug) return null;

    // Fast path: slug-as-doc-id. Single key-value read with no index — free.
    const direct = await adminDb.collection(PROBLEMS).doc(slug).get();
    if (direct.exists) {
        const data = direct.data() as any;
        return { id: direct.id, ...data, sql: decodeSqlFromStore(data.sql) };
    }

    // Legacy fallback: random-ID docs that store the slug in a field.
    const snap = await adminDb.collection(PROBLEMS).where("slug", "==", slug).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() as any;
    return { id: d.id, ...data, sql: decodeSqlFromStore(data.sql) };
}

export async function loadProblemById(id: string): Promise<(PracticeProblem & { id: string }) | null> {
    const d = await adminDb.collection(PROBLEMS).doc(id).get();
    if (!d.exists) return null;
    const data = d.data() as any;
    return { id: d.id, ...data, sql: decodeSqlFromStore(data.sql) };
}
