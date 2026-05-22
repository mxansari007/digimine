import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassroomEnrollment, isPublishedContent, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { teacherId: string } }
) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "quizzes";
        const teacherId = params.teacherId;

        if (!teacherId) {
            return NextResponse.json({ error: "teacherId required" }, { status: 400 });
        }

        const access = await assertClassroomEnrollment(req, teacherId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const validTypes = ["quizzes", "tests", "contests", "courses"];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ error: "invalid type" }, { status: 400 });
        }

        // Only filter by teacherId to avoid needing composite indexes.
        // Status and isDeleted are filtered in JS below.
        const snapshot = await adminDb
            .collection(type)
            .where("teacherId", "==", teacherId)
            .get();

        const items = snapshot.docs
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
                    visibility: data.visibility || "private",
                    startTime: toIsoDate(data.startTime),
                    endTime: toIsoDate(data.endTime),
                    createdAt: toIsoDate(data.createdAt),
                };
            })
            .filter((item) => isPublishedContent(item) && item.teacherId === teacherId)
            .sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });

        return NextResponse.json({ items });
    } catch (error: any) {
        console.error("Content list error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load content" },
            { status: 500 }
        );
    }
}
