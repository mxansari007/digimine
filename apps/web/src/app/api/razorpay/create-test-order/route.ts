import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { TestPurchase } from "@digimine/types";
import Razorpay from "razorpay";
import { Timestamp } from "firebase-admin/firestore";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { testId, amount, userId } = body;
        const seriesId = testId;

        if (!testId || !amount || !userId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        if (amount < 1) {
            return NextResponse.json(
                { error: "Invalid amount" },
                { status: 400 }
            );
        }

        const existingPurchaseSnapshot = await adminDb
            .collection("testPurchases")
            .where("userId", "==", userId)
            .get();
        const alreadyPurchased = existingPurchaseSnapshot.docs.some((purchaseDoc) => {
            const data = purchaseDoc.data();
            return data.seriesId === seriesId && data.status === "active";
        });

        if (alreadyPurchased) {
            return NextResponse.json({
                alreadyPurchased: true,
                seriesId,
            });
        }

        // Get test details
        const testDoc = await adminDb.collection("tests").doc(seriesId).get();
        if (!testDoc.exists) {
            return NextResponse.json(
                { error: "Test not found" },
                { status: 404 }
            );
        }
        // Create Razorpay Order
        const amountInPaise = Math.round(amount * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `test_${testId}_${Date.now()}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Save pending purchase to Firestore
        const purchaseRef = adminDb.collection("testPurchases").doc(`${userId}_${seriesId}`);

        const purchaseDoc: Omit<TestPurchase, "id"> = {
            userId,
            seriesId,
            orderId: razorpayOrder.id,
            price: amount,
            purchasedAt: Timestamp.now() as any,
            status: "pending",
            createdAt: Timestamp.now() as any,
            updatedAt: Timestamp.now() as any,
        };

        await purchaseRef.set(purchaseDoc);

        return NextResponse.json({
            orderId: purchaseRef.id,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
        });
    } catch (error: any) {
        console.error("Error creating Razorpay test order:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create order" },
            { status: 500 }
        );
    }
}
