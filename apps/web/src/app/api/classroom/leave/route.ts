import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { classId, teacherId, studentId } = body;

        if (!studentId) {
            return NextResponse.json({ error: "studentId is required" }, { status: 400 });
        }

        // Prefer the new class-scoped path. Fall back to legacy if no class
        // is supplied (or the class is a synthetic legacy id from the
        // my-enrollments endpoint).
        if (classId && !classId.startsWith("legacy:")) {
            const enrollmentRef = adminDb
                .collection("classes")
                .doc(classId)
                .collection("students")
                .doc(studentId);
            const snap = await enrollmentRef.get();
            if (!snap.exists) {
                return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
            }
            const data = snap.data() || {};
            if (data.status !== "active") {
                return NextResponse.json({ success: true, message: "Already not enrolled" });
            }
            const ownerTeacherId = data.teacherId;
            const now = Timestamp.now();
            await enrollmentRef.update({ status: "removed", updatedAt: now });
            await adminDb.collection("classes").doc(classId).set(
                {
                    activeStudentsCount: FieldValue.increment(-1),
                    updatedAt: now,
                },
                { merge: true }
            );

            if (ownerTeacherId) {
                // Drop the teacher only when the student has no other active
                // enrollments in any of that teacher's classes.
                const others = await adminDb
                    .collectionGroup("students")
                    .where("studentId", "==", studentId)
                    .where("teacherId", "==", ownerTeacherId)
                    .where("status", "==", "active")
                    .get();
                const remaining = others.docs.filter((d) => d.ref.path !== enrollmentRef.path);
                if (remaining.length === 0) {
                    await adminDb
                        .collection("users")
                        .doc(studentId)
                        .set(
                            {
                                enrolledTeacherIds: FieldValue.arrayRemove(ownerTeacherId),
                                updatedAt: now,
                            },
                            { merge: true }
                        )
                        .catch(() => {
                            /* user doc may not exist */
                        });
                    await adminDb
                        .collection("teachers")
                        .doc(ownerTeacherId)
                        .update({
                            "usage.currentStudents": FieldValue.increment(-1),
                            updatedAt: now,
                        })
                        .catch(() => {
                            /* counters non-critical */
                        });
                }
            }

            return NextResponse.json({ success: true, classId });
        }

        // Legacy fallback: leave from `teacher_enrollments` keyed by teacherId.
        const legacyTeacherId = teacherId || (classId ? classId.replace(/^legacy:/, "") : "");
        if (!legacyTeacherId) {
            return NextResponse.json(
                { error: "classId or teacherId is required" },
                { status: 400 }
            );
        }
        const legacyRef = adminDb
            .collection("teacher_enrollments")
            .doc(legacyTeacherId)
            .collection("students")
            .doc(studentId);
        const legacySnap = await legacyRef.get();
        if (!legacySnap.exists) {
            return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
        }
        const data = legacySnap.data() || {};
        if (data.status !== "active") {
            return NextResponse.json({ success: true, message: "Already not enrolled" });
        }
        const now = Timestamp.now();
        await legacyRef.update({ status: "removed", updatedAt: now });
        await adminDb
            .collection("teachers")
            .doc(legacyTeacherId)
            .update({
                "usage.currentStudents": FieldValue.increment(-1),
                updatedAt: now,
            })
            .catch(() => {});
        await adminDb
            .collection("users")
            .doc(studentId)
            .set(
                {
                    enrolledTeacherIds: FieldValue.arrayRemove(legacyTeacherId),
                    updatedAt: now,
                },
                { merge: true }
            )
            .catch(() => {});
        return NextResponse.json({ success: true, teacherId: legacyTeacherId });
    } catch (error: any) {
        console.error("Leave classroom error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to leave classroom" },
            { status: 500 }
        );
    }
}
