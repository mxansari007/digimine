/**
 * Institute billing — plan catalog, invoices, and plan change requests.
 *
 * Plans are quoted in INR (the platform is India-first). Pricing is annual.
 * The catalog is static at this stage — pricing changes ship via code review,
 * not Firestore. Plan changes go through a request queue that the platform
 * super_admin fulfils manually (no payment gateway wired up yet).
 */

export type InstituteBillingPlanId = "trial" | "starter" | "growth" | "scale" | "enterprise";

export type InstituteBillingInterval = "annual" | "monthly";

export interface InstituteBillingPlanLimits {
    /** Max active teachers under the institute. -1 = unlimited. */
    teachers: number;
    /** Max students across all classes. -1 = unlimited. */
    students: number;
    /** Max classes the institute can have active at one time. */
    classes: number;
    /** Cap on question bank rows. -1 = unlimited. */
    questionBankItems: number;
    /** Centralized content pieces (quizzes + tests + contests + courses). */
    centralizedContent: number;
    /** Whether the plan unlocks white-labeling / custom branding. */
    customBranding: boolean;
    /** Priority support SLA in hours. -1 = standard / community only. */
    supportSlaHours: number;
}

export interface InstituteBillingPlan {
    id: InstituteBillingPlanId;
    name: string;
    tagline: string;
    /** Annual price in INR — the headline number. */
    annualPriceINR: number;
    /** Monthly equivalent in INR for display. 0 when plan is free. */
    monthlyPriceINR: number;
    limits: InstituteBillingPlanLimits;
    /** Customer-facing bullet points, ordered for the marketing card. */
    features: string[];
    /** True for the plan we want to feature visually. */
    recommended?: boolean;
    /** Hidden plans (e.g. trial) don't render in the catalog grid. */
    hidden?: boolean;
}

export const INSTITUTE_BILLING_PLANS: Record<InstituteBillingPlanId, InstituteBillingPlan> = {
    trial: {
        id: "trial",
        name: "Trial",
        tagline: "Free 30-day evaluation",
        annualPriceINR: 0,
        monthlyPriceINR: 0,
        limits: {
            teachers: 3,
            students: 60,
            classes: 5,
            questionBankItems: 100,
            centralizedContent: 10,
            customBranding: false,
            supportSlaHours: -1,
        },
        features: [
            "Up to 3 teachers, 60 students",
            "5 classes, 10 centralized content pieces",
            "Email support",
        ],
        hidden: true,
    },
    starter: {
        id: "starter",
        name: "Starter",
        tagline: "Small coaching centres",
        annualPriceINR: 24000,
        monthlyPriceINR: 2400,
        limits: {
            teachers: 5,
            students: 200,
            classes: 15,
            questionBankItems: 500,
            centralizedContent: 50,
            customBranding: false,
            supportSlaHours: 48,
        },
        features: [
            "5 teacher seats, 200 students",
            "15 classes",
            "Centralized question bank (500 items)",
            "Email support (48h)",
        ],
    },
    growth: {
        id: "growth",
        name: "Growth",
        tagline: "Established institutes",
        annualPriceINR: 60000,
        monthlyPriceINR: 6000,
        limits: {
            teachers: 15,
            students: 750,
            classes: 50,
            questionBankItems: 2500,
            centralizedContent: 250,
            customBranding: true,
            supportSlaHours: 24,
        },
        features: [
            "15 teacher seats, 750 students",
            "50 classes",
            "Question bank (2,500 items)",
            "Custom branding & subdomain",
            "Priority support (24h)",
        ],
        recommended: true,
    },
    scale: {
        id: "scale",
        name: "Scale",
        tagline: "Multi-branch chains",
        annualPriceINR: 144000,
        monthlyPriceINR: 14400,
        limits: {
            teachers: 50,
            students: 3000,
            classes: 200,
            questionBankItems: 10000,
            centralizedContent: 1000,
            customBranding: true,
            supportSlaHours: 8,
        },
        features: [
            "50 teacher seats, 3,000 students",
            "200 classes",
            "Question bank (10,000 items)",
            "Custom branding & subdomain",
            "Priority support (8h)",
        ],
    },
    enterprise: {
        id: "enterprise",
        name: "Enterprise",
        tagline: "Universities & networks",
        annualPriceINR: 0,
        monthlyPriceINR: 0,
        limits: {
            teachers: -1,
            students: -1,
            classes: -1,
            questionBankItems: -1,
            centralizedContent: -1,
            customBranding: true,
            supportSlaHours: 4,
        },
        features: [
            "Unlimited teachers, students, classes",
            "Unlimited question bank",
            "Custom branding & domain",
            "Dedicated success manager",
            "Priority support (4h)",
        ],
    },
};

export function getInstituteBillingPlan(id: string | null | undefined): InstituteBillingPlan {
    if (!id) return INSTITUTE_BILLING_PLANS.trial;
    const plan = INSTITUTE_BILLING_PLANS[id as InstituteBillingPlanId];
    return plan ?? INSTITUTE_BILLING_PLANS.trial;
}

// ────────────────────────────────────────────────────────────────────
// Invoices — issued manually by the platform super_admin for now.
// ────────────────────────────────────────────────────────────────────

export type InstituteInvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled";

export interface InstituteInvoice {
    id: string;
    instituteId: string;
    /** Sequential, human-readable invoice number, e.g. INV-2026-0123. */
    number: string;
    planId: InstituteBillingPlanId;
    /** Period the invoice covers. */
    periodStart: Date;
    periodEnd: Date;
    /** Amount in INR (paise are not modelled — invoices round to rupees). */
    amountINR: number;
    /** Tax in INR, computed by super_admin. */
    taxINR: number;
    /** Total = amount + tax. */
    totalINR: number;
    status: InstituteInvoiceStatus;
    issuedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
    /** Optional PDF link uploaded by super_admin (Storage URL or external). */
    pdfUrl: string | null;
    /** Free-form note shown to the customer. */
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────
// Plan change requests — institute submits, super_admin actions.
// ────────────────────────────────────────────────────────────────────

export type InstituteBillingChangeKind = "upgrade" | "downgrade" | "renew" | "cancel";
export type InstituteBillingChangeStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface InstitutePlanChangeRequest {
    id: string;
    instituteId: string;
    requestedBy: string;
    requestedAt: Date;
    kind: InstituteBillingChangeKind;
    fromPlanId: InstituteBillingPlanId | null;
    toPlanId: InstituteBillingPlanId | null;
    /** Optional context (additional seats wanted, GST number, etc). */
    notes: string | null;
    status: InstituteBillingChangeStatus;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    resolutionNotes: string | null;
}

export interface CreatePlanChangeRequestInput {
    kind: InstituteBillingChangeKind;
    toPlanId?: InstituteBillingPlanId;
    notes?: string;
}

// ────────────────────────────────────────────────────────────────────
// Billing contact (separate from operations contact on the institute
// doc). Stored on the institute under `billing.contact`.
// ────────────────────────────────────────────────────────────────────

export interface InstituteBillingContact {
    name: string;
    email: string;
    phone: string | null;
    /** GST number for tax invoicing. */
    gstin: string | null;
    /** Billing address, free-form. */
    address: string | null;
}

export interface UpdateBillingContactInput {
    name?: string;
    email?: string;
    phone?: string | null;
    gstin?: string | null;
    address?: string | null;
}

// ────────────────────────────────────────────────────────────────────
// Helpers used by both server and UI.
// ────────────────────────────────────────────────────────────────────

export interface InstituteBillingUsage {
    teachers: number;
    students: number;
    classes: number;
    questionBankItems: number;
    centralizedContent: number;
}

export function isLimitExceeded(limit: number, used: number): boolean {
    if (limit < 0) return false; // unlimited
    return used > limit;
}

export function usagePercent(limit: number, used: number): number {
    if (limit < 0) return 0;
    if (limit === 0) return used > 0 ? 100 : 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

export function formatLimit(limit: number): string {
    if (limit < 0) return "Unlimited";
    return limit.toLocaleString("en-IN");
}

export function formatINR(amount: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(amount);
}
