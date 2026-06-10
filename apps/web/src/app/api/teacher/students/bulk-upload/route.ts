import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { checkPlanLimits } from "@/lib/middleware/checkPlanLimits";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const tokenUserId = auth.userId;

        const body = await req.json();
        const { teacherId, students } = body;

        if (!teacherId || !students || !Array.isArray(students)) {
            return NextResponse.json({ error: "teacherId and students array are required" }, { status: 400 });
        }

        if (tokenUserId !== teacherId) {
            return NextResponse.json(
                { error: "You can only enroll students into your own classroom." },
                { status: 403 }
            );
        }

        // Check enrollment cap for batch
        const limitCheck = await checkPlanLimits(teacherId, "enroll_student");
        if (!limitCheck.allowed) {
            return NextResponse.json({ error: limitCheck.message }, { status: 403 });
        }

        const results = { successful: 0, failed: 0, errors: [] as string[] };
        const batch = adminDb.batch();
        const teacherEnrollmentsRef = adminDb.collection("teacher_enrollments").doc(teacherId).collection("students");

        for (const student of students) {
            const { email, name, rollNumber } = student;
            if (!email || !name) {
                results.failed++;
                results.errors.push(`Missing email or name for row: ${JSON.stringify(student)}`);
                continue;
            }

            // Use email-based ID for non-auth students (simplified)
            const studentId = email.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
            const enrollmentRef = teacherEnrollmentsRef.doc(studentId);

            batch.set(enrollmentRef, {
                studentId,
                studentEmail: email,
                studentName: name,
                rollNumber: rollNumber || null,
                enrolledAt: Timestamp.now(),
                status: "active",
                totalAttempts: 0,
                lastActiveAt: null,
            });

            results.successful++;
        }

        await batch.commit();

        // Increment teacher usage counter (fallback if Firebase Functions trigger is not deployed)
        if (results.successful > 0) {
            await adminDb.collection("teachers").doc(teacherId).update({
                "usage.currentStudents": FieldValue.increment(results.successful),
                updatedAt: Timestamp.now(),
            });
        }

        return NextResponse.json({
            success: true,
            ...results,
        });
    } catch (error: any) {
        console.error("Bulk upload error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to bulk upload students" },
            { status: 500 }
        );
    }
}
