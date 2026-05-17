import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { createHmac } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
}

export async function POST(req: Request) {
    try {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            orderId,
            courseId,
        } = await req.json();

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !orderId || !courseId) {
            return NextResponse.json({ error: "Missing payment verification fields" }, { status: 400 });
        }

        const shasum = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest("hex");

        if (digest !== razorpay_signature) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        const enrollmentRef = adminDb.collection("courseEnrollments").doc(orderId);
        const enrollmentSnap = await enrollmentRef.get();
        const enrollment = enrollmentSnap.data();

        if (!enrollmentSnap.exists || enrollment?.userId !== authUserId || enrollment?.courseId !== courseId) {
            return NextResponse.json({ error: "Enrollment order mismatch" }, { status: 403 });
        }

        if (enrollment.orderId !== razorpay_order_id) {
            return NextResponse.json({ error: "Payment order mismatch" }, { status: 400 });
        }

        const now = new Date();
        await enrollmentRef.set(
            {
                status: "active",
                paymentId: razorpay_payment_id,
                enrolledAt: now,
                updatedAt: now,
            },
            { merge: true }
        );

        await adminDb.collection("users").doc(authUserId).set(
            {
                enrolledCourseIds: FieldValue.arrayUnion(courseId),
                updatedAt: now,
            },
            { merge: true }
        );

        return NextResponse.json({ success: true, enrollmentId: orderId });
    } catch (error: unknown) {
        console.error("Error verifying course payment:", error);
        const message = error instanceof Error ? error.message : "Failed to verify course payment";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
