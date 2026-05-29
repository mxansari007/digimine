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
    | "ai_interview" // AI mock coding interviews + behaviour tracker
    | "downloads" // downloadable resources
    | "ad_free" // no ads
    | "certificates"; // completion certificates

/** Numeric quota knobs (-1 = unlimited). */
export type EntitlementQuota =
    | "practiceSubmissionsPerDay"
    | "premiumProblemUnlocksPerMonth"
    | "mockTestsPerMonth"
    | "premiumQuizzesPerMonth"
    | "courseEnrollmentsActive"
    | "aiInterviewsPerDay";

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
    { key: "ai_interview", label: "AI mock interviews", blurb: "AI coding interviews with a behaviour-tracker scorecard.", group: "practice" },
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
    { key: "aiInterviewsPerDay", label: "AI interviews / day", blurb: "AI mock interviews a user can run per day.", group: "practice", freeDefault: 0 },
];

export type EntitlementFeatureMap = Partial<Record<EntitlementFeature, boolean>>;
export type EntitlementQuotaMap = Partial<Record<EntitlementQuota, number>>;

// ─────────────────────────────────────────────────────────────────────
// Teaching features — gated capabilities for teacher + institute plans.
// Separate from EntitlementFeature (which is student-only) because
// teachers and institutes need different concepts (question bank
// authoring tools, AI generation, etc.).
// ─────────────────────────────────────────────────────────────────────

export type TeachingFeature =
    | "question_bank_template_download"
    | "question_bank_markdown_import"
    | "ai_question_generation";

export interface TeachingFeatureMeta {
    key: TeachingFeature;
    label: string;
    blurb: string;
}

export const TEACHING_FEATURES: TeachingFeatureMeta[] = [
    {
        key: "question_bank_template_download",
        label: "Question template download",
        blurb:
            "Download the markdown template for bulk-authoring questions offline.",
    },
    {
        key: "question_bank_markdown_import",
        label: "Question markdown import",
        blurb:
            "Bulk-import a batch of questions from a markdown file in one shot.",
    },
    {
        key: "ai_question_generation",
        label: "AI question generation",
        blurb:
            "Generate question drafts from a topic + difficulty prompt; review and save individually.",
    },
];

export type TeachingFeatureMap = Partial<Record<TeachingFeature, boolean>>;

// ─────────────────────────────────────────────────────────────────────
// Teaching limits — numeric caps applied to teacher/institute plans.
// Surfaced in the admin plan editor, enforced server-side by
// checkPlanLimits, and rendered on the teacher Usage page. -1 means
// unlimited. Missing/null defaults to unlimited so legacy plans without
// the field keep working until an admin sets a cap.
// ─────────────────────────────────────────────────────────────────────

export type TeachingLimitKey =
    | "maxClasses"
    | "maxStudents"
    | "maxTests"
    | "maxQuizzes"
    | "maxContests"
    | "maxCourses"
    | "maxQuestions"
    | "pistonConcurrency";

export interface TeachingLimits {
    maxClasses: number;
    maxStudents: number;
    maxTests: number;
    maxQuizzes: number;
    maxContests: number;
    maxCourses: number;
    maxQuestions: number;
    pistonConcurrency: number;
}

export interface TeachingLimitMeta {
    key: TeachingLimitKey;
    label: string;
    blurb: string;
}

export const TEACHING_LIMITS: TeachingLimitMeta[] = [
    { key: "maxClasses", label: "Classes", blurb: "Active classrooms a teacher can run." },
    { key: "maxStudents", label: "Students", blurb: "Total enrolled students across all classes." },
    { key: "maxTests", label: "Test series", blurb: "Test series the teacher can author." },
    { key: "maxQuizzes", label: "Quizzes", blurb: "Quizzes the teacher can author." },
    { key: "maxContests", label: "Contests", blurb: "Contests the teacher can run." },
    { key: "maxCourses", label: "Courses", blurb: "Courses the teacher can author." },
    { key: "maxQuestions", label: "Question-bank items", blurb: "Custom questions stored across banks." },
    { key: "pistonConcurrency", label: "Code-runner concurrency", blurb: "Concurrent piston code submissions." },
];

/** Sentinel returned when a plan doesn't define limits — everything unlimited. */
export const UNLIMITED_TEACHING_LIMITS: TeachingLimits = {
    maxClasses: -1,
    maxStudents: -1,
    maxTests: -1,
    maxQuizzes: -1,
    maxContests: -1,
    maxCourses: -1,
    maxQuestions: -1,
    pistonConcurrency: -1,
};

// ─────────────────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────────────────

export type BillingInterval = "monthly" | "annual" | "lifetime";

/**
 * Which audience this plan is offered to. Used by the per-role pricing
 * pages (/pricing/teacher, /pricing/institute) and by the admin editor
 * to filter the plan list. The student-specific feature/quota toggles
 * on the editor are only shown when `roleScope === "student"`; for the
 * other scopes the plan is described purely by its `highlights` array
 * (and `seatCap` for institute plans).
 */
export type PlanRoleScope = "student" | "teacher" | "institute";

export interface AppSubscriptionPlan {
    id: string;
    /** Stable code used in checkout + entitlements, e.g. "free", "pro". */
    code: string;
    name: string;
    tagline: string;
    /** Marketing bullet points. */
    highlights: string[];
    /**
     * Legacy field. Mirrors `monthlyPriceINR` for back-compat with the
     * student membership flow + promo engine, which still read this.
     * New code should prefer `monthlyPriceINR` / `annualPriceINR`.
     */
    priceINR: number;
    /** Price when billed monthly. 0 for the free plan. INR. */
    monthlyPriceINR: number;
    /**
     * Price when billed annually. `null` means the plan doesn't offer an
     * annual cadence — the UI hides the annual toggle for that card. INR.
     */
    annualPriceINR: number | null;
    /** Strike-through "was" price for showing a discount on monthly. */
    compareAtINR: number | null;
    /**
     * Legacy field — describes the *default* cadence the plan was created
     * with. Moot in the new model (both prices live side-by-side) but
     * still serialised so older readers don't break.
     */
    interval: BillingInterval;
    /**
     * Which audience the plan is for. Existing pre-roleScope plans default
     * to "student" via the deserializer fallback so legacy data keeps
     * working without a migration.
     */
    roleScope: PlanRoleScope;
    /**
     * Seat cap — only meaningful when `roleScope === "institute"`. null
     * means unlimited (or N/A for non-institute plans).
     */
    seatCap: number | null;
    /** Capability flags this plan unlocks. */
    features: EntitlementFeatureMap;
    /** Numeric quotas (-1 = unlimited). */
    quotas: EntitlementQuotaMap;
    /**
     * Teaching capability flags unlocked by this plan. Only meaningful
     * when `roleScope` is "teacher" or "institute" — for student plans
     * this is an empty map and ignored by the UI / resolver.
     */
    teachingFeatures: TeachingFeatureMap;
    /**
     * Numeric caps applied to teacher/institute plans. -1 = unlimited.
     * Missing on the plan doc → treated as unlimited at resolve time
     * so legacy plans without the field don't suddenly start blocking.
     * Only meaningful when `roleScope` is "teacher" or "institute".
     */
    teachingLimits?: TeachingLimits;
    /**
     * Daily cap on AI-generated questions, summed across requests. The
     * counter resets at local midnight (IST). Semantics:
     *   - `null`  → no limit (still gated by the
     *               teachingFeatures.ai_question_generation flag).
     *   - `0`     → AI requests are rejected even if the flag is on.
     *   - `> 0`   → that many questions per day.
     * Only meaningful when `roleScope` is "teacher" or "institute".
     */
    aiQuestionsPerDay: number | null;
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
// AI provider config (admin-managed, stored at appConfig/aiProvider)
// ─────────────────────────────────────────────────────────────────────

export type AiProvider = "deepseek" | "openai" | "anthropic";

export interface AiProviderConfig {
    /**
     * Master kill-switch for AI-powered features (e.g. question
     * generation). When false, the UI shows "AI generation is
     * currently unavailable" and the server endpoints return 503
     * even for users on plans that include the feature.
     */
    enabled: boolean;
    provider: AiProvider;
    /**
     * Secret API key. Stored in Firestore at appConfig/aiProvider.
     * TODO(security): Firestore at-rest encryption protects the doc,
     * but consider migrating to a secret manager (GCP Secret Manager
     * / env var) before going to scale. For now the only way to
     * retrieve it is server-side via adminDb (admin-only route).
     */
    apiKey: string;
    /** Model identifier (e.g. "deepseek-chat", "gpt-4o-mini"). */
    model: string;
    /** Hard ceiling per generation request, to bound cost. */
    maxQuestionsPerRequest: number;
    updatedAt: Date;
    updatedBy: string | null;
}

export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
    enabled: false,
    provider: "deepseek",
    apiKey: "",
    model: "deepseek-chat",
    maxQuestionsPerRequest: 10,
    updatedAt: new Date(0),
    updatedBy: null,
};

/**
 * Public view of the AI provider config — safe to return to
 * non-admin callers. Crucially OMITS apiKey so it never leaks
 * through a `/me`-style endpoint.
 */
export interface AiProviderPublicView {
    enabled: boolean;
    provider: AiProvider;
    model: string;
    maxQuestionsPerRequest: number;
}

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
