/**
 * POST /api/credits/verify-payment
 *   { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Verifies the Razorpay signature (timing-safe, same as the test-payment
 * route) then settles the order: the pending→paid transition and the
 * wallet credit run in one transaction, so a double-submitted verify can
 * only credit once and a crash can't strand a paid order uncredited.
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { settleCreditOrder } from "@/lib/server/credits";

export const dynamic = "force-dynamic";

function safeEqualHex(a: string, b: string): boolean {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
        if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return NextResponse.json({ error: "Missing payment fields" }, { status: 400 });
        }

        const shasum = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        if (!safeEqualHex(shasum.digest("hex"), razorpay_signature)) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        const settled = await settleCreditOrder({
            orderId: String(orderId),
            userId,
            razorpayOrderId: String(razorpay_order_id),
            paymentId: String(razorpay_payment_id),
        });

        if (!settled.ok) {
            return NextResponse.json({ error: settled.error }, { status: 404 });
        }
        if (settled.alreadyPaid) {
            return NextResponse.json({ success: true, alreadyPaid: true });
        }
        return NextResponse.json({
            success: true,
            credited: settled.credited,
            balance: settled.balance,
        });
    } catch (error: any) {
        const rzp = error?.error;
        const reason =
            rzp?.description || rzp?.reason || error?.message || "Failed to verify payment";
        console.error("[/api/credits/verify-payment] failed:", {
            statusCode: error?.statusCode,
            code: rzp?.code,
            message: error?.message,
        });
        return NextResponse.json({ error: reason }, { status: 500 });
    }
}
