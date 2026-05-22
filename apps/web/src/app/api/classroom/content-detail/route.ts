import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertTeacherContentAccess, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "quiz"; // quiz | test | contest | course
        const contentId = searchParams.get("contentId");
        const teacherId = searchParams.get("teacherId");
        const classId = searchParams.get("classId");

        if (!contentId) {
            return NextResponse.json({ error: "contentId required" }, { status: 400 });
        }

        const collectionName = type === "test" ? "tests" : `${type}s`;

        const snap = await adminDb.collection(collectionName).doc(contentId).get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const data = snap.data();
        const access = await assertTeacherContentAccess(req, data, teacherId, { classId });
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const content: Record<string, any> = {
            id: snap.id,
            slug: data?.slug || snap.id,
            accessType: data?.accessType || "free",
            ...data,
            createdAt: toIsoDate(data?.createdAt),
            updatedAt: toIsoDate(data?.updatedAt),
            startTime: toIsoDate(data?.startTime),
            endTime: toIsoDate(data?.endTime),
        };

        return NextResponse.json({ content });
    } catch (error: any) {
        console.error("Content detail error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load content" },
            { status: 500 }
        );
    }
}
