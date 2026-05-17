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

        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(price * 100),
            currency: "INR",
            receipt: `course_${courseId}_${Date.now()}`.slice(0, 40),
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
    } catch (error: unknown) {
        console.error("Error creating course order:", error);
        const message = error instanceof Error ? error.message : "Failed to create course order";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
