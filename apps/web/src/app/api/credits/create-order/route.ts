/**
 * POST /api/credits/create-order  { packId }
 *
 * Creates a Razorpay order for one admin-defined credit pack. The price
 * and credit amount are resolved SERVER-SIDE from `appConfig/aiCredits`
 * — the client only names the pack, so a tampered request can't buy
 * credits at a made-up price. Mirrors /api/razorpay/create-test-order.
 */
import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getAiCreditsConfig, CREDIT_ORDERS } from "@/lib/server/credits";

export const dynamic = "force-dynamic";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const packId = typeof body.packId === "string" ? body.packId : "";
        if (!packId) {
            return NextResponse.json({ error: "packId required" }, { status: 400 });
        }

        const cfg = await getAiCreditsConfig();
        if (!cfg.enabled) {
            return NextResponse.json(
                { error: "Credit purchases are not available right now." },
                { status: 503 }
            );
        }
        const pack = cfg.packs.find((p) => p.id === packId && p.active);
        if (!pack) {
            return NextResponse.json({ error: "This pack is no longer available." }, { status: 404 });
        }

        const amountInPaise = Math.round(pack.priceINR * 100);
        const shortTs = Date.now().toString(36);
        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            // Razorpay caps receipt at 40 chars (same budget trick as test orders).
            receipt: `cr_${packId.slice(0, 20)}_${shortTs}`,
        });

        const orderRef = adminDb.collection(CREDIT_ORDERS).doc();
        await orderRef.set({
            userId,
            packId: pack.id,
            packName: pack.name,
            credits: pack.credits + pack.bonusCredits,
            amountINR: pack.priceINR,
            razorpayOrderId: razorpayOrder.id,
            status: "pending",
            paymentId: null,
            paidAt: null,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({
            orderId: orderRef.id,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            credits: pack.credits + pack.bonusCredits,
        });
    } catch (error: any) {
        const rzp = error?.error;
        const reason =
            rzp?.description || rzp?.reason || error?.message || "Failed to create order";
        console.error("[/api/credits/create-order] failed:", {
            statusCode: error?.statusCode,
            code: rzp?.code,
            description: rzp?.description,
            message: error?.message,
        });
        return NextResponse.json({ error: reason }, { status: 500 });
    }
}
