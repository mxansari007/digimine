/**
 * Institute-side per-class roster.
 *
 *   GET  → list students currently enrolled in the class
 *   POST → add a student to this class from the institute's
 *          student_invites (the institute-attached student pool).
 *
 * Why the duplication with /api/teacher/classes/[id]/students:
 *   The write shape MUST match the teacher-side write so a student
 *   enrolled by an institute admin is indistinguishable from one
 *   enrolled by their teacher (same fields on the enrollment doc,
 *   same denorm on the user doc). Pulling this out into a helper is
 *   worth doing once a third caller exists; with two callers a tight
 *   duplicate is clearer than the indirection.
 *
 * Access: caller must be admin of the institute, AND the class must
 * belong to that institute.
 */
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

async function loadOwnedClass(instituteId: string, classId: string) {
    const snap = await adminDb.collection("classes").doc(classId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.instituteId !== instituteId) return null;
    return { ref: snap.ref, data };
}

function serializeStudent(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        studentId: data.studentId || doc.id,
        studentEmail: data.studentEmail || "",
        studentName: data.studentName || data.studentEmail || "Student",
        rollNumber: data.rollNumber || null,
        status: data.status || "active",
        enrolledAt: toIsoDate(data.enrolledAt),
        totalAttempts: data.totalAttempts || 0,
        lastActiveAt: toIsoDate(data.lastActiveAt),
        isPending: String(data.studentId || doc.id).startsWith("pending:"),
    };
}

export async function GET(
    req: Request,
    { params }: { params: { instituteId: string; classId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const owned = await loadOwnedClass(params.instituteId, params.classId);
        if (!owned) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        const snap = await adminDb
            .collection("classes")
            .doc(params.classId)
            .collection("students")
            .get();
        const students = snap.docs.map(serializeStudent);
        students.sort((a, b) => {
            const aT = a.enrolledAt ? Date.parse(a.enrolledAt) : 0;
            const bT = b.enrolledAt ? Date.parse(b.enrolledAt) : 0;
            return bT - aT;
        });
        return NextResponse.json({ students });
    } catch (error) {
        const e = error as Error;
        console.error("[institute class students GET] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to list students" },
            { status: 500 }
        );
    }
}

/**
 * POST body:
 *   { studentInviteId: string }
 *
 * The studentInviteId is the doc id from
 * institutes/{instituteId}/student_invites — that's where the
 * institute admin's student pool lives. We resolve that to the
 * studentId + email, then write the class enrollment using the same
 * shape the teacher-side POST writes.
 */
export async function POST(
    req: Request,
    { params }: { params: { instituteId: string; classId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const owned = await loadOwnedClass(params.instituteId, params.classId);
        if (!owned) return NextResponse.json({ error: "Class not found" }, { status: 404 });
        if (owned.data.isArchived) {
            return NextResponse.json({ error: "Class is archived" }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const inviteId = typeof body.studentInviteId === "string" ? body.studentInviteId.trim() : "";
        if (!inviteId) {
            return NextResponse.json(
                { error: "studentInviteId is required." },
                { status: 400 }
            );
        }

        const inviteRef = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("student_invites")
            .doc(inviteId);
        const inviteSnap = await inviteRef.get();
        if (!inviteSnap.exists) {
            return NextResponse.json(
                { error: "Student not in this institute's roster." },
                { status: 404 }
            );
        }
        const invite = inviteSnap.data() || {};
        if (invite.status !== "active") {
            return NextResponse.json(
                {
                    error:
                        "This student hasn't signed up yet. Once they sign up the institute auto-attaches them; then you can add them to a class.",
                },
                { status: 400 }
            );
        }

        const studentId: string = invite.studentId || "";
        const studentEmail: string = invite.email || "";
        const studentName: string = invite.name || studentEmail;
        if (!studentId || !studentEmail) {
            return NextResponse.json(
                { error: "Student record is missing a uid or email." },
                { status: 500 }
            );
        }

        // The teacherId we record on the enrollment must point at one
        // of the class's actual teachers (lead teacher field first;
        // otherwise the first subject's teacher). Without one, the
        // student dashboard's classroom card has no teacher to link to.
        let teacherId: string =
            typeof owned.data.teacherId === "string" ? owned.data.teacherId : "";
        if (!teacherId) {
            const subjectSnap = await adminDb
                .collection("classes")
                .doc(params.classId)
                .collection("subjects")
                .orderBy("order")
                .limit(1)
                .get();
            if (!subjectSnap.empty) {
                teacherId = subjectSnap.docs[0].data()?.teacherId || "";
            }
        }
        if (!teacherId) {
            return NextResponse.json(
                {
                    error:
                        "Assign a teacher to this class first (Classes → add a subject), then add students.",
                },
                { status: 400 }
            );
        }

        const enrollmentRef = owned.ref.collection("students").doc(studentId);
        const existing = await enrollmentRef.get();
        if (existing.exists && existing.data()?.status === "active") {
            return NextResponse.json(
                { error: "Student is already in this class." },
                { status: 409 }
            );
        }

        const now = Timestamp.now();
        const enrollmentData = {
            classId: params.classId,
            teacherId,
            studentId,
            studentEmail,
            studentName,
            rollNumber: null,
            status: "active",
            enrolledAt: now,
            totalAttempts: 0,
            lastActiveAt: null,
            // Provenance so the teacher-side roster knows this came from
            // the institute admin path rather than self-enrollment.
            addedBy: "institute_admin",
            addedByUserId: auth.userId,
        };
        // Single batch: enrollment doc + class counters + user-side
        // denormalised arrays. Firestore rules gate teacher-private content
        // reads on `users/{uid}.enrolledTeacherIds`; if these writes were
        // separate, a student would briefly fail content reads right after
        // an admin added them.
        const batch = adminDb.batch();
        batch.set(enrollmentRef, enrollmentData, { merge: true });
        batch.set(
            owned.ref,
            {
                studentsCount: FieldValue.increment(existing.exists ? 0 : 1),
                activeStudentsCount: FieldValue.increment(1),
                updatedAt: now,
            },
            { merge: true }
        );
        batch.set(
            adminDb.collection("users").doc(studentId),
            {
                enrolledTeacherIds: FieldValue.arrayUnion(teacherId),
                classMemberships: FieldValue.arrayUnion({
                    classId: params.classId,
                    teacherId,
                    status: "active",
                    joinedAt: now,
                }),
                updatedAt: now,
            },
            { merge: true }
        );
        await batch.commit();

        return NextResponse.json({ student: serializeStudent(await enrollmentRef.get()) });
    } catch (error) {
        const e = error as Error;
        console.error("[institute class students POST] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to add student to class" },
            { status: 500 }
        );
    }
}
