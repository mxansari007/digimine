"use client";

/**
 * AI Credits — the admin owns the whole credit economy from this page:
 *   • master switch (off = nothing is charged anywhere),
 *   • per-task rates (0 = that task is free),
 *   • welcome credits for new wallets,
 *   • sellable packs (the /credits buy page reads these),
 *   • manual grant/revoke for any user,
 *   • a live view of recent credit activity.
 *
 * Config is `appConfig/aiCredits` (client SDK, admin-writable by rules);
 * grants/ledger go through the web app's /api/admin/credits route.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, InfoTip } from "@digimine/ui";
import { X } from "lucide-react";
import {
    AI_CREDIT_TASK_META,
    type AiCreditsConfig,
    type CreditPack,
} from "@digimine/types";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { authedFetch } from "@/lib/api";
import { getAiCreditsConfig, saveAiCreditsConfig } from "@/lib/firestore/credits";

type LedgerRow = {
    id: string;
    userId: string;
    type: string;
    task: string | null;
    amount: number;
    balanceAfter: number;
    note: string | null;
    actorId: string | null;
    createdAt: string | null;
};

type UserLookup = {
    userId: string;
    wallet: {
        balance: number;
        lifetimePurchased: number;
        lifetimeSpent: number;
        lifetimeGranted: number;
    } | null;
    transactions: LedgerRow[];
};

function newPack(): CreditPack {
    return {
        id: `pack-${Date.now().toString(36)}`,
        name: "",
        credits: 100,
        bonusCredits: 0,
        priceINR: 99,
        compareAtINR: null,
        badge: null,
        active: true,
        sortOrder: 0,
    };
}

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function AiCreditsPage() {
    const { firebaseUser } = useAdminAuth();
    const [config, setConfig] = useState<AiCreditsConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // Grant form
    const [grantTarget, setGrantTarget] = useState("");
    const [grantAmount, setGrantAmount] = useState("");
    const [grantNote, setGrantNote] = useState("");
    const [granting, setGranting] = useState(false);
    const [grantError, setGrantError] = useState<string | null>(null);
    const [lookup, setLookup] = useState<UserLookup | null>(null);
    const [lookingUp, setLookingUp] = useState(false);

    // Platform-wide recent ledger
    const [recent, setRecent] = useState<LedgerRow[]>([]);

    const flash = (m: string) => {
        setMsg(m);
        setTimeout(() => setMsg(null), 3500);
    };

    const load = useCallback(async () => {
        try {
            const cfg = await getAiCreditsConfig();
            setConfig(cfg);
            const res = await authedFetch("/api/admin/credits");
            if (res.ok) {
                const data = await res.json();
                setRecent(data.transactions || []);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const save = async () => {
        if (!config || !firebaseUser) return;
        setSaving(true);
        try {
            await saveAiCreditsConfig(config, firebaseUser.uid);
            flash("Credit settings saved.");
        } finally {
            setSaving(false);
        }
    };

    const isEmail = (s: string) => s.includes("@");

    const handleLookup = async () => {
        const target = grantTarget.trim();
        if (!target) return;
        setLookingUp(true);
        setGrantError(null);
        setLookup(null);
        try {
            const qs = isEmail(target) ? `email=${encodeURIComponent(target)}` : `userId=${encodeURIComponent(target)}`;
            const res = await authedFetch(`/api/admin/credits?${qs}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Lookup failed");
            setLookup(data);
        } catch (e: any) {
            setGrantError(e.message || "Lookup failed");
        } finally {
            setLookingUp(false);
        }
    };

    const handleGrant = async () => {
        const target = grantTarget.trim();
        const amount = Math.trunc(Number(grantAmount));
        if (!target || !Number.isFinite(amount) || amount === 0) {
            setGrantError("Enter a user (email or uid) and a non-zero amount.");
            return;
        }
        setGranting(true);
        setGrantError(null);
        try {
            const res = await authedFetch("/api/admin/credits", {
                method: "POST",
                body: JSON.stringify({
                    ...(isEmail(target) ? { email: target } : { userId: target }),
                    amount,
                    note: grantNote.trim() || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Grant failed");
            flash(`${amount > 0 ? "Granted" : "Revoked"} ${Math.abs(amount)} credits — new balance ${data.balance}.`);
            setGrantAmount("");
            setGrantNote("");
            await Promise.all([handleLookup(), load()]);
        } catch (e: any) {
            setGrantError(e.message || "Grant failed");
        } finally {
            setGranting(false);
        }
    };

    const updatePack = (index: number, patch: Partial<CreditPack>) => {
        setConfig((c) =>
            c
                ? {
                      ...c,
                      packs: c.packs.map((p, i) => (i === index ? { ...p, ...patch } : p)),
                  }
                : c
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    const inputCls =
        "mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100";

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">AI Credits</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Meter the platform&apos;s AI features with a credit wallet. You set the rates, design the
                    packs students/teachers/institutes buy, and can grant credits manually.
                </p>
            </div>

            {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

            {/* ── Master switch ── */}
            <Card className={`p-6 ${config?.enabled ? "border-primary-200 bg-primary-50/30" : "border-emerald-300 bg-emerald-50/40"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                            Credit system
                            <InfoTip label="What the credit system does">
                                The master switch for AI metering. When <strong>ON</strong>, every AI task
                                with a non-zero rate debits the user&apos;s wallet (and rejects when the
                                balance can&apos;t cover it). When <strong>OFF</strong>, no credits are
                                charged anywhere and AI features behave exactly as before — plan feature
                                flags and quotas still apply either way.
                            </InfoTip>
                        </h2>
                        <p className="mt-1 max-w-xl text-sm text-slate-600">
                            {config?.enabled ? (
                                <>Metering is <strong>ON</strong> — AI tasks charge the rates below.</>
                            ) : (
                                <>Metering is <strong>OFF</strong> — AI tasks are free (plan limits still apply). Set rates and packs first, then flip this on.</>
                            )}
                        </p>
                    </div>
                    <label className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-700">Charge credits</span>
                        <button
                            type="button"
                            onClick={() => setConfig((c) => (c ? { ...c, enabled: !c.enabled } : c))}
                            className={`relative h-7 w-12 rounded-full transition-colors ${config?.enabled ? "bg-primary-600" : "bg-slate-300"}`}
                        >
                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${config?.enabled ? "left-6" : "left-1"}`} />
                        </button>
                    </label>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Welcome credits
                            <InfoTip label="Welcome credits">
                                Granted once, automatically, the first time a user&apos;s wallet is touched
                                (first AI task or first visit to the buy page). 0 = no free starter credits.
                            </InfoTip>
                        </span>
                        <input
                            type="number"
                            min={0}
                            className={inputCls}
                            value={config?.welcomeCredits ?? 0}
                            onChange={(e) =>
                                setConfig((c) =>
                                    c ? { ...c, welcomeCredits: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : c
                                )
                            }
                        />
                    </label>
                </div>
            </Card>

            {/* ── Rates ── */}
            <Card className="p-6">
                <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                    Credit rates
                    <InfoTip label="Credit rates">
                        How many credits each AI task costs. Set a task to <strong>0</strong> to make it
                        free while still metering the others. Changes apply to NEW tasks immediately;
                        already-charged work is refunded at the amount originally paid.
                    </InfoTip>
                </h2>
                <div className="mt-4 space-y-4">
                    {AI_CREDIT_TASK_META.map((task) => (
                        <div key={task.key} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-100 p-4">
                            <div className="min-w-0">
                                <div className="font-medium text-slate-900">{task.label}</div>
                                <div className="mt-0.5 text-sm text-slate-500">{task.blurb}</div>
                            </div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                    value={config?.rates[task.key] ?? 0}
                                    onChange={(e) =>
                                        setConfig((c) =>
                                            c
                                                ? {
                                                      ...c,
                                                      rates: {
                                                          ...c.rates,
                                                          [task.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                                      },
                                                  }
                                                : c
                                        )
                                    }
                                />
                                <span className="text-xs text-slate-500">credits {task.unit}</span>
                            </label>
                        </div>
                    ))}
                </div>
            </Card>

            {/* ── Packs ── */}
            <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                        Credit packs
                        <InfoTip label="Credit packs">
                            The bundles users can buy on the <span className="font-mono">/credits</span> page
                            (Razorpay). Price and credits are locked into the order at purchase time, so
                            editing a pack never affects already-paid orders. Untick &quot;On sale&quot; to
                            retire a pack without deleting it.
                        </InfoTip>
                    </h2>
                    <Button
                        variant="secondary"
                        onClick={() => setConfig((c) => (c ? { ...c, packs: [...c.packs, newPack()] } : c))}
                    >
                        Add pack
                    </Button>
                </div>
                {config && config.packs.length === 0 && (
                    <p className="mt-4 text-sm text-slate-500">
                        No packs yet — add at least one before enabling the system, or users will have no
                        way to top up.
                    </p>
                )}
                <div className="mt-4 space-y-4">
                    {config?.packs.map((pack, i) => (
                        <div key={pack.id} className="rounded-lg border border-slate-100 p-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                                <label className="block lg:col-span-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
                                    <input
                                        className={inputCls}
                                        value={pack.name}
                                        placeholder="Starter pack"
                                        onChange={(e) => updatePack(i, { name: e.target.value })}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credits</span>
                                    <input
                                        type="number"
                                        min={1}
                                        className={inputCls}
                                        value={pack.credits}
                                        onChange={(e) => updatePack(i, { credits: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bonus</span>
                                    <input
                                        type="number"
                                        min={0}
                                        className={inputCls}
                                        value={pack.bonusCredits}
                                        onChange={(e) => updatePack(i, { bonusCredits: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price ₹</span>
                                    <input
                                        type="number"
                                        min={1}
                                        className={inputCls}
                                        value={pack.priceINR}
                                        onChange={(e) => updatePack(i, { priceINR: Math.max(1, Number(e.target.value) || 1) })}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compare ₹</span>
                                    <input
                                        type="number"
                                        min={0}
                                        className={inputCls}
                                        value={pack.compareAtINR ?? ""}
                                        placeholder="—"
                                        onChange={(e) => {
                                            const v = e.target.value === "" ? null : Number(e.target.value);
                                            updatePack(i, { compareAtINR: v && v > 0 ? v : null });
                                        }}
                                    />
                                </label>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-4">
                                    <label className="flex items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Badge</span>
                                        <input
                                            className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                                            value={pack.badge ?? ""}
                                            placeholder="Most Popular"
                                            onChange={(e) => updatePack(i, { badge: e.target.value || null })}
                                        />
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={pack.active}
                                            onChange={(e) => updatePack(i, { active: e.target.checked })}
                                        />
                                        On sale
                                    </label>
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700"
                                    onClick={() =>
                                        setConfig((c) =>
                                            c ? { ...c, packs: c.packs.filter((_, idx) => idx !== i) } : c
                                        )
                                    }
                                >
                                    <X className="h-4 w-4" /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5">
                    <Button variant="primary" onClick={save} isLoading={saving}>
                        Save credit settings
                    </Button>
                </div>
            </Card>

            {/* ── Grant / inspect ── */}
            <Card className="p-6">
                <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                    Grant or revoke credits
                    <InfoTip label="Manual grants">
                        Top up any account (student, teacher or institute admin) by email or uid — e.g.
                        goodwill credits, offline payments, or refunds. Use a <strong>negative</strong>{" "}
                        amount to revoke; a revoke never takes the balance below 0. Every grant is recorded
                        in the ledger with your admin id.
                    </InfoTip>
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block lg:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">User email or uid</span>
                        <input
                            className={inputCls}
                            value={grantTarget}
                            placeholder="student@example.com"
                            onChange={(e) => setGrantTarget(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount (− to revoke)</span>
                        <input
                            type="number"
                            className={inputCls}
                            value={grantAmount}
                            placeholder="100"
                            onChange={(e) => setGrantAmount(e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</span>
                        <input
                            className={inputCls}
                            value={grantNote}
                            placeholder="Offline payment"
                            onChange={(e) => setGrantNote(e.target.value)}
                        />
                    </label>
                </div>
                {grantError && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {grantError}
                    </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="primary" onClick={handleGrant} isLoading={granting}>
                        Apply
                    </Button>
                    <Button variant="secondary" onClick={handleLookup} isLoading={lookingUp}>
                        Look up wallet
                    </Button>
                </div>

                {lookup && (
                    <div className="mt-5 rounded-lg border border-slate-100 p-4">
                        <div className="flex flex-wrap items-center gap-6 text-sm">
                            <span className="font-mono text-xs text-slate-500">{lookup.userId}</span>
                            <span>
                                Balance: <strong className="font-mono">{lookup.wallet?.balance ?? 0}</strong>
                            </span>
                            <span className="text-slate-500">
                                purchased {lookup.wallet?.lifetimePurchased ?? 0} · spent {lookup.wallet?.lifetimeSpent ?? 0} · granted {lookup.wallet?.lifetimeGranted ?? 0}
                            </span>
                        </div>
                        {lookup.transactions.length > 0 && (
                            <ul className="mt-3 divide-y divide-slate-100 text-sm">
                                {lookup.transactions.slice(0, 10).map((t) => (
                                    <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                                        <span className="min-w-0 truncate text-slate-700">
                                            {t.type}
                                            {t.task ? ` · ${t.task}` : ""}
                                            {t.note ? ` — ${t.note}` : ""}
                                        </span>
                                        <span className="flex-shrink-0 text-xs text-slate-400">{formatWhen(t.createdAt)}</span>
                                        <span className={`w-16 flex-shrink-0 text-right font-mono font-semibold ${t.amount > 0 ? "text-emerald-600" : "text-slate-900"}`}>
                                            {t.amount > 0 ? "+" : ""}{t.amount}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </Card>

            {/* ── Recent activity ── */}
            <Card className="p-6">
                <h2 className="text-lg font-semibold text-slate-900">Recent credit activity</h2>
                {recent.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No credit transactions yet.</p>
                ) : (
                    <ul className="mt-3 divide-y divide-slate-100 text-sm">
                        {recent.map((t) => (
                            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                                <span className="w-44 flex-shrink-0 truncate font-mono text-xs text-slate-500">{t.userId}</span>
                                <span className="min-w-0 flex-1 truncate text-slate-700">
                                    {t.type}
                                    {t.task ? ` · ${t.task}` : ""}
                                    {t.note ? ` — ${t.note}` : ""}
                                </span>
                                <span className="flex-shrink-0 text-xs text-slate-400">{formatWhen(t.createdAt)}</span>
                                <span className={`w-16 flex-shrink-0 text-right font-mono font-semibold ${t.amount > 0 ? "text-emerald-600" : "text-slate-900"}`}>
                                    {t.amount > 0 ? "+" : ""}{t.amount}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
