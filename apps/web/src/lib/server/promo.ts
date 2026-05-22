import type { PromoCode, PromoValidationResult } from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";

function toDate(v: any): Date | null {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v instanceof Date) return v;
    return null;
}

export async function loadPromo(code: string): Promise<(PromoCode & { id: string }) | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    const snap = await adminDb.collection("promoCodes").doc(normalized).get();
    if (!snap.exists) {
        // Fall back to a query in case the doc id isn't the code.
        const q = await adminDb.collection("promoCodes").where("code", "==", normalized).limit(1).get();
        if (q.empty) return null;
        return { id: q.docs[0].id, ...(q.docs[0].data() as any) };
    }
    return { id: snap.id, ...(snap.data() as any) };
}

/**
 * Validate a promo against an optional target plan (code + price). Pure
 * checks here; redemption (incrementing counters / granting) is separate.
 */
export async function validatePromo(
    rawCode: string,
    target?: { planCode: string; priceINR: number },
    userId?: string | null
): Promise<PromoValidationResult> {
    const code = rawCode.trim().toUpperCase();
    const base: PromoValidationResult = {
        valid: false,
        reason: null,
        code,
        type: null,
        discountedPriceINR: null,
        grantsPlanCode: null,
        freeMonths: null,
    };

    const promo = await loadPromo(code);
    if (!promo) return { ...base, reason: "Code not found." };
    if (!promo.isActive) return { ...base, reason: "This code is no longer active." };

    const now = Date.now();
    const starts = toDate(promo.startsAt);
    const expires = toDate(promo.expiresAt);
    if (starts && starts.getTime() > now) return { ...base, reason: "This code isn't active yet." };
    if (expires && expires.getTime() < now) return { ...base, reason: "This code has expired." };
    if (promo.maxRedemptions >= 0 && (promo.redeemedCount ?? 0) >= promo.maxRedemptions) {
        return { ...base, reason: "This code has reached its redemption limit." };
    }

    // Per-user once.
    if (promo.oncePerUser && userId) {
        const prior = await adminDb
            .collection("subscriptionRedemptions")
            .where("userId", "==", userId)
            .where("code", "==", code)
            .limit(1)
            .get();
        if (!prior.empty) return { ...base, reason: "You've already used this code." };
    }

    // Plan applicability.
    if (
        target &&
        Array.isArray(promo.applicablePlanCodes) &&
        promo.applicablePlanCodes.length > 0 &&
        !promo.applicablePlanCodes.includes(target.planCode)
    ) {
        return { ...base, reason: "This code doesn't apply to the selected plan." };
    }

    // Compute discounted price when a target plan is supplied.
    let discounted: number | null = null;
    let freeMonths: number | null = null;
    if (target) {
        if (promo.type === "percent") discounted = Math.max(0, Math.round(target.priceINR * (1 - promo.value / 100)));
        else if (promo.type === "flat") discounted = Math.max(0, target.priceINR - promo.value);
        else if (promo.type === "free_months") freeMonths = promo.value;
        else if (promo.type === "free_plan") discounted = 0;
    } else if (promo.type === "free_months") {
        freeMonths = promo.value;
    }

    return {
        valid: true,
        reason: null,
        code,
        type: promo.type,
        discountedPriceINR: discounted,
        grantsPlanCode: promo.type === "free_plan" ? promo.grantsPlanCode : null,
        freeMonths,
    };
}
