import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    buildAttemptResponse,
    finalizeAttempt,
    getAttempt,
    getAuthenticatedUserId,
    getRawQuestions,
    sanitizeQuestions,
    serializeAttempt,
    syncTimedOutAttempt,
} from "@/lib/server/quizAttempts";

type SaveAnswer = {
    questionId: string;
    answer: string;
    timeSpent?: number;
};

function normalizeAnswers(value: unknown): SaveAnswer[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            if (typeof record.questionId !== "string") return null;
            return {
                questionId: record.questionId,
                answer: typeof record.answer === "string" ? record.answer : "",
                ...(typeof record.timeSpent === "number" ? { timeSpent: record.timeSpent } : {}),
            };
        })
        .filter(Boolean) as SaveAnswer[];
}

async function requireOwnedAttempt(req: Request, attemptId: string) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
        return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
    }

    const attempt = await getAttempt(attemptId);
    if (!attempt) {
        return { error: NextResponse.json({ error: "Quiz attempt not found" }, { status: 404 }) };
    }

    if (attempt.userId !== userId) {
        return { error: NextResponse.json({ error: "You do not own this quiz attempt" }, { status: 403 }) };
    }

    return { userId, attempt };
}

export async function GET(req: Request, { params }: { params: { attemptId: string } }) {
    try {
        const owned = await requireOwnedAttempt(req, params.attemptId);
        if (owned.error) return owned.error;

        const synced = await syncTimedOutAttempt(owned.attempt!);
        const questions = await getRawQuestions(synced.quizId);
        return NextResponse.json(
            synced.status === "in_progress"
                ? buildAttemptResponse(synced, questions)
                : { attempt: serializeAttempt(synced), questions: sanitizeQuestions(questions, synced) }
        );
    } catch (error) {
        console.error("Failed to load quiz attempt:", error);
        return NextResponse.json({ error: "Failed to load quiz attempt" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: { attemptId: string } }) {
    try {
        const owned = await requireOwnedAttempt(req, params.attemptId);
        if (owned.error) return owned.error;

        const body = await req.json().catch(() => ({}));
        const answers = body.answers !== undefined ? normalizeAnswers(body.answers) : undefined;
        const remainingTime = typeof body.remainingTime === "number" ? Math.max(0, Math.floor(body.remainingTime)) : undefined;
        const currentQuestionIndex = typeof body.currentQuestionIndex === "number"
            ? Math.max(0, Math.floor(body.currentQuestionIndex))
            : undefined;

        const attemptRef = adminDb.collection("quizAttempts").doc(params.attemptId);
        await adminDb.runTransaction(async (tx) => {
            const snapshot = await tx.get(attemptRef);
            if (!snapshot.exists) return;
            const current = snapshot.data() || {};
            if (current.status !== "in_progress") return;
            if (current.userId !== owned.userId) return;

            const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
            if (answers !== undefined) updateData.answers = answers;
            if (remainingTime !== undefined) updateData.remainingTime = remainingTime;
            if (currentQuestionIndex !== undefined) updateData.currentQuestionIndex = currentQuestionIndex;
            tx.update(attemptRef, updateData);
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to save quiz attempt:", error);
        return NextResponse.json({ error: "Failed to save quiz attempt" }, { status: 500 });
    }
}

export async function POST(req: Request, { params }: { params: { attemptId: string } }) {
    try {
        const owned = await requireOwnedAttempt(req, params.attemptId);
        if (owned.error) return owned.error;

        const body = await req.json().catch(() => ({}));
        const finalStatus = body.finalStatus === "timed_out" ? "timed_out" : "completed";
        const incomingAnswers = normalizeAnswers(body.answers);
        const remainingTime = typeof body.remainingTime === "number" ? Math.max(0, Math.floor(body.remainingTime)) : undefined;
        const currentQuestionIndex = typeof body.currentQuestionIndex === "number"
            ? Math.max(0, Math.floor(body.currentQuestionIndex))
            : undefined;

        if (owned.attempt!.status === "in_progress" && incomingAnswers.length > 0) {
            const attemptRef = adminDb.collection("quizAttempts").doc(params.attemptId);
            await adminDb.runTransaction(async (tx) => {
                const snapshot = await tx.get(attemptRef);
                if (!snapshot.exists) return;
                const current = snapshot.data() || {};
                if (current.status !== "in_progress") return;
                const updateData: Record<string, unknown> = {
                    answers: incomingAnswers,
                    updatedAt: Timestamp.now(),
                };
                if (remainingTime !== undefined) updateData.remainingTime = remainingTime;
                if (currentQuestionIndex !== undefined) updateData.currentQuestionIndex = currentQuestionIndex;
                tx.update(attemptRef, updateData);
            });
        }

        const finalAttempt = await finalizeAttempt(params.attemptId, finalStatus);
        return NextResponse.json({ attempt: serializeAttempt(finalAttempt), result: {
            score: finalAttempt.totalScore,
            rawScore: finalAttempt.totalScore,
            maxScore: finalAttempt.maxPossibleScore,
            percentage: finalAttempt.percentage,
            correct: finalAttempt.correctAnswers,
            wrong: finalAttempt.wrongAnswers,
            skipped: finalAttempt.skipped,
            totalQuestions: finalAttempt.questionResults?.length || 0,
            passed: finalAttempt.passed ?? null,
            passingPercentage: finalAttempt.passingPercentage || 0,
            questionResults: finalAttempt.questionResults || [],
        } });
    } catch (error) {
        console.error("Failed to submit quiz attempt:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to submit quiz attempt" }, { status: 500 });
    }
}
