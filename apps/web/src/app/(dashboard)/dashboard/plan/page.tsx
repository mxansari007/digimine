"use client";

/**
 * "My Plan" — the student's active plan, the limits/allowances on it, and how
 * much of each they've used this period. Limits come from the resolved
 * entitlements (already in context); live usage comes from
 * /api/subscription/usage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Badge, InfoTip } from "@digimine/ui";
import { Check, Lock, Sparkles, Infinity as InfinityIcon, ArrowRight } from "lucide-react";
import {
    ENTITLEMENT_FEATURES,
    ENTITLEMENT_QUOTAS,
    type EntitlementQuota,
} from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

interface QuotaUsage {
    key: EntitlementQuota;
    limit: number;
    used: number;
    remaining: number;
    period: string;
}

/** Human label for the period a quota resets on. */
function periodLabel(key: EntitlementQuota): string {
    if (key === "practiceSubmissionsPerDay") return "today";
    if (key === "aiInterviewsPerWeek") return "this week";
    return "this month";
}

function resetLabel(key: EntitlementQuota): string {
    if (key === "practiceSubmissionsPerDay") return "Resets daily";
    if (key === "aiInterviewsPerWeek") return "Resets every week";
    return "Resets monthly";
}

export default function MyPlanPage() {
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const { entitlements, isPremium, ready } = useEntitlements();
    const [usage, setUsage] = useState<QuotaUsage[] | null>(null);
    const [loadingUsage, setLoadingUsage] = useState(true);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoadingUsage(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/subscription/usage");
            const data = await res.json();
            if (res.ok && Array.isArray(data.usage)) setUsage(data.usage);
        } catch {
            /* fall back to limits-only from context */
        } finally {
            setLoadingUsage(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        if (!authLoading && firebaseUser) load();
        else if (!authLoading && !firebaseUser) setLoadingUsage(false);
    }, [authLoading, firebaseUser, load]);

    const usageByKey = useMemo(() => {
        const m = new Map<string, QuotaUsage>();
        (usage || []).forEach((u) => m.set(u.key, u));
        return m;
    }, [usage]);

    const enforced = entitlements?.enforced !== false;
    const planName = !enforced
        ? "All Access"
        : entitlements?.planName || (isPremium ? "Premium" : "Free");
    const expiresAt = entitlements?.expiresAt ? new Date(entitlements.expiresAt) : null;

    if (authLoading || !ready) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">My Plan</h1>
                <p className="mt-1 text-slate-500">Your current plan, what it unlocks, and your limits.</p>
            </div>

            {/* ── Plan summary ── */}
            <Card padding="lg" elevated intent={isPremium ? "primary" : "default"}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-slate-900">{planName}</h2>
                            {!enforced ? (
                                <Badge variant="info" size="sm">Launch mode</Badge>
                            ) : isPremium ? (
                                <Badge variant="success" size="sm">
                                    <Sparkles className="h-3 w-3" aria-hidden /> Premium
                                </Badge>
                            ) : (
                                <Badge variant="secondary" size="sm">Free</Badge>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                            {!enforced
                                ? "Everything is unlocked for everyone while we're in launch mode."
                                : isPremium
                                    ? expiresAt
                                        ? `Premium is active until ${expiresAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`
                                        : "Premium is active."
                                    : "You're on the free plan — a generous taste of everything, with limits below."}
                        </p>
                    </div>
                    {enforced && !isPremium && (
                        <Link href="/membership">
                            <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                                Upgrade to Premium
                            </Button>
                        </Link>
                    )}
                    {enforced && isPremium && (
                        <Link href="/membership">
                            <Button variant="outline">Manage plan</Button>
                        </Link>
                    )}
                </div>
            </Card>

            {/* ── Limits / allowances ── */}
            <div>
                <div className="mb-3 flex items-center gap-1.5">
                    <h2 className="text-lg font-bold text-slate-900">Your limits</h2>
                    <InfoTip label="About your limits">
                        These are the allowances on your current plan. Free plans get a capped amount per
                        day/week/month; Premium lifts the caps. Counters reset automatically.
                    </InfoTip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {ENTITLEMENT_QUOTAS.map((q) => {
                        const u = usageByKey.get(q.key);
                        const limit = u ? u.limit : entitlements?.quotas?.[q.key] ?? 0;
                        const unlimited = limit < 0;
                        const used = u?.used ?? 0;
                        const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
                        const full = !unlimited && limit > 0 && used >= limit;
                        const barColor = full
                            ? "bg-rose-500"
                            : pct >= 80
                                ? "bg-amber-500"
                                : "bg-primary-500";
                        return (
                            <Card key={q.key} padding="md" className="flex flex-col gap-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                                            {q.label}
                                            <InfoTip label={q.label} side="bottom">{q.blurb}</InfoTip>
                                        </p>
                                        <p className="text-[11px] text-slate-400">{resetLabel(q.key)}</p>
                                    </div>
                                    {unlimited ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 ring-1 ring-inset ring-primary-200">
                                            <InfinityIcon className="h-3 w-3" aria-hidden /> Unlimited
                                        </span>
                                    ) : limit === 0 ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                            <Lock className="h-3 w-3" aria-hidden /> Not included
                                        </span>
                                    ) : (
                                        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                                            {loadingUsage && !u ? (
                                                <span className="text-slate-400">… / {limit}</span>
                                            ) : (
                                                <>
                                                    <span className={full ? "text-rose-600" : "text-slate-900"}>{used}</span>
                                                    <span className="text-slate-400"> / {limit}</span>
                                                </>
                                            )}
                                        </span>
                                    )}
                                </div>
                                {!unlimited && limit > 0 && (
                                    <>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                                style={{ width: `${Math.max(pct, used > 0 ? 6 : 0)}%` }}
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-500">
                                            {full
                                                ? `Limit reached — resets ${periodLabel(q.key) === "today" ? "tomorrow" : "soon"}.`
                                                : `${u?.remaining ?? limit - used} left ${periodLabel(q.key)}.`}
                                        </p>
                                    </>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* ── What's included ── */}
            <div>
                <h2 className="mb-3 text-lg font-bold text-slate-900">What&apos;s included</h2>
                <Card padding="none" elevated className="divide-y divide-slate-100">
                    {ENTITLEMENT_FEATURES.map((f) => {
                        const on = Boolean(entitlements?.features?.[f.key]);
                        return (
                            <div key={f.key} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-800">{f.label}</p>
                                    <p className="text-xs text-slate-500">{f.blurb}</p>
                                </div>
                                {on ? (
                                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                                    </span>
                                ) : (
                                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                        <Lock className="h-3 w-3" aria-hidden />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </Card>
                {enforced && !isPremium && (
                    <div className="mt-4 rounded-2xl border border-primary-200 bg-primary-50/60 p-4 text-center sm:flex sm:items-center sm:justify-between sm:text-left">
                        <p className="text-sm text-slate-700">
                            Want everything unlocked and the caps lifted?
                        </p>
                        <Link href="/membership" className="mt-3 inline-block sm:mt-0">
                            <Button variant="primary" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                                See Premium plans
                            </Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
