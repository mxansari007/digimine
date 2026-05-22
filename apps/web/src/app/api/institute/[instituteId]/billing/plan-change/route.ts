import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { INSTITUTE_BILLING_PLANS } from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import {
    resolveInstitutePlanId,
    serializePlanChangeRequest,
} from "@/lib/server/instituteBilling";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set(["upgrade", "downgrade", "renew", "cancel"]);

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const snap = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("planChangeRequests")
            .orderBy("requestedAt", "desc")
            .limit(20)
            .get();

        return NextResponse.json({
            requests: snap.docs.map((d) => serializePlanChangeRequest({ id: d.id, ...d.data() })),
        });
    } catch (error: any) {
        console.error("List plan change requests failed:", error);
        return NextResponse.json({ requests: [] });
    }
}

export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const kind = typeof body.kind === "string" ? body.kind : "";
        if (!VALID_KINDS.has(kind)) {
            return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
        }

        const toPlanId = body.toPlanId && body.toPlanId in INSTITUTE_BILLING_PLANS ? body.toPlanId : null;
        if ((kind === "upgrade" || kind === "downgrade") && !toPlanId) {
            return NextResponse.json({ error: "toPlanId required for plan change" }, { status: 400 });
        }

        const fromPlanId = resolveInstitutePlanId(auth.institute);

        // Reject duplicate pending requests so the queue stays clean.
        const existing = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("planChangeRequests")
            .where("status", "==", "pending")
            .limit(1)
            .get();
        if (!existing.empty) {
            return NextResponse.json(
                { error: "A pending request is already open. Cancel it before submitting a new one." },
                { status: 409 }
            );
        }

        const now = Timestamp.now();
        const docRef = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("planChangeRequests")
            .add({
                instituteId: params.instituteId,
                requestedBy: auth.userId,
                requestedAt: now,
                kind,
                fromPlanId,
                toPlanId,
                notes: typeof body.notes === "string" ? body.notes.trim() : null,
                status: "pending",
                resolvedAt: null,
                resolvedBy: null,
                resolutionNotes: null,
            });

        const created = await docRef.get();
        return NextResponse.json({
            request: serializePlanChangeRequest({ id: created.id, ...created.data() }),
        });
    } catch (error: any) {
        console.error("Create plan change request failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
