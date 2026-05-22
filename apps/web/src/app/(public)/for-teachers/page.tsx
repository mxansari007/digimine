"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import {
    TEACHER_BILLING_PLANS,
    annualMonthlyEquivalent,
    formatINR,
    formatLimit,
    type TeacherBillingPlan,
    type TeacherBillingPlanId,
} from "@digimine/types";

type Cadence = "monthly" | "annual";

const PLAN_ORDER: TeacherBillingPlanId[] = ["free", "starter", "pro"];

const HIGHLIGHTS = [
    {
        title: "Author once, publish anywhere",
        body: "Build tests, quizzes, courses, and contests in one place. Drop the same content into a private classroom or onto the public marketplace.",
    },
    {
        title: "A real test-taking experience",
        body: "Question palette, mark-for-review, full-screen mode, anti-cheat heuristics, auto-submit on time-out — what students expect from a serious platform.",
    },
    {
        title: "Coding questions, native",
        body: "Run candidate code against your test cases in 30+ languages. Time and memory limits enforced. Re-evaluation supported.",
    },
    {
        title: "Per-student analytics",
        body: "See risk scores, weak topics, response patterns, and engagement heatmaps for every student in every class.",
    },
    {
        title: "Classes that scale",
        body: "Run multiple classes, invite by code, assign content per class, archive when the term ends. No spreadsheets.",
    },
    {
        title: "Earn on the side",
        body: "Submit your best content for the public marketplace. Approved teachers earn a revenue share on every sale.",
    },
];

const STEPS = [
    {
        n: "1",
        title: "Sign up",
        body: "Pick the Teacher role on signup. Free, no card.",
    },
    {
        n: "2",
        title: "Finish onboarding",
        body: "Confirm your phone and basic profile so students see who they're buying from.",
    },
    {
        n: "3",
        title: "Create a class",
        body: "Spin up a class, share the invite code, start adding students.",
    },
    {
        n: "4",
        title: "Publish your first test",
        body: "Build a test in the editor, target it at your class, watch results come in live.",
    },
];

const FAQS: Array<{ q: string; a: string }> = [
    {
        q: "Is the Free plan really free?",
        a: "Yes — no card required and no surprise downgrades. It's capped to 1 class, 25 students, and a small content quota so we can keep it sustainable.",
    },
    {
        q: "What's the difference between Pro and Institute?",
        a: "Pro is for individual teachers. Institute is a separate product for organisations with multiple teachers, centralised question banks, institute-wide tests, GST invoicing, and custom branding. If you have 2+ teachers, look at the Institute plans.",
    },
    {
        q: "How does the marketplace work?",
        a: "Starter and Pro teachers can submit content for review. Approved content gets listed on the public catalog. You earn a revenue share on every paid sale — payouts are processed monthly.",
    },
    {
        q: "Can I upgrade or downgrade later?",
        a: "Yes. Plan changes take effect from the next billing cycle. Annual subscriptions are pro-rated on upgrade and credited on downgrade.",
    },
    {
        q: "Do students pay anything?",
        a: "Only if you charge them via the marketplace. Private classroom content is free for enrolled students — your subscription covers it.",
    },
    {
        q: "What payment methods do you accept?",
        a: "UPI, cards (credit/debit), net banking, and wallets — all via Razorpay. We invoice you with GST included.",
    },
];

function planCard(plan: TeacherBillingPlan, cadence: Cadence) {
    const isFree = plan.id === "free";
    const annualEq = annualMonthlyEquivalent(plan);

    const price = cadence === "annual" ? annualEq : plan.monthlyPriceINR;
    const priceLabel = isFree ? "Free" : `${formatINR(price)}`;
    const subLabel = isFree
        ? "forever"
        : cadence === "annual"
        ? `/mo · billed ${formatINR(plan.annualPriceINR)} yearly`
        : "/mo · billed monthly";

    const ctaHref = `/register?role=teacher&plan=${plan.id}${cadence === "annual" ? "&billing=annual" : ""}`;

    return (
        <Card
            key={plan.id}
            className={`relative flex flex-col p-6 ${
                plan.recommended ? "border-primary-500 ring-2 ring-primary-200" : ""
            }`}
        >
            {plan.recommended && (
                <span className="absolute -top-3 left-6 chip-info">Most popular</span>
            )}
            <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">{plan.tagline}</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">{plan.name}</h3>
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">{priceLabel}</p>
            <p className="text-xs text-slate-500">{subLabel}</p>
            {!isFree && cadence === "annual" && (
                <p className="mt-1 text-xs text-emerald-700">2 months free vs monthly</p>
            )}

            <ul className="mt-5 space-y-2 text-sm text-slate-700">
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Classes</span>
                    <span className="font-medium">{formatLimit(plan.limits.classes)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Students</span>
                    <span className="font-medium">{formatLimit(plan.limits.students)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Test series</span>
                    <span className="font-medium">{formatLimit(plan.limits.tests)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Quizzes</span>
                    <span className="font-medium">{formatLimit(plan.limits.quizzes)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Question bank</span>
                    <span className="font-medium">{formatLimit(plan.limits.questions)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Marketplace selling</span>
                    <span
                        className={`font-medium ${
                            plan.limits.publicMarketplace ? "text-emerald-700" : "text-slate-400"
                        }`}
                    >
                        {plan.limits.publicMarketplace ? "Included" : "—"}
                    </span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Custom branding</span>
                    <span
                        className={`font-medium ${
                            plan.limits.customBranding ? "text-emerald-700" : "text-slate-400"
                        }`}
                    >
                        {plan.limits.customBranding ? "Included" : "—"}
                    </span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Support SLA</span>
                    <span className="font-medium">
                        {plan.limits.supportSlaHours < 0 ? "Community" : `${plan.limits.supportSlaHours}h`}
                    </span>
                </li>
            </ul>

            <ul className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm text-slate-700">
                {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                        <span className="text-primary-600">✓</span>
                        <span>{f}</span>
                    </li>
                ))}
            </ul>

            <div className="mt-6">
                <Link href={ctaHref}>
                    <Button variant={plan.recommended ? "primary" : "outline"} size="md" className="w-full">
                        {isFree ? "Start free" : `Start ${plan.name}`}
                    </Button>
                </Link>
            </div>
        </Card>
    );
}

export default function ForTeachersPage() {
    const [cadence, setCadence] = useState<Cadence>("annual");
    const plans = PLAN_ORDER.map((id) => TEACHER_BILLING_PLANS[id]).filter(Boolean);

    return (
        <main className="bg-white">
            {/* Hero */}
            <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-white">
                <div className="container-page py-16 sm:py-24">
                    <div className="max-w-3xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                            For independent teachers & creators
                        </p>
                        <h1 className="font-display mt-3 text-4xl font-bold text-slate-900 sm:text-5xl">
                            Teach online without stitching ten tools together.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
                            Test editor, classes, coding questions, analytics, and a marketplace — one teacher seat. Start
                            free, upgrade when your class outgrows it.
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Link href="/register?role=teacher">
                                <Button size="lg">Start teaching free</Button>
                            </Link>
                            <Link href="#plans">
                                <Button variant="outline" size="lg">
                                    See plans
                                </Button>
                            </Link>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                            No card required • Cancel anytime • GST-compliant invoicing
                        </p>
                    </div>
                </div>
            </section>

            {/* Highlights */}
            <section className="border-t border-slate-200">
                <div className="container-page py-16 sm:py-20">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            What you get
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            Everything a serious teacher needs. Nothing they don&apos;t.
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {HIGHLIGHTS.map((h) => (
                            <Card key={h.title} className="p-6">
                                <h3 className="text-base font-semibold text-slate-900">{h.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{h.body}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* Steps */}
            <section className="border-t border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            How it works
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            From signup to your first class in 15 minutes.
                        </h2>
                    </div>
                    <ol className="mt-10 grid gap-5 md:grid-cols-4">
                        {STEPS.map((s) => (
                            <li key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold">
                                    {s.n}
                                </div>
                                <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{s.body}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Plans */}
            <section id="plans" className="border-t border-slate-200">
                <div className="container-page py-16 sm:py-20">
                    <div className="flex flex-wrap items-end justify-between gap-6">
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Plans</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                                Pricing that scales with your class size, not surprise students.
                            </h2>
                            <p className="mt-3 text-sm text-slate-600">
                                Pick monthly to stay flexible, or annual to save two months. You can switch any time.
                            </p>
                        </div>
                        <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1">
                            <button
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
                                onClick={() => setCadence("annual")}
                                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                                    cadence === "annual"
                                        ? "bg-primary-600 text-white"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Annual
                                <span className="ml-1.5 text-[10px] uppercase tracking-wider">save 17%</span>
                            </button>
                        </div>
                    </div>
                    <div className="mt-10 grid gap-5 md:grid-cols-3">
                        {plans.map((plan) => planCard(plan, cadence))}
                    </div>
                    <Card intent="info" className="mt-8 p-5 text-sm">
                        <p className="font-semibold text-info-700">
                            Need more than one teacher seat?
                        </p>
                        <p className="text-info-700/80 mt-0.5">
                            Institute plans cover multiple teachers, centralised question banks, institute-wide tests, and
                            GST-compliant annual invoicing.
                            <Link href="/for-institutes" className="ml-2 font-semibold underline">
                                See institute plans →
                            </Link>
                        </p>
                    </Card>
                </div>
            </section>

            {/* FAQ */}
            <section className="border-t border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">FAQ</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            Questions teachers ask before signing up.
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-4 lg:grid-cols-2">
                        {FAQS.map((f) => (
                            <Card key={f.q} className="p-6">
                                <h3 className="text-base font-semibold text-slate-900">{f.q}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{f.a}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="border-t border-slate-200 bg-slate-950 text-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                        <div>
                            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
                                Start teaching in the next hour.
                            </h2>
                            <p className="mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
                                Free to start, no card required. Upgrade when your class grows.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 lg:justify-end">
                            <Link href="/register?role=teacher">
                                <Button size="lg">Start teaching free</Button>
                            </Link>
                            <Link href="/for-institutes">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="border-white/30 text-white hover:bg-white/10"
                                >
                                    Run an institute instead
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
