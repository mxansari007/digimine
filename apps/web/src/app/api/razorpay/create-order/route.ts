import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { Order, OrderItem } from "@digimine/types";
import Razorpay from "razorpay";
import { Timestamp } from "firebase-admin/firestore";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { items, subtotal, customerEmail, customerPhone } = body;

        if (!items || items.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }

        if (!subtotal || subtotal < 1) { // Razorpay minimum is 1 INR (100 paise)
            return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
        }

        // Create the Razorpay Order
        const amountInPaise = Math.round(subtotal * 100);
        
        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Save pending order to Firestore
        const orderRef = adminDb.collection("orders").doc();
        
        const orderDoc: Order = {
            id: orderRef.id,
            userId: null,
            items: items as OrderItem[],
            subtotal: subtotal,
            discount: 0,
            total: subtotal,
            status: "pending",
            customerEmail,
            customerPhone: customerPhone || null,
            paymentMethod: "razorpay",
            paymentId: razorpayOrder.id, // storing razorpay order id here initially
            createdAt: Timestamp.now() as any,
            updatedAt: Timestamp.now() as any,
        };

        await orderRef.set(orderDoc);

        return NextResponse.json({ 
            orderId: orderRef.id, 
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency
        });

    } catch (error: any) {
        console.error("Error creating Razorpay order:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create order" },
            { status: 500 }
        );
    }
}
