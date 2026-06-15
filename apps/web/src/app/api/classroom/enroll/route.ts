import { NextResponse } from "next/server";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { checkPlanLimits } from "@/lib/middleware/checkPlanLimits";
import { getClassById, getClassByInviteCode } from "@/lib/server/classes";
import { enrollStudentInGroup, getGroupByInviteCode } from "@/lib/server/sections";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        // Bearer token + verified email required. Pre-fix, an unauthenticated
        // caller could POST `{ inviteCode, studentId: "<any-uid>" }` and enroll
        // any student in any open class — spam-amplifiable, pollutes rosters.
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const tokenUserId = auth.userId;

        const body = await req.json();
        const { inviteCode, classId: classIdInput, studentId: bodyStudentId, studentEmail, studentName, rollNumber } =
            body;
        let { teacherId } = body;
        // The token's uid is authoritative — body studentId is ignored if
        // it doesn't match (defends against client tampering).
        if (bodyStudentId && bodyStudentId !== tokenUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const studentId = tokenUserId;

        // Resolve target class via id or invite code.
        let classDoc: any = null;
        if (classIdInput) {
            classDoc = await getClassById(classIdInput);
        } else if (inviteCode) {
            classDoc = await getClassByInviteCode(String(inviteCode).trim());
        }

        // Legacy invite codes (per-teacher) — pre-class-refactor, teachers
        // had a single inviteCode on their own doc and any student with it
        // could join. Tightened guard:
        //   - Only resolve if the teacher has EXACTLY ONE non-archived
        //     class. With multiple classes the legacy code is ambiguous
        //     (which class to join?) and indistinguishable from a stale
        //     bookmark for a since-rotated class code, so we reject it
        //     and tell the student to ask for a fresh class-level code.
        //   - Skip archived classes outright.
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
                    .get();
                const liveClasses = ownedClasses.docs
                    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
                    .filter((c: any) => !c.isArchived);
                if (liveClasses.length === 1) {
                    classDoc = liveClasses[0];
                } else if (liveClasses.length > 1) {
                    return NextResponse.json(
                        {
                            error:
                                "This invite link is outdated. Ask your teacher for the new class invite code.",
                            code: "legacy_invite_ambiguous",
                        },
                        { status: 410 }
                    );
                }
                // length === 0: no live classes; fall through to the
                // generic "Invalid invite code" 404 below.
            }
        }

        // Group invite codes (GRP-…): join the GROUP, which auto-enrolls the
        // student into every non-archived class that targets that group
        // (combined classes included). One code → potentially several classes.
        if (!classDoc && inviteCode) {
            const group = await getGroupByInviteCode(String(inviteCode).trim());
            if (group) {
                const result = await enrollStudentInGroup(group, {
                    studentId,
                    studentEmail,
                    studentName,
                    rollNumber,
                });
                return NextResponse.json({
                    success: true,
                    joined: "group",
                    groupId: group.id,
                    sectionId: group.sectionId,
                    classIds: result.joinedClassIds,
                    message: result.alreadyMember ? "Already in this group" : "Joined",
                });
            }
        }

        if (!classDoc) {
            return NextResponse.json({ error: "Invalid invite code or class." }, { status: 404 });
        }
        if (classDoc.isArchived) {
            return NextResponse.json({ error: "This class is archived." }, { status: 410 });
        }
        // Institute classes (the "section") have no single owning teacher —
        // teachers are assigned per subject — so `teacherId` is "" for them.
        // Everything below must tolerate an empty teacherId.
        teacherId = classDoc.teacherId || "";
        const classId = classDoc.id;
        const instituteId = classDoc.instituteId || null;

        if (!studentId) {
            return NextResponse.json({ error: "studentId is required" }, { status: 400 });
        }

        // Enforce the teacher's student cap — independent-teacher classes only.
        // Institute classes aren't metered per teacher (capacity belongs to the
        // institute), and checkPlanLimits keys on a teacher doc that doesn't
        // exist when teacherId is "".
        if (teacherId) {
            const limitCheck = await checkPlanLimits(teacherId, "enroll_student");
            if (!limitCheck.allowed) {
                return NextResponse.json({ error: limitCheck.message }, { status: 403 });
            }
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

        // User-side denormalised membership. enrolledTeacherIds is only stamped
        // for independent-teacher classes (Firestore rules read it to gate that
        // teacher's private content). Institute classes have no owning teacher,
        // so membership is tracked by classId / instituteId and we never write
        // an empty teacherId into the array.
        const membership: Record<string, any> = {
            classId,
            teacherId: teacherId || null,
            status: "active",
            joinedAt: now,
        };
        if (instituteId) membership.instituteId = instituteId;
        const userUpdate: Record<string, any> = {
            classMemberships: FieldValue.arrayUnion(membership),
            updatedAt: now,
        };
        if (teacherId) userUpdate.enrolledTeacherIds = FieldValue.arrayUnion(teacherId);

        // Batch the enrollment doc + user-side denormalised arrays in a
        // single commit. Firestore rules read `users/{uid}.enrolledTeacherIds`
        // when gating teacher-private content reads, so if the enrollment
        // doc landed but the array hadn't been updated yet (separate
        // writes), the student would briefly see a "no access" page right
        // after joining. Single batch closes that window.
        const batch = adminDb.batch();
        const classRef = adminDb.collection("classes").doc(classId);

        if (existingSnap.exists) {
            const data = existingSnap.data() || {};
            const wasActive = data.status === "active";
            if (!wasActive) {
                batch.update(enrollmentRef, { status: "active", updatedAt: now });
                batch.set(
                    classRef,
                    { activeStudentsCount: FieldValue.increment(1), updatedAt: now },
                    { merge: true }
                );
            }
            batch.set(userRef, userUpdate, { merge: true });
            await batch.commit();
            return NextResponse.json({
                success: true,
                classId,
                teacherId,
                message: wasActive ? "Already enrolled" : "Re-enrolled",
            });
        }

        batch.set(enrollmentRef, {
            classId,
            teacherId: teacherId || null,
            studentId,
            studentEmail: studentEmail || "",
            studentName: studentName || studentEmail || "Student",
            rollNumber: rollNumber || null,
            enrolledAt: now,
            status: "active",
            totalAttempts: 0,
            lastActiveAt: null,
        });

        batch.set(
            classRef,
            {
                studentsCount: FieldValue.increment(1),
                activeStudentsCount: FieldValue.increment(1),
                updatedAt: now,
            },
            { merge: true }
        );

        batch.set(userRef, userUpdate, { merge: true });

        await batch.commit();

        // Teacher usage counter is best-effort and outside the batch on
        // purpose — it doesn't gate read access, so we don't want to fail
        // the enrollment if the teacher doc is missing. Skipped for institute
        // classes (no owning teacher → `.doc("")` would throw).
        if (teacherId) {
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
        }

        return NextResponse.json({ success: true, classId, teacherId });
    } catch (error: any) {
        console.error("Enrollment error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to enroll" },
            { status: 500 }
        );
    }
}
