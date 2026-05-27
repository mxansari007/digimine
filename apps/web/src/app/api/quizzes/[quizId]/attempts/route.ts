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
import { requireAssignedRole } from "@/lib/server/roleGate";

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
        const classIdParam = searchParams.get("classId");
        const contestContext = contestId
            ? await getContestAttemptContext(contestId, quiz.id, {
                  userId,
                  classId: classIdParam,
              })
            : undefined;

        const access = contestContext
            ? { allowed: true, status: 200, courses: [] }
            : await assertQuizAccess(userId, quiz, { classId: classIdParam });
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

        // Defense-in-depth: refuse to start attempts for role-less users.
        // useAttemptGate sends them through /role-select before they hit this.
        const gate = await requireAssignedRole(userId);
        if (!gate.ok) return gate.response;

        const quiz = await getQuiz(params.quizId);
        if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const contestId = typeof body.contestId === "string" && body.contestId ? body.contestId : null;
        // Pass through the class the student arrived from. The attempt-start
        // gate uses this to find them in `classes/{classId}/students` rather
        // than the legacy `teacher_enrollments` collection that only existed
        // before the class-centric refactor.
        const classId = typeof body.classId === "string" && body.classId ? body.classId : null;
        const contestContext = contestId
            ? await getContestAttemptContext(contestId, quiz.id, { userId, classId })
            : undefined;

        const access = contestContext
            ? { allowed: true, status: 200, courses: [] }
            : await assertQuizAccess(userId, quiz, { classId });
        if (!access.allowed) {
            return NextResponse.json({ error: access.error, courses: coursePayload(access.courses) }, { status: access.status });
        }

        const attempt = await createQuizAttempt(userId, quiz, contestContext, { classId });
        const questions = await getRawQuestions(quiz.id);
        return NextResponse.json(buildAttemptResponse(attempt, questions));
    } catch (error) {
        console.error("Failed to start quiz attempt:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start quiz attempt" }, { status: 500 });
    }
}
