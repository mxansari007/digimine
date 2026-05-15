import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

        if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            throw new Error("Razorpay secret not configured");
        }

        // Verify the signature
        const generated_signature = crypto
            .createHmac("sha256", secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generated_signature !== razorpay_signature) {
            return NextResponse.json({ success: false, error: "Signature mismatch" }, { status: 400 });
        }

        // Update order in Firestore
        const orderRef = adminDb.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const orderData = orderSnap.data()!;
        
        // Ensure the order corresponds to this Razorpay order
        if (orderData.paymentId !== razorpay_order_id) {
            return NextResponse.json({ error: "Invalid order match" }, { status: 400 });
        }

        // Generate a persistent access key
        const accessKey = uuidv4();
        
        const updateData: any = {
            status: "completed",
            paymentId: razorpay_payment_id,
        };

        if (!orderData.accessKey) {
            updateData.accessKey = accessKey;
        }

        if (orderData.status !== "completed") {
            await orderRef.update(updateData);
            
            // Send order success email
            const { sendOrderEmail } = await import("@/lib/email");
            await sendOrderEmail(orderId);
        }

        return NextResponse.json({ 
            success: true, 
            accessKey: orderData.accessKey || accessKey 
        });

    } catch (error: any) {
        console.error("Error verifying Razorpay payment:", error);
        return NextResponse.json(
            { error: "Verification failed" },
            { status: 500 }
        );
    }
}
