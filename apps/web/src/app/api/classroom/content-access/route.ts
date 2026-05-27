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
        // Bearer token required — pre-fix, an absent token would fall back
        // to the `?userId=` query, letting any caller probe arbitrary users'
        // enrollment status.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ hasAccess: false }, { status: 401 });
        }
        if (queryUserId && queryUserId !== tokenUserId) {
            return NextResponse.json({ hasAccess: false }, { status: 403 });
        }
        if (!teacherId && !classId) {
            return NextResponse.json({ hasAccess: false });
        }
        const userId = tokenUserId;

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
