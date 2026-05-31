"use client";

/**
 * Institute pricing — public landing for institute monetisation tiers.
 *
 * Reads from `subscriptionPlans` filtered by `roleScope: "institute"`
 * via /api/subscription/plans. Same structure as the teacher pricing
 * page; the differences are seat-cap rendering, hero copy, and
 * CTA target (/institute/onboarding for new, /institute/billing for
 * existing).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { Check, Building2 } from "lucide-react";
import { formatINR } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";

type Plan = {
    id: string;
    code: string;
    name: string;
    tagline: string;
    highlights: string[];
    monthlyPriceINR: number;
    annualPriceINR: number | null;
    compareAtINR: number | null;
    seatCap: number | null;
    roleScope?: string;
    isFree: boolean;
    recommended: boolean;
    badge: string | null;
};

type Cadence = "monthly" | "annual";

export default function InstitutePricingPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cadence, setCadence] = useState<Cadence>("annual");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/subscription/plans?roleScope=institute", {
                    cache: "no-store",
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to load plans");
                if (!cancelled) setPlans(data.plans || []);
            } catch (err) {
                if (!cancelled) setError((err as Error).message || "Failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
            <header className="mx-auto max-w-2xl text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 dark:bg-primary-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                    <Building2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    For institutes
                </span>
                <h1 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
                    One platform for your whole institute.
                </h1>
                <p className="mt-3 text-base text-slate-600">
                    Centralise teachers, classes, content, and the question bank
                    under your institute&apos;s brand. Pay per active seat &mdash;
                    not per teacher you happen to invite.
                </p>
            </header>

            {loading ? (
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-80 animate-pulse rounded-2xl bg-slate-100"
                        />
                    ))}
                </div>
            ) : error ? (
                <Card className="mt-10 p-8 text-center text-rose-700">
                    Couldn&apos;t load plans: {error}
                </Card>
            ) : plans.length === 0 ? (
                <Card className="mt-10 p-12 text-center">
                    <p className="text-lg font-semibold text-slate-900">
                        Institute pricing is coming soon.
                    </p>
                    <p className="mt-2 max-w-md text-sm text-slate-500 mx-auto">
                        We&apos;re still finalising plans for institutes. Talk to us
                        for a custom quote &mdash; we&apos;ll get you set up with a
                        trial in the meantime.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <Link href="/institute/onboarding">
                            <Button variant="primary">Start a trial institute</Button>
                        </Link>
                        <Link href="/contact">
                            <Button variant="outline">Contact sales</Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <>
                    {plans.some((p) => p.annualPriceINR != null) && (
                        <CadenceToggle cadence={cadence} setCadence={setCadence} />
                    )}
                    <PlanGrid plans={plans} cadence={cadence} />
                </>
            )}

            <FooterFaq />
        </div>
    );
}

function CadenceToggle({
    cadence,
    setCadence,
}: {
    cadence: Cadence;
    setCadence: (c: Cadence) => void;
}) {
    return (
        <div className="mt-8 flex justify-center">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                <button
                    type="button"
                    onClick={() => setCadence("monthly")}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        cadence === "monthly"
                            ? "bg-primary-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                    Monthly
                </button>
                <button
                    type="button"
                    onClick={() => setCadence("annual")}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        cadence === "annual"
                            ? "bg-primary-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                    Annual
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider">save ~17%</span>
                </button>
            </div>
        </div>
    );
}

function PlanGrid({ plans, cadence }: { plans: Plan[]; cadence: Cadence }) {
    const colCount = Math.min(plans.length, 4);
    return (
        <div
            className={`mt-8 grid gap-4 ${
                colCount >= 4
                    ? "sm:grid-cols-2 lg:grid-cols-4"
                    : colCount === 3
                        ? "sm:grid-cols-2 lg:grid-cols-3"
                        : colCount === 2
                            ? "sm:grid-cols-2"
                            : "max-w-md mx-auto"
            }`}
        >
            {plans.map((p) => (
                <PlanCard key={p.id} plan={p} cadence={cadence} />
            ))}
        </div>
    );
}

function PlanCard({ plan, cadence }: { plan: Plan; cadence: Cadence }) {
    const accent = plan.recommended;
    const { isInstituteAdmin } = useAuthContext();
    const teaching = useTeachingFeatures();
    const supportsAnnual = plan.annualPriceINR != null;
    const effectiveCadence: Cadence =
        cadence === "annual" && supportsAnnual ? "annual" : "monthly";
    const price = effectiveCadence === "annual" ? plan.annualPriceINR! : plan.monthlyPriceINR;
    const intervalLabel = effectiveCadence === "annual" ? "/yr" : "/mo";
    const monthlyEquivalent =
        effectiveCadence === "annual" && supportsAnnual
            ? Math.round(plan.annualPriceINR! / 12)
            : null;

    // Match against the institute's resolved plan code. Same source as
    // /admin/subscription writes — `subscriptionPlans where code == X
    // and roleScope == "institute"`.
    const isCurrent =
        isInstituteAdmin &&
        teaching.scope === "institute" &&
        !!teaching.planCode &&
        teaching.planCode === plan.code;
    const onPaidPlan =
        isInstituteAdmin &&
        teaching.scope === "institute" &&
        !!teaching.planCode &&
        teaching.planName !== null;

    return (
        <Card
            className={`relative flex flex-col p-6 ${
                isCurrent
                    ? "border-emerald-300 dark:border-emerald-500/25 bg-gradient-to-br from-emerald-50/70 dark:from-emerald-500/10 to-white dark:to-surface ring-2 ring-emerald-200/60 dark:ring-emerald-500/25"
                    : accent
                    ? "border-primary-300 dark:border-primary-500/25 bg-gradient-to-br from-primary-50/60 dark:from-primary-500/10 to-white dark:to-surface"
                    : ""
            }`}
        >
            {isCurrent ? (
                <span className="absolute -top-2 right-4 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Current plan
                </span>
            ) : plan.badge ? (
                <span className="absolute -top-2 right-4 rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {plan.badge}
                </span>
            ) : null}
            <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
            {plan.tagline && (
                <p className="mt-1 text-xs text-slate-500">{plan.tagline}</p>
            )}
            <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                    {price > 0 ? formatINR(price) : "Free"}
                </span>
                {price > 0 && (
                    <span className="text-xs text-slate-500">{intervalLabel}</span>
                )}
                {plan.compareAtINR && plan.compareAtINR > price && (
                    <span className="text-xs text-slate-400 line-through">
                        {formatINR(plan.compareAtINR)}
                    </span>
                )}
            </div>
            {monthlyEquivalent != null && (
                <p className="mt-0.5 text-xs text-emerald-700">
                    ≈ {formatINR(monthlyEquivalent)} / month
                </p>
            )}
            {cadence === "annual" && !supportsAnnual && price > 0 && (
                <p className="mt-0.5 text-xs text-slate-400">
                    Monthly billing only — no annual variant.
                </p>
            )}

            <p className="mt-2 text-xs font-medium text-slate-600">
                {plan.seatCap == null
                    ? "Unlimited seats"
                    : `Up to ${plan.seatCap} active seats`}
            </p>

            {plan.highlights.length > 0 && (
                <ul className="mt-5 flex-1 space-y-2">
                    {plan.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                            <Check
                                className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600"
                                strokeWidth={2.5}
                                aria-hidden
                            />
                            <span>{h}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-6">
                {isCurrent ? (
                    <Link href="/institute/billing" className="block">
                        <Button variant="outline" className="w-full">
                            Manage plan
                        </Button>
                    </Link>
                ) : (
                    <Link href={plan.isFree ? "/institute/onboarding" : "/institute/billing"}>
                        <Button
                            variant={accent ? "primary" : "outline"}
                            className="w-full"
                        >
                            {plan.isFree
                                ? "Start trial"
                                : onPaidPlan
                                    ? `Switch to ${plan.name}`
                                    : `Choose ${plan.name}`}
                        </Button>
                    </Link>
                )}
            </div>
        </Card>
    );
}

function FooterFaq() {
    return (
        <section className="mt-16 grid gap-6 sm:grid-cols-2">
            <FaqItem
                q="What's a seat?"
                a="One seat = one active teacher attached to your institute. Pending invites don't consume a seat until the teacher signs up; removed teachers free their seat immediately."
            />
            <FaqItem
                q="Do students count toward seats?"
                a="No. Student counts are unlimited on every paid plan. You only pay for active teacher seats."
            />
            <FaqItem
                q="Can we change plans mid-cycle?"
                a="Yes. Plan changes go through a quick review so we can prorate the seat math and issue a proper GST invoice. Most changes settle within 1 business day."
            />
            <FaqItem
                q="What about GST invoices?"
                a="Every paid invoice is GST-compliant. Set your GSTIN on the institute billing page and we'll include it on all future invoices."
            />
        </section>
    );
}

function FaqItem({ q, a }: { q: string; a: string }) {
    return (
        <div>
            <h4 className="text-sm font-semibold text-slate-900">{q}</h4>
            <p className="mt-1 text-sm text-slate-600">{a}</p>
        </div>
    );
}
