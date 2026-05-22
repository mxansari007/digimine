import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

// Firestore "in" queries are limited to 30 values; chunk for safety.
const IN_CHUNK = 30;

async function countAttemptsByContentIds(
    collection: "quizAttempts" | "testAttempts",
    field: "quizId" | "seriesId",
    ids: string[]
): Promise<number> {
    if (ids.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const chunk = ids.slice(i, i + IN_CHUNK);
        const snap = await adminDb
            .collection(collection)
            .where(field, "in", chunk)
            .count()
            .get();
        total += snap.data().count;
    }
    return total;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const teacherId = searchParams.get("teacherId");

        if (!teacherId) {
            return NextResponse.json({ error: "teacherId is required" }, { status: 400 });
        }

        // Authenticated callers only — and they may only view their own dashboard.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in to view dashboard stats." }, { status: 401 });
        }
        if (tokenUserId !== teacherId) {
            return NextResponse.json(
                { error: "You can only view your own dashboard." },
                { status: 403 }
            );
        }

        const teacherRef = adminDb.collection("teachers").doc(teacherId);
        const teacherSnap = await teacherRef.get();

        if (!teacherSnap.exists) {
            return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
        }

        const teacher = teacherSnap.data()!;

        // Get recent enrollment count
        const enrollmentsRef = adminDb.collection("teacher_enrollments").doc(teacherId).collection("students");
        const enrollmentsSnap = await enrollmentsRef.count().get();

        // Fetch teacher-owned content (need IDs for attempts join + counts)
        const [quizzesQ, testsQ, coursesQ, contestsQ] = await Promise.all([
            adminDb.collection("quizzes").where("teacherId", "==", teacherId).select().get(),
            adminDb.collection("tests").where("teacherId", "==", teacherId).select().get(),
            adminDb.collection("courses").where("teacherId", "==", teacherId).count().get(),
            adminDb.collection("contests").where("teacherId", "==", teacherId).count().get(),
        ]);

        const quizIds = quizzesQ.docs.map((d) => d.id);
        const testIds = testsQ.docs.map((d) => d.id);

        // Count attempts via content-id join (attempts don't carry teacherId)
        const [quizAttemptsCount, testAttemptsCount] = await Promise.all([
            countAttemptsByContentIds("quizAttempts", "quizId", quizIds),
            countAttemptsByContentIds("testAttempts", "seriesId", testIds),
        ]);

        return NextResponse.json({
            stats: {
                totalStudents: enrollmentsSnap.data().count,
                totalQuizzes: quizIds.length,
                totalTests: testIds.length,
                totalCourses: coursesQ.data().count,
                totalContests: contestsQ.data().count,
                totalSubmissions: quizAttemptsCount + testAttemptsCount,
                totalEarnings: teacher.usage?.totalEarnings || 0,
                pendingPayout: teacher.usage?.pendingPayout || 0,
            },
            usage: teacher.usage || {},
            subscription: teacher.subscription || {},
        });
    } catch (error: any) {
        console.error("Dashboard stats error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch dashboard stats" },
            { status: 500 }
        );
    }
}
