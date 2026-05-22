import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { RazorpayProvider } from "@digimine/utils";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanByCode, grantPlan, recordRedemption } from "@/lib/server/subscriptionGrant";

export const dynamic = "force-dynamic";

/**
 * Verify a Razorpay payment and grant the plan.
 * Body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;
        if (!orderId || !razorpayOrderId || !razorpayPaymentId) {
            return NextResponse.json({ error: "Missing payment fields" }, { status: 400 });
        }

        const orderRef = adminDb.collection("subscriptionOrders").doc(String(orderId));
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        const order = orderSnap.data() || {};
        if (order.userId !== userId) return NextResponse.json({ error: "Order does not belong to you" }, { status: 403 });
        if (order.status === "paid") {
            return NextResponse.json({ success: true, alreadyProcessed: true, planCode: order.planCode });
        }

        const provider = new RazorpayProvider();
        const verification = await provider.verifyPayment({
            orderId: String(orderId),
            providerOrderId: String(razorpayOrderId),
            paymentId: String(razorpayPaymentId),
            signature: razorpaySignature,
        });
        if (!verification.success) {
            return NextResponse.json({ error: verification.message || "Verification failed" }, { status: 400 });
        }

        const plan = await getPlanByCode(order.planCode);
        const interval = plan?.interval || order.interval || "monthly";

        await grantPlan({
            userId,
            planCode: order.planCode,
            source: "paid",
            interval,
            extraMonths: order.extraMonths || 0,
            promoCode: order.promoCode || null,
        });

        await orderRef.update({
            status: "paid",
            razorpayPaymentId,
            paidAt: Timestamp.now(),
        });

        if (order.promoCode) {
            await recordRedemption({ userId, code: order.promoCode, planCode: order.planCode, amountPaidINR: order.amountINR || 0 });
        }

        return NextResponse.json({ success: true, planCode: order.planCode });
    } catch (error: any) {
        console.error("Subscription verify failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
