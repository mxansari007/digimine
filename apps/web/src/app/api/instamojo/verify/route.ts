import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import type { OrderStatus } from "@digimine/types";

const INSTAMOJO_BASE_URL = process.env.INSTAMOJO_ENV === "production"
    ? "https://api.instamojo.com"
    : "https://test.instamojo.com";

interface VerifyPaymentRequest {
    orderId: string;
    paymentId?: string;
    paymentRequestId?: string;
}

/**
 * Get OAuth2 access token from Instamojo
 */
async function getInstamojoAccessToken(): Promise<string> {
    const response = await fetch(`${INSTAMOJO_BASE_URL}/oauth2/token/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.INSTAMOJO_CLIENT_ID!,
            client_secret: process.env.INSTAMOJO_CLIENT_SECRET!,
        }),
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("Instamojo token error:", errorData);
        throw new Error("Failed to get Instamojo access token");
    }

    const data = await response.json();
    return data.access_token;
}

export async function POST(request: NextRequest) {
    try {
        const body: VerifyPaymentRequest = await request.json();
        const { orderId, paymentId, paymentRequestId } = body;

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

        // Use the payment request ID from the order or from the request
        const imPaymentRequestId = paymentRequestId || order.instamojoPaymentRequestId;

        if (!imPaymentRequestId) {
            return NextResponse.json(
                { error: "Payment request ID not found" },
                { status: 400 }
            );
        }

        // Get access token
        const accessToken = await getInstamojoAccessToken();

        // Verify payment with Instamojo
        // If we have a specific payment_id, get that payment's details
        // Otherwise, get the payment request status
        let paymentStatus = "";
        let verifiedPaymentId: string | null = null;

        if (paymentId) {
            // Verify specific payment
            const paymentResponse = await fetch(
                `${INSTAMOJO_BASE_URL}/v2/payment_requests/${imPaymentRequestId}/${paymentId}/`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                    },
                }
            );

            if (!paymentResponse.ok) {
                const errorData = await paymentResponse.text();
                console.error("Instamojo payment verification failed:", errorData);
                return NextResponse.json(
                    { error: "Failed to verify payment", details: errorData },
                    { status: 500 }
                );
            }

            const paymentData = await paymentResponse.json();
            paymentStatus = paymentData.status;
            verifiedPaymentId = paymentData.payment_id || paymentId;
        } else {
            // Get payment request status
            const requestResponse = await fetch(
                `${INSTAMOJO_BASE_URL}/v2/payment_requests/${imPaymentRequestId}/`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                    },
                }
            );

            if (!requestResponse.ok) {
                const errorData = await requestResponse.text();
                console.error("Instamojo request verification failed:", errorData);
                return NextResponse.json(
                    { error: "Failed to verify payment request", details: errorData },
                    { status: 500 }
                );
            }

            const requestData = await requestResponse.json();
            // Check if any payment was made
            if (requestData.payments && requestData.payments.length > 0) {
                // Get the latest payment
                const latestPayment = requestData.payments[requestData.payments.length - 1];
                paymentStatus = latestPayment.status;
                verifiedPaymentId = latestPayment.payment_id;
            } else {
                paymentStatus = requestData.status || "Pending";
            }
        }

        let newStatus: OrderStatus = "pending";

        if (paymentStatus === "Credit") {
            newStatus = "completed";
        } else if (paymentStatus === "Failed") {
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
            paymentId: verifiedPaymentId || null,
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
            instamojoStatus: paymentStatus,
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
