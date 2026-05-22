import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getClassByInviteCode, serializeClass } from "@/lib/server/classes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const inv = (searchParams.get("inviteCode") || "").trim();

        if (!inv || inv.length < 3) {
            return NextResponse.json({ class: null, teacher: null });
        }

        // New shape: class invite codes live on `classes/{id}.inviteCode`.
        const classDoc = await getClassByInviteCode(inv);
        if (classDoc) {
            const teacherSnap = await adminDb.collection("teachers").doc(classDoc.teacherId).get();
            const teacherData = teacherSnap.exists ? teacherSnap.data() : null;
            return NextResponse.json({
                class: serializeClass({ id: classDoc.id, ...classDoc }),
                teacher: {
                    id: classDoc.teacherId,
                    profile: teacherData?.profile || {},
                },
            });
        }

        // Legacy fallback: teacher-level invite code on `teachers/{id}`.
        const teacherSnap = await adminDb
            .collection("teachers")
            .where("inviteCode", "==", inv)
            .limit(1)
            .get();
        if (!teacherSnap.empty) {
            const doc = teacherSnap.docs[0];
            const data = doc.data();
            return NextResponse.json({
                class: null,
                teacher: {
                    id: doc.id,
                    profile: data?.profile || {},
                    inviteCode: data?.inviteCode || "",
                },
            });
        }

        return NextResponse.json({ class: null, teacher: null });
    } catch (e: any) {
        console.error("Invite lookup error:", e);
        return NextResponse.json(
            { class: null, teacher: null, error: e.message },
            { status: 500 }
        );
    }
}
