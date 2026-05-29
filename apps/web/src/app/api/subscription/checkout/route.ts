import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { RazorpayProvider } from "@digimine/utils";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanByCode, grantPlan, recordRedemption } from "@/lib/server/subscriptionGrant";
import { validatePromo } from "@/lib/server/promo";

export const dynamic = "force-dynamic";

/**
 * Begin a subscription purchase.
 *
 * Body: { planCode, promoCode? }
 *
 *   - Free plan, or a promo that drives the price to ₹0 (free_plan / 100%)
 *     → grant immediately, return { granted: true }.
 *   - Otherwise create a Razorpay order and return its details; the client
 *     completes payment then calls /api/subscription/verify.
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to subscribe." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const planCode = String(body.planCode || "");
        const promoCode = body.promoCode ? String(body.promoCode) : "";
        const cadence = body.cadence === "annual" ? "annual" : "monthly";

        const plan = await getPlanByCode(planCode);
        if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

        // Resolve price + billing interval for the chosen cadence. Plans carry
        // monthlyPriceINR/annualPriceINR; `priceINR` is a legacy monthly mirror
        // some seeds omit, so fall back through both.
        const monthlyPrice =
            typeof plan.monthlyPriceINR === "number"
                ? plan.monthlyPriceINR
                : typeof plan.priceINR === "number"
                    ? plan.priceINR
                    : 0;
        const annualPrice =
            typeof plan.annualPriceINR === "number" && plan.annualPriceINR > 0
                ? plan.annualPriceINR
                : null;
        const useAnnual = cadence === "annual" && annualPrice != null;
        const interval = useAnnual ? "annual" : "monthly";
        const basePrice = useAnnual ? (annualPrice as number) : monthlyPrice;

        // Free plan — grant directly.
        if (plan.isFree || basePrice <= 0) {
            await grantPlan({ userId, planCode: plan.code, source: "grant", interval });
            return NextResponse.json({ granted: true, planCode: plan.code });
        }

        // Apply promo if provided.
        let finalPrice = basePrice;
        let extraMonths = 0;
        let appliedPromo: string | null = null;
        if (promoCode) {
            const v = await validatePromo(promoCode, { planCode: plan.code, priceINR: basePrice }, userId);
            if (!v.valid) return NextResponse.json({ error: v.reason || "Invalid promo" }, { status: 400 });
            appliedPromo = v.code;
            if (v.grantsPlanCode) {
                // free_plan promo → grant the target plan free.
                const grantPlanDoc = await getPlanByCode(v.grantsPlanCode);
                const targetCode = grantPlanDoc?.code || v.grantsPlanCode;
                await grantPlan({ userId, planCode: targetCode, source: "promo", interval: grantPlanDoc?.interval || "monthly", promoCode: v.code });
                await recordRedemption({ userId, code: v.code, planCode: targetCode, amountPaidINR: 0 });
                return NextResponse.json({ granted: true, planCode: targetCode, viaPromo: true });
            }
            if (typeof v.discountedPriceINR === "number") finalPrice = v.discountedPriceINR;
            if (typeof v.freeMonths === "number") extraMonths = v.freeMonths;
        }

        // 100%-off → grant free.
        if (finalPrice <= 0) {
            await grantPlan({ userId, planCode: plan.code, source: "promo", interval, extraMonths, promoCode: appliedPromo });
            if (appliedPromo) await recordRedemption({ userId, code: appliedPromo, planCode: plan.code, amountPaidINR: 0 });
            return NextResponse.json({ granted: true, planCode: plan.code, viaPromo: Boolean(appliedPromo) });
        }

        // Paid → create Razorpay order + pending record.
        const userSnap = await adminDb.collection("users").doc(userId).get();
        const u = userSnap.data() || {};
        const provider = new RazorpayProvider();
        const order = await provider.createSubscriptionOrder({
            planId: plan.code,
            planName: plan.name,
            amountINR: finalPrice,
            amountUSD: 0,
            customerEmail: u.email || "",
            customerName: u.displayName || "",
            metadata: { userId, planCode: plan.code, promoCode: appliedPromo || "", extraMonths: String(extraMonths) },
        });

        const pendingRef = adminDb.collection("subscriptionOrders").doc();
        await pendingRef.set({
            id: pendingRef.id,
            userId,
            planCode: plan.code,
            interval,
            amountINR: finalPrice,
            promoCode: appliedPromo,
            extraMonths,
            providerOrderId: order.providerOrderId,
            status: "pending",
            createdAt: Timestamp.now(),
        });

        return NextResponse.json({
            granted: false,
            orderId: pendingRef.id,
            razorpayOrderId: order.providerOrderId,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
            planName: plan.name,
        });
    } catch (error: any) {
        console.error("Subscription checkout failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
