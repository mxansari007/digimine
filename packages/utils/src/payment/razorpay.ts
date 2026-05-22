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

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `sub_${input.planId}_${Date.now()}`,
            notes: {
                planId: input.planId,
                planName: input.planName,
                customerEmail: input.customerEmail,
                ...input.metadata,
            },
        };

        const order = await this.razorpay.orders.create(options);

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

        if (expectedSignature === input.signature) {
            return { success: true };
        }
        return { success: false, message: "Invalid payment signature" };
    }
}
