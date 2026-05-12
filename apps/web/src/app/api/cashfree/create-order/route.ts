import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { OrderStatus, PaymentMethod, OrderItem } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

const CASHFREE_BASE_URL = process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

interface CreateOrderRequest {
    items: OrderItem[];
    subtotal: number;
    customerEmail: string;
    customerPhone: string;
    guestId?: string;
    userId?: string;
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
            paymentMethod: "cashfree" as PaymentMethod,
            paymentId: null,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        await adminDb.collection("orders").doc(orderId).set(newOrder);

        // Create order with Cashfree
        const cashfreeResponse = await fetch(`${CASHFREE_BASE_URL}/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-version": "2023-08-01",
                "x-client-id": process.env.CASHFREE_APP_ID!,
                "x-client-secret": process.env.CASHFREE_SECRET_KEY!,
            },
            body: JSON.stringify({
                order_id: orderId,
                order_amount: subtotal,
                order_currency: "INR",
                customer_details: {
                    customer_id: guestId || userId || `guest_${uuidv4().substring(0, 8)}`,
                    customer_email: customerEmail,
                    customer_phone: customerPhone.replace(/[^0-9]/g, "").slice(-10), // Last 10 digits
                },
                order_meta: {
                    return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/success?orderId=${orderId}`,
                },
            }),
        });

        if (!cashfreeResponse.ok) {
            const errorData = await cashfreeResponse.json();
            console.error("Cashfree order creation failed:", errorData);

            // Update order status to failed
            await adminDb.collection("orders").doc(orderId).update({
                status: "failed" as OrderStatus,
                updatedAt: Timestamp.now(),
            });

            return NextResponse.json(
                { error: "Failed to create payment order", details: errorData },
                { status: 500 }
            );
        }

        const cashfreeData = await cashfreeResponse.json();

        return NextResponse.json({
            orderId,
            paymentSessionId: cashfreeData.payment_session_id,
            cfOrderId: cashfreeData.cf_order_id,
        });

    } catch (error) {
        console.error("Create order error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
