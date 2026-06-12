import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { resolveClassMember } from "@/lib/server/classCommunity";

export const dynamic = "force-dynamic";

type Params = { params: { classId: string; studentId: string } };

/**
 * Teacher moderation for one student in a class. Sets the per-class
 * mute flags on the roster doc:
 *   { threads?: boolean, dm?: boolean, reason?: string }
 * Only the class teacher or an institute admin of the class may call it.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }
        if (member.role === "student") {
            return NextResponse.json(
                { error: "Only your teacher can moderate this class." },
                { status: 403 }
            );
        }
        if (params.studentId === member.userId) {
            return NextResponse.json({ error: "You can't moderate yourself." }, { status: 400 });
        }

        const rosterRef = adminDb
            .collection("classes")
            .doc(params.classId)
            .collection("students")
            .doc(params.studentId);
        const snap = await rosterRef.get();
        if (!snap.exists || snap.data()?.status !== "active") {
            return NextResponse.json({ error: "Student is not in this class." }, { status: 404 });
        }

        const body = await req.json().catch(() => ({}));
        const current = snap.data()?.communityBlock || {};
        const threads = typeof body.threads === "boolean" ? body.threads : Boolean(current.threads);
        const dm = typeof body.dm === "boolean" ? body.dm : Boolean(current.dm);
        const reason =
            typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : current.reason || null;

        await rosterRef.set(
            {
                communityBlock:
                    threads || dm
                        ? { threads, dm, reason, blockedBy: member.userId, blockedAt: Timestamp.now() }
                        : // Fully cleared — drop the field rather than leave a stale record.
                          FieldValue.delete(),
            },
            { merge: true }
        );

        return NextResponse.json({ block: { threads, dm } });
    } catch (error: any) {
        console.error("Moderate member failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
