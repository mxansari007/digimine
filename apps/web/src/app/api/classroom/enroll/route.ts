import { NextResponse } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { checkPlanLimits } from "@/lib/middleware/checkPlanLimits";
import { getClassById, getClassByInviteCode } from "@/lib/server/classes";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { inviteCode, classId: classIdInput, studentId, studentEmail, studentName, rollNumber } =
            body;
        let { teacherId } = body;

        // Resolve target class via id or invite code.
        let classDoc: any = null;
        if (classIdInput) {
            classDoc = await getClassById(classIdInput);
        } else if (inviteCode) {
            classDoc = await getClassByInviteCode(String(inviteCode).trim());
        }

        // Legacy invite codes (per-teacher) still resolve to the teacher's
        // single default class — fall through and find any class owned by
        // them. After migration this branch is rare.
        if (!classDoc && inviteCode && !teacherId) {
            const teachersSnap = await adminDb
                .collection("teachers")
                .where("inviteCode", "==", String(inviteCode).trim())
                .limit(1)
                .get();
            if (!teachersSnap.empty) {
                teacherId = teachersSnap.docs[0].id;
                const ownedClasses = await adminDb
                    .collection("classes")
                    .where("teacherId", "==", teacherId)
                    .limit(1)
                    .get();
                if (!ownedClasses.empty) {
                    classDoc = { id: ownedClasses.docs[0].id, ...ownedClasses.docs[0].data() };
                }
            }
        }

        if (!classDoc) {
            return NextResponse.json({ error: "Invalid invite code or class." }, { status: 404 });
        }
        if (classDoc.isArchived) {
            return NextResponse.json({ error: "This class is archived." }, { status: 410 });
        }
        teacherId = classDoc.teacherId;
        const classId = classDoc.id;

        if (!studentId) {
            return NextResponse.json({ error: "studentId is required" }, { status: 400 });
        }

        // Enforce the teacher's student cap.
        const limitCheck = await checkPlanLimits(teacherId, "enroll_student");
        if (!limitCheck.allowed) {
            return NextResponse.json({ error: limitCheck.message }, { status: 403 });
        }

        // New shape: classes/{classId}/students/{studentId}
        const enrollmentRef = adminDb
            .collection("classes")
            .doc(classId)
            .collection("students")
            .doc(studentId);
        const existingSnap = await enrollmentRef.get();
        const now = Timestamp.now();

        const userRef = adminDb.collection("users").doc(studentId);

        if (existingSnap.exists) {
            const data = existingSnap.data() || {};
            const wasActive = data.status === "active";
            if (!wasActive) {
                await enrollmentRef.update({
                    status: "active",
                    updatedAt: now,
                });
                await adminDb.collection("classes").doc(classId).set(
                    {
                        activeStudentsCount: FieldValue.increment(1),
                        updatedAt: now,
                    },
                    { merge: true }
                );
            }
            await userRef
                .set(
                    {
                        enrolledTeacherIds: FieldValue.arrayUnion(teacherId),
                        classMemberships: FieldValue.arrayUnion({
                            classId,
                            teacherId,
                            status: "active",
                            joinedAt: now,
                        }),
                        updatedAt: now,
                    },
                    { merge: true }
                )
                .catch(() => {
                    /* user doc may not exist yet */
                });
            return NextResponse.json({
                success: true,
                classId,
                teacherId,
                message: wasActive ? "Already enrolled" : "Re-enrolled",
            });
        }

        await enrollmentRef.set({
            classId,
            teacherId,
            studentId,
            studentEmail: studentEmail || "",
            studentName: studentName || studentEmail || "Student",
            rollNumber: rollNumber || null,
            enrolledAt: now,
            status: "active",
            totalAttempts: 0,
            lastActiveAt: null,
        });

        await adminDb.collection("classes").doc(classId).set(
            {
                studentsCount: FieldValue.increment(1),
                activeStudentsCount: FieldValue.increment(1),
                updatedAt: now,
            },
            { merge: true }
        );

        // Bump teacher usage (best-effort).
        await adminDb
            .collection("teachers")
            .doc(teacherId)
            .update({
                "usage.currentStudents": FieldValue.increment(1),
                updatedAt: now,
            })
            .catch(() => {
                /* counters are not load-bearing */
            });

        await userRef
            .set(
                {
                    enrolledTeacherIds: FieldValue.arrayUnion(teacherId),
                    classMemberships: FieldValue.arrayUnion({
                        classId,
                        teacherId,
                        status: "active",
                        joinedAt: now,
                    }),
                    updatedAt: now,
                },
                { merge: true }
            )
            .catch(() => {
                /* user doc may not exist yet */
            });

        return NextResponse.json({ success: true, classId, teacherId });
    } catch (error: any) {
        console.error("Enrollment error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to enroll" },
            { status: 500 }
        );
    }
}
