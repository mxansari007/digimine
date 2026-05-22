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
    DEFAULT_SUBSCRIPTION_CONFIG,
    type AppSubscriptionPlan,
    type PromoCode,
    type SubscriptionGlobalConfig,
} from "@digimine/types";
import { db } from "@/lib/firebase/client";

const CONFIG_REF = () => doc(db, "appConfig", "subscription");
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
    return {
        id,
        code: d.code || "",
        name: d.name || "",
        tagline: d.tagline || "",
        highlights: Array.isArray(d.highlights) ? d.highlights : [],
        priceINR: d.priceINR ?? 0,
        compareAtINR: d.compareAtINR ?? null,
        interval: d.interval || "monthly",
        features: d.features || {},
        quotas: d.quotas || {},
        isFree: Boolean(d.isFree),
        isActive: d.isActive !== false,
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
    const payload: any = {
        code: (plan.code || "").trim().toLowerCase(),
        name: plan.name || "",
        tagline: plan.tagline || "",
        highlights: plan.highlights || [],
        priceINR: plan.priceINR ?? 0,
        compareAtINR: plan.compareAtINR ?? null,
        interval: plan.interval || "monthly",
        features: plan.features || {},
        quotas: plan.quotas || {},
        isFree: Boolean(plan.isFree),
        isActive: plan.isActive !== false,
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
