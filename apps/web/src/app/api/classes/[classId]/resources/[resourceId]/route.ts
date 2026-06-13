import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { adminApp, adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { resolveClassMember } from "@/lib/server/classCommunity";
import { CLASS_RESOURCES } from "@/lib/server/classResources";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "digimine-1c33f.firebasestorage.app";

function isModerator(role: string): boolean {
    return role === "teacher" || role === "institute_admin";
}

/** Remove a resource. Author can delete their own; teachers/admins delete any. */
export async function DELETE(
    req: Request,
    { params }: { params: { classId: string; resourceId: string } }
) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }

        const ref = adminDb.collection(CLASS_RESOURCES).doc(params.resourceId);
        const snap = await ref.get();
        const data = snap.data();
        if (!snap.exists || !data || data.classId !== params.classId || data.isDeleted) {
            return NextResponse.json({ error: "Resource not found." }, { status: 404 });
        }
        if (data.uploaderId !== member.userId && !isModerator(member.role)) {
            return NextResponse.json(
                { error: "You can only remove resources you shared." },
                { status: 403 }
            );
        }

        await ref.delete();

        // Best-effort: drop the underlying Storage object so we don't leave
        // orphaned files. Never let a storage hiccup fail the request.
        if (typeof data.storagePath === "string" && data.storagePath) {
            try {
                await getStorage(adminApp).bucket(STORAGE_BUCKET).file(data.storagePath).delete();
            } catch (err) {
                console.warn("Resource file cleanup skipped:", err);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Delete resource failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Pin / unpin a resource to the top of the library. Teachers/admins only. */
export async function PATCH(
    req: Request,
    { params }: { params: { classId: string; resourceId: string } }
) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }
        if (!isModerator(member.role)) {
            return NextResponse.json(
                { error: "Only your teacher can pin resources." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const action = body.action === "unpin" ? "unpin" : body.action === "pin" ? "pin" : null;
        if (!action) {
            return NextResponse.json({ error: "Unknown action." }, { status: 400 });
        }

        const ref = adminDb.collection(CLASS_RESOURCES).doc(params.resourceId);
        const snap = await ref.get();
        const data = snap.data();
        if (!snap.exists || !data || data.classId !== params.classId || data.isDeleted) {
            return NextResponse.json({ error: "Resource not found." }, { status: 404 });
        }

        const isPinned = action === "pin";
        await ref.update({ isPinned, updatedAt: Timestamp.now() });
        return NextResponse.json({ ok: true, isPinned });
    } catch (error: any) {
        console.error("Pin resource failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
