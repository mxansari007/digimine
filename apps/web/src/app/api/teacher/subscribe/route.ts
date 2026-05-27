import { NextResponse } from "next/server";
import { RazorpayProvider } from "@digimine/utils";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export async function POST(req: Request) {
    try {
        const uid = await getBearerUserId(req).catch(() => null);
        if (!uid) {
            return NextResponse.json({ error: "Sign in to subscribe." }, { status: 401 });
        }

        const body = await req.json();
        const { planId, planName, amountINR, amountUSD, cadence, customerEmail, customerName } = body;

        if (!planId || !amountINR || !customerEmail) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        const normalizedCadence: "monthly" | "annual" =
            cadence === "annual" ? "annual" : "monthly";

        // Guard: refuse to start a checkout for the same plan + cadence
        // the teacher is already on. Without this, a stale tab / forged
        // request would happily create another Razorpay order and
        // double-charge after webhook verification.
        const teacherSnap = await adminDb.collection("teachers").doc(uid).get();
        const subscription = teacherSnap.exists ? teacherSnap.data()?.subscription : null;
        if (subscription) {
            const currentPlan = subscription.planCode || subscription.planId || null;
            const currentCadence = subscription.cadence || "monthly";
            const status = subscription.status || null;
            const isLive = status === "active" || status === "trial" || status === "grace_period";
            if (isLive && currentPlan === planId && currentCadence === normalizedCadence) {
                return NextResponse.json(
                    {
                        error: `You're already on the ${planName || planId} plan (${normalizedCadence}). Manage it from your dashboard.`,
                        code: "already_subscribed",
                    },
                    { status: 409 }
                );
            }
        }

        const provider = new RazorpayProvider();

        const order = await provider.createSubscriptionOrder({
            planId,
            planName: planName || planId,
            amountINR,
            amountUSD: amountUSD || 0,
            customerEmail,
            customerName: customerName || "",
            metadata: {
                planId,
                cadence: normalizedCadence,
                customerEmail,
            },
        });

        const orderRef = adminDb.collection("subscriptionOrders").doc();
        await orderRef.set({
            id: orderRef.id,
            teacherId: uid,
            planId,
            planName,
            cadence: normalizedCadence,
            amount: amountINR,
            currency: "INR",
            providerOrderId: order.providerOrderId,
            provider: order.provider,
            status: "pending",
            customerEmail,
            customerName,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({
            orderId: orderRef.id,
            razorpayOrderId: order.providerOrderId,
            amount: order.amount,
            currency: order.currency,
        });
    } catch (error: any) {
        console.error("Error creating subscription order:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create subscription order" },
            { status: 500 }
        );
    }
}
