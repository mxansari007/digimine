import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { serializePlanChangeRequest } from "@/lib/server/instituteBilling";

export const dynamic = "force-dynamic";

export async function DELETE(
    req: Request,
    { params }: { params: { instituteId: string; requestId: string } }
) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const ref = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("planChangeRequests")
            .doc(params.requestId);

        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }
        const data = snap.data() || {};
        if (data.status !== "pending") {
            return NextResponse.json(
                { error: "Only pending requests can be cancelled" },
                { status: 409 }
            );
        }

        await ref.update({
            status: "cancelled",
            resolvedAt: Timestamp.now(),
            resolvedBy: auth.userId,
        });

        const fresh = await ref.get();
        return NextResponse.json({
            request: serializePlanChangeRequest({ id: fresh.id, ...fresh.data() }),
        });
    } catch (error: any) {
        console.error("Cancel plan change request failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
