import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { createHmac } from "crypto";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            orderId,
            testId,
            userId,
        } = body;

        // Verify signature
        const shasum = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest("hex");

        if (digest !== razorpay_signature) {
            return NextResponse.json(
                { error: "Invalid signature" },
                { status: 400 }
            );
        }

        // Update purchase record
        const purchaseRef = adminDb.collection("testPurchases").doc(orderId);
        await purchaseRef.update({
            status: "active",
            paymentId: razorpay_payment_id,
            updatedAt: new Date(),
        });

        // Add test series to user's purchased tests for profile and Firestore rules checks.
        const userRef = adminDb.collection("users").doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            const purchasedTests = userData?.purchasedTests || [];
            const purchasedTestSeriesIds = userData?.purchasedTestSeriesIds || [];
            const alreadyInProfile = purchasedTests.some((purchase: any) => (
                typeof purchase === "string"
                    ? purchase === testId
                    : purchase?.seriesId === testId || purchase?.testId === testId
            ));
            
            if (!alreadyInProfile) {
                purchasedTests.push(testId);
            }

            const nextPurchasedTestSeriesIds = purchasedTestSeriesIds.includes(testId)
                ? purchasedTestSeriesIds
                : [...purchasedTestSeriesIds, testId];
            
            await userRef.update({
                purchasedTests,
                purchasedTestSeriesIds: nextPurchasedTestSeriesIds,
                updatedAt: new Date(),
            });
        }

        return NextResponse.json({ success: true, purchaseId: orderId });
    } catch (error: any) {
        console.error("Error verifying payment:", error);
        return NextResponse.json(
            { error: error.message || "Failed to verify payment" },
            { status: 500 }
        );
    }
}
