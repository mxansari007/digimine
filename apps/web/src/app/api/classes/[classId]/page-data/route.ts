import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
    assertClassEnrollment,
    getClassById,
    serializeClass,
} from "@/lib/server/classes";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const classDoc = await getClassById(params.classId);
        if (!classDoc) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        const { searchParams } = new URL(req.url);
        // `?studentId=` is still accepted but MUST match the bearer token
        // when present. Pre-fix, an unauthenticated caller could probe any
        // student's enrollment status by passing their uid as the query.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        const queryStudentId = searchParams.get("studentId");
        if (queryStudentId && tokenUserId && queryStudentId !== tokenUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const studentId = queryStudentId && queryStudentId === tokenUserId ? queryStudentId : null;

        // Public-ish read of the class shell — teacher info, name, invite code.
        // We don't return content lists here unless the caller is enrolled.
        const teacherSnap = await adminDb.collection("teachers").doc(classDoc.teacherId).get();
        const teacherData = teacherSnap.exists ? teacherSnap.data() : null;
        const teacher = {
            id: classDoc.teacherId,
            profile: teacherData?.profile || {},
            subjects: teacherData?.profile?.subjects || [],
        };

        // Enrollment check. Both an explicit studentId (used by the
        // student-facing page) and the bearer token (when called with auth)
        // can confirm enrollment; bearer takes precedence.
        let enrolled = false;
        let userId: string | null = null;
        const accessResult = await assertClassEnrollment(req, params.classId).catch(() => null);
        if (accessResult && accessResult.allowed) {
            enrolled = true;
            userId = accessResult.userId;
        } else if (studentId) {
            const memberSnap = await adminDb
                .collection("classes")
                .doc(params.classId)
                .collection("students")
                .doc(studentId)
                .get();
            enrolled = memberSnap.exists && memberSnap.data()?.status === "active";
            userId = studentId;
        }

        // Count content currently assigned to this class.
        const counts = { quizzes: 0, tests: 0, contests: 0, courses: 0 };
        if (enrolled) {
            const collections: Array<["quizzes" | "tests" | "contests" | "courses", keyof typeof counts]> = [
                ["quizzes", "quizzes"],
                ["tests", "tests"],
                ["contests", "contests"],
                ["courses", "courses"],
            ];
            await Promise.all(
                collections.map(async ([col, key]) => {
                    // No teacherId filter — institute-authored content
                    // has `teacherId: ""` and would otherwise be dropped
                    // from the count. classIds membership is the only
                    // constraint needed; class-enrollment auth is upstream.
                    const snap = await adminDb
                        .collection(col)
                        .where("classIds", "array-contains", params.classId)
                        .get();
                    counts[key] = snap.docs.filter((d) => {
                        const data = d.data() || {};
                        return data.status === "published" && !data.isDeleted;
                    }).length;
                })
            );
        }

        return NextResponse.json({
            class: serializeClass({ id: classDoc.id, ...classDoc }),
            teacher,
            enrolled,
            userId,
            counts,
        });
    } catch (error: any) {
        console.error("Class page-data error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load class" },
            { status: 500 }
        );
    }
}
