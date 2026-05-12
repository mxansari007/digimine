import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { OrderStatus, PaymentMethod, OrderItem } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

const INSTAMOJO_BASE_URL = process.env.INSTAMOJO_ENV === "production"
    ? "https://api.instamojo.com"
    : "https://test.instamojo.com";

interface CreateOrderRequest {
    items: OrderItem[];
    subtotal: number;
    customerEmail: string;
    customerPhone: string;
    guestId?: string;
    userId?: string;
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
        const body: CreateOrderRequest = await request.json();
        const { items, subtotal, customerEmail, customerPhone, guestId, userId } = body;

        if (!items || items.length === 0 || !subtotal || !customerEmail || !customerPhone) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Generate unique order ID
        const orderId = `order_${uuidv4().replace(/-/g, "").substring(0, 16)}`;

        // Create pending order in Firestore using Admin SDK
        const newOrder = {
            id: orderId,
            userId: userId || null,
            customerEmail,
            customerPhone,
            guestId: guestId || null,
            items,
            subtotal,
            discount: 0,
            total: subtotal,
            status: "pending" as OrderStatus,
            paymentMethod: "instamojo" as PaymentMethod,
            paymentId: null,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        await adminDb.collection("orders").doc(orderId).set(newOrder);

        // Step 1: Get access token
        const accessToken = await getInstamojoAccessToken();

        // Step 2: Create payment request with Instamojo
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const redirectUrl = `${appUrl}/success?orderId=${orderId}`;

        // Build purpose from item names
        const purpose = items.map(i => i.productName).join(", ").substring(0, 250);

        const paymentResponse = await fetch(`${INSTAMOJO_BASE_URL}/v2/payment_requests/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Bearer ${accessToken}`,
            },
            body: new URLSearchParams({
                purpose: purpose || "Product Purchase",
                amount: subtotal.toFixed(2),
                buyer_name: customerEmail.split("@")[0],
                email: customerEmail,
                phone: customerPhone.replace(/[^0-9]/g, "").slice(-10),
                redirect_url: redirectUrl,
                send_email: "false",
                send_sms: "false",
                allow_repeated_payments: "false",
            }),
        });

        if (!paymentResponse.ok) {
            const errorData = await paymentResponse.text();
            console.error("Instamojo payment request creation failed:", errorData);

            // Update order status to failed
            await adminDb.collection("orders").doc(orderId).update({
                status: "failed" as OrderStatus,
                updatedAt: Timestamp.now(),
            });

            return NextResponse.json(
                { error: "Failed to create payment request", details: errorData },
                { status: 500 }
            );
        }

        const paymentData = await paymentResponse.json();

        // Store the Instamojo payment request ID on the order for verification later
        await adminDb.collection("orders").doc(orderId).update({
            instamojoPaymentRequestId: paymentData.id,
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({
            orderId,
            paymentUrl: paymentData.longurl,
            paymentRequestId: paymentData.id,
        });

    } catch (error) {
        console.error("Create order error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
