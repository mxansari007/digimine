import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { TestPurchase } from "@digimine/types";
import Razorpay from "razorpay";
import { Timestamp } from "firebase-admin/firestore";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = await adminAuth.verifyIdToken(match[1]);
        return decoded.uid;
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    try {
        // Authenticate via bearer token. Previously the route trusted `userId`
        // from the body — a forged request could create a pending purchase
        // under any account.
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await req.json();
        const { testId, amount } = body;
        const userId = authUserId;
        const seriesId = testId;

        if (!testId || !amount) {
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

        // Razorpay limits `receipt` to 40 characters. Long Firestore IDs blow that
        // budget, so we truncate the testId and pack the timestamp in base36.
        const shortId = String(testId).slice(-12);
        const shortTs = Date.now().toString(36);
        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `t_${shortId}_${shortTs}`,
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
        // Razorpay SDK errors are shaped as { statusCode, error: { code, description, field, reason } }
        // — not { message }. Plain JS errors use { message }. Extract whichever exists so the client
        // (and our server logs) get a useful reason instead of a generic "Failed to create order".
        const rzp = error?.error;
        const reason =
            rzp?.description ||
            rzp?.reason ||
            error?.message ||
            "Failed to create order";
        console.error("Error creating Razorpay test order:", {
            statusCode: error?.statusCode,
            code: rzp?.code,
            description: rzp?.description,
            field: rzp?.field,
            reason: rzp?.reason,
            message: error?.message,
        });
        return NextResponse.json(
            { error: reason, code: rzp?.code, field: rzp?.field },
            { status: 500 }
        );
    }
}
