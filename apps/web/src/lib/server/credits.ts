/**
 * AI credit wallet — the metering layer for AI tasks.
 *
 * Config lives at `appConfig/aiCredits` (admin-owned). Wallets live at
 * `creditWallets/{userId}` with an append-only `creditTransactions`
 * ledger. All mutations run in Firestore transactions so two parallel
 * AI requests can never overdraw a wallet, mirroring `reserveAiTaskUsage`.
 *
 * Charging contract (same shape across all AI routes):
 *   1. `chargeCredits()` BEFORE the expensive AI work. It returns
 *      `{ ok: true, charged: 0 }` when the system is disabled or the
 *      task's rate is 0, so callers never need to special-case those.
 *   2. If the AI work fails after a successful charge, `refundCredits()`
 *      with the exact `charged` amount from step 1.
 *   3. On insufficient balance, respond with
 *      `insufficientCreditsResponse(result)` — a 402 the clients map to
 *      a "buy credits" nudge.
 */
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type {
    AiCreditsConfig,
    AiCreditsPublicView,
    AiCreditTask,
    CreditPack,
    CreditTransactionType,
    CreditWallet,
} from "@digimine/types";
import { DEFAULT_AI_CREDITS_CONFIG, DEFAULT_AI_CREDIT_RATES } from "@digimine/types";

export const CREDIT_WALLETS = "creditWallets";
export const CREDIT_TRANSACTIONS = "creditTransactions";
export const CREDIT_ORDERS = "creditOrders";

function sanitizePack(raw: unknown, index: number): CreditPack | null {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    const credits = typeof p.credits === "number" ? Math.floor(p.credits) : 0;
    const priceINR = typeof p.priceINR === "number" ? p.priceINR : 0;
    if (credits <= 0 || priceINR <= 0) return null;
    return {
        id: typeof p.id === "string" && p.id ? p.id : `pack-${index}`,
        name: typeof p.name === "string" && p.name ? p.name : `${credits} credits`,
        credits,
        bonusCredits:
            typeof p.bonusCredits === "number" && p.bonusCredits > 0
                ? Math.floor(p.bonusCredits)
                : 0,
        priceINR,
        compareAtINR:
            typeof p.compareAtINR === "number" && p.compareAtINR > priceINR
                ? p.compareAtINR
                : null,
        badge: typeof p.badge === "string" && p.badge ? p.badge : null,
        active: p.active !== false,
        sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : index,
    };
}

export async function getAiCreditsConfig(): Promise<AiCreditsConfig> {
    const snap = await adminDb.collection("appConfig").doc("aiCredits").get();
    if (!snap.exists) return DEFAULT_AI_CREDITS_CONFIG;
    const d = snap.data() || {};
    const rawRates = (d.rates || {}) as Record<string, unknown>;
    const rates = { ...DEFAULT_AI_CREDIT_RATES };
    for (const key of Object.keys(rates) as AiCreditTask[]) {
        const v = rawRates[key];
        if (typeof v === "number" && v >= 0) rates[key] = Math.floor(v);
    }
    const packs = Array.isArray(d.packs)
        ? (d.packs.map(sanitizePack).filter(Boolean) as CreditPack[])
        : [];
    return {
        enabled: Boolean(d.enabled),
        rates,
        welcomeCredits:
            typeof d.welcomeCredits === "number" && d.welcomeCredits > 0
                ? Math.floor(d.welcomeCredits)
                : 0,
        packs,
        updatedAt:
            d.updatedAt?.toDate?.() instanceof Date ? d.updatedAt.toDate() : new Date(0),
        updatedBy: d.updatedBy ?? null,
    };
}

export function toCreditsPublicView(cfg: AiCreditsConfig): AiCreditsPublicView {
    return {
        enabled: cfg.enabled,
        rates: cfg.rates,
        packs: cfg.packs
            .filter((p) => p.active)
            .sort((a, b) => a.sortOrder - b.sortOrder),
    };
}

// ─────────────────────────────────────────────────────────────────────
// Wallet primitives
// ─────────────────────────────────────────────────────────────────────

type TxnInput = {
    userId: string;
    type: CreditTransactionType;
    task: AiCreditTask | null;
    amount: number;
    balanceAfter: number;
    ref: string | null;
    note: string | null;
    actorId: string | null;
};

/** Append a ledger row inside an open transaction. */
function writeLedger(tx: FirebaseFirestore.Transaction, input: TxnInput): void {
    const ref = adminDb.collection(CREDIT_TRANSACTIONS).doc();
    tx.create(ref, { ...input, createdAt: Timestamp.now() });
}

type WalletShape = {
    userId: string;
    balance: number;
    lifetimePurchased: number;
    lifetimeSpent: number;
    lifetimeGranted: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
};

/**
 * Read the wallet inside a transaction, materialising it (with welcome
 * credits) on first touch. Returns the CURRENT balance and a `write`
 * callback that persists a delta + keeps lifetime counters in sync.
 */
async function readWalletTx(
    tx: FirebaseFirestore.Transaction,
    userId: string,
    welcomeCredits: number
): Promise<{ balance: number; existing: boolean; welcomeGranted: number }> {
    const ref = adminDb.collection(CREDIT_WALLETS).doc(userId);
    const snap = await tx.get(ref);
    if (snap.exists) {
        const d = snap.data() || {};
        return {
            balance: typeof d.balance === "number" ? d.balance : 0,
            existing: true,
            welcomeGranted: 0,
        };
    }
    return { balance: welcomeCredits, existing: false, welcomeGranted: welcomeCredits };
}

function walletWriteTx(
    tx: FirebaseFirestore.Transaction,
    userId: string,
    opts: {
        existing: boolean;
        newBalance: number;
        welcomeGranted: number;
        purchasedDelta?: number;
        spentDelta?: number;
        grantedDelta?: number;
    }
): void {
    const ref = adminDb.collection(CREDIT_WALLETS).doc(userId);
    const now = Timestamp.now();
    if (opts.existing) {
        const update: Record<string, unknown> = {
            balance: opts.newBalance,
            updatedAt: now,
        };
        if (opts.purchasedDelta) {
            update.lifetimePurchased = FieldValueIncrement(opts.purchasedDelta);
        }
        if (opts.spentDelta) {
            update.lifetimeSpent = FieldValueIncrement(opts.spentDelta);
        }
        if (opts.grantedDelta) {
            update.lifetimeGranted = FieldValueIncrement(opts.grantedDelta);
        }
        tx.update(ref, update);
    } else {
        const wallet: WalletShape = {
            userId,
            balance: opts.newBalance,
            lifetimePurchased: opts.purchasedDelta || 0,
            lifetimeSpent: opts.spentDelta || 0,
            lifetimeGranted: (opts.grantedDelta || 0) + opts.welcomeGranted,
            createdAt: now,
            updatedAt: now,
        };
        tx.create(ref, wallet);
        if (opts.welcomeGranted > 0) {
            writeLedger(tx, {
                userId,
                type: "grant",
                task: null,
                amount: opts.welcomeGranted,
                // Welcome credits land before the operation's own delta is
                // applied, so their balanceAfter is just the grant itself.
                balanceAfter: opts.welcomeGranted,
                ref: null,
                note: "Welcome credits",
                actorId: null,
            });
        }
    }
}

function FieldValueIncrement(n: number) {
    return FieldValue.increment(n);
}

/** Read a wallet outside a transaction (display only — never for charging). */
export async function getWallet(userId: string): Promise<CreditWallet | null> {
    const snap = await adminDb.collection(CREDIT_WALLETS).doc(userId).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return {
        id: snap.id,
        userId,
        balance: typeof d.balance === "number" ? d.balance : 0,
        lifetimePurchased: d.lifetimePurchased || 0,
        lifetimeSpent: d.lifetimeSpent || 0,
        lifetimeGranted: d.lifetimeGranted || 0,
        createdAt: d.createdAt?.toDate?.() || new Date(0),
        updatedAt: d.updatedAt?.toDate?.() || new Date(0),
    };
}

// ─────────────────────────────────────────────────────────────────────
// Charge / refund / credit
// ─────────────────────────────────────────────────────────────────────

export type ChargeResult =
    | { ok: true; charged: number; balance: number }
    | { ok: false; reason: "insufficient"; needed: number; balance: number };

/**
 * Atomically debit `rate × units` credits for an AI task. Resolves the
 * config itself unless one is passed (routes that already loaded it can
 * avoid the extra read). No-ops (ok, charged 0) when the credit system
 * is disabled or the task is free.
 */
export async function chargeCredits(opts: {
    userId: string;
    task: AiCreditTask;
    units?: number;
    ref?: string | null;
    note?: string | null;
    config?: AiCreditsConfig;
}): Promise<ChargeResult> {
    const cfg = opts.config ?? (await getAiCreditsConfig());
    const units = Math.max(1, Math.floor(opts.units ?? 1));
    const cost = cfg.enabled ? (cfg.rates[opts.task] || 0) * units : 0;
    if (cost <= 0) {
        return { ok: true, charged: 0, balance: -1 };
    }
    return adminDb.runTransaction(async (tx) => {
        const wallet = await readWalletTx(tx, opts.userId, cfg.welcomeCredits);
        if (wallet.balance < cost) {
            return {
                ok: false as const,
                reason: "insufficient" as const,
                needed: cost,
                balance: Math.max(0, wallet.balance),
            };
        }
        const newBalance = wallet.balance - cost;
        walletWriteTx(tx, opts.userId, {
            existing: wallet.existing,
            newBalance,
            welcomeGranted: wallet.welcomeGranted,
            spentDelta: cost,
        });
        writeLedger(tx, {
            userId: opts.userId,
            type: "debit",
            task: opts.task,
            amount: -cost,
            balanceAfter: newBalance,
            ref: opts.ref ?? null,
            note: opts.note ?? null,
            actorId: null,
        });
        return { ok: true as const, charged: cost, balance: newBalance };
    });
}

/**
 * Return previously-charged credits (failed/cancelled task). Pass the
 * exact `charged` amount from the original ChargeResult — never recompute
 * from current rates, which may have changed. Safe to call with 0.
 */
export async function refundCredits(opts: {
    userId: string;
    task: AiCreditTask;
    amount: number;
    ref?: string | null;
    note?: string | null;
}): Promise<void> {
    const amount = Math.floor(opts.amount);
    if (amount <= 0) return;
    try {
        await adminDb.runTransaction(async (tx) => {
            const wallet = await readWalletTx(tx, opts.userId, 0);
            const newBalance = wallet.balance + amount;
            walletWriteTx(tx, opts.userId, {
                existing: wallet.existing,
                newBalance,
                welcomeGranted: 0,
                spentDelta: -amount,
            });
            writeLedger(tx, {
                userId: opts.userId,
                type: "refund",
                task: opts.task,
                amount,
                balanceAfter: newBalance,
                ref: opts.ref ?? null,
                note: opts.note ?? null,
                actorId: null,
            });
        });
    } catch (err) {
        // A failed refund must never mask the original error path — log
        // loudly for manual reconciliation instead (same policy as the
        // aiUsage quota refund).
        console.error("[credits] refund failed — manual reconcile needed", {
            userId: opts.userId,
            task: opts.task,
            amount,
            ref: opts.ref,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export type SettleOrderResult =
    | { ok: true; alreadyPaid: true }
    | { ok: true; alreadyPaid: false; credited: number; balance: number }
    | { ok: false; error: string };

/**
 * Atomically settle a verified Razorpay credit order: the pending→paid
 * transition and the wallet credit happen in ONE transaction, so a crash
 * can never leave a paid order without its credits, and a double-submitted
 * verify can only credit once. The credit amount is the snapshot taken at
 * order time — later pack edits never change what a paid order delivers.
 */
export async function settleCreditOrder(opts: {
    orderId: string;
    userId: string;
    razorpayOrderId: string;
    paymentId: string;
}): Promise<SettleOrderResult> {
    const cfg = await getAiCreditsConfig();
    const orderRef = adminDb.collection(CREDIT_ORDERS).doc(opts.orderId);
    return adminDb.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) return { ok: false as const, error: "Order not found" };
        const d = orderSnap.data() || {};
        if (d.userId !== opts.userId) return { ok: false as const, error: "Order not found" };
        if (d.razorpayOrderId !== opts.razorpayOrderId) {
            return { ok: false as const, error: "Order mismatch" };
        }
        if (d.status === "paid") {
            return { ok: true as const, alreadyPaid: true as const };
        }
        const credits = typeof d.credits === "number" ? Math.floor(d.credits) : 0;
        const wallet = await readWalletTx(tx, opts.userId, cfg.welcomeCredits);

        tx.update(orderRef, {
            status: "paid",
            paymentId: opts.paymentId,
            paidAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        const newBalance = wallet.balance + credits;
        walletWriteTx(tx, opts.userId, {
            existing: wallet.existing,
            newBalance,
            welcomeGranted: wallet.welcomeGranted,
            purchasedDelta: credits,
        });
        writeLedger(tx, {
            userId: opts.userId,
            type: "purchase",
            task: null,
            amount: credits,
            balanceAfter: newBalance,
            ref: opts.orderId,
            note: typeof d.packName === "string" ? d.packName : "Credit pack",
            actorId: null,
        });
        return { ok: true as const, alreadyPaid: false as const, credited: credits, balance: newBalance };
    });
}

/**
 * Admin grant (amount > 0) or revoke (amount < 0). A revoke clamps at 0
 * rather than overdrawing. Returns the new balance.
 */
export async function grantCredits(opts: {
    userId: string;
    amount: number;
    actorId: string;
    note?: string | null;
}): Promise<number> {
    const amount = Math.trunc(opts.amount);
    if (amount === 0) throw new Error("Amount must be non-zero");
    const cfg = await getAiCreditsConfig();
    return adminDb.runTransaction(async (tx) => {
        const wallet = await readWalletTx(tx, opts.userId, cfg.welcomeCredits);
        const newBalance = Math.max(0, wallet.balance + amount);
        const applied = newBalance - wallet.balance;
        walletWriteTx(tx, opts.userId, {
            existing: wallet.existing,
            newBalance,
            welcomeGranted: wallet.welcomeGranted,
            grantedDelta: applied > 0 ? applied : 0,
        });
        writeLedger(tx, {
            userId: opts.userId,
            type: applied >= 0 ? "grant" : "revoke",
            task: null,
            amount: applied,
            balanceAfter: newBalance,
            ref: null,
            note: opts.note ?? null,
            actorId: opts.actorId,
        });
        return newBalance;
    });
}

/** Standard 402 for AI routes when the wallet can't cover the task. */
export function insufficientCreditsResponse(
    result: Extract<ChargeResult, { ok: false }>,
    taskLabel: string
): NextResponse {
    return NextResponse.json(
        {
            error: `You need ${result.needed} credit${result.needed === 1 ? "" : "s"} for ${taskLabel} but have ${result.balance}. Buy credits to continue.`,
            code: "insufficient_credits",
            needed: result.needed,
            balance: result.balance,
            buyUrl: "/credits",
        },
        { status: 402 }
    );
}
