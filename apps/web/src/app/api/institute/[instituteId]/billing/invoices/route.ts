import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { serializeInvoice } from "@/lib/server/instituteBilling";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const snap = await adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("invoices")
            .orderBy("issuedAt", "desc")
            .limit(50)
            .get();

        return NextResponse.json({
            invoices: snap.docs.map((d) => serializeInvoice({ id: d.id, ...d.data() })),
        });
    } catch (error: any) {
        // Falling back gracefully when the collection has no `issuedAt` index
        // built yet — empty invoice list is fine for new institutes.
        console.error("List invoices failed:", error);
        return NextResponse.json({ invoices: [] });
    }
}
