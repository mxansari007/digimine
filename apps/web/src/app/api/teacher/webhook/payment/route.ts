import { NextResponse } from "next/server";
import { RazorpayProvider } from "@digimine/utils";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

// In dev mode (or against emulators) the developer can bypass signature
// verification by setting BYPASS_PAYMENT_VERIFICATION=1 in .env.local —
// useful for simulating a successful checkout end-to-end without involving
// the Razorpay test gateway. Never set this in prod.
const BYPASS_VERIFICATION =
    process.env.NODE_ENV !== "production" &&
    process.env.BYPASS_PAYMENT_VERIFICATION === "1";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            planId,
            cadence,
            teacherId,
        } = body;

        if (!orderId || !razorpayOrderId || !razorpayPaymentId || !planId || !teacherId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!BYPASS_VERIFICATION) {
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
        }

        const normalizedCadence: "monthly" | "annual" =
            cadence === "annual" ? "annual" : "monthly";
        const now = Timestamp.now();
        const expiresAt = Timestamp.fromDate(
            new Date(Date.now() + (normalizedCadence === "annual" ? YEAR_MS : MONTH_MS))
        );

        // `planCode` is the new authoritative field that the entitlements
        // resolver looks up. `planId` is kept as a mirror for back-compat
        // with older readers / Razorpay metadata.
        const subscription = {
            planId,
            planCode: planId,
            cadence: normalizedCadence,
            status: "active" as const,
            startedAt: now.toDate(),
            expiresAt: expiresAt.toDate(),
            gracePeriodEndsAt: null,
            autoRenew: true,
        };

        const teacherRef = adminDb.collection("teachers").doc(teacherId);
        await teacherRef.set(
            {
                subscription: JSON.parse(JSON.stringify(subscription)),
                updatedAt: now,
            },
            { merge: true }
        );

        const orderRef = adminDb.collection("subscriptionOrders").doc(orderId);
        await orderRef.update({
            teacherId,
            cadence: normalizedCadence,
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
