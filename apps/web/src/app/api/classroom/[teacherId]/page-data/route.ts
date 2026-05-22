import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { teacherId: string } }
) {
    try {
        const { searchParams } = new URL(req.url);
        const studentId = searchParams.get("studentId");
        const teacherId = params.teacherId;

        if (!teacherId) {
            return NextResponse.json({ error: "teacherId required" }, { status: 400 });
        }

        const teacherSnap = await adminDb.collection("teachers").doc(teacherId).get();
        if (!teacherSnap.exists) {
            return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
        }

        const teacherData = teacherSnap.data();
        const teacher = {
            id: teacherSnap.id,
            profile: teacherData?.profile || {},
            inviteCode: teacherData?.inviteCode || "",
            subjects: teacherData?.profile?.subjects || [],
        };

        let enrolled = false;
        if (studentId) {
            const enrollmentSnap = await adminDb
                .collection("teacher_enrollments")
                .doc(teacherId)
                .collection("students")
                .doc(studentId)
                .get();
            enrolled = enrollmentSnap.exists && enrollmentSnap.data()?.status === "active";
        }

        // Simple queries — only filter by teacherId to avoid needing composite indexes.
        // Status/isDeleted filtering done in JS.
        const [quizzesSnap, testsSnap, contestsSnap, coursesSnap] = await Promise.all([
            adminDb.collection("quizzes").where("teacherId", "==", teacherId).get(),
            adminDb.collection("tests").where("teacherId", "==", teacherId).get(),
            adminDb.collection("contests").where("teacherId", "==", teacherId).get(),
            adminDb.collection("courses").where("teacherId", "==", teacherId).get(),
        ]);

        const countPublished = (docs: any[]) =>
            docs.filter((d: any) => d.data().status === "published" && !d.data().isDeleted).length;

        return NextResponse.json({
            teacher,
            enrolled,
            counts: {
                quizzes: countPublished(quizzesSnap.docs),
                tests: countPublished(testsSnap.docs),
                contests: countPublished(contestsSnap.docs),
                courses: countPublished(coursesSnap.docs),
            },
        });
    } catch (error: any) {
        console.error("Classroom page-data error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load classroom" },
            { status: 500 }
        );
    }
}
