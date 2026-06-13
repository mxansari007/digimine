"use client";

/**
 * AI credits — balance, buy packs, history. One wallet per account, so
 * the same page serves students, teachers and institute admins. Packs
 * and per-task rates are admin-defined (`appConfig/aiCredits`) and read
 * through /api/credits/config; purchases reuse the platform's Razorpay
 * flow (create-order → checkout → verify).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditsContext";
import { userHomePath } from "@/lib/auth/redirects";
import { CheckIcon, ClockIcon } from "@/components/icons/AppIcons";
import { AI_CREDIT_TASK_META } from "@digimine/types";
import type { AiCreditsPublicView, AiCreditTask, CreditTransactionType } from "@digimine/types";

declare global {
    interface Window {
        Razorpay: any;
    }
}

type LedgerRow = {
    id: string;
    type: CreditTransactionType;
    task: AiCreditTask | null;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string | null;
};

type WalletView = {
    balance: number;
    lifetimePurchased: number;
    lifetimeSpent: number;
    transactions: LedgerRow[];
};

const TXN_LABEL: Record<CreditTransactionType, string> = {
    purchase: "Pack purchased",
    debit: "Used",
    refund: "Refunded",
    grant: "Granted",
    revoke: "Revoked",
};

function taskLabel(task: AiCreditTask | null): string | null {
    const meta = AI_CREDIT_TASK_META.find((t) => t.key === task);
    return meta?.label ?? null;
}

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function CreditsPage() {
    const router = useRouter();
    const toast = useToast();
    const { user, firebaseUser, loading: authLoading, portals } = useAuthContext();
    const { refresh: refreshCreditsHeader } = useCredits();

    // Role-aware "back" target: the user's primary dashboard (portals are
    // sorted primary-first), falling back to the role's home. Mirrors the
    // avatar menu so a teacher/institute admin lands on the right portal.
    const backHref = portals[0]?.href ?? (user ? userHomePath(user) : "/dashboard");
    const backLabel = portals[0]?.label ? `${portals[0].label} dashboard` : "dashboard";

    const [config, setConfig] = useState<AiCreditsPublicView | null>(null);
    const [wallet, setWallet] = useState<WalletView | null>(null);
    const [loading, setLoading] = useState(true);
    const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
    const [razorpayReady, setRazorpayReady] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    const loadAll = useCallback(async () => {
        try {
            setLoading(true);
            const token = firebaseUser ? await firebaseUser.getIdToken() : null;
            const [cfgRes, walletRes] = await Promise.all([
                fetch("/api/credits/config"),
                token
                    ? fetch("/api/credits/wallet", {
                          headers: { Authorization: `Bearer ${token}` },
                      })
                    : Promise.resolve(null),
            ]);
            if (cfgRes.ok) setConfig(await cfgRes.json());
            if (walletRes?.ok) setWallet(await walletRes.json());
        } catch (error) {
            console.error("Error loading credits:", error);
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push("/login?redirect=/credits");
            return;
        }
        loadAll();
    }, [user, authLoading, loadAll, router]);

    useEffect(() => {
        if (typeof window !== "undefined" && typeof window.Razorpay === "function") {
            setRazorpayReady(true);
        }
    }, []);

    const handleBuy = async (packId: string) => {
        if (!user || buyingPackId) return;
        setPaymentError(null);

        if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
            setPaymentError("Payment gateway key is not configured. Please contact support.");
            return;
        }
        if (!razorpayReady || typeof window.Razorpay !== "function") {
            setPaymentError("Payment gateway is still loading. Please wait a moment and try again.");
            return;
        }

        setBuyingPackId(packId);
        try {
            const token = firebaseUser ? await firebaseUser.getIdToken() : null;
            if (!token) {
                setPaymentError("You're signed out. Sign in again and retry.");
                setBuyingPackId(null);
                return;
            }
            const response = await fetch("/api/credits/create-order", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ packId }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to create order");

            const rzp = new window.Razorpay({
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: data.amount,
                currency: data.currency,
                name: "PlacementRanker",
                description: `AI Credits — ${data.credits} credits`,
                order_id: data.razorpayOrderId,
                handler: async (rzpResponse: any) => {
                    try {
                        const verifyToken = firebaseUser ? await firebaseUser.getIdToken() : null;
                        const verifyResponse = await fetch("/api/credits/verify-payment", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                ...(verifyToken ? { Authorization: `Bearer ${verifyToken}` } : {}),
                            },
                            body: JSON.stringify({
                                razorpay_payment_id: rzpResponse.razorpay_payment_id,
                                razorpay_order_id: rzpResponse.razorpay_order_id,
                                razorpay_signature: rzpResponse.razorpay_signature,
                                orderId: data.orderId,
                            }),
                        });
                        const verifyData = await verifyResponse.json();
                        if (!verifyResponse.ok) {
                            throw new Error(verifyData.error || "Payment verification failed");
                        }
                        toast.success(`${verifyData.credited ?? data.credits} credits added to your wallet.`);
                        await loadAll();
                        // Keep the shared header pill / sidebar balance in sync.
                        await refreshCreditsHeader();
                    } catch (error) {
                        console.error("Payment verification error:", error);
                        toast.error("Payment verification failed", {
                            description: "Please contact support — your payment reference is safe.",
                        });
                    } finally {
                        setBuyingPackId(null);
                    }
                },
                prefill: { email: user.email },
                theme: { color: "#14B8A6" },
                modal: {
                    ondismiss: () => {
                        setPaymentError("Payment was cancelled. You can try again whenever you're ready.");
                        setBuyingPackId(null);
                    },
                    confirm_close: true,
                },
            });
            rzp.on("payment.failed", (resp: any) => {
                setPaymentError(resp.error?.description || "Payment failed. Please try again.");
                setBuyingPackId(null);
            });
            rzp.open();
        } catch (error) {
            console.error("Credit purchase error:", error);
            setPaymentError(error instanceof Error ? error.message : "Failed to start purchase");
            setBuyingPackId(null);
        }
    };

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    const packs = config?.packs ?? [];
    const meteredTasks = AI_CREDIT_TASK_META.filter(
        (t) => (config?.rates?.[t.key] ?? 0) > 0
    );

    return (
        <div className="min-h-screen bg-background py-12">
            <Script
                src="https://checkout.razorpay.com/v1/checkout.js"
                strategy="lazyOnload"
                onLoad={() => setRazorpayReady(typeof window.Razorpay === "function")}
                onReady={() => setRazorpayReady(typeof window.Razorpay === "function")}
                onError={() => setPaymentError("Payment gateway could not be loaded. Please refresh.")}
            />
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
                <Link
                    href={backHref}
                    className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-primary-700 dark:hover:text-primary-300"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to {backLabel}
                </Link>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
                    AI Credits
                </p>
                <h1 className="mt-2 font-display text-2xl font-bold text-gray-900 sm:text-3xl">
                    Your credit wallet
                </h1>
                <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
                    Credits power the platform&apos;s AI features — mock interviews, question
                    generation and project evaluations. Buy once, spend across any AI task.
                </p>

                {/* Balance */}
                <Card padding="lg" className="mt-8">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                Available balance
                            </div>
                            <div className="mt-1 font-display text-4xl font-bold text-gray-900">
                                {wallet?.balance ?? 0}
                                <span className="ml-2 text-base font-semibold text-slate-400">credits</span>
                            </div>
                        </div>
                        <div className="flex gap-8 text-sm">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Purchased</div>
                                <div className="mt-1 font-mono text-lg font-semibold text-gray-900">{wallet?.lifetimePurchased ?? 0}</div>
                            </div>
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Spent</div>
                                <div className="mt-1 font-mono text-lg font-semibold text-gray-900">{wallet?.lifetimeSpent ?? 0}</div>
                            </div>
                        </div>
                    </div>
                </Card>

                {paymentError && (
                    <Card intent="danger" padding="md" className="mt-4 text-sm text-danger-700 dark:text-danger-300">
                        {paymentError}
                    </Card>
                )}

                {/* Packs */}
                <div className="mt-10">
                    <h2 className="font-display text-xl font-bold text-gray-900">Buy credits</h2>
                    {!config?.enabled ? (
                        <Card padding="xl" className="mt-4 text-center text-slate-500">
                            Credit purchases aren&apos;t open yet. All AI features currently run
                            without credits.
                        </Card>
                    ) : packs.length === 0 ? (
                        <Card padding="xl" className="mt-4 text-center text-slate-500">
                            No credit packs are on sale right now. Check back soon.
                        </Card>
                    ) : (
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {packs.map((pack) => (
                                <Card key={pack.id} padding="lg" className="relative flex flex-col">
                                    {pack.badge && (
                                        <span className="absolute -top-2.5 right-4 rounded-full bg-primary-600 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-soft-sm">
                                            {pack.badge}
                                        </span>
                                    )}
                                    <h3 className="font-display text-base font-semibold text-gray-900">{pack.name}</h3>
                                    <div className="mt-3 font-display text-3xl font-bold text-gray-900">
                                        {pack.credits}
                                        <span className="ml-1.5 text-sm font-semibold text-slate-400">credits</span>
                                    </div>
                                    {pack.bonusCredits > 0 && (
                                        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-500/25">
                                            +{pack.bonusCredits} bonus credits
                                        </span>
                                    )}
                                    <div className="mt-4 flex items-baseline gap-2">
                                        <span className="font-display text-2xl font-bold text-gray-900">₹{pack.priceINR}</span>
                                        {pack.compareAtINR && (
                                            <span className="text-sm text-slate-400 line-through">₹{pack.compareAtINR}</span>
                                        )}
                                    </div>
                                    <Button
                                        className="mt-5"
                                        fullWidth
                                        disabled={!!buyingPackId || !razorpayReady}
                                        onClick={() => handleBuy(pack.id)}
                                    >
                                        {buyingPackId === pack.id ? "Processing…" : "Buy Pack"}
                                    </Button>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Rates */}
                {config?.enabled && meteredTasks.length > 0 && (
                    <div className="mt-10">
                        <h2 className="font-display text-xl font-bold text-gray-900">What credits pay for</h2>
                        <Card padding="lg" className="mt-4">
                            <ul className="divide-y divide-slate-100 dark:divide-slate-500/15">
                                {meteredTasks.map((task) => (
                                    <li key={task.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                                        <div>
                                            <div className="font-medium text-gray-900">{task.label}</div>
                                            <div className="text-sm text-slate-500">{task.blurb}</div>
                                        </div>
                                        <span className="flex-shrink-0 font-mono text-sm font-semibold text-primary-700 dark:text-primary-300">
                                            {config.rates[task.key]} {task.unit}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </div>
                )}

                {/* History */}
                <div className="mt-10">
                    <h2 className="font-display text-xl font-bold text-gray-900">Recent activity</h2>
                    <Card padding="none" className="mt-4 overflow-hidden">
                        {!wallet || wallet.transactions.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                No credit activity yet.
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-500/15">
                                {wallet.transactions.map((txn) => {
                                    const positive = txn.amount > 0;
                                    return (
                                        <li key={txn.id} className="flex items-center gap-4 px-5 py-3.5">
                                            <span
                                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                                                    positive
                                                        ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-300"
                                                        : "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400"
                                                }`}
                                            >
                                                {positive ? <CheckIcon className="h-4 w-4" /> : <ClockIcon className="h-4 w-4" />}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-gray-900">
                                                    {TXN_LABEL[txn.type] || txn.type}
                                                    {taskLabel(txn.task) ? ` · ${taskLabel(txn.task)}` : ""}
                                                    {txn.note ? ` — ${txn.note}` : ""}
                                                </div>
                                                <div className="text-xs text-slate-500">{formatWhen(txn.createdAt)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-mono text-sm font-bold ${positive ? "text-success-600 dark:text-success-400" : "text-gray-900"}`}>
                                                    {positive ? "+" : ""}{txn.amount}
                                                </div>
                                                <div className="text-xs text-slate-400">bal {txn.balanceAfter}</div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
