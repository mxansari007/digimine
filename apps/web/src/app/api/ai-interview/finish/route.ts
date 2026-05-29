/**
 * POST /api/ai-interview/finish
 *
 * Finalises an interview:
 *   1. Runs the FINAL judge (all tests, incl. hidden) on the latest code →
 *      objective correctness.
 *   2. Asks the LLM for a behaviour scorecard from the transcript (graded on
 *      what the candidate DID — not accent/tone). Filler-words + pass-rate are
 *      computed server-side and override anything the model says.
 *   3. Stores the scorecard, marks the session completed, and folds it into
 *      the user's readiness rollup (exactly once).
 *
 * Idempotent: calling finish on an already-completed session returns the
 * stored scorecard without re-rolling the aggregate.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getAiProviderConfig } from "@/lib/server/aiProvider";
import { loadProblemById } from "@/lib/server/practice";
import { judgeDsa, judgeSql, type JudgeResult } from "@/lib/server/practiceJudge";
import {
    AI_INTERVIEW_SESSIONS,
    buildScoringMessages,
    callChat,
    countFillerWords,
    normalizeScorecard,
    safeParseJsonObject,
    updateReadinessRollup,
} from "@/lib/server/aiInterview";
import type { AIInterviewSession } from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId required" }, { status: 400 });
        }

        const ref = adminDb.collection(AI_INTERVIEW_SESSIONS).doc(sessionId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Interview not found" }, { status: 404 });
        }
        const session = snap.data() as AIInterviewSession;
        if (session.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Already scored. Still (idempotently) ensure the readiness rollup was
        // applied — recovers from a prior finish that completed the session but
        // crashed before the rollup. updateReadinessRollup no-ops if this
        // session is already folded in.
        if (session.status === "completed" && session.scorecard) {
            await updateReadinessRollup(
                userId,
                sessionId,
                {
                    problemTitle: session.problemTitle,
                    primaryPattern: session.primaryPattern,
                    completedAt: session.completedAt,
                },
                session.scorecard
            );
            return NextResponse.json({ scorecard: session.scorecard, alreadyCompleted: true });
        }

        const interviewType = session.interviewType || "dsa";
        const isSql = interviewType === "sql";
        const isCoding = interviewType === "dsa" || isSql;

        // 1. Coding (DSA + SQL): final correctness via the judge (all tests,
        //    incl. hidden for DSA; full result-set comparison for SQL).
        let finalJudge: JudgeResult | null = null;
        let problem: Awaited<ReturnType<typeof loadProblemById>> = null;
        if (isCoding) {
            problem = await loadProblemById(session.problemId);
            if (!problem) {
                return NextResponse.json({ error: "Problem missing" }, { status: 404 });
            }
            const hasCode = !!(session.latestCode && session.latestCode.trim());
            if (hasCode) {
                finalJudge = isSql
                    ? await judgeSql(problem, session.latestCode)
                    : await judgeDsa(problem, session.language, session.latestCode, "submit");
            } else {
                finalJudge = {
                    verdict: "wrong_answer",
                    passedCount: 0,
                    totalCount: isSql
                        ? 1
                        : Array.isArray(problem.testCases)
                            ? problem.testCases.length
                            : 0,
                    runtimeMs: 0,
                    results: [],
                };
            }
        }

        // 2. Behaviour scorecard (best-effort — never block finishing on the LLM).
        const fillerWords = countFillerWords(session.transcript || []);
        let parsed: any = null;
        const aiCfg = await getAiProviderConfig();
        if (aiCfg.enabled && aiCfg.apiKey) {
            try {
                const messages = buildScoringMessages({
                    interviewType,
                    config: session.config,
                    problem,
                    transcript: session.transcript || [],
                    finalJudge,
                });
                const raw = await callChat(messages, aiCfg, { json: true, temperature: 0.2 });
                parsed = safeParseJsonObject(raw);
            } catch (err) {
                console.error("[/api/ai-interview/finish] scoring upstream failed:", err);
            }
        }
        const scorecard = normalizeScorecard(parsed, { interviewType, finalJudge, fillerWords });

        // 3. Persist + roll up.
        const completedAt = new Date().toISOString();
        await ref.set(
            {
                status: "completed",
                scorecard,
                completedAt,
                updatedAt: completedAt,
            },
            { merge: true }
        );

        await updateReadinessRollup(
            userId,
            sessionId,
            {
                problemTitle: session.problemTitle,
                primaryPattern: session.primaryPattern,
                completedAt,
            },
            scorecard
        );

        return NextResponse.json({ scorecard });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/finish] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to finish interview" },
            { status: 500 }
        );
    }
}
