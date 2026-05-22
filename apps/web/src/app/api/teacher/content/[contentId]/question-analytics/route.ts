import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { clampPercent, COMPLETED_STATUSES, toMillis } from "@/lib/server/teacherAnalytics";

export const dynamic = "force-dynamic";

type QuestionDoc = {
    id: string;
    questionText: string;
    type: "mcq" | "text_input" | "code";
    options?: Array<{ id: string; text: string; isCorrect?: boolean }>;
    correctAnswer?: string;
    marks?: number;
};

async function loadQuestions(
    kind: "quiz" | "test",
    contentId: string,
    testId: string | null
): Promise<QuestionDoc[]> {
    if (kind === "quiz") {
        const snap = await adminDb
            .collection("quizzes")
            .doc(contentId)
            .collection("questions")
            .get();
        return snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as any) } as QuestionDoc)
        );
    }
    // tests: when testId is set, scope to that specific child test; else aggregate all.
    if (testId) {
        const snap = await adminDb
            .collection("tests")
            .doc(contentId)
            .collection("tests")
            .doc(testId)
            .collection("questions")
            .get();
        return snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as any) } as QuestionDoc)
        );
    }
    const childrenSnap = await adminDb
        .collection("tests")
        .doc(contentId)
        .collection("tests")
        .get();
    const all: QuestionDoc[] = [];
    await Promise.all(
        childrenSnap.docs.map(async (child) => {
            const qSnap = await child.ref.collection("questions").get();
            qSnap.docs.forEach((q) =>
                all.push({ id: q.id, ...(q.data() as any) } as QuestionDoc)
            );
        })
    );
    return all;
}

export async function GET(
    req: Request,
    { params }: { params: { contentId: string } }
) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");
        const kind = searchParams.get("kind") as "quiz" | "test" | null;
        const testId = searchParams.get("testId");

        if (!teacherId) return NextResponse.json({ error: "teacherId required" }, { status: 400 });
        if (kind !== "quiz" && kind !== "test") {
            return NextResponse.json({ error: "kind must be quiz or test" }, { status: 400 });
        }

        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
        if (tokenUserId !== teacherId) {
            return NextResponse.json({ error: "Not yours" }, { status: 403 });
        }

        // Confirm ownership
        const contentRef =
            kind === "quiz"
                ? adminDb.collection("quizzes").doc(params.contentId)
                : adminDb.collection("tests").doc(params.contentId);
        const contentSnap = await contentRef.get();
        if (!contentSnap.exists || (contentSnap.data() || {}).teacherId !== teacherId) {
            return NextResponse.json({ error: "Not yours" }, { status: 404 });
        }

        // Pull questions + attempts.
        let attemptsSnap: FirebaseFirestore.QuerySnapshot;
        if (kind === "quiz") {
            attemptsSnap = await adminDb
                .collection("quizAttempts")
                .where("quizId", "==", params.contentId)
                .get();
        } else if (testId) {
            attemptsSnap = await adminDb
                .collection("testAttempts")
                .where("seriesId", "==", params.contentId)
                .where("testId", "==", testId)
                .get();
        } else {
            attemptsSnap = await adminDb
                .collection("testAttempts")
                .where("seriesId", "==", params.contentId)
                .get();
        }

        const questions = await loadQuestions(kind, params.contentId, testId);

        type Stats = {
            attempts: number;
            correct: number;
            wrong: number;
            skipped: number;
            totalTimeSeconds: number;
            timeSamples: number;
            // For MCQs: which option was each wrong-answer using?
            optionCounts: Map<string, number>;
        };
        const stats = new Map<string, Stats>();

        const completedAttempts = attemptsSnap.docs.filter((d) =>
            COMPLETED_STATUSES.has((d.data() || {}).status)
        );

        completedAttempts.forEach((doc) => {
            const data = doc.data() || {};
            const answers: any[] = Array.isArray(data.answers) ? data.answers : [];
            const totalDurationSec =
                toMillis(data.completedAt) && toMillis(data.startedAt)
                    ? Math.max(
                          0,
                          Math.round(
                              (toMillis(data.completedAt) - toMillis(data.startedAt)) / 1000
                          )
                      )
                    : 0;
            const perQuestionTime =
                answers.length > 0 ? Math.round(totalDurationSec / answers.length) : 0;

            answers.forEach((a) => {
                if (!a.questionId) return;
                let slot = stats.get(a.questionId);
                if (!slot) {
                    slot = {
                        attempts: 0,
                        correct: 0,
                        wrong: 0,
                        skipped: 0,
                        totalTimeSeconds: 0,
                        timeSamples: 0,
                        optionCounts: new Map(),
                    };
                    stats.set(a.questionId, slot);
                }
                slot.attempts += 1;
                const selected = typeof a.selectedOptionId === "string"
                    ? a.selectedOptionId
                    : typeof a.answer === "string"
                    ? a.answer
                    : "";

                const isSkipped = !selected || selected.trim() === "";
                if (isSkipped) {
                    slot.skipped += 1;
                } else if (a.isCorrect) {
                    slot.correct += 1;
                } else {
                    slot.wrong += 1;
                    slot.optionCounts.set(selected, (slot.optionCounts.get(selected) || 0) + 1);
                }

                // Per-question timing: if individual `timeSpent` was recorded, use it;
                // otherwise fall back to evenly-distributed attempt duration.
                if (typeof a.timeSpent === "number" && a.timeSpent > 0) {
                    slot.totalTimeSeconds += a.timeSpent;
                    slot.timeSamples += 1;
                } else if (perQuestionTime > 0) {
                    slot.totalTimeSeconds += perQuestionTime;
                    slot.timeSamples += 1;
                }
            });
        });

        const rows = questions.map((q) => {
            const s = stats.get(q.id) || {
                attempts: 0,
                correct: 0,
                wrong: 0,
                skipped: 0,
                totalTimeSeconds: 0,
                timeSamples: 0,
                optionCounts: new Map<string, number>(),
            };
            const attempted = s.correct + s.wrong;
            const correctRate = attempted > 0 ? clampPercent((s.correct / attempted) * 100) : null;
            const skipRate = s.attempts > 0 ? clampPercent((s.skipped / s.attempts) * 100) : 0;
            const avgTime = s.timeSamples > 0 ? Math.round(s.totalTimeSeconds / s.timeSamples) : null;

            // For MCQ: identify the most-picked wrong option
            let commonWrong: {
                optionId: string;
                optionText: string;
                pickedCount: number;
                pickedPercent: number;
            } | null = null;
            if (q.type === "mcq" && q.options && s.wrong > 0) {
                let bestId = "";
                let bestCount = 0;
                for (const [optId, count] of s.optionCounts.entries()) {
                    if (count > bestCount) {
                        bestCount = count;
                        bestId = optId;
                    }
                }
                if (bestId) {
                    const opt = q.options.find((o) => o.id === bestId);
                    commonWrong = {
                        optionId: bestId,
                        optionText: opt?.text || "Option",
                        pickedCount: bestCount,
                        pickedPercent: clampPercent((bestCount / s.wrong) * 100),
                    };
                }
            }

            // Difficulty band based on correct rate
            const difficulty = correctRate === null
                ? "n/a"
                : correctRate >= 75
                ? "easy"
                : correctRate >= 45
                ? "moderate"
                : "hard";

            return {
                id: q.id,
                questionText: q.questionText || "(no text)",
                type: q.type,
                marks: q.marks || 1,
                attempts: s.attempts,
                correct: s.correct,
                wrong: s.wrong,
                skipped: s.skipped,
                correctRate,
                skipRate,
                avgTimeSeconds: avgTime,
                difficulty,
                commonWrong,
            };
        });

        rows.sort((a, b) => (a.correctRate ?? 999) - (b.correctRate ?? 999));

        return NextResponse.json({
            totalAttempts: completedAttempts.length,
            questions: rows,
        });
    } catch (error: any) {
        console.error("Question analytics error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load question analytics" },
            { status: 500 }
        );
    }
}
