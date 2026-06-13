/**
 * AI usage credit system.
 *
 * Every metered AI task (interviews, question generation, project
 * evaluation) costs credits. The platform admin owns the economics from
 * the admin panel — per-task rates, sellable packs, welcome credits and
 * the master switch all live in `appConfig/aiCredits`, so pricing is
 * DATA in Firestore, not hard-coded.
 *
 * Pieces:
 *   - AiCreditsConfig     → `appConfig/aiCredits` (single doc).
 *       `enabled` is the kill-switch: while false, nothing is charged
 *       and the platform behaves exactly as before credits existed.
 *   - CreditWallet        → `creditWallets/{userId}` (any role: student,
 *       teacher or institute admin — whoever triggers the AI work pays
 *       from their own wallet).
 *   - CreditTransaction   → `creditTransactions/{id}` (immutable ledger).
 *   - CreditOrder         → `creditOrders/{orderId}` (Razorpay pack buys).
 *
 * A task with rate 0 is free even while the system is enabled, which
 * lets the admin meter some tasks and not others. Credit charges layer
 * ON TOP of plan feature flags and quotas — a plan gates whether you
 * may use a feature at all; credits meter how much you use it.
 */

/** Metered AI task keys. One rate per task in `AiCreditsConfig.rates`. */
export type AiCreditTask =
    | "ai_interview" // one full AI mock interview (charged at booking / instant start)
    | "ai_question_generation" // per generated question
    | "project_evaluation"; // per student submission evaluated (charged to the eval owner)

export interface AiCreditTaskMeta {
    key: AiCreditTask;
    label: string;
    /** What one unit means — shown in the admin rates editor. */
    unit: string;
    blurb: string;
}

export const AI_CREDIT_TASK_META: AiCreditTaskMeta[] = [
    {
        key: "ai_interview",
        label: "AI Mock Interview",
        unit: "per interview",
        blurb: "Charged when a student books or instantly starts an interview; refunded on cancel or missed booking.",
    },
    {
        key: "ai_question_generation",
        label: "AI Question Generation",
        unit: "per question",
        blurb: "Charged per question a teacher generates; refunded if the AI call fails.",
    },
    {
        key: "project_evaluation",
        label: "AI Project Evaluation",
        unit: "per submission",
        blurb: "Charged to the evaluation owner (teacher/institute) for each student repo scored; refunded if the run fails.",
    },
];

/** A sellable credit bundle, defined by the admin. */
export interface CreditPack {
    id: string;
    name: string;
    credits: number;
    /** Extra credits on top (marketing: "1000 + 200 bonus"). */
    bonusCredits: number;
    priceINR: number;
    /** Strikethrough price for the pricing card. */
    compareAtINR: number | null;
    /** e.g. "Most Popular". */
    badge: string | null;
    active: boolean;
    sortOrder: number;
}

export interface AiCreditsConfig {
    /** Master switch. false = nothing is charged anywhere. */
    enabled: boolean;
    /** Credits per unit, per task. 0 = that task is free. */
    rates: Record<AiCreditTask, number>;
    /** Credits granted once when a user's wallet is first created. */
    welcomeCredits: number;
    packs: CreditPack[];
    updatedAt: Date;
    updatedBy: string | null;
}

export const DEFAULT_AI_CREDIT_RATES: Record<AiCreditTask, number> = {
    ai_interview: 25,
    ai_question_generation: 1,
    project_evaluation: 10,
};

export const DEFAULT_AI_CREDITS_CONFIG: AiCreditsConfig = {
    enabled: false,
    rates: DEFAULT_AI_CREDIT_RATES,
    welcomeCredits: 0,
    packs: [],
    updatedAt: new Date(0),
    updatedBy: null,
};

/** Safe subset of the config exposed to the (public) buy page. */
export interface AiCreditsPublicView {
    enabled: boolean;
    rates: Record<AiCreditTask, number>;
    /** Active packs only, sorted for display. */
    packs: CreditPack[];
}

/** `creditWallets/{userId}` — one wallet per account, any role. */
export interface CreditWallet {
    id: string;
    userId: string;
    balance: number;
    lifetimePurchased: number;
    lifetimeSpent: number;
    lifetimeGranted: number;
    createdAt: Date;
    updatedAt: Date;
}

export type CreditTransactionType =
    | "purchase" // pack bought (amount > 0)
    | "debit" // AI task charged (amount < 0)
    | "refund" // failed/cancelled task returned (amount > 0)
    | "grant" // admin gave credits (amount > 0) — includes welcome credits
    | "revoke"; // admin took credits back (amount < 0)

/** `creditTransactions/{id}` — append-only ledger, server/admin writes only. */
export interface CreditTransaction {
    id: string;
    userId: string;
    type: CreditTransactionType;
    /** Which AI task, for debit/refund rows. */
    task: AiCreditTask | null;
    /** Signed credit delta: positive = into wallet, negative = out. */
    amount: number;
    balanceAfter: number;
    /** Correlates to the thing paid for: orderId / sessionId / submissionId. */
    ref: string | null;
    note: string | null;
    /** Admin uid for grant/revoke rows. */
    actorId: string | null;
    createdAt: Date;
}

/** `creditOrders/{id}` — a Razorpay purchase of one pack. */
export interface CreditOrder {
    id: string;
    userId: string;
    packId: string;
    packName: string;
    /** Total credits the pack delivers (credits + bonus), snapshot at order time. */
    credits: number;
    amountINR: number;
    razorpayOrderId: string;
    status: "pending" | "paid";
    paymentId: string | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
