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
    { params }: { params: { contentId: string } }
) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");
        const kind = searchParams.get("kind"); // "quiz" | "test"
        const testId = searchParams.get("testId"); // optional child for test series

        if (!teacherId) {
            return NextResponse.json({ error: "teacherId required" }, { status: 400 });
        }
        if (kind !== "quiz" && kind !== "test") {
            return NextResponse.json({ error: "kind must be quiz or test" }, { status: 400 });
        }

        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in as the teacher." }, { status: 401 });
        }
        if (tokenUserId !== teacherId) {
            return NextResponse.json({ error: "You can only view your own classroom." }, { status: 403 });
        }

        // Verify ownership
        const contentRef =
            kind === "quiz"
                ? adminDb.collection("quizzes").doc(params.contentId)
                : adminDb.collection("tests").doc(params.contentId);
        const contentSnap = await contentRef.get();
        if (!contentSnap.exists) {
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }
        const contentData = contentSnap.data() || {};
        if (contentData.teacherId !== teacherId) {
            return NextResponse.json({ error: "Not your content" }, { status: 403 });
        }

        const enrollmentsSnap = await adminDb
            .collection("teacher_enrollments")
            .doc(teacherId)
            .collection("students")
            .get();
        const enrolledStudents = new Map<string, any>();
        enrollmentsSnap.docs.forEach((d) => {
            const data = d.data() || {};
            enrolledStudents.set(data.studentId || d.id, {
                id: d.id,
                studentId: data.studentId || d.id,
                studentName: data.studentName || data.studentEmail || "Student",
                studentEmail: data.studentEmail || "",
                rollNumber: data.rollNumber || null,
                status: data.status || "active",
            });
        });

        let attemptsSnap: FirebaseFirestore.QuerySnapshot;
        const childTests: { id: string; title: string }[] = [];
        if (kind === "quiz") {
            attemptsSnap = await adminDb
                .collection("quizAttempts")
                .where("quizId", "==", params.contentId)
                .get();
        } else {
            const childrenSnap = await contentRef.collection("tests").get();
            childrenSnap.docs.forEach((c) => {
                childTests.push({ id: c.id, title: (c.data() || {}).title || c.id });
            });
            if (testId) {
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
        }

        type AttemptRow = {
            id: string;
            kind: "quiz" | "test";
            userId: string;
            studentName: string;
            studentEmail: string;
            rollNumber: string | null;
            status: string;
            startedAt: string | null;
            completedAt: string | null;
            totalScore: number;
            maxPossibleScore: number;
            percentage: number;
            correctAnswers: number;
            wrongAnswers: number;
            unattempted: number;
            durationSeconds: number;
            passed: boolean | null;
            attemptNumber?: number;
            testId?: string;
            seriesId?: string;
            quizId?: string;
        };

        const rows: AttemptRow[] = [];
        attemptsSnap.docs.forEach((d) => {
            const data = d.data() || {};
            const userId = data.userId;
            const student = enrolledStudents.get(userId);
            if (!student) return; // only classroom students
            const startedMs = toMillis(data.startedAt) || toMillis(data.createdAt);
            const completedMs = toMillis(data.completedAt) || toMillis(data.updatedAt);
            rows.push({
                id: d.id,
                kind,
                userId,
                studentName: student.studentName,
                studentEmail: student.studentEmail,
                rollNumber: student.rollNumber,
                status: data.status || "in_progress",
                startedAt: toIsoDate(data.startedAt) || toIsoDate(data.createdAt),
                completedAt: toIsoDate(data.completedAt),
                totalScore: typeof data.totalScore === "number" ? data.totalScore : 0,
                maxPossibleScore: typeof data.maxPossibleScore === "number" ? data.maxPossibleScore : 0,
                percentage: pctFromData(data),
                correctAnswers: typeof data.correctAnswers === "number" ? data.correctAnswers : 0,
                wrongAnswers: typeof data.wrongAnswers === "number" ? data.wrongAnswers : 0,
                unattempted:
                    typeof data.unattempted === "number"
                        ? data.unattempted
                        : typeof data.skipped === "number"
                        ? data.skipped
                        : 0,
                durationSeconds:
                    completedMs && startedMs ? Math.max(0, Math.round((completedMs - startedMs) / 1000)) : 0,
                passed: typeof data.passed === "boolean" ? data.passed : null,
                attemptNumber: data.attemptNumber || undefined,
                testId: data.testId,
                seriesId: data.seriesId,
                quizId: data.quizId,
            });
        });

        rows.sort((a, b) => {
            const aTime = toMillis(a.completedAt) || toMillis(a.startedAt);
            const bTime = toMillis(b.completedAt) || toMillis(b.startedAt);
            return bTime - aTime;
        });

        // Leaderboard — best score per student
        const bestByStudent = new Map<string, AttemptRow>();
        rows.forEach((r) => {
            if (!COMPLETED.has(r.status)) return;
            const existing = bestByStudent.get(r.userId);
            if (!existing || r.totalScore > existing.totalScore) {
                bestByStudent.set(r.userId, r);
            }
        });
        const leaderboard = Array.from(bestByStudent.values())
            .sort((a, b) => {
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                if (b.percentage !== a.percentage) return b.percentage - a.percentage;
                return a.durationSeconds - b.durationSeconds;
            })
            .map((entry, i) => ({ ...entry, rank: i + 1 }));

        const completedRows = rows.filter((r) => COMPLETED.has(r.status));
        const avgPercentage = completedRows.length
            ? clampPercent(completedRows.reduce((s, r) => s + r.percentage, 0) / completedRows.length)
            : null;
        const topPercentage = completedRows.length
            ? Math.max(...completedRows.map((r) => r.percentage))
            : null;
        const passRate = completedRows.length
            ? clampPercent(
                  (completedRows.filter((r) => r.passed === true).length / completedRows.length) * 100
              )
            : null;
        const avgDuration = completedRows.length
            ? Math.round(
                  completedRows.reduce((s, r) => s + r.durationSeconds, 0) / completedRows.length
              )
            : 0;

        // Score histogram (10% buckets)
        const histogram = Array.from({ length: 10 }, () => 0);
        completedRows.forEach((r) => {
            const idx = Math.min(9, Math.floor(r.percentage / 10));
            histogram[idx] += 1;
        });

        const studentsWhoAttempted = new Set(rows.map((r) => r.userId)).size;
        const studentsNotAttempted = Array.from(enrolledStudents.values()).filter(
            (s) => s.status === "active" && !rows.some((r) => r.userId === s.studentId)
        );

        return NextResponse.json({
            content: {
                id: params.contentId,
                kind,
                title: contentData.title || params.contentId,
                status: contentData.status || "draft",
                isDeleted: contentData.isDeleted || false,
                ...(kind === "test" ? { childTests, currentTestId: testId || null } : {}),
            },
            stats: {
                totalAttempts: rows.length,
                completedAttempts: completedRows.length,
                inProgressAttempts: rows.filter((r) => r.status === "in_progress").length,
                studentsWhoAttempted,
                totalEnrolledStudents: Array.from(enrolledStudents.values()).filter(
                    (s) => s.status === "active"
                ).length,
                averagePercentage: avgPercentage,
                topPercentage,
                passRate,
                averageDurationSeconds: avgDuration,
            },
            attempts: rows,
            leaderboard,
            histogram,
            studentsNotAttempted: studentsNotAttempted.map((s) => ({
                id: s.id,
                studentId: s.studentId,
                studentName: s.studentName,
                studentEmail: s.studentEmail,
                rollNumber: s.rollNumber,
            })),
        });
    } catch (error: any) {
        console.error("Teacher content attempts error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load attempts" },
            { status: 500 }
        );
    }
}
