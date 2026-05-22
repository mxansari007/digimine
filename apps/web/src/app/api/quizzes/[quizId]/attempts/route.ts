import { NextResponse } from "next/server";
import {
    assertQuizAccess,
    buildAttemptResponse,
    createQuizAttempt,
    getAuthenticatedUserId,
    getQuiz,
    getRawQuestions,
    getUserQuizAttempts,
    getContestAttemptContext,
    syncTimedOutAttempt,
} from "@/lib/server/quizAttempts";

export const dynamic = "force-dynamic";

function coursePayload(courses: Array<{ id: string; slug?: string; title?: string; accessType?: string }>) {
    return courses.map((course) => ({
        id: course.id,
        slug: course.slug,
        title: course.title,
        accessType: course.accessType,
    }));
}

export async function GET(req: Request, { params }: { params: { quizId: string } }) {
    try {
        const userId = await getAuthenticatedUserId(req);
        if (!userId) {
            return NextResponse.json({ error: "Sign in to resume quiz attempts." }, { status: 401 });
        }

        const quiz = await getQuiz(params.quizId);
        if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

        const { searchParams } = new URL(req.url);
        const contestId = searchParams.get("contestId");
        const contestContext = contestId ? await getContestAttemptContext(contestId, quiz.id) : undefined;

        const access = contestContext ? { allowed: true, status: 200, courses: [] } : await assertQuizAccess(userId, quiz);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error, courses: coursePayload(access.courses) }, { status: access.status });
        }

        const attempts = await getUserQuizAttempts(userId, quiz.id);
        const active = attempts.find((attempt) => attempt.status === "in_progress" && (contestId ? attempt.contestId === contestId : !attempt.contestId));
        if (!active) {
            return NextResponse.json({ attempt: null, questions: [] });
        }

        const synced = await syncTimedOutAttempt(active);
        if (synced.status !== "in_progress") {
            return NextResponse.json({ attempt: null, questions: [] });
        }

        const questions = await getRawQuestions(quiz.id);
        return NextResponse.json(buildAttemptResponse(synced, questions));
    } catch (error) {
        console.error("Failed to load quiz attempt:", error);
        return NextResponse.json({ error: "Failed to load quiz attempt" }, { status: 500 });
    }
}

export async function POST(req: Request, { params }: { params: { quizId: string } }) {
    try {
        const userId = await getAuthenticatedUserId(req);
        if (!userId) {
            return NextResponse.json({ error: "Sign in to start this quiz." }, { status: 401 });
        }

        const quiz = await getQuiz(params.quizId);
        if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const contestId = typeof body.contestId === "string" && body.contestId ? body.contestId : null;
        const contestContext = contestId ? await getContestAttemptContext(contestId, quiz.id) : undefined;

        const access = contestContext ? { allowed: true, status: 200, courses: [] } : await assertQuizAccess(userId, quiz);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error, courses: coursePayload(access.courses) }, { status: access.status });
        }

        const attempt = await createQuizAttempt(userId, quiz, contestContext);
        const questions = await getRawQuestions(quiz.id);
        return NextResponse.json(buildAttemptResponse(attempt, questions));
    } catch (error) {
        console.error("Failed to start quiz attempt:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start quiz attempt" }, { status: 500 });
    }
}
