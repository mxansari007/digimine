import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";

const MIN_PAYOUT_INR = 1000;
const MIN_PAYOUT_USD = 25;

export async function POST(req: Request) {
    try {
        // Auth: the teacherId in the body must match the signed-in user.
        // Payout endpoints are the highest-impact teacher route — they decrement
        // a balance and create a real payout record — so we verify the bearer
        // token explicitly here rather than trusting the body field.
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in to request a payout." }, { status: 401 });
        }

        const body = await req.json();
        const { teacherId, amount, method } = body;

        if (!teacherId || !amount || !method) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (tokenUserId !== teacherId) {
            return NextResponse.json(
                { error: "You can only request payouts for your own account." },
                { status: 403 }
            );
        }

        const teacherRef = adminDb.collection("teachers").doc(teacherId);
        const teacherSnap = await teacherRef.get();

        if (!teacherSnap.exists) {
            return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
        }

        const teacher = teacherSnap.data()!;
        const pendingPayout = teacher.usage?.pendingPayout || 0;

        if (pendingPayout < MIN_PAYOUT_INR && pendingPayout < MIN_PAYOUT_USD) {
            return NextResponse.json(
                { error: `Minimum payout is ₹${MIN_PAYOUT_INR} or $${MIN_PAYOUT_USD}` },
                { status: 400 }
            );
        }

        if (amount > pendingPayout) {
            return NextResponse.json(
                { error: "Requested amount exceeds pending payout" },
                { status: 400 }
            );
        }

        // Create payout record
        const payoutRef = adminDb.collection("payouts").doc();
        await payoutRef.set({
            id: payoutRef.id,
            teacherId,
            amount,
            status: "pending",
            method,
            initiatedAt: Timestamp.now(),
            completedAt: null,
            transactionId: null,
            adminNotes: null,
        });

        // Decrement pending payout
        await teacherRef.update({
            "usage.pendingPayout": FieldValue.increment(-amount),
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ success: true, payoutId: payoutRef.id });
    } catch (error: any) {
        console.error("Payout request error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to request payout" },
            { status: 500 }
        );
    }
}
