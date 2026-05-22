import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, hasActiveClassroomEnrollment } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const queryUserId = searchParams.get("userId");
        const teacherId = searchParams.get("teacherId");
        const classId = searchParams.get("classId");
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        const userId = tokenUserId || queryUserId;

        if (!userId || (!teacherId && !classId)) {
            return NextResponse.json({ hasAccess: false });
        }
        if (tokenUserId && queryUserId && tokenUserId !== queryUserId) {
            return NextResponse.json({ hasAccess: false }, { status: 403 });
        }

        // Class-level check (preferred when caller knows the classId).
        if (classId) {
            const memberSnap = await adminDb
                .collection("classes")
                .doc(classId)
                .collection("students")
                .doc(userId)
                .get();
            return NextResponse.json({
                hasAccess: memberSnap.exists && memberSnap.data()?.status === "active",
            });
        }

        // Teacher-level fallback (covers legacy callers and "any class").
        const hasAccess = await hasActiveClassroomEnrollment(teacherId!, userId);
        return NextResponse.json({ hasAccess });
    } catch (error: any) {
        console.error("Content access check error:", error);
        return NextResponse.json({ hasAccess: false });
    }
}
