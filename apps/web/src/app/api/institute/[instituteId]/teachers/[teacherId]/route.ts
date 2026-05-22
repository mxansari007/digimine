import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin, bumpInstituteCounts } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { instituteId: string; teacherId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const status = typeof body.status === "string" ? body.status : "";
        if (!["invited", "active", "removed"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const ref = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("teachers")
            .doc(params.teacherId);
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ error: "Not in roster" }, { status: 404 });
        const data = snap.data() || {};
        const prev = data.status || "invited";
        if (prev === status) return NextResponse.json({ ok: true });

        const now = Timestamp.now();
        const update: Record<string, any> = { status, updatedAt: now };
        if (status === "removed") update.removedAt = now;
        if (status === "active" && prev !== "active") update.joinedAt = now;

        await ref.update(update);

        // Maintain counters + teacher doc pointer.
        const teacherUserId = data.teacherId || params.teacherId;
        if (!teacherUserId.startsWith("invite:")) {
            if (status === "removed") {
                await adminDb
                    .collection("teachers")
                    .doc(teacherUserId)
                    .set({ instituteId: null, updatedAt: now }, { merge: true })
                    .catch(() => {});
                if (prev === "active") await bumpInstituteCounts(params.instituteId, { activeTeacherCount: -1 });
            } else if (status === "active") {
                await adminDb
                    .collection("teachers")
                    .doc(teacherUserId)
                    .set({ instituteId: params.instituteId, updatedAt: now }, { merge: true })
                    .catch(() => {});
                if (prev !== "active") await bumpInstituteCounts(params.instituteId, { activeTeacherCount: 1 });
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Update institute teacher failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { instituteId: string; teacherId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const ref = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("teachers")
            .doc(params.teacherId);
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ ok: true });
        const data = snap.data() || {};
        const wasActive = data.status === "active";

        await ref.delete();

        const teacherUserId = data.teacherId || params.teacherId;
        if (!teacherUserId.startsWith("invite:")) {
            await adminDb
                .collection("teachers")
                .doc(teacherUserId)
                .set({ instituteId: null, updatedAt: Timestamp.now() }, { merge: true })
                .catch(() => {});
        }
        await bumpInstituteCounts(params.instituteId, {
            teacherCount: -1,
            activeTeacherCount: wasActive ? -1 : 0,
        });

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Delete institute teacher failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
