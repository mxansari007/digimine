import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    Timestamp,
} from "firebase/firestore";
import {
    AI_QUOTA_PERIODS,
    AI_QUOTA_TASKS,
    DEFAULT_AI_PROVIDER_CONFIG,
    DEFAULT_SUBSCRIPTION_CONFIG,
    type AiAllowance,
    type AiAllowanceMap,
    type AiProvider,
    type AiProviderConfig,
    type AiQuotaPeriod,
    type AppSubscriptionPlan,
    type PromoCode,
    type SubscriptionGlobalConfig,
    type TeachingLimits,
} from "@digimine/types";

const VALID_PERIODS = new Set<AiQuotaPeriod>(AI_QUOTA_PERIODS.map((p) => p.key));

/**
 * Read the per-task AI allowance map off a raw plan doc. Back-compat: when
 * `aiAllowances` is absent, derive the question-gen allowance from the
 * legacy `aiQuestionsPerDay` (daily). Missing tasks default to unlimited.
 */
function mapAiAllowances(raw: any): AiAllowanceMap {
    const out: AiAllowanceMap = {};
    const src = (raw?.aiAllowances || {}) as Record<string, any>;
    for (const t of AI_QUOTA_TASKS) {
        const a = src[t.key];
        if (a && typeof a.limit === "number" && Number.isFinite(a.limit)) {
            out[t.key] = {
                limit: Math.trunc(a.limit),
                period: VALID_PERIODS.has(a.period) ? a.period : "month",
            };
        } else if (t.key === "ai_question_generation" && typeof raw?.aiQuestionsPerDay === "number") {
            out[t.key] = { limit: raw.aiQuestionsPerDay, period: "day" };
        } else {
            out[t.key] = { limit: -1, period: "month" };
        }
    }
    return out;
}

/** Project a question-gen allowance to the legacy daily cap (null unless daily). */
function legacyDayCap(a: AiAllowance | undefined): number | null {
    if (!a || typeof a.limit !== "number") return null;
    if (a.limit === 0) return 0;
    if (a.limit < 0) return null;
    return a.period === "day" ? a.limit : null;
}

/** Sanitize an allowance map for persistence. */
function cleanAiAllowances(map: AiAllowanceMap | undefined): Record<string, AiAllowance> {
    const out: Record<string, AiAllowance> = {};
    for (const t of AI_QUOTA_TASKS) {
        const a = map?.[t.key];
        out[t.key] = {
            limit: a && typeof a.limit === "number" ? Math.trunc(a.limit) : -1,
            period: a && VALID_PERIODS.has(a.period) ? a.period : "month",
        };
    }
    return out;
}

function mapTeachingLimits(raw: any): TeachingLimits | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const num = (k: string): number =>
        typeof raw[k] === "number" && Number.isFinite(raw[k]) ? raw[k] : -1;
    return {
        maxClasses: num("maxClasses"),
        maxStudents: num("maxStudents"),
        maxTests: num("maxTests"),
        maxQuizzes: num("maxQuizzes"),
        maxContests: num("maxContests"),
        maxCourses: num("maxCourses"),
        maxQuestions: num("maxQuestions"),
        pistonConcurrency: num("pistonConcurrency"),
    };
}
import { db } from "@/lib/firebase/client";

const CONFIG_REF = () => doc(db, "appConfig", "subscription");
const AI_CONFIG_REF = () => doc(db, "appConfig", "aiProvider");
const PLANS = () => collection(db, "subscriptionPlans");
const PROMOS = () => collection(db, "promoCodes");

// ─── Global config ───────────────────────────────────────────────────

export async function getSubscriptionConfig(): Promise<SubscriptionGlobalConfig> {
    const snap = await getDoc(CONFIG_REF());
    if (!snap.exists()) return DEFAULT_SUBSCRIPTION_CONFIG;
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

export async function saveSubscriptionConfig(
    cfg: Partial<SubscriptionGlobalConfig>,
    adminUid: string
): Promise<void> {
    await setDoc(
        CONFIG_REF(),
        {
            enforced: Boolean(cfg.enforced),
            currency: "INR",
            freePlanCode: cfg.freePlanCode || "free",
            promoBanner: cfg.promoBanner ?? null,
            updatedAt: serverTimestamp(),
            updatedBy: adminUid,
        },
        { merge: true }
    );
}

// ─── Plans ───────────────────────────────────────────────────────────

function mapPlan(id: string, d: any): AppSubscriptionPlan {
    const rs = d.roleScope;
    // Back-compat: older plans only have `priceINR`. Treat it as the
    // monthly price and assume no annual variant.
    const monthlyPriceINR =
        typeof d.monthlyPriceINR === "number" ? d.monthlyPriceINR : (d.priceINR ?? 0);
    const annualPriceINR =
        typeof d.annualPriceINR === "number" ? d.annualPriceINR : null;
    return {
        id,
        code: d.code || "",
        name: d.name || "",
        tagline: d.tagline || "",
        highlights: Array.isArray(d.highlights) ? d.highlights : [],
        priceINR: monthlyPriceINR,
        monthlyPriceINR,
        annualPriceINR,
        compareAtINR: d.compareAtINR ?? null,
        interval: d.interval || "monthly",
        // Pre-roleScope plans default to "student" so legacy data keeps
        // working without a migration.
        roleScope: rs === "teacher" || rs === "institute" ? rs : "student",
        seatCap: typeof d.seatCap === "number" ? d.seatCap : null,
        features: d.features || {},
        quotas: d.quotas || {},
        teachingFeatures: d.teachingFeatures || {},
        teachingLimits: mapTeachingLimits(d.teachingLimits),
        aiQuestionsPerDay:
            typeof d.aiQuestionsPerDay === "number" ? d.aiQuestionsPerDay : null,
        aiAllowances: mapAiAllowances(d),
        isFree: Boolean(d.isFree),
        isActive: d.isActive !== false,
        isPublic: d.isPublic !== false,
        recommended: Boolean(d.recommended),
        badge: d.badge ?? null,
        sortOrder: d.sortOrder ?? 0,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
    };
}

export async function listPlans(): Promise<AppSubscriptionPlan[]> {
    const snap = await getDocs(PLANS());
    return snap.docs.map((d) => mapPlan(d.id, d.data() || {})).sort((a, b) => a.sortOrder - b.sortOrder || a.priceINR - b.priceINR);
}

export async function savePlan(plan: Partial<AppSubscriptionPlan> & { id?: string }): Promise<string> {
    const id = plan.id || doc(PLANS()).id;
    const rs = plan.roleScope;
    // Authoritative price fields are monthly/annual. Keep `priceINR`
    // mirrored to monthly so legacy readers (membership page, promo
    // engine, JSON-LD product schema) keep working without a migration.
    const monthlyPriceINR =
        typeof plan.monthlyPriceINR === "number" ? plan.monthlyPriceINR : (plan.priceINR ?? 0);
    const annualPriceINR =
        typeof plan.annualPriceINR === "number" ? plan.annualPriceINR : null;
    const payload: any = {
        code: (plan.code || "").trim().toLowerCase(),
        name: plan.name || "",
        tagline: plan.tagline || "",
        highlights: plan.highlights || [],
        priceINR: monthlyPriceINR,
        monthlyPriceINR,
        annualPriceINR,
        compareAtINR: plan.compareAtINR ?? null,
        interval: plan.interval || "monthly",
        roleScope: rs === "teacher" || rs === "institute" ? rs : "student",
        seatCap: typeof plan.seatCap === "number" ? plan.seatCap : null,
        features: plan.features || {},
        quotas: plan.quotas || {},
        teachingFeatures: plan.teachingFeatures || {},
        // Only persist teachingLimits for teacher/institute plans; student
        // plans don't have caps over these resources and writing an empty
        // block would pollute the doc.
        teachingLimits:
            (rs === "teacher" || rs === "institute") && plan.teachingLimits
                ? plan.teachingLimits
                : null,
        // Per-task AI allowances (limit + period) — only for teaching plans.
        aiAllowances:
            rs === "teacher" || rs === "institute"
                ? cleanAiAllowances(plan.aiAllowances)
                : null,
        // Legacy daily cap kept in sync for back-compat readers: the
        // question-gen allowance projected to a daily number (null unless
        // its period is "day").
        aiQuestionsPerDay: legacyDayCap(plan.aiAllowances?.ai_question_generation),
        isFree: Boolean(plan.isFree),
        isActive: plan.isActive !== false,
        isPublic: plan.isPublic !== false,
        recommended: Boolean(plan.recommended),
        badge: plan.badge || null,
        sortOrder: plan.sortOrder ?? 0,
        updatedAt: serverTimestamp(),
    };
    if (!plan.id) payload.createdAt = serverTimestamp();
    await setDoc(doc(PLANS(), id), payload, { merge: true });
    return id;
}

export async function deletePlan(id: string): Promise<void> {
    await deleteDoc(doc(PLANS(), id));
}

// ─── Promo codes ─────────────────────────────────────────────────────

function mapPromo(id: string, d: any): PromoCode {
    return {
        id,
        code: d.code || id,
        description: d.description || "",
        type: d.type || "percent",
        value: d.value ?? 0,
        grantsPlanCode: d.grantsPlanCode ?? null,
        applicablePlanCodes: Array.isArray(d.applicablePlanCodes) ? d.applicablePlanCodes : [],
        maxRedemptions: d.maxRedemptions ?? -1,
        redeemedCount: d.redeemedCount ?? 0,
        oncePerUser: d.oncePerUser !== false,
        startsAt: d.startsAt?.toDate ? d.startsAt.toDate() : null,
        expiresAt: d.expiresAt?.toDate ? d.expiresAt.toDate() : null,
        isActive: d.isActive !== false,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(),
    };
}

export async function listPromos(): Promise<PromoCode[]> {
    const snap = await getDocs(PROMOS());
    return snap.docs.map((d) => mapPromo(d.id, d.data() || {})).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function savePromo(promo: Partial<PromoCode>): Promise<string> {
    const code = (promo.code || "").trim().toUpperCase();
    if (!code) throw new Error("Code is required");
    // Use the code as the doc id so validation can look it up directly.
    const payload: any = {
        code,
        description: promo.description || "",
        type: promo.type || "percent",
        value: promo.value ?? 0,
        grantsPlanCode: promo.grantsPlanCode || null,
        applicablePlanCodes: promo.applicablePlanCodes || [],
        maxRedemptions: promo.maxRedemptions ?? -1,
        redeemedCount: promo.redeemedCount ?? 0,
        oncePerUser: promo.oncePerUser !== false,
        startsAt: promo.startsAt ? Timestamp.fromDate(new Date(promo.startsAt)) : null,
        expiresAt: promo.expiresAt ? Timestamp.fromDate(new Date(promo.expiresAt)) : null,
        isActive: promo.isActive !== false,
        updatedAt: serverTimestamp(),
    };
    const existing = await getDoc(doc(PROMOS(), code));
    if (!existing.exists()) payload.createdAt = serverTimestamp();
    await setDoc(doc(PROMOS(), code), payload, { merge: true });
    return code;
}

export async function deletePromo(code: string): Promise<void> {
    await deleteDoc(doc(PROMOS(), code.toUpperCase()));
}

// ─── AI provider config ──────────────────────────────────────────────

export async function getAiProviderConfig(): Promise<AiProviderConfig> {
    const snap = await getDoc(AI_CONFIG_REF());
    if (!snap.exists()) return DEFAULT_AI_PROVIDER_CONFIG;
    const d = snap.data() || {};
    const provider: AiProvider =
        d.provider === "openai" || d.provider === "anthropic"
            ? d.provider
            : "deepseek";
    return {
        enabled: Boolean(d.enabled),
        provider,
        apiKey: typeof d.apiKey === "string" ? d.apiKey : "",
        model: typeof d.model === "string" && d.model ? d.model : "deepseek-chat",
        maxQuestionsPerRequest:
            typeof d.maxQuestionsPerRequest === "number" && d.maxQuestionsPerRequest > 0
                ? d.maxQuestionsPerRequest
                : 10,
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(0),
        updatedBy: d.updatedBy ?? null,
    };
}

export async function saveAiProviderConfig(
    cfg: Partial<AiProviderConfig>,
    adminUid: string
): Promise<void> {
    const provider: AiProvider =
        cfg.provider === "openai" || cfg.provider === "anthropic"
            ? cfg.provider
            : "deepseek";
    await setDoc(
        AI_CONFIG_REF(),
        {
            enabled: Boolean(cfg.enabled),
            provider,
            // We accept the key on every save — clear it by passing "".
            // The admin UI re-fetches after save so the displayed value
            // reflects what was actually stored.
            apiKey: typeof cfg.apiKey === "string" ? cfg.apiKey : "",
            model: cfg.model || "deepseek-chat",
            maxQuestionsPerRequest:
                typeof cfg.maxQuestionsPerRequest === "number" && cfg.maxQuestionsPerRequest > 0
                    ? cfg.maxQuestionsPerRequest
                    : 10,
            updatedAt: serverTimestamp(),
            updatedBy: adminUid,
        },
        { merge: true }
    );
}
