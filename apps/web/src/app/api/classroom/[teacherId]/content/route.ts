import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassroomEnrollment, isPublishedContent } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { teacherId: string } }) {
    try {
        const { teacherId } = params;
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "quizzes";

        const access = await assertClassroomEnrollment(req, teacherId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        // Map type to collection name
        const collectionMap: Record<string, string> = {
            quizzes: "quizzes",
            tests: "tests",
            contests: "contests",
            courses: "courses",
        };

        const collectionName = collectionMap[type];
        if (!collectionName) {
            return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
        }

        const snapshot = await adminDb
            .collection(collectionName)
            .where("teacherId", "==", teacherId)
            .get();

        const content = snapshot.docs
            .map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }))
            .filter((item) => isPublishedContent(item));

        return NextResponse.json({ content });
    } catch (error: any) {
        console.error("Classroom content error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch classroom content" },
            { status: 500 }
        );
    }
}
