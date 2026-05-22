import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassOwner } from "@/lib/server/classes";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

function serializeStudent(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        studentId: data.studentId || doc.id,
        studentEmail: data.studentEmail || "",
        studentName: data.studentName || data.studentEmail || "Student",
        rollNumber: data.rollNumber || null,
        enrolledAt: toIsoDate(data.enrolledAt),
        status: data.status || "active",
        totalAttempts: data.totalAttempts || 0,
        lastActiveAt: toIsoDate(data.lastActiveAt),
    };
}

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }

        const snap = await adminDb
            .collection("classes")
            .doc(params.classId)
            .collection("students")
            .get();

        const students = snap.docs.map(serializeStudent);
        students.sort((a, b) => {
            const aTime = a.enrolledAt ? Date.parse(a.enrolledAt) : 0;
            const bTime = b.enrolledAt ? Date.parse(b.enrolledAt) : 0;
            return bTime - aTime;
        });

        return NextResponse.json({ students });
    } catch (error: any) {
        console.error("List class students failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to list students" },
            { status: 500 }
        );
    }
}

export async function POST(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }
        const body = await req.json().catch(() => ({}));
        const studentEmail = typeof body.studentEmail === "string" ? body.studentEmail.trim() : "";
        const studentName = typeof body.studentName === "string" ? body.studentName.trim() : "";
        const rollNumber = typeof body.rollNumber === "string" ? body.rollNumber.trim() : "";

        if (!studentEmail) {
            return NextResponse.json({ error: "Student email is required." }, { status: 400 });
        }

        // Find an existing user by email so we can wire the enrollment to a
        // real uid. If they haven't signed up yet we still create a pending
        // row keyed by a synthetic id; the join API will reconcile when the
        // student finally enrolls via the invite code.
        const userSnap = await adminDb
            .collection("users")
            .where("email", "==", studentEmail)
            .limit(1)
            .get();
        const studentId = userSnap.empty ? `pending:${studentEmail.toLowerCase()}` : userSnap.docs[0].id;

        const classRef = adminDb.collection("classes").doc(params.classId);
        const enrollmentRef = classRef.collection("students").doc(studentId);
        const existing = await enrollmentRef.get();
        if (existing.exists && existing.data()?.status === "active") {
            return NextResponse.json({ error: "Student is already in this class." }, { status: 409 });
        }

        const now = Timestamp.now();
        const data = {
            classId: params.classId,
            teacherId: ownership.teacherId,
            studentId,
            studentEmail,
            studentName: studentName || studentEmail,
            rollNumber: rollNumber || null,
            status: "active",
            enrolledAt: now,
            totalAttempts: 0,
            lastActiveAt: null,
        };
        await enrollmentRef.set(data, { merge: true });

        // Bump aggregate counts on the class doc.
        await classRef.set(
            {
                studentsCount: FieldValue.increment(existing.exists ? 0 : 1),
                activeStudentsCount: FieldValue.increment(1),
                updatedAt: now,
            },
            { merge: true }
        );

        // Denormalize on the user doc when the student has actually signed up.
        if (!studentId.startsWith("pending:")) {
            await adminDb
                .collection("users")
                .doc(studentId)
                .set(
                    {
                        enrolledTeacherIds: FieldValue.arrayUnion(ownership.teacherId),
                        classMemberships: FieldValue.arrayUnion({
                            classId: params.classId,
                            teacherId: ownership.teacherId,
                            status: "active",
                            joinedAt: now,
                        }),
                        updatedAt: now,
                    },
                    { merge: true }
                );
        }

        return NextResponse.json({ student: serializeStudent(await enrollmentRef.get()) });
    } catch (error: any) {
        console.error("Add class student failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to add student" },
            { status: 500 }
        );
    }
}
