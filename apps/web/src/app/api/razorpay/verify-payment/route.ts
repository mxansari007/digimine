import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// Constant-time comparison for HMAC signatures. See verify-test-payment for rationale.
function safeEqualHex(a: string, b: string): boolean {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

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

        if (!safeEqualHex(generated_signature, razorpay_signature)) {
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

            // If this order was placed by a signed-in buyer (userId stamped
            // at create-order time), append the items to their
            // `purchasedProducts` array so /dashboard can surface them.
            // Guests (userId=null) keep using the access-key flow.
            const buyerUserId =
                typeof orderData.userId === "string" && orderData.userId
                    ? orderData.userId
                    : null;
            if (buyerUserId && Array.isArray(orderData.items)) {
                const productIds = orderData.items
                    .map((it: any) => it?.productId)
                    .filter((p: any) => typeof p === "string" && p);
                if (productIds.length > 0) {
                    await adminDb
                        .collection("users")
                        .doc(buyerUserId)
                        .set(
                            {
                                purchasedProducts: FieldValue.arrayUnion(...productIds),
                                updatedAt: FieldValue.serverTimestamp(),
                            },
                            { merge: true }
                        );
                }
            }

            // Send order success email
            const { sendOrderEmail } = await import("@/lib/email");
            await sendOrderEmail(orderId);
        }

        return NextResponse.json({ 
            success: true, 
            accessKey: orderData.accessKey || accessKey 
        });

    } catch (error: any) {
        const rzp = error?.error;
        const reason =
            rzp?.description ||
            rzp?.reason ||
            error?.message ||
            "Verification failed";
        console.error("Error verifying Razorpay payment:", {
            statusCode: error?.statusCode,
            code: rzp?.code,
            description: rzp?.description,
            message: error?.message,
        });
        return NextResponse.json({ error: reason }, { status: 500 });
    }
}
