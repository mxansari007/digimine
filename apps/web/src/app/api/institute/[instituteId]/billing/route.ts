import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { INSTITUTE_BILLING_PLANS } from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin, serializeInstitute } from "@/lib/server/institutes";
import {
    computeInstituteUsage,
    resolveInstitutePlanId,
    serializePlanChangeRequest,
} from "@/lib/server/instituteBilling";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const planId = resolveInstitutePlanId(auth.institute);
        const [usage, pendingSnap] = await Promise.all([
            computeInstituteUsage(params.instituteId),
            adminDb
                .collection("institutes")
                .doc(params.instituteId)
                .collection("planChangeRequests")
                .where("status", "==", "pending")
                .limit(5)
                .get(),
        ]);

        return NextResponse.json({
            institute: serializeInstitute({ id: params.instituteId, ...auth.institute }),
            planId,
            plan: INSTITUTE_BILLING_PLANS[planId],
            catalog: Object.values(INSTITUTE_BILLING_PLANS).filter((p) => !p.hidden),
            usage,
            billingContact: auth.institute?.billing?.contact ?? null,
            pendingRequests: pendingSnap.docs.map((d) => serializePlanChangeRequest({ id: d.id, ...d.data() })),
        });
    } catch (error: any) {
        console.error("Get institute billing failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const contact = body?.contact;
        if (!contact || typeof contact !== "object") {
            return NextResponse.json({ error: "contact required" }, { status: 400 });
        }

        const sanitized: Record<string, any> = {};
        if (typeof contact.name === "string") sanitized.name = contact.name.trim();
        if (typeof contact.email === "string") sanitized.email = contact.email.trim().toLowerCase();
        if (contact.phone === null || typeof contact.phone === "string")
            sanitized.phone = contact.phone ? String(contact.phone).trim() : null;
        if (contact.gstin === null || typeof contact.gstin === "string")
            sanitized.gstin = contact.gstin ? String(contact.gstin).trim().toUpperCase() : null;
        if (contact.address === null || typeof contact.address === "string")
            sanitized.address = contact.address ? String(contact.address).trim() : null;

        if (!sanitized.name || !sanitized.email) {
            return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
        }

        await adminDb.collection("institutes").doc(params.instituteId).update({
            "billing.contact": sanitized,
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ contact: sanitized });
    } catch (error: any) {
        console.error("Update billing contact failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
