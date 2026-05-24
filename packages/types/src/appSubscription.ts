/**
 * Consumer (student) subscription control plane.
 *
 * This is the monetisation layer for END USERS — distinct from the teacher
 * (teacherBilling.ts) and institute (instituteBilling.ts) plans. The whole
 * point: the platform admin configures everything from an admin page, so
 * pricing/quotas/bundles are DATA in Firestore, not hard-coded.
 *
 * Pieces:
 *   - SubscriptionGlobalConfig  → `appConfig/subscription` (single doc).
 *       The `enforced` flag is the kill-switch: while false, EVERYONE gets
 *       full access (launch mode). Flip it on to start charging.
 *   - AppSubscriptionPlan       → `subscriptionPlans/{id}` (admin-defined).
 *   - PromoCode                 → `promoCodes/{code}` (admin-defined).
 *   - UserSubscription          → `userSubscriptions/{userId}`.
 *
 * Entitlements are resolved with `resolveEntitlements(config, plan)`.
 */

// ─────────────────────────────────────────────────────────────────────
// Feature + quota catalogs (the knobs an admin can turn per plan)
// ─────────────────────────────────────────────────────────────────────

/** Boolean capability flags a plan can unlock. */
export type EntitlementFeature =
    | "practice_premium" // unlimited practice + premium problems + solutions
    | "revision_radar" // spaced-repetition queue
    | "mentor_rescue" // ask-a-mentor on practice
    | "mock_tests" // access paid mock test series
    | "quizzes_premium" // premium quizzes
    | "courses_premium" // premium courses
    | "contests" // join contests
    | "downloads" // downloadable resources
    | "ad_free" // no ads
    | "certificates"; // completion certificates

/** Numeric quota knobs (-1 = unlimited). */
export type EntitlementQuota =
    | "practiceSubmissionsPerDay"
    | "premiumProblemUnlocksPerMonth"
    | "mockTestsPerMonth"
    | "premiumQuizzesPerMonth"
    | "courseEnrollmentsActive";

export interface EntitlementFeatureMeta {
    key: EntitlementFeature;
    label: string;
    blurb: string;
    /** Grouping for the admin UI. */
    group: "practice" | "tests" | "quizzes" | "courses" | "general";
}

export interface EntitlementQuotaMeta {
    key: EntitlementQuota;
    label: string;
    blurb: string;
    group: "practice" | "tests" | "quizzes" | "courses";
    /** Sensible default for a FREE plan. */
    freeDefault: number;
}

export const ENTITLEMENT_FEATURES: EntitlementFeatureMeta[] = [
    { key: "practice_premium", label: "Premium DSA/SQL practice", blurb: "Unlimited problems, premium sets, full solutions.", group: "practice" },
    { key: "revision_radar", label: "Revision Radar", blurb: "Spaced-repetition review queue.", group: "practice" },
    { key: "mentor_rescue", label: "Mentor Rescue", blurb: "Ask a mentor for a targeted hint.", group: "practice" },
    { key: "mock_tests", label: "Mock test series", blurb: "Access paid mock tests.", group: "tests" },
    { key: "quizzes_premium", label: "Premium quizzes", blurb: "Access premium quizzes.", group: "quizzes" },
    { key: "courses_premium", label: "Premium courses", blurb: "Access enrollment-required courses.", group: "courses" },
    { key: "contests", label: "Contests", blurb: "Join live contests.", group: "general" },
    { key: "downloads", label: "Downloads", blurb: "Downloadable PDFs and resources.", group: "general" },
    { key: "ad_free", label: "Ad-free", blurb: "Remove ads across the platform.", group: "general" },
    { key: "certificates", label: "Certificates", blurb: "Earn completion certificates.", group: "general" },
];

export const ENTITLEMENT_QUOTAS: EntitlementQuotaMeta[] = [
    { key: "practiceSubmissionsPerDay", label: "Practice submissions / day", blurb: "Code submissions allowed per day.", group: "practice", freeDefault: 20 },
    { key: "premiumProblemUnlocksPerMonth", label: "Premium problem unlocks / month", blurb: "Premium problems a free user can open.", group: "practice", freeDefault: 5 },
    { key: "mockTestsPerMonth", label: "Mock tests / month", blurb: "Paid mock tests attemptable.", group: "tests", freeDefault: 2 },
    { key: "premiumQuizzesPerMonth", label: "Premium quizzes / month", blurb: "Premium quizzes attemptable.", group: "quizzes", freeDefault: 5 },
    { key: "courseEnrollmentsActive", label: "Active premium course enrollments", blurb: "Premium courses enrolled at once.", group: "courses", freeDefault: 1 },
];

export type EntitlementFeatureMap = Partial<Record<EntitlementFeature, boolean>>;
export type EntitlementQuotaMap = Partial<Record<EntitlementQuota, number>>;

// ─────────────────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────────────────

export type BillingInterval = "monthly" | "annual" | "lifetime";

export interface AppSubscriptionPlan {
    id: string;
    /** Stable code used in checkout + entitlements, e.g. "free", "pro". */
    code: string;
    name: string;
    tagline: string;
    /** Marketing bullet points. */
    highlights: string[];
    /** 0 for the free plan. INR. */
    priceINR: number;
    /** Strike-through "was" price for showing a discount. */
    compareAtINR: number | null;
    interval: BillingInterval;
    /** Capability flags this plan unlocks. */
    features: EntitlementFeatureMap;
    /** Numeric quotas (-1 = unlimited). */
    quotas: EntitlementQuotaMap;
    /** The single free tier everyone falls back to. Exactly one should be true. */
    isFree: boolean;
    isActive: boolean;
    recommended: boolean;
    badge: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Global config (the launch-mode kill switch)
// ─────────────────────────────────────────────────────────────────────

export interface SubscriptionGlobalConfig {
    /**
     * When false, the paywall is OFF and everyone gets full entitlements
     * (launch / free-for-all mode). Flip to true to start enforcing plans.
     */
    enforced: boolean;
    currency: "INR";
    /** Code of the plan free users fall back to (must exist + isFree). */
    freePlanCode: string;
    /** Optional banner shown on the membership page. */
    promoBanner: string | null;
    updatedAt: Date;
    updatedBy: string | null;
}

export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionGlobalConfig = {
    enforced: false, // launch mode — everyone free until you flip it
    currency: "INR",
    freePlanCode: "free",
    promoBanner: null,
    updatedAt: new Date(0),
    updatedBy: null,
};

// ─────────────────────────────────────────────────────────────────────
// Promo codes
// ─────────────────────────────────────────────────────────────────────

export type PromoType = "percent" | "flat" | "free_months" | "free_plan";

export interface PromoCode {
    id: string;
    /** Uppercase code the user types. Doc id == code. */
    code: string;
    description: string;
    type: PromoType;
    /** percent: 0-100; flat: INR off; free_months: N months; free_plan: ignored. */
    value: number;
    /** For free_plan: which plan code to grant. Otherwise null. */
    grantsPlanCode: string | null;
    /** Restrict to specific plan codes (empty = any paid plan). */
    applicablePlanCodes: string[];
    maxRedemptions: number; // -1 = unlimited
    redeemedCount: number;
    /** Per-user one-time by default. */
    oncePerUser: boolean;
    startsAt: Date | null;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface PromoValidationResult {
    valid: boolean;
    reason: string | null;
    code: string;
    type: PromoType | null;
    /** Final price after discount (when applied to a plan). */
    discountedPriceINR: number | null;
    grantsPlanCode: string | null;
    freeMonths: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// User subscription
// ─────────────────────────────────────────────────────────────────────

export type UserSubscriptionStatus = "active" | "expired" | "cancelled" | "trialing" | "none";
export type SubscriptionSource = "paid" | "promo" | "grant" | "trial";

export interface UserSubscription {
    id: string; // == userId
    userId: string;
    planCode: string;
    status: UserSubscriptionStatus;
    source: SubscriptionSource;
    startedAt: Date | null;
    expiresAt: Date | null; // null = lifetime / non-expiring
    autoRenew: boolean;
    /** Last promo code applied. */
    promoCode: string | null;
    updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Entitlement resolution
// ─────────────────────────────────────────────────────────────────────

export interface ResolvedEntitlements {
    /** Effective plan code (or "all-access" in launch mode). */
    planCode: string;
    planName: string;
    /** True when everything is unlocked because enforcement is off OR the
     *  user is on a paid plan that grants the feature. */
    enforced: boolean;
    features: Record<EntitlementFeature, boolean>;
    quotas: Record<EntitlementQuota, number>;
    status: UserSubscriptionStatus;
    expiresAt: Date | null;
    /**
     * STRICT premium check: true iff the user has an active subscription on
     * a non-free plan. Computed from the user's actual `UserSubscription`
     * record and is INDEPENDENT of the launch-mode kill switch — so
     * admin-flagged premium content stays gated even when enforcement is
     * still off. Use this for `access: "premium"` style gates. Use
     * `features[...]` for quota / kill-switch-aware gates.
     */
    isPaid: boolean;
    /** Stable code of the user's actual paid plan, or null if free / none. */
    paidPlanCode: string | null;
}

function allFeaturesOn(): Record<EntitlementFeature, boolean> {
    const out = {} as Record<EntitlementFeature, boolean>;
    ENTITLEMENT_FEATURES.forEach((f) => (out[f.key] = true));
    return out;
}
function allQuotasUnlimited(): Record<EntitlementQuota, number> {
    const out = {} as Record<EntitlementQuota, number>;
    ENTITLEMENT_QUOTAS.forEach((q) => (out[q.key] = -1));
    return out;
}

/**
 * Resolve what a user can actually do.
 *
 *   - If config.enforced === false → everyone gets all-access (launch mode).
 *   - Else merge the plan's features/quotas over sensible free defaults.
 *
 * `plan` should be the user's active plan, or the free plan when they have
 * none / it expired.
 */
export function resolveEntitlements(
    config: Pick<SubscriptionGlobalConfig, "enforced">,
    plan: Pick<AppSubscriptionPlan, "code" | "name" | "features" | "quotas" | "isFree"> | null,
    sub?: Pick<UserSubscription, "status" | "planCode" | "expiresAt"> | null,
    /** The user's actual paid plan, if any (separate from the effective
     *  `plan` arg which can be a free fallback). Pass null/undefined when
     *  the user has no paid plan or it's expired. */
    paidPlan?: Pick<AppSubscriptionPlan, "code" | "isFree"> | null
): ResolvedEntitlements {
    // Strict premium check — always honours the user's actual subscription,
    // never bypassed by launch mode. A user is "paid" iff they have an
    // active sub on a non-free plan.
    const isPaid = Boolean(
        sub &&
            (sub.status === "active" || sub.status === "trialing") &&
            paidPlan &&
            !paidPlan.isFree
    );
    const paidPlanCode = isPaid ? paidPlan?.code ?? null : null;

    if (!config.enforced) {
        return {
            planCode: "all-access",
            planName: "All Access (launch mode)",
            enforced: false,
            features: allFeaturesOn(),
            quotas: allQuotasUnlimited(),
            status: sub?.status || "active",
            expiresAt: sub?.expiresAt ?? null,
            isPaid,
            paidPlanCode,
        };
    }

    const features = {} as Record<EntitlementFeature, boolean>;
    ENTITLEMENT_FEATURES.forEach((f) => {
        features[f.key] = Boolean(plan?.features?.[f.key]);
    });
    const quotas = {} as Record<EntitlementQuota, number>;
    ENTITLEMENT_QUOTAS.forEach((q) => {
        const v = plan?.quotas?.[q.key];
        quotas[q.key] = typeof v === "number" ? v : q.freeDefault;
    });

    return {
        planCode: plan?.code || "free",
        planName: plan?.name || "Free",
        enforced: true,
        features,
        quotas,
        status: sub?.status || "none",
        expiresAt: sub?.expiresAt ?? null,
        isPaid,
        paidPlanCode,
    };
}

export function isPlanActive(sub: Pick<UserSubscription, "status" | "expiresAt"> | null, now: number = Date.now()): boolean {
    if (!sub) return false;
    if (sub.status !== "active" && sub.status !== "trialing") return false;
    if (!sub.expiresAt) return true;
    const exp = sub.expiresAt instanceof Date ? sub.expiresAt.getTime() : new Date(sub.expiresAt).getTime();
    return Number.isFinite(exp) ? exp > now : true;
}

// `formatINR` is exported from instituteBilling.ts — reuse that.
