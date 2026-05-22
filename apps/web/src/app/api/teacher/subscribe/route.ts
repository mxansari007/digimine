import { NextResponse } from "next/server";
import { RazorpayProvider } from "@digimine/utils";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { planId, planName, amountINR, amountUSD, customerEmail, customerName } = body;

        if (!planId || !amountINR || !customerEmail) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
                customerEmail,
            },
        });

        // Save pending subscription order to Firestore
        const orderRef = adminDb.collection("subscriptionOrders").doc();
        await orderRef.set({
            id: orderRef.id,
            teacherId: null, // filled after payment verification
            planId,
            planName,
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
