import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export async function POST(req: Request) {
    try {
        // Bearer required — pre-fix, anyone could call this with another
        // student's uid to forcibly remove them from a class.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const body = await req.json();
        const { classId, teacherId, studentId: bodyStudentId } = body;
        if (bodyStudentId && bodyStudentId !== tokenUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const studentId = tokenUserId;

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

            // "Does the student still have other active enrollments with
            // this teacher?" — runs OUTSIDE the batch because
            // collectionGroup queries aren't allowed inside transactions.
            // The TOCTOU window between this read and the batch commit
            // below is narrow; if a concurrent enroll lands inside that
            // window, the next enroll's arrayUnion of enrolledTeacherIds
            // re-asserts the membership. We treat the array as a
            // best-effort denorm rather than a source of truth.
            let shouldDropTeacher = false;
            if (ownerTeacherId) {
                const others = await adminDb
                    .collectionGroup("students")
                    .where("studentId", "==", studentId)
                    .where("teacherId", "==", ownerTeacherId)
                    .where("status", "==", "active")
                    .get();
                const remaining = others.docs.filter((d) => d.ref.path !== enrollmentRef.path);
                shouldDropTeacher = remaining.length === 0;
            }

            // Single batch: enrollment status + class counter + (optional)
            // user-side denorm removal all land together so Firestore rules
            // never observe a partial state.
            const batch = adminDb.batch();
            batch.update(enrollmentRef, { status: "removed", updatedAt: now });
            batch.set(
                adminDb.collection("classes").doc(classId),
                {
                    activeStudentsCount: FieldValue.increment(-1),
                    updatedAt: now,
                },
                { merge: true }
            );
            if (ownerTeacherId && shouldDropTeacher) {
                batch.set(
                    adminDb.collection("users").doc(studentId),
                    {
                        enrolledTeacherIds: FieldValue.arrayRemove(ownerTeacherId),
                        updatedAt: now,
                    },
                    { merge: true }
                );
            }
            await batch.commit();

            // Teacher usage counter is best-effort and intentionally
            // outside the batch — it doesn't gate any reads.
            if (ownerTeacherId && shouldDropTeacher) {
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
        const legacyBatch = adminDb.batch();
        legacyBatch.update(legacyRef, { status: "removed", updatedAt: now });
        legacyBatch.set(
            adminDb.collection("users").doc(studentId),
            {
                enrolledTeacherIds: FieldValue.arrayRemove(legacyTeacherId),
                updatedAt: now,
            },
            { merge: true }
        );
        await legacyBatch.commit();

        // Counter best-effort, outside the batch.
        await adminDb
            .collection("teachers")
            .doc(legacyTeacherId)
            .update({
                "usage.currentStudents": FieldValue.increment(-1),
                updatedAt: now,
            })
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
