import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin, bumpInstituteCounts } from "@/lib/server/institutes";
import { allocateUniqueInviteCode, serializeClass } from "@/lib/server/classes";

export const dynamic = "force-dynamic";

async function loadOwnedClass(instituteId: string, classId: string) {
    const snap = await adminDb.collection("classes").doc(classId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.instituteId !== instituteId) return null;
    return { ref: snap.ref, data };
}

export async function GET(req: Request, { params }: { params: { instituteId: string; classId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const found = await loadOwnedClass(params.instituteId, params.classId);
        if (!found) return NextResponse.json({ error: "Class not found" }, { status: 404 });
        return NextResponse.json({ class: serializeClass({ id: params.classId, ...found.data }) });
    } catch (error: any) {
        console.error("Get institute class failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: { instituteId: string; classId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const found = await loadOwnedClass(params.instituteId, params.classId);
        if (!found) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const update: Record<string, any> = { updatedAt: Timestamp.now() };

        if (typeof body.name === "string") {
            const v = body.name.trim();
            if (!v) return NextResponse.json({ error: "Name required" }, { status: 400 });
            update.name = v;
        }
        if (body.description === null || typeof body.description === "string") {
            update.description = body.description ? String(body.description).trim() : null;
        }
        if (typeof body.isArchived === "boolean") {
            update.isArchived = body.isArchived;
        }
        if (body.regenerateInviteCode) {
            update.inviteCode = await allocateUniqueInviteCode();
        }
        // Teacher (re)assignment — must be an active roster member.
        if (body.teacherId !== undefined) {
            const next = typeof body.teacherId === "string" ? body.teacherId : "";
            if (next) {
                const rosterSnap = await adminDb
                    .collection("institutes")
                    .doc(params.instituteId)
                    .collection("teachers")
                    .doc(next)
                    .get();
                const data = rosterSnap.exists ? rosterSnap.data() || {} : null;
                if (!data || data.status !== "active") {
                    return NextResponse.json(
                        { error: "Teacher is not an active member of this institute" },
                        { status: 400 }
                    );
                }
            }
            update.teacherId = next;
        }

        await found.ref.update(update);
        const fresh = await found.ref.get();
        return NextResponse.json({ class: serializeClass({ id: fresh.id, ...fresh.data() }) });
    } catch (error: any) {
        console.error("Update institute class failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { instituteId: string; classId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const found = await loadOwnedClass(params.instituteId, params.classId);
        if (!found) return NextResponse.json({ ok: true });

        // Soft-archive (consistent with existing /teacher/classes endpoint)
        await found.ref.update({ isArchived: true, updatedAt: Timestamp.now() });
        await bumpInstituteCounts(params.instituteId, { classCount: -1 });

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Archive institute class failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
