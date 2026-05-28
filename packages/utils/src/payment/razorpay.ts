import type { PaymentProvider, CreateSubscriptionOrderInput, SubscriptionOrder, VerifyPaymentInput, PaymentVerificationResult } from "../payment";

// Razorpay is only imported server-side
let Razorpay: any;

try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Razorpay = require("razorpay");
} catch {
    // Razorpay not available in client bundle
}

export class RazorpayProvider implements PaymentProvider {
    readonly name = "razorpay" as const;
    private razorpay: any;

    constructor(keyId?: string, keySecret?: string) {
        if (!Razorpay) {
            throw new Error("Razorpay SDK is not available");
        }
        const id = keyId || process.env.RAZORPAY_KEY_ID;
        const secret = keySecret || process.env.RAZORPAY_KEY_SECRET;
        if (!id || !secret) {
            throw new Error("Razorpay keys are not configured");
        }
        this.razorpay = new Razorpay({ key_id: id, key_secret: secret });
    }

    async createSubscriptionOrder(input: CreateSubscriptionOrderInput): Promise<SubscriptionOrder> {
        const amountInPaise = Math.round(input.amountINR * 100);

        // Razorpay caps the receipt field at 40 chars. The planId is now a
        // longer string (e.g. "teacher-starter-monthly" = 23 chars) and the
        // previous format `sub_${planId}_${Date.now()}` overflows. Plan
        // identity lives in `notes` anyway — keep the receipt opaque.
        const receipt = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt,
            notes: {
                planId: input.planId,
                planName: input.planName,
                customerEmail: input.customerEmail,
                ...input.metadata,
            },
        };

        let order: any;
        try {
            order = await this.razorpay.orders.create(options);
        } catch (e: any) {
            // The razorpay node SDK throws objects shaped like
            // { statusCode, error: { code, description, ... } } with no
            // `.message`. Re-throw a real Error so callers can show the
            // actual cause instead of a generic fallback.
            const description =
                e?.error?.description ||
                e?.error?.reason ||
                e?.message ||
                "Razorpay order creation failed";
            const err = new Error(`Razorpay: ${description}`);
            (err as any).cause = e;
            throw err;
        }

        return {
            orderId: input.metadata.teacherId || order.id,
            providerOrderId: order.id,
            amount: order.amount,
            currency: order.currency,
            provider: "razorpay",
        };
    }

    async verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerificationResult> {
        const crypto = await import("crypto");
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            return { success: false, message: "Razorpay secret not configured" };
        }

        const body = input.providerOrderId + "|" + input.paymentId;
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(body)
            .digest("hex");

        // `===` on hex strings is fast-exit on the first byte that differs,
        // leaking timing info about the prefix. Razorpay signatures are 64-char
        // hex of fixed length; use `timingSafeEqual` so the only signal is the
        // boolean result.
        const sig = String(input.signature || "");
        if (
            sig.length === expectedSignature.length &&
            crypto.timingSafeEqual(Buffer.from(expectedSignature, "hex"), Buffer.from(sig, "hex"))
        ) {
            return { success: true };
        }
        return { success: false, message: "Invalid payment signature" };
    }
}
