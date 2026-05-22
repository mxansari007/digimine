import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/middleware/requireAdmin";

export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await req.json();
        const { payoutId, status, transactionId, adminNotes } = body;

        if (!payoutId || !status) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const payoutRef = adminDb.collection("payouts").doc(payoutId);
        const payoutSnap = await payoutRef.get();

        if (!payoutSnap.exists) {
            return NextResponse.json({ error: "Payout not found" }, { status: 404 });
        }

        const updateData: Record<string, any> = {
            status,
            updatedAt: Timestamp.now(),
        };

        if (transactionId) updateData.transactionId = transactionId;
        if (adminNotes) updateData.adminNotes = adminNotes;

        if (status === "completed" || status === "failed") {
            updateData.completedAt = Timestamp.now();
        }

        await payoutRef.update(updateData);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Process payout error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to process payout" },
            { status: 500 }
        );
    }
}
