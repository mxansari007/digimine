import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassEnrollment, getClassById } from "@/lib/server/classes";
import { isPublishedContent, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "quizzes";
        if (!params.classId) {
            return NextResponse.json({ error: "classId required" }, { status: 400 });
        }
        const validTypes = ["quizzes", "tests", "contests", "courses"];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ error: "invalid type" }, { status: 400 });
        }

        const classDoc = await getClassById(params.classId);
        if (!classDoc) {
            return NextResponse.json({ error: "Class not found" }, { status: 404 });
        }

        const access = await assertClassEnrollment(req, params.classId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        // Pull content that has this class in its `classIds` array.
        // We DON'T filter by `teacherId` here because institute-authored
        // content is stamped with `teacherId: ""` + `instituteId: <id>`,
        // and that filter would silently drop those rows for enrolled
        // students. The class-enrollment gate above already authorises;
        // class membership is the only signal we need to constrain by.
        const snap = await adminDb
            .collection(type)
            .where("classIds", "array-contains", params.classId)
            .get();

        const items = snap.docs
            .map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    slug: data.slug || doc.id,
                    title: data.title || data.name || "Untitled",
                    description: data.description || data.shortDescription || "",
                    status: data.status || "draft",
                    isDeleted: data.isDeleted || false,
                    totalQuestions: data.totalQuestions ?? 0,
                    totalTests: data.totalTests ?? 0,
                    totalMarks: data.totalMarks ?? 0,
                    duration: data.duration ?? 0,
                    estimatedHours: data.estimatedHours ?? 0,
                    teacherId: data.teacherId || "",
                    classIds: Array.isArray(data.classIds) ? data.classIds : [],
                    visibility: data.visibility || "private",
                    startTime: toIsoDate(data.startTime),
                    endTime: toIsoDate(data.endTime),
                    createdAt: toIsoDate(data.createdAt),
                };
            })
            .filter((item) => isPublishedContent(item))
            .sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });

        return NextResponse.json({ items });
    } catch (error: any) {
        console.error("Class content list error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load content" },
            { status: 500 }
        );
    }
}
