"use client";

import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import {
    INSTITUTE_BILLING_PLANS,
    formatINR,
    formatLimit,
    type InstituteBillingPlan,
    type InstituteBillingPlanId,
} from "@digimine/types";

const PLAN_ORDER: InstituteBillingPlanId[] = ["starter", "growth", "scale", "enterprise"];

const HIGHLIGHTS = [
    {
        title: "One institute, many teachers",
        body: "Invite your teachers with a single code. They keep their own classes; you keep oversight across all of them.",
    },
    {
        title: "Centralised question bank",
        body: "Build a shared pool of questions tagged by subject, topic, and difficulty — every teacher can pick from it.",
    },
    {
        title: "Institute-wide tests & quizzes",
        body: "Run the same mock test across every batch, then compare results class-by-class without exporting a single spreadsheet.",
    },
    {
        title: "Per-student risk & analytics",
        body: "See who&apos;s slipping before parent-teacher meetings. Trend lines, weak topics, engagement heatmaps — out of the box.",
    },
    {
        title: "Custom branding (Growth+)",
        body: "Your logo on the dashboard, a custom tagline, and an institute-only sub-experience for your students.",
    },
    {
        title: "GST-compliant billing",
        body: "Annual invoices with your GSTIN baked in, paid via standard bank transfer or NEFT. No payment-gateway nags.",
    },
];

const STEPS = [
    {
        n: "1",
        title: "Create an account",
        body: "Sign in with Google or email and choose “Run an institute”.",
    },
    {
        n: "2",
        title: "Set up your institute",
        body: "Name it, add a contact email, and you’re in. You start on a 30-day trial, no card required.",
    },
    {
        n: "3",
        title: "Invite your teachers",
        body: "Share the invite code from your dashboard. Existing teachers redeem it to join; new ones sign up first.",
    },
    {
        n: "4",
        title: "Roll out to classes",
        body: "Create classes from the institute admin, assign each one to a teacher, and start publishing tests institute-wide.",
    },
];

const FAQS: Array<{ q: string; a: string }> = [
    {
        q: "Is there a free trial?",
        a: "Yes — every new institute starts on a 30-day Trial with 3 teachers, 60 students and 5 classes. No card required. You can convert to a paid plan from Billing whenever you're ready.",
    },
    {
        q: "What happens to my existing teacher account?",
        a: "Nothing changes. You can continue to use your independent teacher dashboard. When you create an institute, your role is promoted to Institute Admin and you can switch between the two contexts.",
    },
    {
        q: "Do students pay separately?",
        a: "No. The institute plan covers all student access for classes you create. Students do not need to purchase anything.",
    },
    {
        q: "Can teachers stay independent after joining?",
        a: "Teachers under an institute still own their content. The institute can also publish centralised content that targets multiple classes at once.",
    },
    {
        q: "How does payment work?",
        a: "We invoice annually in INR with GST. You pay by bank transfer or UPI against the invoice. Renewal reminders go to the billing contact you set in your dashboard.",
    },
];

function planCard(plan: InstituteBillingPlan) {
    const isEnterprise = plan.id === "enterprise";
    const limits = plan.limits;
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
            <p className="mt-4 text-3xl font-bold text-slate-900">
                {isEnterprise ? "Custom" : formatINR(plan.annualPriceINR)}
            </p>
            <p className="text-xs text-slate-500">
                {isEnterprise ? "Talk to sales for pricing" : "billed annually, exclusive of GST"}
            </p>

            <ul className="mt-5 space-y-2 text-sm text-slate-700">
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Teachers</span>
                    <span className="font-medium">{formatLimit(limits.teachers)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Students</span>
                    <span className="font-medium">{formatLimit(limits.students)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Classes</span>
                    <span className="font-medium">{formatLimit(limits.classes)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Question bank</span>
                    <span className="font-medium">{formatLimit(limits.questionBankItems)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Centralised content</span>
                    <span className="font-medium">{formatLimit(limits.centralizedContent)}</span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Custom branding</span>
                    <span className={`font-medium ${limits.customBranding ? "text-emerald-700" : "text-slate-400"}`}>
                        {limits.customBranding ? "Included" : "—"}
                    </span>
                </li>
                <li className="flex items-baseline justify-between">
                    <span className="text-slate-500">Support SLA</span>
                    <span className="font-medium">
                        {limits.supportSlaHours < 0 ? "Community" : `${limits.supportSlaHours}h`}
                    </span>
                </li>
            </ul>

            <div className="mt-6">
                {isEnterprise ? (
                    <Link href="/contact?intent=enterprise">
                        <Button variant="outline" size="md" className="w-full">
                            Talk to sales
                        </Button>
                    </Link>
                ) : (
                    <Link href={`/register?intent=institute&plan=${plan.id}`}>
                        <Button variant={plan.recommended ? "primary" : "outline"} size="md" className="w-full">
                            Start with {plan.name}
                        </Button>
                    </Link>
                )}
            </div>
        </Card>
    );
}

export default function ForInstitutesPage() {
    const plans = PLAN_ORDER.map((id) => INSTITUTE_BILLING_PLANS[id]).filter(Boolean);

    return (
        <main className="bg-white">
            {/* Hero */}
            <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50 to-white">
                <div className="container-page py-16 sm:py-24">
                    <div className="max-w-3xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                            For coaching centres, colleges & training institutes
                        </p>
                        <h1 className="font-display mt-3 text-4xl font-bold text-slate-900 sm:text-5xl">
                            Run your institute on one platform. From quiz to question paper to placement.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
                            Onboard every teacher, every batch, every student under your brand. Set tests for the whole
                            institute. See who&apos;s slipping before they fail. Pay one annual fee — no per-student gotchas.
                        </p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <Link href="/register?intent=institute">
                                <Button size="lg">Create your institute</Button>
                            </Link>
                            <Link href="/contact?intent=institute">
                                <Button variant="outline" size="lg">
                                    Talk to us first
                                </Button>
                            </Link>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                            30-day Trial • No card required • Cancel anytime
                        </p>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: "Teachers onboarded", v: "1,200+" },
                            { label: "Students reached", v: "85,000+" },
                            { label: "Tests delivered", v: "12,400+" },
                            { label: "Avg setup time", v: "< 1 day" },
                        ].map((s) => (
                            <Card key={s.label} className="p-5">
                                <p className="text-2xl font-bold text-slate-900">{s.v}</p>
                                <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{s.label}</p>
                            </Card>
                        ))}
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
                            Built for the way institutes actually run.
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
                            From signup to first test, in an afternoon.
                        </h2>
                    </div>
                    <ol className="mt-10 grid gap-5 md:grid-cols-4">
                        {STEPS.map((s) => (
                            <li
                                key={s.n}
                                className="rounded-2xl border border-slate-200 bg-white p-6"
                            >
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold">
                                    {s.n}
                                </div>
                                <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{s.body}</p>
                            </li>
                        ))}
                    </ol>
                    <div className="mt-10">
                        <Link href="/register?intent=institute">
                            <Button size="lg">Start your 30-day trial</Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Plans */}
            <section className="border-t border-slate-200">
                <div className="container-page py-16 sm:py-20">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            Plans
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            Simple annual pricing. No per-student surprises.
                        </h2>
                        <p className="mt-3 text-sm text-slate-600">
                            All plans include analytics, question bank, classes, and centralised content. Trial is on by
                            default — you choose a plan when you&apos;re ready.
                        </p>
                    </div>
                    <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        {plans.map(planCard)}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="border-t border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            FAQ
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            Questions institutes ask before signing up.
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
                                Ready to bring your institute online?
                            </h2>
                            <p className="mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
                                Create your institute account in under a minute. You can invite teachers, set up
                                classes, and run your first centralised test the same day.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 lg:justify-end">
                            <Link href="/register?intent=institute">
                                <Button size="lg">Create institute account</Button>
                            </Link>
                            <Link href="/contact?intent=institute">
                                <Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10">
                                    Book a demo
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
