import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import type { OrderStatus } from "@digimine/types";

const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

interface VerifyPaymentRequest {
    orderId: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: VerifyPaymentRequest = await request.json();
        const { orderId } = body;

        if (!orderId) {
            return NextResponse.json(
                { error: "Order ID is required" },
                { status: 400 }
            );
        }

        // Fetch order from Firestore using Admin SDK
        const orderRef = adminDb.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json(
                { error: "Order not found" },
                { status: 404 }
            );
        }

        const order = orderSnap.data()!;

        // If already completed, return success
        if (order.status === "completed") {
            return NextResponse.json({
                success: true,
                orderId,
                status: "completed",
                message: "Payment already verified",
            });
        }

        // Verify payment with Cashfree
        const cashfreeResponse = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
            method: "GET",
            headers: {
                "x-api-version": "2023-08-01",
                "x-client-id": process.env.CASHFREE_APP_ID!,
                "x-client-secret": process.env.CASHFREE_SECRET_KEY!,
            },
        });

        if (!cashfreeResponse.ok) {
            const errorData = await cashfreeResponse.json();
            console.error("Cashfree verification failed:", errorData);
            return NextResponse.json(
                { error: "Failed to verify payment", details: errorData },
                { status: 500 }
            );
        }

        const cashfreeData = await cashfreeResponse.json();
        const paymentStatus = cashfreeData.order_status;

        let newStatus: OrderStatus = "pending";
        let paymentId: string | null = null;

        if (paymentStatus === "PAID") {
            newStatus = "completed";
            // Get payment ID from payments array if available
            if (cashfreeData.payments && cashfreeData.payments.length > 0) {
                paymentId = cashfreeData.payments[0].cf_payment_id || null;
            }
        } else if (paymentStatus === "EXPIRED" || paymentStatus === "TERMINATED") {
            newStatus = "failed";
        }

        // Update order in Firestore
        // Generate access key if not present and order is completed
        let accessKey = order.accessKey;
        if (newStatus === "completed" && !accessKey) {
            accessKey = Array.from(Array(32), () => Math.floor(Math.random() * 36).toString(36)).join('');
        }

        await orderRef.update({
            status: newStatus,
            paymentId: paymentId || cashfreeData.cf_order_id,
            accessKey: accessKey || null,
            updatedAt: Timestamp.now(),
        });

        // If payment successful, update user's purchased products
        if (newStatus === "completed") {
            // 1. Send Email
            try {
                const { sendOrderEmail } = await import("@/lib/email");
                await sendOrderEmail(orderId);
            } catch (emailError) {
                console.error("Error triggering email:", emailError);
            }

            if (order.userId) {
                try {
                    const userRef = adminDb.collection("users").doc(order.userId);
                    const userSnap = await userRef.get();

                    if (userSnap.exists) {
                        const userData = userSnap.data()!;
                        const existingProducts = userData.purchasedProducts || [];
                        const newProductIds = order.items.map((item: { productId: string }) => item.productId);
                        const updatedProducts = [...new Set([...existingProducts, ...newProductIds])];

                        await userRef.update({
                            purchasedProducts: updatedProducts,
                            updatedAt: Timestamp.now(),
                        });
                    }
                } catch (userError) {
                    console.error("Error updating user purchases:", userError);
                    // Don't fail the verification if user update fails
                }
            }
        }

        // Return key if just generated/verified
        return NextResponse.json({
            success: newStatus === "completed",
            orderId,
            status: newStatus,
            cashfreeStatus: paymentStatus,
            accessKey: newStatus === "completed" ? accessKey : undefined
        });

    } catch (error) {
        console.error("Verify payment error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
