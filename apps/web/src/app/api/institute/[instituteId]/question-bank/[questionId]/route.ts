import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

function serialize(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        ...data,
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
    };
}

export async function PATCH(
    req: Request,
    { params }: { params: { instituteId: string; questionId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const ref = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("questionBank")
            .doc(params.questionId);
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const update: Record<string, any> = { updatedAt: Timestamp.now() };

        const allowed = [
            "questionText",
            "options",
            "correctAnswer",
            "explanation",
            "marks",
            "negativeMarks",
            "difficulty",
            "subject",
            "topic",
            "tags",
        ];
        for (const key of allowed) {
            if (key in body) update[key] = body[key];
        }

        await ref.update(update);
        return NextResponse.json({ question: serialize(await ref.get()) });
    } catch (error: any) {
        console.error("Question bank update failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { instituteId: string; questionId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("questionBank")
            .doc(params.questionId)
            .delete();
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Question bank delete failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
