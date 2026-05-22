import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { v4 as uuidv4 } from "uuid";
import { previewAttemptOverlay } from "@/lib/server/userRole";

export const dynamic = "force-dynamic";

function toMillis(value: any): number {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, seriesId, testId, contestContext, userAgent, questions } = body;

        if (!userId || !seriesId || !testId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Load test data
        const testSnap = await adminDb
            .collection("tests")
            .doc(seriesId)
            .collection("tests")
            .doc(testId)
            .get();
        if (!testSnap.exists) {
            return NextResponse.json({ error: "Test not found" }, { status: 404 });
        }
        const test: any = { id: testSnap.id, ...testSnap.data() };

        // Load questions
        let questionsList = questions;
        if (!questionsList || questionsList.length === 0) {
            const qSnap = await adminDb
                .collection("tests")
                .doc(seriesId)
                .collection("tests")
                .doc(testId)
                .collection("questions")
                .orderBy("order", "asc")
                .get();
            questionsList = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        // Calculate duration
        const durationSeconds = contestContext
            ? Math.max(
                  0,
                  Math.floor((new Date(contestContext.endTime).getTime() - Date.now()) / 1000)
              )
            : (test.duration || 60) * 60;
        if (contestContext && durationSeconds <= 0) {
            return NextResponse.json(
                { error: "This contest has already ended." },
                { status: 409 }
            );
        }
        const endTimeDate = new Date(Date.now() + durationSeconds * 1000);
        const maxPossibleScore =
            test.totalMarks ||
            questionsList.reduce((sum: number, q: any) => sum + (q.marks || 1), 0);

        // Race-safe attempt creation: do the existence check + write inside a
        // single Firestore transaction. Without this, two parallel POSTs both
        // see "no in-progress" and both create a fresh attempt.
        const attemptsCollection = adminDb.collection("testAttempts");

        // Pre-fetch any previously-completed attempts so retake/contest gating
        // can short-circuit before the transaction.
        const prevSnap = await attemptsCollection
            .where("userId", "==", userId)
            .where("testId", "==", testId)
            .get();
        const previousForThisTest = prevSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((a) =>
                contestContext ? a.contestId === contestContext.contestId : !a.contestId
            );
        if (
            contestContext &&
            previousForThisTest.some(
                (a) => a.status === "completed" || a.status === "timed_out"
            )
        ) {
            return NextResponse.json(
                { error: "You have already submitted this contest." },
                { status: 409 }
            );
        }
        if (
            !test.allowRetake &&
            !contestContext &&
            previousForThisTest.some(
                (a) => a.status === "completed" || a.status === "timed_out"
            )
        ) {
            return NextResponse.json(
                { error: "Retakes are disabled for this test." },
                { status: 403 }
            );
        }

        const attemptId = uuidv4();

        // Tag the attempt as a preview when the caller isn't a regular
        // customer (teachers, institute admins, platform admins). Preview
        // attempts still let the caller see their results but are
        // excluded from leaderboards and aggregate analytics.
        const previewOverlay = await previewAttemptOverlay(userId);

        const created = await adminDb.runTransaction(async (tx) => {
            // 1. Look for an existing in-progress attempt for this exact context.
            // Note: admin SDK supports queries inside transactions.
            const activeQuery = contestContext
                ? attemptsCollection
                      .where("userId", "==", userId)
                      .where("contestId", "==", contestContext.contestId)
                      .where("status", "==", "in_progress")
                      .limit(1)
                : attemptsCollection
                      .where("userId", "==", userId)
                      .where("testId", "==", testId)
                      .where("status", "==", "in_progress")
                      .limit(1);
            const existingSnap = await tx.get(activeQuery);
            const existingDoc = existingSnap.docs.find((d) => {
                const data = d.data() || {};
                // For non-contest, the same testId could match a contest attempt
                // (contestId set). Exclude those when caller wants a plain attempt.
                if (!contestContext && data.contestId) return false;
                return true;
            });

            if (existingDoc) {
                const data = existingDoc.data() || {};
                // If the attempt's deadline already passed, mark it as timed_out
                // and let the next call create a fresh attempt instead of
                // returning a dead in-progress doc.
                const endMs = toMillis(data.endTime);
                if (endMs > 0 && endMs <= Date.now()) {
                    tx.update(existingDoc.ref, {
                        status: "timed_out",
                        updatedAt: new Date(),
                        remainingTime: 0,
                    });
                    // fall through and create a new attempt below
                } else {
                    return { id: existingDoc.id, ...data, reused: true } as any;
                }
            }

            // 2. Block if a different test is currently active.
            const otherActiveQuery = attemptsCollection
                .where("userId", "==", userId)
                .where("status", "==", "in_progress")
                .limit(5);
            const otherSnap = await tx.get(otherActiveQuery);
            const otherActive = otherSnap.docs.find((d) => {
                const data = d.data() || {};
                if (contestContext) {
                    return data.contestId !== contestContext.contestId;
                }
                return data.testId !== testId || Boolean(data.contestId);
            });
            if (otherActive) {
                const data = otherActive.data() || {};
                const endMs = toMillis(data.endTime);
                if (endMs > 0 && endMs <= Date.now()) {
                    tx.update(otherActive.ref, {
                        status: "abandoned",
                        updatedAt: new Date(),
                    });
                } else {
                    throw new Error(
                        `You already have an active test: "${data.title || "another test"}". Please finish it first.`
                    );
                }
            }

            // 3. Allocate attempt number from previously-completed attempts.
            const attemptNumber = previousForThisTest.length + 1;

            const attemptData: any = {
                userId,
                seriesId,
                testId,
                sourceType: contestContext ? "contest" : "test_series",
                ...(contestContext
                    ? {
                          contestId: contestContext.contestId,
                          contestTitle: contestContext.title,
                      }
                    : {}),
                attemptNumber,
                title: `Attempt ${attemptNumber}`,
                status: "in_progress",
                startedAt: new Date(),
                endTime: endTimeDate,
                currentQuestionIndex: 0,
                answers: [],
                totalScore: 0,
                maxPossibleScore,
                correctAnswers: 0,
                wrongAnswers: 0,
                unattempted: questionsList.length,
                percentage: 0,
                passed: false,
                totalTimeSpent: 0,
                remainingTime: durationSeconds,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...(previewOverlay || {}),
            };
            if (userAgent) attemptData.userAgent = userAgent;

            const newRef = attemptsCollection.doc(attemptId);
            tx.set(newRef, attemptData);
            return { id: attemptId, ...attemptData, reused: false };
        });

        return NextResponse.json({
            attempt: created,
            questions: questionsList,
            reused: Boolean(created?.reused),
        });
    } catch (error: any) {
        console.error("Start attempt error:", error);
        const status = /already (have|submitted)/i.test(error?.message || "") ? 409 : 500;
        return NextResponse.json(
            { error: error.message || "Failed to start test" },
            { status }
        );
    }
}
