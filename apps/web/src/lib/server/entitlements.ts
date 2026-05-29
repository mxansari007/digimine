/**
 * Server-side entitlement resolution + quota tracking.
 *
 * Reads the global config (`appConfig/subscription`), the user's active
 * subscription (`userSubscriptions/{uid}`), and the matching plan, then
 * returns what the user can do via the shared `resolveEntitlements`.
 *
 * Quota usage is tracked in `entitlementUsage/{uid_quota_period}` counters
 * so freemium limits (e.g. submissions/day) can be enforced server-side.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
    DEFAULT_SUBSCRIPTION_CONFIG,
    isPlanActive,
    resolveEntitlements,
    type AppSubscriptionPlan,
    type EntitlementQuota,
    type ResolvedEntitlements,
    type SubscriptionGlobalConfig,
    type UserSubscription,
} from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";

const CONFIG_DOC = adminDb.collection("appConfig").doc("subscription");

export async function getGlobalConfig(): Promise<SubscriptionGlobalConfig> {
    const snap = await CONFIG_DOC.get();
    if (!snap.exists) return DEFAULT_SUBSCRIPTION_CONFIG;
    const d = snap.data() || {};
    return {
        enforced: Boolean(d.enforced),
        currency: "INR",
        freePlanCode: d.freePlanCode || "free",
        promoBanner: d.promoBanner ?? null,
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(0),
        updatedBy: d.updatedBy ?? null,
    };
}

async function getPlanByCode(code: string): Promise<AppSubscriptionPlan | null> {
    if (!code) return null;
    const snap = await adminDb.collection("subscriptionPlans").where("code", "==", code).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as any) };
}

async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const snap = await adminDb.collection("userSubscriptions").doc(userId).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return {
        id: snap.id,
        userId,
        planCode: d.planCode || "free",
        status: d.status || "none",
        source: d.source || "grant",
        startedAt: d.startedAt?.toDate ? d.startedAt.toDate() : null,
        expiresAt: d.expiresAt?.toDate ? d.expiresAt.toDate() : null,
        autoRenew: Boolean(d.autoRenew),
        promoCode: d.promoCode ?? null,
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(0),
    };
}

/**
 * Resolve a user's effective entitlements. Anonymous users (userId null)
 * get the free plan under enforcement, or all-access in launch mode.
 *
 * The user's subscription is fetched *even in launch mode* so the strict
 * `isPaid` flag is accurate — that flag (and only that flag) is what
 * admin-flagged premium content like `access: "premium"` problems is
 * gated on, so it must work regardless of the kill switch.
 */
export async function getEntitlements(userId: string | null): Promise<ResolvedEntitlements> {
    const config = await getGlobalConfig();

    // Always look up the user's subscription so `isPaid` is meaningful
    // even when the kill switch is off.
    let sub: UserSubscription | null = null;
    let paidPlan: AppSubscriptionPlan | null = null;
    if (userId) {
        sub = await getUserSubscription(userId);
        if (sub && isPlanActive(sub) && sub.planCode && sub.planCode !== "free") {
            paidPlan = await getPlanByCode(sub.planCode);
        }
    }

    // In launch mode no further plan resolution is needed — `features` /
    // `quotas` come from the all-access defaults, but we still pass the sub
    // + paid plan so `isPaid` reflects reality.
    if (!config.enforced) {
        return resolveEntitlements(config, null, sub, paidPlan);
    }

    const active = sub && isPlanActive(sub);
    const planCode = active ? sub!.planCode : config.freePlanCode;
    const plan = await getPlanByCode(planCode);
    return resolveEntitlements(config, plan, active ? sub : null, paidPlan);
}

// ─────────────────────────────────────────────────────────────────────
// Quota tracking
// ─────────────────────────────────────────────────────────────────────

/** ISO-8601 week key, e.g. "2026-W22". Weeks start Monday; stable across
 *  year boundaries so a user can't get a double allowance at the new year. */
function isoWeekKey(d: Date): string {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3); // shift to the week's Thursday
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week =
        1 +
        Math.round(
            ((date.getTime() - firstThursday.getTime()) / 86400000 -
                3 +
                ((firstThursday.getUTCDay() + 6) % 7)) /
                7
        );
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodKey(quota: EntitlementQuota, now: Date): string {
    // Daily quotas roll on the calendar day; weekly on the ISO week; the rest
    // roll monthly.
    if (quota === "practiceSubmissionsPerDay") return now.toISOString().slice(0, 10); // YYYY-MM-DD
    if (quota === "aiInterviewsPerWeek") return isoWeekKey(now); // YYYY-Www
    return now.toISOString().slice(0, 7); // YYYY-MM
}

export interface QuotaCheck {
    allowed: boolean;
    limit: number; // -1 unlimited
    used: number;
    remaining: number; // -1 unlimited
}

/**
 * Check (and optionally consume) a quota for a user. Returns whether the
 * action is allowed under the current plan. `consume` increments the
 * counter when allowed.
 */
export async function checkQuota(
    userId: string,
    quota: EntitlementQuota,
    options: { consume?: boolean } = {}
): Promise<QuotaCheck> {
    const ent = await getEntitlements(userId);
    const limit = ent.quotas[quota] ?? 0;

    // Unlimited (-1) — always allowed, no counter writes.
    if (limit < 0) return { allowed: true, limit: -1, used: 0, remaining: -1 };

    const now = new Date();
    const period = periodKey(quota, now);
    const ref = adminDb.collection("entitlementUsage").doc(`${userId}_${quota}_${period}`);
    const snap = await ref.get();
    const used = snap.exists ? snap.data()?.count ?? 0 : 0;

    if (used >= limit) {
        return { allowed: false, limit, used, remaining: 0 };
    }

    if (options.consume) {
        await ref.set(
            {
                userId,
                quota,
                period,
                count: FieldValue.increment(1),
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        );
    }

    return { allowed: true, limit, used: used + (options.consume ? 1 : 0), remaining: limit - used - (options.consume ? 1 : 0) };
}
