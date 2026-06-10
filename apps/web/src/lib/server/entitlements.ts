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
    ENTITLEMENT_QUOTAS,
    isPlanActive,
    resolveEntitlements,
    type AppSubscriptionPlan,
    type EntitlementQuota,
    type ResolvedEntitlements,
    type SubscriptionGlobalConfig,
    type UserSubscription,
} from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import { getUserEntitlementOverride } from "@/lib/server/userOverrides";

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
    let resolved: ResolvedEntitlements;
    if (!config.enforced) {
        resolved = resolveEntitlements(config, null, sub, paidPlan);
    } else {
        const active = sub && isPlanActive(sub);
        const planCode = active ? sub!.planCode : config.freePlanCode;
        const plan = await getPlanByCode(planCode);
        resolved = resolveEntitlements(config, plan, active ? sub : null, paidPlan);
    }

    // Layer the per-user admin override on top — only the keys the admin set
    // win, so a grant can unlock a feature/quota the plan doesn't include
    // (or revoke one it does), for this user only.
    if (userId) {
        const override = await getUserEntitlementOverride(userId);
        if (override) {
            resolved = {
                ...resolved,
                features: { ...resolved.features, ...(override.features || {}) },
                quotas: { ...resolved.quotas, ...(override.quotas || {}) },
            };
        }
    }
    return resolved;
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
 *
 * When consuming, the read-check-increment runs inside a Firestore
 * transaction so two concurrent requests (e.g. a double-clicked "Start")
 * can't both pass `used < limit` and over-consume the allowance.
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

    // Read-only check — no atomicity needed when we're not writing.
    if (!options.consume) {
        const snap = await ref.get();
        const used = snap.exists ? snap.data()?.count ?? 0 : 0;
        if (used >= limit) return { allowed: false, limit, used, remaining: 0 };
        return { allowed: true, limit, used, remaining: limit - used };
    }

    // Atomic consume — re-read inside the transaction so the limit check and
    // the increment are a single conflict-checked unit.
    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const used = snap.exists ? snap.data()?.count ?? 0 : 0;
        if (used >= limit) {
            return { allowed: false, limit, used, remaining: 0 } as QuotaCheck;
        }
        tx.set(
            ref,
            { userId, quota, period, count: FieldValue.increment(1), updatedAt: Timestamp.now() },
            { merge: true }
        );
        return { allowed: true, limit, used: used + 1, remaining: limit - used - 1 } as QuotaCheck;
    });
}

/**
 * Give back one unit of a previously-consumed quota — used when a committed
 * action is undone (e.g. the student cancels a booked interview, or a booking
 * expires unused). Floors at zero and never writes a negative counter.
 */
export async function refundQuota(
    userId: string,
    quota: EntitlementQuota,
    /** When the unit was consumed — defaults to now. Pass the booking's
     *  creation time so a refund near a period boundary credits the right
     *  period (the one the unit was charged to). */
    consumedAt: Date = new Date()
): Promise<void> {
    const period = periodKey(quota, consumedAt);
    const ref = adminDb.collection("entitlementUsage").doc(`${userId}_${quota}_${period}`);
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const used = snap.data()?.count ?? 0;
        if (used <= 0) return;
        tx.set(ref, { count: Math.max(0, used - 1), updatedAt: Timestamp.now() }, { merge: true });
    });
}

export interface QuotaUsage {
    key: EntitlementQuota;
    /** Plan limit for the current period. -1 = unlimited. */
    limit: number;
    /** How much of this period's allowance is already used. */
    used: number;
    /** limit - used (>= 0). -1 when unlimited. */
    remaining: number;
    /** The period bucket the counter lives in (e.g. "2026-W22", "2026-05-31"). */
    period: string;
}

/**
 * Per-quota usage for a user this period — the limit from their plan plus the
 * already-consumed count from `entitlementUsage`. Powers the student "My Plan"
 * page so they can see "3 of 5 used this week". Reads all counters in one
 * batched getAll.
 */
export async function getQuotaUsage(userId: string): Promise<QuotaUsage[]> {
    const ent = await getEntitlements(userId);
    const now = new Date();

    // Build refs only for finite-limit quotas; unlimited ones need no read.
    const finite = ENTITLEMENT_QUOTAS.map((q) => {
        const limit = ent.quotas[q.key] ?? 0;
        return { key: q.key, limit, period: limit < 0 ? "" : periodKey(q.key, now) };
    });
    const toRead = finite.filter((q) => q.limit >= 0);
    const refs = toRead.map((q) =>
        adminDb.collection("entitlementUsage").doc(`${userId}_${q.key}_${q.period}`)
    );
    const snaps = refs.length ? await adminDb.getAll(...refs) : [];
    const usedByKey = new Map<string, number>();
    toRead.forEach((q, i) => {
        const s = snaps[i];
        usedByKey.set(q.key, s && s.exists ? s.data()?.count ?? 0 : 0);
    });

    return finite.map((q) => {
        if (q.limit < 0) return { key: q.key, limit: -1, used: 0, remaining: -1, period: "" };
        const used = usedByKey.get(q.key) ?? 0;
        return { key: q.key, limit: q.limit, used, remaining: Math.max(0, q.limit - used), period: q.period };
    });
}
