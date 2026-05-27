import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { v4 as uuidv4 } from "uuid";
import { previewAttemptOverlay } from "@/lib/server/userRole";
import { requireAssignedRole } from "@/lib/server/roleGate";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { assertContestClassroomAccess } from "@/lib/server/quizAttempts";

export const dynamic = "force-dynamic";

/**
 * Resolves whether a student is allowed to start a test in this series.
 * Mirrors the three-tier check from `assertQuizAccess` so the two flows behave
 * identically: (1) explicit class context, (2) fan-out across class IDs the
 * series is assigned to, (3) legacy teacher_enrollments fallback for
 * pre-class-refactor installs.
 */
async function isEnrolledForSeriesAccess(args: {
    userId: string;
    teacherId: string;
    seriesClassIds: string[];
    requestedClassId: string;
}): Promise<boolean> {
    const { userId, teacherId, seriesClassIds, requestedClassId } = args;

    // 1. Class the student arrived from. Verify they're actually in it AND
    //    that the class belongs to this series' teacher AND (if the series
    //    is class-scoped) that the series is assigned to that class.
    if (requestedClassId) {
        if (seriesClassIds.length > 0 && !seriesClassIds.includes(requestedClassId)) {
            // Series wasn't assigned to the class the student claims — fail
            // closed. Fall through to the legacy check just in case.
        } else {
            const [memberSnap, classSnap] = await Promise.all([
                adminDb
                    .collection("classes")
                    .doc(requestedClassId)
                    .collection("students")
                    .doc(userId)
                    .get(),
                adminDb.collection("classes").doc(requestedClassId).get(),
            ]);
            if (
                memberSnap.exists &&
                memberSnap.data()?.status === "active" &&
                classSnap.exists &&
                classSnap.data()?.teacherId === teacherId
            ) {
                return true;
            }
        }
    }

    // 2. Class-fan-out — the student didn't pass a classId but may still be
    //    enrolled in one of the classes this series is published into.
    if (seriesClassIds.length > 0) {
        for (const cid of seriesClassIds) {
            const memberSnap = await adminDb
                .collection("classes")
                .doc(cid)
                .collection("students")
                .doc(userId)
                .get();
            if (memberSnap.exists && memberSnap.data()?.status === "active") {
                return true;
            }
        }
    }

    // 3. Legacy fallback: pre-class-refactor data has students attached
    //    directly to the teacher.
    const legacy = await adminDb
        .collection("teacher_enrollments")
        .doc(teacherId)
        .collection("students")
        .doc(userId)
        .get();
    return legacy.exists && legacy.data()?.status === "active";
}

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
        const classId = typeof body.classId === "string" && body.classId ? body.classId : "";

        if (!userId || !seriesId || !testId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Verify the caller actually owns the userId they sent. Pre-existing
        // routes trusted whatever userId the client put in the body — closing
        // that gap here. Falls back gracefully for contest flows that may not
        // include a Bearer token yet.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (tokenUserId && tokenUserId !== userId) {
            return NextResponse.json(
                { error: "You can only start a test for your own account." },
                { status: 403 }
            );
        }

        // Defense-in-depth: refuse to create attempts for role-less users.
        const gate = await requireAssignedRole(String(userId));
        if (!gate.ok) return gate.response;

        // Load test series + test data so we can run the enrollment check.
        const seriesSnap = await adminDb.collection("tests").doc(seriesId).get();
        if (!seriesSnap.exists) {
            return NextResponse.json({ error: "Test series not found" }, { status: 404 });
        }
        const series: any = { id: seriesSnap.id, ...seriesSnap.data() };

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

        // ── Release-date gate ──────────────────────────────────────────────
        //
        // If the test has `availableFrom` set and that moment hasn't
        // arrived, refuse the attempt server-side. Without this guard a
        // student could open /tests/<slug>/attempt directly via URL even
        // though the UI shows the test as locked.
        if (test.availableFrom) {
            const releaseMillis = toMillis(test.availableFrom);
            if (releaseMillis > 0 && Date.now() < releaseMillis) {
                const when = new Date(releaseMillis).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                });
                return NextResponse.json(
                    {
                        error: `This test isn't available yet — releases on ${when}.`,
                        code: "not_yet_released",
                        availableFrom: new Date(releaseMillis).toISOString(),
                    },
                    { status: 403 }
                );
            }
        }

        // ── Contest classroom gate ─────────────────────────────────────────
        //
        // Don't trust the body's `contestContext`. Re-fetch the contest doc
        // and (a) confirm it's the one the client claims, (b) enforce
        // classroom enrollment when the contest is private. Previously a
        // classroom-only contest could be opened by anyone with the ID
        // during the live window.
        if (contestContext && contestContext.contestId) {
            const contestSnap = await adminDb
                .collection("contests")
                .doc(contestContext.contestId)
                .get();
            if (!contestSnap.exists) {
                return NextResponse.json(
                    { error: "Contest not found." },
                    { status: 404 }
                );
            }
            const contestData = contestSnap.data() || {};
            if (contestData.status !== "published") {
                return NextResponse.json(
                    { error: "Contest is not available." },
                    { status: 403 }
                );
            }
            try {
                await assertContestClassroomAccess(contestData, String(userId), classId);
            } catch (e) {
                return NextResponse.json(
                    { error: (e as Error).message || "Not authorised for this contest." },
                    { status: 403 }
                );
            }
        }

        // ── Class-enrollment gate ──────────────────────────────────────────
        //
        // Runs for BOTH contest and non-contest attempts. The contest gate
        // above validates the contest doc's own classroom scoping, but a
        // public contest can wrap a class-private series — in that case
        // the series gate is the one that must reject non-enrolled
        // students. Public-catalogue series (visibility = published/public)
        // still bypass.
        if (series.teacherId) {
            const isPublicCatalog =
                series.visibility === "published" || series.visibility === "public";
            if (!isPublicCatalog) {
                const allowed = await isEnrolledForSeriesAccess({
                    userId: String(userId),
                    teacherId: String(series.teacherId),
                    seriesClassIds: Array.isArray(series.classIds) ? series.classIds : [],
                    requestedClassId: classId,
                });
                if (!allowed) {
                    return NextResponse.json(
                        { error: "Join this teacher's class to take this test." },
                        { status: 403 }
                    );
                }
            }
        }

        // Institute-authored series: teacherId is empty but instituteId is
        // set. Same gating model as teacher series — enrolled students of
        // any assigned class can attempt it. Without this branch, institute
        // tests were openly accessible (no enrollment check at all).
        // Runs for both contest and non-contest attempts for the same
        // reason as the teacher branch.
        if (!series.teacherId && series.instituteId) {
            const seriesClassIds: string[] = Array.isArray(series.classIds) ? series.classIds : [];
            const candidates = classId && (seriesClassIds.length === 0 || seriesClassIds.includes(classId))
                ? [classId, ...seriesClassIds.filter((c) => c !== classId)]
                : seriesClassIds;
            let allowed = false;
            for (const cid of candidates) {
                const [memberSnap, classSnap] = await Promise.all([
                    adminDb.collection("classes").doc(cid).collection("students").doc(String(userId)).get(),
                    adminDb.collection("classes").doc(cid).get(),
                ]);
                if (
                    memberSnap.exists &&
                    memberSnap.data()?.status === "active" &&
                    classSnap.exists &&
                    classSnap.data()?.instituteId === series.instituteId
                ) {
                    allowed = true;
                    break;
                }
            }
            if (!allowed) {
                return NextResponse.json(
                    { error: "You're not enrolled in any class with this test." },
                    { status: 403 }
                );
            }
        }

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
                // Classroom context — preserved on the attempt doc so
                // teacher dashboards can filter by class. Empty string
                // means the student arrived outside a classroom (public
                // test or course-linked test); null normalised elsewhere.
                ...(classId ? { classId } : {}),
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
