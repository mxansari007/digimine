import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

// Notes are stored privately under the teacher:
//   teachers/{teacherId}/student_notes/{studentId}
// A teacher's own scratchpad on each student. Never visible to the student.

type AuthResult =
    | { error: { status: number; message: string }; teacherId?: undefined }
    | { error?: undefined; teacherId: string };

async function authTeacher(req: Request, teacherId: string | null): Promise<AuthResult> {
    if (!teacherId) return { error: { status: 400, message: "teacherId required" } };
    const tokenUserId = await getBearerUserId(req).catch(() => null);
    if (!tokenUserId) return { error: { status: 401, message: "Sign in" } };
    if (tokenUserId !== teacherId) return { error: { status: 403, message: "Not yours" } };
    return { teacherId };
}

export async function GET(req: Request, { params }: { params: { studentId: string } }) {
    try {
        const { searchParams } = new URL(req.url);
        const auth = await authTeacher(req, searchParams.get("teacherId"));
        if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

        const ref = adminDb
            .collection("teachers")
            .doc(auth.teacherId)
            .collection("student_notes")
            .doc(params.studentId);
        const snap = await ref.get();
        const data = snap.exists ? snap.data() || {} : {};
        return NextResponse.json({
            note: {
                body: typeof data.body === "string" ? data.body : "",
                updatedAt: toIsoDate(data.updatedAt),
            },
        });
    } catch (error: any) {
        console.error("Get note failed:", error);
        return NextResponse.json({ error: error?.message || "Failed to load note" }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: { studentId: string } }) {
    try {
        const { searchParams } = new URL(req.url);
        const auth = await authTeacher(req, searchParams.get("teacherId"));
        if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

        const body = await req.json().catch(() => ({}));
        const noteBody = typeof body.body === "string" ? body.body.slice(0, 4000) : "";

        const ref = adminDb
            .collection("teachers")
            .doc(auth.teacherId)
            .collection("student_notes")
            .doc(params.studentId);
        const now = Timestamp.now();
        await ref.set(
            {
                body: noteBody,
                studentId: params.studentId,
                teacherId: auth.teacherId,
                updatedAt: now,
            },
            { merge: true }
        );
        return NextResponse.json({ ok: true, updatedAt: now.toDate().toISOString() });
    } catch (error: any) {
        console.error("Save note failed:", error);
        return NextResponse.json({ error: error?.message || "Failed to save note" }, { status: 500 });
    }
}
