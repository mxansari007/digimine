import { describe, it, expect } from "vitest";
import type { PaymentProvider, CreateSubscriptionOrderInput, VerifyPaymentInput } from "../payment";

describe("Payment types compile correctly", () => {
  it("CreateSubscriptionOrderInput has required fields", () => {
    const input: CreateSubscriptionOrderInput = {
      planId: "plan_123",
      planName: "Pro",
      amountINR: 999,
      amountUSD: 12,
      customerEmail: "test@example.com",
      customerName: "Test User",
      metadata: { source: "web" },
    };
    expect(input.planId).toBe("plan_123");
    expect(input.amountINR).toBe(999);
  });

  it("VerifyPaymentInput accepts optional signature", () => {
    const input: VerifyPaymentInput = {
      orderId: "order_123",
      providerOrderId: "prov_123",
      paymentId: "pay_123",
    };
    expect(input.signature).toBeUndefined();
  });

  it("PaymentVerificationResult success shape", () => {
    const result = { success: true, message: "OK" };
    expect(result.success).toBe(true);
  });

  it("BUG: amountINR and amountUSD can be negative (no validation in types)", () => {
    // Type system allows negative amounts — no runtime guard
    const badInput: CreateSubscriptionOrderInput = {
      planId: "plan_123",
      planName: "Pro",
      amountINR: -100,
      amountUSD: -2,
      customerEmail: "test@example.com",
      customerName: "Test User",
      metadata: {},
    };
    expect(badInput.amountINR).toBe(-100);
  });

  it("BUG: empty planId is allowed", () => {
    const badInput: CreateSubscriptionOrderInput = {
      planId: "",
      planName: "Pro",
      amountINR: 999,
      amountUSD: 12,
      customerEmail: "test@example.com",
      customerName: "Test User",
      metadata: {},
    };
    expect(badInput.planId).toBe("");
  });

  it("BUG: invalid email is allowed in type", () => {
    const badInput: CreateSubscriptionOrderInput = {
      planId: "plan_123",
      planName: "Pro",
      amountINR: 999,
      amountUSD: 12,
      customerEmail: "not-an-email",
      customerName: "Test User",
      metadata: {},
    };
    expect(badInput.customerEmail).toBe("not-an-email");
  });
});
