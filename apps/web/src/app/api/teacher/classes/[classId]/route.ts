import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { allocateUniqueInviteCode, assertClassOwner, serializeClass } from "@/lib/server/classes";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }
        return NextResponse.json({
            class: serializeClass({ id: params.classId, ...ownership.classDoc }),
        });
    } catch (error: any) {
        console.error("Get class failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load class" },
            { status: 500 }
        );
    }
}

export async function PATCH(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }
        const body = await req.json().catch(() => ({}));
        const update: Record<string, any> = { updatedAt: Timestamp.now() };
        if (typeof body.name === "string") {
            const name = body.name.trim();
            if (!name) return NextResponse.json({ error: "Class name is required." }, { status: 400 });
            if (name.length > 80)
                return NextResponse.json({ error: "Class name is too long." }, { status: 400 });
            update.name = name;
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

        await adminDb.collection("classes").doc(params.classId).update(update);
        const fresh = await adminDb.collection("classes").doc(params.classId).get();
        return NextResponse.json({
            class: serializeClass({ id: fresh.id, ...fresh.data() }),
        });
    } catch (error: any) {
        console.error("Update class failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to update class" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request, { params }: { params: { classId: string } }) {
    try {
        const ownership = await assertClassOwner(req, params.classId);
        if (!ownership.ok) {
            return NextResponse.json({ error: ownership.error }, { status: ownership.status });
        }
        // Soft-archive instead of hard delete so attempts and references stay
        // resolvable. The teacher can permanently delete via admin tooling if
        // needed.
        await adminDb
            .collection("classes")
            .doc(params.classId)
            .update({ isArchived: true, updatedAt: Timestamp.now() });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Archive class failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to archive class" },
            { status: 500 }
        );
    }
}
