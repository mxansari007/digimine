/**
 * POST /api/ai-interview/turn
 *
 * Drives one interaction in a live interview. Two actions:
 *   - action="run":     execute the candidate's code against VISIBLE tests via
 *                       the existing judge, append a run-result turn, return it.
 *                       The interviewer sees these results as ground truth on
 *                       the next message turn.
 *   - action="message": append the candidate's spoken/typed message, ask the
 *                       grounded DeepSeek interviewer for its reply, append +
 *                       return it.
 *
 * Code/language sent with either action is persisted as the session's latest
 * code so "End interview" can run the final (hidden) judge.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getAiProviderConfig } from "@/lib/server/aiProvider";
import { loadProblemById } from "@/lib/server/practice";
import { judgeDsa, judgeSql } from "@/lib/server/practiceJudge";
import {
    AI_INTERVIEW_SESSIONS,
    buildInterviewerMessages,
    callChat,
    extractEditorSignal,
    extractEndSignal,
    makeTurn,
    summarizeJudgeForChat,
} from "@/lib/server/aiInterview";
import type {
    AIInterviewSession,
    AIInterviewTurn,
    InterviewLanguage,
} from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_LANGS: InterviewLanguage[] = ["python", "javascript", "cpp", "java", "sql"];

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        const action = body.action === "run" ? "run" : "message";
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
        if (session.status !== "in_progress") {
            return NextResponse.json(
                { error: "This interview has already ended." },
                { status: 400 }
            );
        }

        // DSA + SQL interviews ground on a problem + allow code/query runs; other
        // types are conversation-only. (Default missing type to "dsa" for legacy
        // docs.)
        const interviewType = session.interviewType || "dsa";
        const isSql = interviewType === "sql";
        const isCoding = interviewType === "dsa" || isSql;
        const problem = isCoding ? await loadProblemById(session.problemId) : null;
        if (isCoding && !problem) {
            return NextResponse.json({ error: "Problem missing" }, { status: 404 });
        }

        // Persist any code/language the client sent along with this turn.
        const incomingLang =
            typeof body.language === "string" &&
            VALID_LANGS.includes(body.language as InterviewLanguage)
                ? (body.language as InterviewLanguage)
                : session.language;
        const incomingCode =
            typeof body.code === "string" ? body.code : session.latestCode;

        const transcript: AIInterviewTurn[] = Array.isArray(session.transcript)
            ? [...session.transcript]
            : [];

        if (action === "run") {
            if (!isCoding || !problem) {
                return NextResponse.json(
                    { error: "This interview has no code to run." },
                    { status: 400 }
                );
            }
            const judge = isSql
                ? await judgeSql(problem, incomingCode)
                : await judgeDsa(problem, incomingLang, incomingCode, "run");
            const summary = summarizeJudgeForChat(judge);
            const runTurn = makeTurn("system", "run_result", summary, {
                verdict: judge.verdict,
                passedCount: judge.passedCount,
                totalCount: judge.totalCount,
                language: incomingLang,
            });

            // Atomic append — never rewrite the whole array, so a concurrent
            // Run + Send can't clobber each other's turn.
            await ref.set(
                {
                    transcript: FieldValue.arrayUnion(runTurn),
                    latestCode: incomingCode,
                    language: incomingLang,
                    updatedAt: new Date().toISOString(),
                },
                { merge: true }
            );

            return NextResponse.json({ turn: runTurn, judge });
        }

        // action === "message"
        const text = typeof body.message === "string" ? body.message.trim() : "";
        if (!text) {
            return NextResponse.json({ error: "message required" }, { status: 400 });
        }

        const aiCfg = await getAiProviderConfig();
        if (!aiCfg.enabled || !aiCfg.apiKey) {
            return NextResponse.json(
                { error: "AI interviewer is temporarily unavailable." },
                { status: 503 }
            );
        }

        const candidateTurn = makeTurn("candidate", "message", text);
        // Local copy (incl. this turn) only to build the interviewer prompt;
        // persistence below uses an atomic arrayUnion, not this array.
        transcript.push(candidateTurn);

        const messages = buildInterviewerMessages({
            interviewType,
            config: session.config,
            problem,
            transcript,
            latestCode: incomingCode,
        });

        let reply = "";
        try {
            reply = (await callChat(messages, aiCfg, { temperature: 0.5 })).trim();
        } catch (err) {
            console.error("[/api/ai-interview/turn] upstream failed:", err);
            return NextResponse.json(
                { error: "The interviewer couldn't respond. Please try again." },
                { status: 502 }
            );
        }
        if (!reply) {
            return NextResponse.json(
                { error: "The interviewer returned an empty reply. Please try again." },
                { status: 502 }
            );
        }

        // Strip control tags from what the candidate sees: [[OPEN_EDITOR]]
        // (DSA + SQL coding types) reveals the editor; [[END_INTERVIEW]] (any
        // type) tells the room to auto-finish after the closing remark.
        let cleaned = reply;
        let openEditor = false;
        if (isCoding) {
            const e = extractEditorSignal(cleaned);
            cleaned = e.cleaned;
            openEditor = e.openEditor;
        }
        const endSig = extractEndSignal(cleaned);
        cleaned = endSig.cleaned;
        const ended = endSig.ended;

        const interviewerTurn = makeTurn("interviewer", "message", cleaned);
        const unlockNow = isCoding && openEditor && !session.codingUnlocked;

        const update: Record<string, unknown> = {
            transcript: FieldValue.arrayUnion(candidateTurn, interviewerTurn),
            latestCode: incomingCode,
            language: incomingLang,
            updatedAt: new Date().toISOString(),
        };
        if (unlockNow) update.codingUnlocked = true;

        await ref.set(update, { merge: true });

        return NextResponse.json({
            turn: interviewerTurn,
            message: cleaned,
            codingUnlocked: isCoding && (openEditor || Boolean(session.codingUnlocked)),
            ended,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/turn] failed:", e);
        return NextResponse.json(
            { error: e.message || "Turn failed" },
            { status: 500 }
        );
    }
}
