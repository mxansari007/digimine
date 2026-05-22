/**
 * Teacher billing — plan catalog for independent teachers. The institute
 * plan tier sits one level up (see instituteBilling.ts): anyone who needs
 * more than one teacher seat or institute-level features should move to
 * the institute product.
 *
 * Pricing is INR-first, monthly headline. Annual is sold at 2 months free.
 *
 *   Free      — try-before-buy, capped enough to discourage abuse.
 *   Starter   — solo educators with a single class.
 *   Pro       — full-featured solo teacher, marketplace selling, branding.
 *
 * The legacy "Institution" tier (previously sold at ₹4,999/mo on this
 * page) is gone — that's now the dedicated Institute product.
 */

export type TeacherBillingPlanId = "free" | "starter" | "pro";

export interface TeacherBillingPlanLimits {
    /** Max classes the teacher can keep active. -1 = unlimited. */
    classes: number;
    /** Max students across all classes. -1 = unlimited. */
    students: number;
    /** Test series cap. -1 = unlimited. */
    tests: number;
    /** Quiz cap. -1 = unlimited. */
    quizzes: number;
    /** Course cap. -1 = unlimited. */
    courses: number;
    /** Contest cap. -1 = unlimited. */
    contests: number;
    /** Personal question bank size. -1 = unlimited. */
    questions: number;
    /** Concurrent piston (code-runner) slots. */
    pistonConcurrency: number;
    /** Whether the teacher can apply to publish on the public marketplace. */
    publicMarketplace: boolean;
    /** Whether the teacher gets custom branding / colour on their classroom. */
    customBranding: boolean;
    /** Support SLA in hours. -1 = community only. */
    supportSlaHours: number;
}

export interface TeacherBillingPlan {
    id: TeacherBillingPlanId;
    name: string;
    tagline: string;
    /** Monthly headline in INR. 0 for the free plan. */
    monthlyPriceINR: number;
    /** Annual price — typically 10× monthly (≈ 17 % discount). 0 for free. */
    annualPriceINR: number;
    limits: TeacherBillingPlanLimits;
    /** Marketing bullets, ordered. */
    features: string[];
    /** Feature the recommended plan visually. */
    recommended?: boolean;
}

export const TEACHER_BILLING_PLANS: Record<TeacherBillingPlanId, TeacherBillingPlan> = {
    free: {
        id: "free",
        name: "Free",
        tagline: "Try the full editor",
        monthlyPriceINR: 0,
        annualPriceINR: 0,
        limits: {
            classes: 1,
            students: 25,
            tests: 3,
            quizzes: 10,
            courses: 2,
            contests: 1,
            questions: 200,
            pistonConcurrency: 1,
            publicMarketplace: false,
            customBranding: false,
            supportSlaHours: -1,
        },
        features: [
            "1 class, up to 25 students",
            "3 test series, 10 quizzes, 2 courses",
            "200-question personal bank",
            "Community support",
        ],
    },
    starter: {
        id: "starter",
        name: "Starter",
        tagline: "Solo educators",
        monthlyPriceINR: 499,
        annualPriceINR: 4990,
        limits: {
            classes: 2,
            students: 150,
            tests: 20,
            quizzes: 50,
            courses: 5,
            contests: 5,
            questions: 1000,
            pistonConcurrency: 2,
            publicMarketplace: true,
            customBranding: false,
            supportSlaHours: 48,
        },
        features: [
            "2 classes, up to 150 students",
            "20 test series, 50 quizzes",
            "1,000-question personal bank",
            "Sell on the public marketplace",
            "Email support (48h)",
        ],
    },
    pro: {
        id: "pro",
        name: "Pro",
        tagline: "Full-time creators",
        monthlyPriceINR: 1499,
        annualPriceINR: 14990,
        limits: {
            classes: 5,
            students: 500,
            tests: -1,
            quizzes: -1,
            courses: -1,
            contests: -1,
            questions: 5000,
            pistonConcurrency: 5,
            publicMarketplace: true,
            customBranding: true,
            supportSlaHours: 24,
        },
        features: [
            "5 classes, up to 500 students",
            "Unlimited tests, quizzes, courses, contests",
            "5,000-question personal bank",
            "Marketplace selling with revenue share",
            "Custom branding on your classroom",
            "Priority support (24h)",
        ],
        recommended: true,
    },
};

export function getTeacherBillingPlan(id: string | null | undefined): TeacherBillingPlan {
    if (!id) return TEACHER_BILLING_PLANS.free;
    const plan = TEACHER_BILLING_PLANS[id as TeacherBillingPlanId];
    return plan ?? TEACHER_BILLING_PLANS.free;
}

/**
 * Resolve the effective annual price (always = monthly × 10, i.e. 2 months
 * free) without hard-coding the discount at call sites.
 */
export function annualEquivalentSavings(plan: TeacherBillingPlan): number {
    if (plan.monthlyPriceINR === 0) return 0;
    return plan.monthlyPriceINR * 12 - plan.annualPriceINR;
}

export function annualMonthlyEquivalent(plan: TeacherBillingPlan): number {
    if (plan.annualPriceINR === 0) return 0;
    return Math.round(plan.annualPriceINR / 12);
}
