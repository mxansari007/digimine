/**
 * Payment Provider Abstraction
 * Supports Razorpay (India)
 */

export interface CreateSubscriptionOrderInput {
    planId: string;
    planName: string;
    amountINR: number;
    amountUSD: number;
    customerEmail: string;
    customerName: string;
    metadata: Record<string, string>;
}

export interface SubscriptionOrder {
    orderId: string;
    providerOrderId: string;
    amount: number;
    currency: string;
    provider: "razorpay";
}

export interface VerifyPaymentInput {
    orderId: string;
    providerOrderId: string;
    paymentId: string;
    signature?: string;
}

export interface PaymentVerificationResult {
    success: boolean;
    message?: string;
}

export interface PaymentProvider {
    readonly name: "razorpay";
    createSubscriptionOrder(input: CreateSubscriptionOrderInput): Promise<SubscriptionOrder>;
    verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerificationResult>;
}
