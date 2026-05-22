import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

const COMPLETED = new Set(["completed", "timed_out"]);

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

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function pctFromData(data: FirebaseFirestore.DocumentData): number {
    if (typeof data.percentage === "number") return clampPercent(data.percentage);
    if (
        typeof data.totalScore === "number" &&
        typeof data.maxPossibleScore === "number" &&
        data.maxPossibleScore > 0
    ) {
        return clampPercent((data.totalScore / data.maxPossibleScore) * 100);
    }
    return 0;
}

export async function GET(
    req: Request,
    { params }: { params: { studentId: string } }
) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");
        if (!teacherId) {
            return NextResponse.json({ error: "teacherId required" }, { status: 400 });
        }

        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in as the teacher." }, { status: 401 });
        }
        if (tokenUserId !== teacherId) {
            return NextResponse.json({ error: "You can only view your own classroom." }, { status: 403 });
        }

        const studentId = params.studentId;
        if (!studentId) {
            return NextResponse.json({ error: "studentId required" }, { status: 400 });
        }

        const enrollmentSnap = await adminDb
            .collection("teacher_enrollments")
            .doc(teacherId)
            .collection("students")
            .doc(studentId)
            .get();
        if (!enrollmentSnap.exists) {
            return NextResponse.json({ error: "Student not in classroom" }, { status: 404 });
        }
        const enrollment = enrollmentSnap.data() || {};

        const [userSnap, quizzesSnap, testsSnap, contestsSnap] = await Promise.all([
            adminDb.collection("users").doc(studentId).get(),
            adminDb.collection("quizzes").where("teacherId", "==", teacherId).get(),
            adminDb.collection("tests").where("teacherId", "==", teacherId).get(),
            adminDb.collection("contests").where("teacherId", "==", teacherId).get(),
        ]);
        const userData = userSnap.data() || {};

        const teacherQuizIds = new Set<string>();
        const quizTitleById = new Map<string, string>();
        quizzesSnap.docs.forEach((d) => {
            const data = d.data() || {};
            teacherQuizIds.add(d.id);
            quizTitleById.set(d.id, data.title || d.id);
        });

        const teacherSeriesIds = new Set<string>();
        const seriesTitleById = new Map<string, string>();
        const testTitleByCompound = new Map<string, string>();
        await Promise.all(
            testsSnap.docs.map(async (seriesDoc) => {
                const sdata = seriesDoc.data() || {};
                teacherSeriesIds.add(seriesDoc.id);
                seriesTitleById.set(seriesDoc.id, sdata.title || seriesDoc.id);
                const childSnap = await seriesDoc.ref.collection("tests").get();
                childSnap.docs.forEach((child) => {
                    const c = child.data() || {};
                    testTitleByCompound.set(`${seriesDoc.id}:${child.id}`, c.title || child.id);
                });
            })
        );

        const teacherContestIds = new Set<string>();
        const contestTitleById = new Map<string, string>();
        contestsSnap.docs.forEach((d) => {
            const data = d.data() || {};
            teacherContestIds.add(d.id);
            contestTitleById.set(d.id, data.title || d.id);
        });

        const [quizAttemptsSnap, testAttemptsSnap] = await Promise.all([
            adminDb.collection("quizAttempts").where("userId", "==", studentId).get(),
            adminDb.collection("testAttempts").where("userId", "==", studentId).get(),
        ]);

        type AttemptRow = {
            id: string;
            kind: "quiz" | "test";
            contentId: string;
            contentTitle: string;
            seriesId?: string;
            testId?: string;
            quizId?: string;
            contestId?: string | null;
            contestTitle?: string | null;
            status: string;
            startedAt: string | null;
            completedAt: string | null;
            updatedAt: string | null;
            totalScore: number;
            maxPossibleScore: number;
            percentage: number;
            correctAnswers: number;
            wrongAnswers: number;
            unattempted: number;
            durationSeconds: number;
            passed: boolean | null;
            attemptNumber?: number;
        };

        const rows: AttemptRow[] = [];

        quizAttemptsSnap.docs.forEach((d) => {
            const data = d.data() || {};
            if (!teacherQuizIds.has(data.quizId)) return;
            const startedMs = toMillis(data.startedAt) || toMillis(data.createdAt);
            const completedMs = toMillis(data.completedAt) || toMillis(data.updatedAt);
            rows.push({
                id: d.id,
                kind: "quiz",
                contentId: data.quizId,
                contentTitle: quizTitleById.get(data.quizId) || data.title || "Quiz",
                quizId: data.quizId,
                contestId: data.contestId || null,
                contestTitle: data.contestTitle || null,
                status: data.status || "in_progress",
                startedAt: toIsoDate(data.startedAt) || toIsoDate(data.createdAt),
                completedAt: toIsoDate(data.completedAt),
                updatedAt: toIsoDate(data.updatedAt),
                totalScore: typeof data.totalScore === "number" ? data.totalScore : 0,
                maxPossibleScore: typeof data.maxPossibleScore === "number" ? data.maxPossibleScore : 0,
                percentage: pctFromData(data),
                correctAnswers: typeof data.correctAnswers === "number" ? data.correctAnswers : 0,
                wrongAnswers: typeof data.wrongAnswers === "number" ? data.wrongAnswers : 0,
                unattempted: typeof data.skipped === "number" ? data.skipped : 0,
                durationSeconds:
                    completedMs && startedMs ? Math.max(0, Math.round((completedMs - startedMs) / 1000)) : 0,
                passed: typeof data.passed === "boolean" ? data.passed : null,
                attemptNumber: data.attemptNumber || undefined,
            });
        });

        testAttemptsSnap.docs.forEach((d) => {
            const data = d.data() || {};
            if (!teacherSeriesIds.has(data.seriesId)) return;
            const startedMs = toMillis(data.startedAt) || toMillis(data.createdAt);
            const completedMs = toMillis(data.completedAt) || toMillis(data.updatedAt);
            const childKey = `${data.seriesId}:${data.testId}`;
            const seriesName = seriesTitleById.get(data.seriesId) || data.seriesId;
            const testName = testTitleByCompound.get(childKey);
            rows.push({
                id: d.id,
                kind: "test",
                contentId: childKey,
                contentTitle: testName ? `${seriesName}: ${testName}` : seriesName,
                seriesId: data.seriesId,
                testId: data.testId,
                contestId: data.contestId || null,
                contestTitle: data.contestTitle || null,
                status: data.status || "in_progress",
                startedAt: toIsoDate(data.startedAt) || toIsoDate(data.createdAt),
                completedAt: toIsoDate(data.completedAt),
                updatedAt: toIsoDate(data.updatedAt),
                totalScore: typeof data.totalScore === "number" ? data.totalScore : 0,
                maxPossibleScore: typeof data.maxPossibleScore === "number" ? data.maxPossibleScore : 0,
                percentage: pctFromData(data),
                correctAnswers: typeof data.correctAnswers === "number" ? data.correctAnswers : 0,
                wrongAnswers: typeof data.wrongAnswers === "number" ? data.wrongAnswers : 0,
                unattempted: typeof data.unattempted === "number" ? data.unattempted : 0,
                durationSeconds:
                    completedMs && startedMs ? Math.max(0, Math.round((completedMs - startedMs) / 1000)) : 0,
                passed: typeof data.passed === "boolean" ? data.passed : null,
                attemptNumber: data.attemptNumber || undefined,
            });
        });

        rows.sort((a, b) => {
            const aTime = toMillis(a.completedAt) || toMillis(a.updatedAt) || toMillis(a.startedAt);
            const bTime = toMillis(b.completedAt) || toMillis(b.updatedAt) || toMillis(b.startedAt);
            return bTime - aTime;
        });

        const completedRows = rows.filter((r) => COMPLETED.has(r.status));
        const totalDurationSeconds = completedRows.reduce((sum, r) => sum + r.durationSeconds, 0);
        const avgPercentage = completedRows.length
            ? clampPercent(completedRows.reduce((s, r) => s + r.percentage, 0) / completedRows.length)
            : null;
        const bestPercentage = completedRows.length
            ? Math.max(...completedRows.map((r) => r.percentage))
            : null;

        const totalAssignedContent = teacherQuizIds.size + teacherSeriesIds.size;
        const completedContentIds = new Set<string>();
        completedRows.forEach((r) => completedContentIds.add(r.kind + ":" + (r.kind === "quiz" ? r.quizId : r.seriesId)));

        // Daily activity for the last 30 days for a small chart
        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;
        const dailyBuckets: { date: string; count: number; avgPercentage: number | null }[] = [];
        for (let i = 29; i >= 0; i--) {
            const dayStart = new Date(now - i * DAY);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = dayStart.getTime() + DAY;
            const dayRows = completedRows.filter((r) => {
                const t = toMillis(r.completedAt) || toMillis(r.updatedAt);
                return t >= dayStart.getTime() && t < dayEnd;
            });
            const count = dayRows.length;
            const avg = count
                ? clampPercent(dayRows.reduce((s, r) => s + r.percentage, 0) / count)
                : null;
            dailyBuckets.push({
                date: dayStart.toISOString().slice(0, 10),
                count,
                avgPercentage: avg,
            });
        }

        return NextResponse.json({
            student: {
                id: studentId,
                studentEmail: enrollment.studentEmail || userData.email || "",
                studentName: enrollment.studentName || userData.displayName || userData.name || "Student",
                rollNumber: enrollment.rollNumber || null,
                status: enrollment.status || "active",
                enrolledAt: toIsoDate(enrollment.enrolledAt),
                lastActiveAt: toIsoDate(enrollment.lastActiveAt),
            },
            stats: {
                totalAttempts: rows.length,
                completedAttempts: completedRows.length,
                inProgressAttempts: rows.filter((r) => r.status === "in_progress").length,
                averagePercentage: avgPercentage,
                bestPercentage,
                totalAssignedContent,
                completedContentCount: completedContentIds.size,
                totalTimeSeconds: totalDurationSeconds,
            },
            attempts: rows,
            daily: dailyBuckets,
        });
    } catch (error: any) {
        console.error("Teacher student detail error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load student detail" },
            { status: 500 }
        );
    }
}
