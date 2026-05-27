/**
 * DELETE /api/institute/[instituteId]/classes/[classId]/students/[studentId]
 *
 * Removes a student from ONE class — leaves their institute membership
 * intact and leaves any OTHER class enrollments they have untouched.
 *
 * Mirrors the soft-delete pattern used by the teacher-side route: the
 * enrollment doc flips to status="removed" rather than being deleted,
 * so a future "reinstate" doesn't lose enrollment history.
 *
 * Access: caller must be admin of the institute, AND the class must
 * belong to that institute.
 */
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

async function loadOwnedClass(instituteId: string, classId: string) {
    const snap = await adminDb.collection("classes").doc(classId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.instituteId !== instituteId) return null;
    return { ref: snap.ref, data };
}

export async function DELETE(
    req: Request,
    {
        params,
    }: {
        params: { instituteId: string; classId: string; studentId: string };
    }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const owned = await loadOwnedClass(params.instituteId, params.classId);
        if (!owned) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        const enrollmentRef = owned.ref
            .collection("students")
            .doc(params.studentId);
        const snap = await enrollmentRef.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Student not in this class" }, { status: 404 });
        }
        const existing = snap.data() || {};
        if (existing.status === "removed") {
            return NextResponse.json({ ok: true, alreadyRemoved: true });
        }

        const now = Timestamp.now();
        const wasActive = existing.status === "active";

        await enrollmentRef.set(
            { status: "removed", removedAt: now, removedBy: auth.userId, updatedAt: now },
            { merge: true }
        );

        await owned.ref.set(
            {
                activeStudentsCount: FieldValue.increment(wasActive ? -1 : 0),
                updatedAt: now,
            },
            { merge: true }
        );

        // Do NOT touch users/{uid}.instituteId — removing from one class
        // is intentionally different from removing from the institute.
        // We also leave classMemberships as-is rather than rewriting the
        // whole array; the next loadClassRoster reads the per-class doc,
        // so the soft-delete is enough to hide the student.

        return NextResponse.json({ ok: true });
    } catch (error) {
        const e = error as Error;
        console.error("[institute class student DELETE] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to remove student from class" },
            { status: 500 }
        );
    }
}
