import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { AppSubscriptionPlan, SubscriptionSource } from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";

function addInterval(start: Date, interval: string, extraMonths = 0): Date | null {
    const d = new Date(start);
    if (interval === "lifetime") return null;
    if (interval === "annual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1); // monthly
    if (extraMonths > 0) d.setMonth(d.getMonth() + extraMonths);
    return d;
}

export async function getPlanByCode(code: string): Promise<(AppSubscriptionPlan & { id: string }) | null> {
    const snap = await adminDb.collection("subscriptionPlans").where("code", "==", code).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as any) };
}

/**
 * Grant a plan to a user (idempotent upsert). `extraMonths` covers
 * free-months promos. Returns the new expiry.
 */
export async function grantPlan(opts: {
    userId: string;
    planCode: string;
    source: SubscriptionSource;
    interval: string;
    extraMonths?: number;
    promoCode?: string | null;
}): Promise<{ expiresAt: Date | null }> {
    const now = new Date();
    const expiresAt = addInterval(now, opts.interval, opts.extraMonths || 0);
    await adminDb
        .collection("userSubscriptions")
        .doc(opts.userId)
        .set(
            {
                userId: opts.userId,
                planCode: opts.planCode,
                status: "active",
                source: opts.source,
                startedAt: Timestamp.fromDate(now),
                expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
                autoRenew: false,
                promoCode: opts.promoCode ?? null,
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        );
    return { expiresAt };
}

/**
 * Record a promo redemption + bump the promo's counter. Best-effort.
 */
export async function recordRedemption(opts: {
    userId: string;
    code: string;
    planCode: string;
    amountPaidINR: number;
}): Promise<void> {
    const code = opts.code.trim().toUpperCase();
    await adminDb.collection("subscriptionRedemptions").add({
        userId: opts.userId,
        code,
        planCode: opts.planCode,
        amountPaidINR: opts.amountPaidINR,
        createdAt: Timestamp.now(),
    });
    // Increment promo counter (doc id is the code, with a query fallback).
    const direct = adminDb.collection("promoCodes").doc(code);
    const snap = await direct.get();
    if (snap.exists) {
        await direct.update({ redeemedCount: FieldValue.increment(1), updatedAt: Timestamp.now() }).catch(() => {});
        return;
    }
    const q = await adminDb.collection("promoCodes").where("code", "==", code).limit(1).get();
    if (!q.empty) {
        await q.docs[0].ref.update({ redeemedCount: FieldValue.increment(1), updatedAt: Timestamp.now() }).catch(() => {});
    }
}
