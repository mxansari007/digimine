import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { createHmac, timingSafeEqual } from "crypto";

// `===` on hex strings leaks per-character timing info. Razorpay signatures are
// 64-char hex; compare them with `timingSafeEqual` (after length match) so the
// only signal a forger can extract is the success/failure boolean.
function safeEqualHex(a: string, b: string): boolean {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

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
        // Auth via bearer — see create-test-order for the same rationale.
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await req.json();
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            orderId,
            testId,
        } = body;
        const userId = authUserId;

        // Verify signature
        const shasum = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest("hex");

        if (!safeEqualHex(digest, razorpay_signature)) {
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
        const rzp = error?.error;
        const reason =
            rzp?.description ||
            rzp?.reason ||
            error?.message ||
            "Failed to verify payment";
        console.error("Error verifying payment:", {
            statusCode: error?.statusCode,
            code: rzp?.code,
            description: rzp?.description,
            message: error?.message,
        });
        return NextResponse.json({ error: reason }, { status: 500 });
    }
}
