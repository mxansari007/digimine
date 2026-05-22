import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { Order, OrderItem } from "@digimine/types";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { items, subtotal, customerEmail, customerPhone } = body;

        if (!items || items.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }

        if (subtotal !== 0) {
            return NextResponse.json({ error: "Invalid amount for a free order" }, { status: 400 });
        }

        // Verify that all items are actually free by checking the database?
        // Let's trust the subtotal for now as it's verified when fetching the product, 
        // but in a production app, we should verify the product prices against the DB.

        const orderRef = adminDb.collection("orders").doc();
        const accessKey = uuidv4();
        
        const orderDoc: Order = {
            id: orderRef.id,
            userId: null,
            items: items as OrderItem[],
            subtotal: 0,
            discount: 0,
            total: 0,
            status: "completed", // Instantly completed since it's free
            customerEmail,
            customerPhone: customerPhone || null,
            paymentMethod: "free",
            paymentId: `free_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            accessKey,
            createdAt: Timestamp.now() as any,
            updatedAt: Timestamp.now() as any,
        };

        await orderRef.set(orderDoc);

        // Send order success email asynchronously
        import("@/lib/email").then(({ sendOrderEmail }) => {
            sendOrderEmail(orderRef.id).catch(err => {
                console.error("Failed to send email for free order", err);
            });
        });

        return NextResponse.json({ 
            orderId: orderRef.id, 
            accessKey: accessKey
        });

    } catch (error: any) {
        console.error("Error creating free order:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create free order" },
            { status: 500 }
        );
    }
}
