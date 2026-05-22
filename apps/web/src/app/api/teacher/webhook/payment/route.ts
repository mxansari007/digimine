import { NextResponse } from "next/server";
import { RazorpayProvider } from "@digimine/utils";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import type { TeacherSubscription } from "@digimine/types";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            planId,
            teacherId,
        } = body;

        if (!orderId || !razorpayOrderId || !razorpayPaymentId || !planId || !teacherId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const provider = new RazorpayProvider();
        const verification = await provider.verifyPayment({
            orderId,
            providerOrderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature,
        });

        if (!verification.success) {
            return NextResponse.json(
                { success: false, message: verification.message || "Payment verification failed" },
                { status: 400 }
            );
        }

        const now = Timestamp.now();
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days

        const subscription: TeacherSubscription = {
            planId,
            status: "active",
            startedAt: now.toDate(),
            expiresAt: expiresAt.toDate(),
            gracePeriodEndsAt: null,
            autoRenew: true,
        };

        // Update teacher document
        const teacherRef = adminDb.collection("teachers").doc(teacherId);
        await teacherRef.update({
            subscription: JSON.parse(JSON.stringify(subscription)),
            updatedAt: now,
        });

        // Update subscription order
        const orderRef = adminDb.collection("subscriptionOrders").doc(orderId);
        await orderRef.update({
            teacherId,
            status: "completed",
            paymentId: razorpayPaymentId,
            completedAt: now,
            updatedAt: now,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Payment webhook error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Failed to process payment" },
            { status: 500 }
        );
    }
}
