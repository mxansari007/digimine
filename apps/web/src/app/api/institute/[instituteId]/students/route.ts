/**
 * GET /api/institute/[instituteId]/students
 *
 * Returns the institute's student_invites roster — both attached
 * students (status="active") and pending invites (status="invited").
 *
 * Access: caller must be admin of the institute.
 */
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

function serializeRow(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        studentId: data.studentId || doc.id,
        email: data.email || "",
        name: data.name || null,
        status: data.status || "invited",
        invitedAt: toIsoDate(data.invitedAt),
        invitedBy: data.invitedBy || "",
        joinedAt: toIsoDate(data.joinedAt),
    };
}

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const snap = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("student_invites")
            .get();
        const students = snap.docs.map(serializeRow);
        students.sort((a, b) => {
            const aT = a.invitedAt ? Date.parse(a.invitedAt) : 0;
            const bT = b.invitedAt ? Date.parse(b.invitedAt) : 0;
            return bT - aT;
        });
        return NextResponse.json({ students });
    } catch (error) {
        const e = error as Error;
        console.error("[students GET] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to list students" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const { searchParams } = new URL(req.url);
        const docId = searchParams.get("id");
        if (!docId) {
            return NextResponse.json({ error: "id required" }, { status: 400 });
        }

        const docRef = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("student_invites")
            .doc(docId);
        const snap = await docRef.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const data = snap.data() || {};
        await docRef.delete();

        // If we removed an attached student, also clear the
        // users/{uid}.instituteId denorm — but ONLY if it pointed at us.
        if (data.status === "active" && data.studentId && !data.studentId.startsWith("pending:")) {
            const userRef = adminDb.collection("users").doc(data.studentId);
            const userSnap = await userRef.get();
            if (userSnap.exists && userSnap.data()?.instituteId === params.instituteId) {
                await userRef.set({ instituteId: null }, { merge: true });
            }
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        const e = error as Error;
        console.error("[students DELETE] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to remove student" },
            { status: 500 }
        );
    }
}
