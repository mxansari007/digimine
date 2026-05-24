"use client";

/**
 * Membership / pricing page.
 *
 * Sells one thing — Premium — across whatever durations the admin has
 * configured in `subscriptionPlans`. Sections, top to bottom:
 *
 *   1. Hero with the placement-prep value prop.
 *   2. Trust strip (students helped, Razorpay/SSL, money-back).
 *   3. Pricing cards (with promo code application + Razorpay checkout).
 *   4. Feature comparison table (Free vs Premium).
 *   5. "What you get" visual grid.
 *   6. FAQ.
 *   7. Final CTA.
 *
 * The Razorpay flow + promo + checkout endpoints are unchanged — only
 * the visual shell is new.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import {
    ENTITLEMENT_FEATURES,
    formatINR,
    type EntitlementFeature,
} from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Plan = {
    id: string;
    code: string;
    name: string;
    tagline: string;
    highlights: string[];
    priceINR: number;
    compareAtINR: number | null;
    interval: string;
    features: Record<string, boolean>;
    isFree: boolean;
    recommended: boolean;
    badge: string | null;
};

// ─── Marketing copy ──────────────────────────────────────────────────
// Editing these is the fastest way to retune the page. Keep them in
// component scope so they stay close to where they're rendered.

const HERO_BULLETS = [
    "Premium DSA & SQL problems with full editorials",
    "Curated mock tests & quizzes from past placement papers",
    "Priority code execution — your submissions skip the queue",
    "Revision Radar tracks what you forget & brings it back",
];

const FEATURE_GROUPS: {
    title: string;
    icon: string;
    features: Array<{ key: EntitlementFeature; label: string; blurb: string }>;
}[] = [
    {
        title: "Practice",
        icon: "💻",
        features: [
            { key: "practice_premium", label: "Premium DSA & SQL problems", blurb: "All locked problems, all languages, all hints." },
            { key: "revision_radar", label: "Revision Radar", blurb: "Spaced-repetition queue so you never forget what you solved." },
            { key: "mentor_rescue", label: "Mentor Rescue", blurb: "Stuck? Ask a mentor for a targeted hint, not the full answer." },
        ],
    },
    {
        title: "Tests & Quizzes",
        icon: "📝",
        features: [
            { key: "mock_tests", label: "Premium mock tests", blurb: "Full-length test series modelled on real placement papers." },
            { key: "quizzes_premium", label: "Premium quizzes", blurb: "Topic-wise quizzes with detailed explanations." },
            { key: "contests", label: "Contests", blurb: "Compete live, climb the leaderboard, win prizes." },
        ],
    },
    {
        title: "Learn",
        icon: "📚",
        features: [
            { key: "courses_premium", label: "Premium courses", blurb: "Multi-week tracks with structured chapters and exercises." },
            { key: "downloads", label: "Downloadable resources", blurb: "PDF cheat-sheets, problem lists, study planners." },
            { key: "certificates", label: "Completion certificates", blurb: "Share-ready certificates for finished courses." },
        ],
    },
    {
        title: "Experience",
        icon: "✨",
        features: [
            { key: "ad_free", label: "Ad-free", blurb: "Clean, distraction-free interface across the platform." },
        ],
    },
];

const FAQS = [
    {
        q: "How does payment work?",
        a: "We use Razorpay — India's most trusted payment gateway. You can pay with UPI, debit/credit card, net banking, or wallets. Your card details never touch our servers.",
    },
    {
        q: "Can I cancel any time?",
        a: "Yes. You keep Premium until the end of your current billing period, then your account quietly drops back to the free tier. Your progress, submissions, and Revision Radar stay forever.",
    },
    {
        q: "Do you offer refunds?",
        a: "If you're unhappy in the first 7 days, email maaz@placementranker.com with your order id and we'll refund in full. After that we don't pro-rate, but you keep access until your period ends.",
    },
    {
        q: "Is my progress lost if I downgrade?",
        a: "Never. Solved problems, mastery scores, sheet completion, course progress, certificates — all of it stays. Going Premium again later picks up exactly where you left off.",
    },
    {
        q: "Do you have a student discount?",
        a: "Quarterly and Annual plans are already a deep discount vs Monthly — that's where most students subscribe. Watch your email for promo codes around placement season.",
    },
    {
        q: "What if my college blocks payment gateways?",
        a: "Most college networks block almost everything. Pay from your phone (mobile data + UPI works) and your account unlocks instantly on the college Wi-Fi after.",
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function intervalLabel(interval: string): string {
    if (interval === "annual") return "year";
    if (interval === "lifetime") return "once";
    return "month";
}
function intervalChip(interval: string): string {
    if (interval === "annual") return "Annual";
    if (interval === "lifetime") return "Lifetime";
    return "Monthly";
}

function discountPct(price: number, compareAt: number | null): number | null {
    if (!compareAt || compareAt <= price) return null;
    return Math.round(((compareAt - price) / compareAt) * 100);
}

// Estimated effective monthly price for non-monthly plans, e.g. "₹333 / mo
// billed yearly". Helps users compare durations at a glance.
function perMonthHint(plan: Plan): string | null {
    if (plan.interval === "monthly" || plan.priceINR <= 0) return null;
    if (plan.interval === "annual") {
        return `Effective ${formatINR(Math.round(plan.priceINR / 12))} / month`;
    }
    if (plan.interval === "lifetime") return "Pay once, use forever";
    return null;
}

// ─── Page ────────────────────────────────────────────────────────────

export default function MembershipPage() {
    const router = useRouter();
    const { firebaseUser, isAuthenticated } = useAuthContext();
    const [enforced, setEnforced] = useState(true);
    const [banner, setBanner] = useState<string | null>(null);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPlan, setCurrentPlan] = useState<string | null>(null);

    const [promo, setPromo] = useState("");
    const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busyPlan, setBusyPlan] = useState<string | null>(null);
    const pricingRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/subscription/config");
            const data = await res.json();
            setEnforced(Boolean(data.enforced));
            setBanner(data.promoBanner || null);
            setPlans(Array.isArray(data.plans) ? data.plans : []);
            if (firebaseUser) {
                const me = await teacherFetch(firebaseUser, "/api/subscription/me")
                    .then((r) => r.json())
                    .catch(() => null);
                setCurrentPlan(me?.entitlements?.planCode || null);
            }
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    // ── Free + paid splits (free plan, when configured, lives in its own card
    //    below the recommended grid). ──
    const paidPlans = useMemo(() => plans.filter((p) => !p.isFree && p.priceINR > 0), [plans]);
    const freePlan = useMemo(() => plans.find((p) => p.isFree) || null, [plans]);
    // The most-feature-rich premium plan drives the comparison-table "Premium"
    // column. Falls back to the first paid plan.
    const benchmarkPremium = useMemo(() => {
        if (paidPlans.length === 0) return null;
        const recommended = paidPlans.find((p) => p.recommended);
        return recommended || paidPlans[0];
    }, [paidPlans]);

    const scrollToPricing = () => pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    const applyPromo = async (planCode: string, priceINR: number) => {
        if (!promo.trim()) return;
        try {
            const res = firebaseUser
                ? await teacherFetch(firebaseUser, "/api/subscription/promo/validate", {
                      method: "POST",
                      body: JSON.stringify({ code: promo, planCode, priceINR }),
                  })
                : await fetch("/api/subscription/promo/validate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ code: promo, planCode, priceINR }),
                  });
            const data = await res.json();
            if (data.valid) {
                const detail =
                    data.discountedPriceINR != null
                        ? `New price: ${formatINR(data.discountedPriceINR)}`
                        : data.freeMonths
                        ? `${data.freeMonths} free month(s)`
                        : data.grantsPlanCode
                        ? `Unlocks ${data.grantsPlanCode}`
                        : "Applied";
                setPromoMsg({ ok: true, text: `Code valid — ${detail}` });
            } else {
                setPromoMsg({ ok: false, text: data.reason || "Invalid code" });
            }
        } catch {
            setPromoMsg({ ok: false, text: "Could not validate code" });
        }
    };

    const subscribe = async (plan: Plan) => {
        if (!isAuthenticated || !firebaseUser) {
            router.push("/login?redirect=/membership");
            return;
        }
        setBusyPlan(plan.code);
        try {
            const res = await teacherFetch(firebaseUser, "/api/subscription/checkout", {
                method: "POST",
                body: JSON.stringify({ planCode: plan.code, promoCode: promo.trim() || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Checkout failed");

            if (data.granted) {
                setPromoMsg({ ok: true, text: "You're all set — plan activated." });
                await load();
                return;
            }

            // Razorpay flow.
            if (!(window as any).Razorpay) {
                const s = document.createElement("script");
                s.src = "https://checkout.razorpay.com/v1/checkout.js";
                document.body.appendChild(s);
                await new Promise((r) => {
                    s.onload = r;
                });
            }
            new (window as any).Razorpay({
                key: data.keyId,
                amount: data.amount,
                currency: data.currency || "INR",
                name: "PlacementRanker",
                description: `${data.planName} membership`,
                order_id: data.razorpayOrderId,
                handler: async (resp: any) => {
                    const v = await teacherFetch(firebaseUser, "/api/subscription/verify", {
                        method: "POST",
                        body: JSON.stringify({
                            orderId: data.orderId,
                            razorpayOrderId: data.razorpayOrderId,
                            razorpayPaymentId: resp.razorpay_payment_id,
                            razorpaySignature: resp.razorpay_signature,
                        }),
                    });
                    const vd = await v.json();
                    if (vd.success) {
                        setPromoMsg({ ok: true, text: "Payment successful — membership active!" });
                        await load();
                    } else {
                        setPromoMsg({ ok: false, text: vd.error || "Verification failed" });
                    }
                },
                theme: { color: "#0d9488" },
            }).open();
        } catch (e: any) {
            setPromoMsg({ ok: false, text: e.message || "Failed" });
        } finally {
            setBusyPlan(null);
        }
    };

    return (
        <main className="min-h-screen bg-white">
            {/* ───────────── Hero ───────────── */}
            <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-primary-950 text-white">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-30"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle at 20% 30%, rgba(20,184,166,.35), transparent 50%), radial-gradient(circle at 80% 20%, rgba(99,102,241,.25), transparent 55%), radial-gradient(circle at 50% 100%, rgba(236,72,153,.18), transparent 60%)",
                    }}
                />
                <div className="container-page relative py-16 sm:py-24">
                    <div className="mx-auto max-w-3xl text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300 backdrop-blur">
                            <span>★</span> PlacementRanker Premium
                        </span>
                        <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
                            One subscription.
                            <br className="hidden sm:block" />
                            <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">
                                Everything you need to crack placements.
                            </span>
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
                            Premium DSA & SQL problems, mock test series, expert quizzes, and full courses — built specifically for Indian placement prep, by people who've cracked it.
                        </p>

                        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Button variant="primary" size="lg" onClick={scrollToPricing} className="!bg-emerald-500 hover:!bg-emerald-600">
                                See plans &amp; pricing →
                            </Button>
                            {!isAuthenticated && (
                                <Link href="/signup?redirect=/membership" className="text-sm font-medium text-slate-300 hover:text-white">
                                    Create a free account first →
                                </Link>
                            )}
                        </div>

                        {!enforced && (
                            <div className="mx-auto mt-6 inline-block rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                                🎉 Everything is free during launch — no payment required
                            </div>
                        )}
                        {banner && (
                            <div className="mx-auto mt-3 inline-block rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-400/30">
                                {banner}
                            </div>
                        )}
                    </div>

                    {/* Hero bullets */}
                    <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
                        {HERO_BULLETS.map((b) => (
                            <li
                                key={b}
                                className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur"
                            >
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                                    ✓
                                </span>
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* ───────────── Trust strip ───────────── */}
            <section className="border-y border-slate-200 bg-slate-50">
                <div className="container-page py-5">
                    <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-600">
                        <li className="flex items-center gap-2"><span>🛡️</span> 7-day money-back guarantee</li>
                        <li className="flex items-center gap-2"><span>🔒</span> Secure payments via Razorpay</li>
                        <li className="flex items-center gap-2"><span>🇮🇳</span> Built for Indian placements</li>
                        <li className="flex items-center gap-2"><span>↺</span> Cancel anytime — no questions</li>
                    </ul>
                </div>
            </section>

            {/* ───────────── Pricing ───────────── */}
            <section ref={pricingRef} className="container-page py-14 sm:py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                        Pick the plan that fits your prep
                    </h2>
                    <p className="mt-3 text-base text-slate-600">
                        Same Premium experience across every plan. Pick the duration that
                        works for you — annual saves the most.
                    </p>
                </div>

                {/* Promo input */}
                <div className="mx-auto mt-8 flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <input
                        className="flex-1 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wider focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        placeholder="Have a promo code?"
                        value={promo}
                        onChange={(e) => {
                            setPromo(e.target.value.toUpperCase());
                            setPromoMsg(null);
                        }}
                    />
                    <span className="text-xs text-slate-500">Apply at checkout</span>
                    {promoMsg && (
                        <span className={`w-full text-center text-sm font-medium ${promoMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>
                            {promoMsg.ok ? "✓ " : "✕ "}{promoMsg.text}
                        </span>
                    )}
                </div>

                {/* Plan cards */}
                {loading ? (
                    <Card className="mt-10 p-14 text-center text-sm text-slate-500">
                        Loading plans…
                    </Card>
                ) : paidPlans.length === 0 && !freePlan ? (
                    <Card className="mt-10 p-14 text-center text-sm text-slate-500">
                        No plans configured yet. (Admin: set them up in the Subscription manager.)
                    </Card>
                ) : (
                    <>
                        <div className={`mt-10 grid gap-5 ${paidPlans.length >= 3 ? "lg:grid-cols-3" : paidPlans.length === 2 ? "sm:grid-cols-2" : ""}`}>
                            {paidPlans.map((plan) => {
                                const isCurrent = currentPlan === plan.code;
                                const off = discountPct(plan.priceINR, plan.compareAtINR);
                                const perMonth = perMonthHint(plan);
                                return (
                                    <Card
                                        key={plan.id}
                                        className={`relative flex flex-col p-7 transition ${
                                            plan.recommended
                                                ? "!border-primary-500 ring-2 ring-primary-200"
                                                : ""
                                        }`}
                                    >
                                        {/* Top badges */}
                                        {plan.recommended && (
                                            <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                                                ★ Most popular
                                            </span>
                                        )}
                                        {plan.badge && !plan.recommended && (
                                            <span className="absolute -top-3 left-6 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                                                {plan.badge}
                                            </span>
                                        )}
                                        {isCurrent && (
                                            <span className="absolute -top-3 right-6 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                                                Current
                                            </span>
                                        )}

                                        {/* Plan header */}
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                                {intervalChip(plan.interval)}
                                            </p>
                                            <h3 className="mt-1 font-display text-2xl font-bold text-slate-900">
                                                {plan.name}
                                            </h3>
                                            {plan.tagline && (
                                                <p className="mt-0.5 text-sm text-slate-500">
                                                    {plan.tagline}
                                                </p>
                                            )}
                                        </div>

                                        {/* Pricing block */}
                                        <div className="mt-5 flex items-end gap-2">
                                            <span className="font-display text-4xl font-bold text-slate-900">
                                                {formatINR(plan.priceINR)}
                                            </span>
                                            <span className="pb-1 text-sm text-slate-500">
                                                / {intervalLabel(plan.interval)}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            {plan.compareAtINR && (
                                                <span className="text-slate-400 line-through">
                                                    {formatINR(plan.compareAtINR)}
                                                </span>
                                            )}
                                            {off && (
                                                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                                    Save {off}%
                                                </span>
                                            )}
                                            {perMonth && <span className="text-slate-500">{perMonth}</span>}
                                        </div>

                                        {/* Feature list */}
                                        <ul className="mt-6 flex-1 space-y-2 text-sm text-slate-700">
                                            {(plan.highlights.length
                                                ? plan.highlights
                                                : ENTITLEMENT_FEATURES.filter((f) => plan.features[f.key]).map((f) => f.label)
                                            ).map((h) => (
                                                <li key={h} className="flex gap-2">
                                                    <span className="mt-0.5 text-primary-600">✓</span>
                                                    <span>{h}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        {/* CTA */}
                                        <div className="mt-6">
                                            {isCurrent ? (
                                                <Button variant="outline" className="w-full" disabled>
                                                    Your current plan
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant={plan.recommended ? "primary" : "outline"}
                                                    className="w-full"
                                                    isLoading={busyPlan === plan.code}
                                                    onClick={() => subscribe(plan)}
                                                >
                                                    {enforced ? `Subscribe to ${plan.name}` : "Activate (free now)"}
                                                </Button>
                                            )}
                                            {promo && (
                                                <button
                                                    onClick={() => applyPromo(plan.code, plan.priceINR)}
                                                    className="mt-2 w-full text-center text-xs text-primary-700 hover:underline"
                                                >
                                                    Check promo on this plan
                                                </button>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>

                        {/* Free plan footnote card */}
                        {freePlan && (
                            <Card className="mx-auto mt-6 max-w-3xl border-dashed bg-slate-50 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {freePlan.name} <span className="ml-1 text-xs font-normal text-slate-500">— always free</span>
                                        </p>
                                        <p className="mt-0.5 text-sm text-slate-600">
                                            {freePlan.tagline || "Start free with limited submissions, free problems, and basic features. Upgrade any time."}
                                        </p>
                                    </div>
                                    {currentPlan === freePlan.code ? (
                                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                            You're on Free
                                        </span>
                                    ) : (
                                        <Button variant="ghost" size="sm" onClick={() => subscribe(freePlan)}>
                                            Stay on Free
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        )}
                    </>
                )}
            </section>

            {/* ───────────── Feature comparison table ───────────── */}
            {benchmarkPremium && (
                <section className="border-t border-slate-200 bg-slate-50">
                    <div className="container-page py-14 sm:py-20">
                        <div className="mx-auto max-w-2xl text-center">
                            <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                                Free vs Premium — at a glance
                            </h2>
                            <p className="mt-3 text-base text-slate-600">
                                Everything you can do on each tier. No hidden fine print.
                            </p>
                        </div>

                        <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-5 py-3 text-left">Feature</th>
                                        <th className="px-5 py-3 text-center">Free</th>
                                        <th className="px-5 py-3 text-center text-primary-700">Premium ★</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {FEATURE_GROUPS.flatMap((g) =>
                                        g.features.map((f) => {
                                            const onPremium = Boolean(benchmarkPremium.features[f.key]);
                                            return (
                                                <tr key={f.key} className="hover:bg-slate-50/60">
                                                    <td className="px-5 py-3">
                                                        <div className="font-medium text-slate-800">{f.label}</div>
                                                        <div className="text-xs text-slate-500">{f.blurb}</div>
                                                    </td>
                                                    <td className="px-5 py-3 text-center text-slate-400">—</td>
                                                    <td className="px-5 py-3 text-center">
                                                        {onPremium ? (
                                                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                                                ✓
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                    <tr className="bg-slate-50">
                                        <td className="px-5 py-3 font-medium text-slate-800">
                                            Daily code submissions
                                            <div className="text-xs text-slate-500">How many graded submits per day</div>
                                        </td>
                                        <td className="px-5 py-3 text-center text-sm text-slate-600">20 / day</td>
                                        <td className="px-5 py-3 text-center text-sm font-semibold text-primary-700">
                                            Unlimited
                                        </td>
                                    </tr>
                                    <tr className="bg-slate-50">
                                        <td className="px-5 py-3 font-medium text-slate-800">
                                            Code execution priority
                                            <div className="text-xs text-slate-500">Premium submissions skip the queue</div>
                                        </td>
                                        <td className="px-5 py-3 text-center text-sm text-slate-600">Standard</td>
                                        <td className="px-5 py-3 text-center text-sm font-semibold text-primary-700">
                                            Priority lane
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            {/* ───────────── What you get (visual grid) ───────────── */}
            <section className="container-page py-14 sm:py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                        What you get with Premium
                    </h2>
                    <p className="mt-3 text-base text-slate-600">
                        Built for the way placement prep actually works in India.
                    </p>
                </div>

                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {FEATURE_GROUPS.map((g) => (
                        <Card key={g.title} className="flex flex-col p-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-50 to-primary-100 text-2xl">
                                {g.icon}
                            </div>
                            <h3 className="mt-4 font-display text-lg font-bold text-slate-900">
                                {g.title}
                            </h3>
                            <ul className="mt-3 flex-1 space-y-2 text-sm text-slate-600">
                                {g.features.map((f) => (
                                    <li key={f.key} className="flex gap-2">
                                        <span className="mt-0.5 text-primary-600">✓</span>
                                        <span>{f.label}</span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    ))}
                </div>
            </section>

            {/* ───────────── FAQ ───────────── */}
            <section className="border-t border-slate-200 bg-slate-50">
                <div className="container-page py-14 sm:py-20">
                    <div className="mx-auto max-w-2xl text-center">
                        <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                            Frequently asked questions
                        </h2>
                        <p className="mt-3 text-base text-slate-600">
                            Can't find what you're looking for?{" "}
                            <Link href="/contact" className="font-medium text-primary-700 hover:underline">
                                Send us a note →
                            </Link>
                        </p>
                    </div>

                    <div className="mx-auto mt-10 max-w-3xl space-y-3">
                        {FAQS.map((f) => (
                            <details key={f.q} className="group rounded-xl border border-slate-200 bg-white p-5 transition open:shadow-sm">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                                    <span className="font-semibold text-slate-900">{f.q}</span>
                                    <span className="text-slate-400 transition-transform group-open:rotate-45 text-lg">+</span>
                                </summary>
                                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ───────────── Final CTA ───────────── */}
            <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white">
                <div className="container-page py-14 text-center sm:py-20">
                    <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold text-white sm:text-4xl">
                        Stop juggling 5 different prep platforms.
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl text-base text-white/85">
                        Everything you need to crack a placement, in one membership.
                    </p>
                    <div className="mt-7">
                        <Button variant="primary" size="lg" onClick={scrollToPricing} className="!bg-white !text-primary-800 hover:!bg-slate-100">
                            See plans →
                        </Button>
                    </div>
                    <p className="mt-4 text-xs text-white/70">
                        Secure payments by Razorpay · UPI / card / netbanking · cancel anytime
                    </p>
                </div>
            </section>
        </main>
    );
}
