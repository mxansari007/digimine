import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

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

        const { courseId } = await req.json();
        if (!courseId || typeof courseId !== "string") {
            return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
        }

        const courseSnap = await adminDb.collection("courses").doc(courseId).get();
        if (!courseSnap.exists) {
            return NextResponse.json({ error: "Course not found" }, { status: 404 });
        }

        const course = courseSnap.data() || {};
        if (course.status !== "published") {
            return NextResponse.json({ error: "Course is not published" }, { status: 403 });
        }
        if (course.accessType !== "enrollment_required") {
            return NextResponse.json({ error: "This course does not require payment" }, { status: 400 });
        }

        const price = Number(course.price || 0);
        if (price < 1) {
            return NextResponse.json({ error: "Course price is invalid" }, { status: 400 });
        }

        const enrollmentId = `${authUserId}_${courseId}`;
        const enrollmentRef = adminDb.collection("courseEnrollments").doc(enrollmentId);
        const existing = await enrollmentRef.get();
        if (existing.exists && existing.data()?.status === "active") {
            return NextResponse.json({ alreadyPurchased: true, courseId });
        }

        // Razorpay caps `receipt` at 40 chars. The previous `.slice(0, 40)`
        // dropped trailing digits of the timestamp when the courseId was long,
        // hurting uniqueness. Pack the courseId (last 12) and a base36 timestamp
        // instead — always under 30 chars and uniquely identifies the attempt.
        const shortCourseId = String(courseId).slice(-12);
        const shortTs = Date.now().toString(36);
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(price * 100),
            currency: "INR",
            receipt: `c_${shortCourseId}_${shortTs}`,
        });

        await enrollmentRef.set(
            {
                userId: authUserId,
                courseId,
                orderId: razorpayOrder.id,
                price,
                status: "pending",
                createdAt: existing.data()?.createdAt || new Date(),
                updatedAt: new Date(),
            },
            { merge: true }
        );

        return NextResponse.json({
            orderId: enrollmentId,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
        });
    } catch (error: any) {
        // Razorpay SDK throws { statusCode, error: { code, description, ... } } —
        // these don't pass `instanceof Error`, so the old check always fell back
        // to the generic message. Unwrap the SDK shape first.
        const rzp = error?.error;
        const message =
            rzp?.description ||
            rzp?.reason ||
            (error instanceof Error ? error.message : null) ||
            "Failed to create course order";
        console.error("Error creating course order:", {
            statusCode: error?.statusCode,
            code: rzp?.code,
            description: rzp?.description,
            field: rzp?.field,
            message: error?.message,
        });
        return NextResponse.json({ error: message, code: rzp?.code, field: rzp?.field }, { status: 500 });
    }
}
