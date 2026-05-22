import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassOwner } from "@/lib/server/classes";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["active", "banned", "removed"]);

export async function PATCH(
    req: Request,
    { params }: { params: { classId: string; studentId: string } }
) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }
        const body = await req.json().catch(() => ({}));
        const nextStatus = typeof body.status === "string" ? body.status : "";
        if (!VALID_STATUSES.has(nextStatus)) {
            return NextResponse.json({ error: "Invalid status." }, { status: 400 });
        }

        const ref = adminDb
            .collection("classes")
            .doc(params.classId)
            .collection("students")
            .doc(params.studentId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Student not in this class." }, { status: 404 });
        }
        const prevStatus = (snap.data() || {}).status;
        const now = Timestamp.now();
        await ref.update({ status: nextStatus, updatedAt: now });

        // Maintain active count + the denormalized user-level fields.
        const activeDelta =
            (prevStatus === "active" ? -1 : 0) + (nextStatus === "active" ? 1 : 0);
        if (activeDelta !== 0) {
            await adminDb
                .collection("classes")
                .doc(params.classId)
                .set(
                    {
                        activeStudentsCount: FieldValue.increment(activeDelta),
                        updatedAt: now,
                    },
                    { merge: true }
                );
        }

        if (!params.studentId.startsWith("pending:")) {
            const userRef = adminDb.collection("users").doc(params.studentId);
            if (nextStatus === "active") {
                await userRef.set(
                    {
                        enrolledTeacherIds: FieldValue.arrayUnion(ownership.teacherId),
                        updatedAt: now,
                    },
                    { merge: true }
                );
            } else if (prevStatus === "active") {
                // The student may still be active in another of this teacher's
                // classes; only drop the teacherId when no active enrollment
                // remains. We re-check here to keep `enrolledTeacherIds` honest.
                const others = await adminDb
                    .collectionGroup("students")
                    .where("studentId", "==", params.studentId)
                    .where("teacherId", "==", ownership.teacherId)
                    .where("status", "==", "active")
                    .get();
                // Subtract the row we just changed (it shows up in collectionGroup
                // with the *new* status, but Firestore may still index the old one
                // briefly — be conservative and only remove when zero others remain).
                const otherActive = others.docs.filter((d) => d.ref.path !== ref.path);
                if (otherActive.length === 0) {
                    await userRef.set(
                        {
                            enrolledTeacherIds: FieldValue.arrayRemove(ownership.teacherId),
                            updatedAt: now,
                        },
                        { merge: true }
                    );
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Update class student failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to update student" },
            { status: 500 }
        );
    }
}
