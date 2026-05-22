import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    allocateUniqueInstituteInviteCode,
    assertInstituteAdmin,
    serializeInstitute,
} from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        return NextResponse.json({
            institute: serializeInstitute({ id: params.instituteId, ...auth.institute }),
        });
    } catch (error: any) {
        console.error("Get institute failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const update: Record<string, any> = { updatedAt: Timestamp.now() };

        if (typeof body.name === "string") {
            const v = body.name.trim();
            if (!v) return NextResponse.json({ error: "Name required" }, { status: 400 });
            update.name = v;
        }
        if (body.description === null || typeof body.description === "string")
            update.description = body.description ? String(body.description).trim() : null;
        if (body.contactEmail === null || typeof body.contactEmail === "string")
            update.contactEmail = body.contactEmail ? String(body.contactEmail).trim() : null;
        if (body.contactPhone === null || typeof body.contactPhone === "string")
            update.contactPhone = body.contactPhone ? String(body.contactPhone).trim() : null;
        if (body.website === null || typeof body.website === "string")
            update.website = body.website ? String(body.website).trim() : null;
        if (body.address === null || typeof body.address === "string")
            update.address = body.address ? String(body.address).trim() : null;
        if (body.branding && typeof body.branding === "object") {
            update["branding.logoUrl"] = body.branding.logoUrl ?? null;
            update["branding.primaryColor"] = body.branding.primaryColor ?? null;
            update["branding.tagline"] = body.branding.tagline ?? null;
        }
        if (body.regenerateInviteCode) {
            update.inviteCode = await allocateUniqueInstituteInviteCode();
        }
        if (typeof body.isArchived === "boolean") {
            update.isArchived = body.isArchived;
        }

        await adminDb.collection("institutes").doc(params.instituteId).update(update);
        const fresh = await adminDb.collection("institutes").doc(params.instituteId).get();
        return NextResponse.json({
            institute: serializeInstitute({ id: fresh.id, ...fresh.data() }),
        });
    } catch (error: any) {
        console.error("Update institute failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
