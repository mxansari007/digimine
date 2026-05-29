"use client";

/**
 * Teacher pricing — public landing for the teacher monetisation tier.
 *
 * Pulls plans from `subscriptionPlans` filtered by `roleScope: "teacher"`
 * via /api/subscription/plans. Each card renders both the monthly and
 * annual price using a single global toggle.
 *
 * CTA behaviour:
 *   - signed-out          → /register?role=teacher (preserves intent)
 *   - signed-in teacher   → opens Razorpay checkout in-place (no detour
 *                           through /teacher/subscribe)
 *   - signed-in non-teacher → still routes to /teacher/subscribe so the
 *                             teacher-doc gate there can do its job
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { Check, GraduationCap } from "lucide-react";
import { formatINR } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import { getTeacher } from "@/lib/firestore/teachers";

type Plan = {
    id: string;
    code: string;
    name: string;
    tagline: string;
    highlights: string[];
    monthlyPriceINR: number;
    annualPriceINR: number | null;
    compareAtINR: number | null;
    roleScope?: string;
    isFree: boolean;
    recommended: boolean;
    badge: string | null;
};

type Cadence = "monthly" | "annual";

export default function TeacherPricingPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cadence, setCadence] = useState<Cadence>("annual");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/subscription/plans?roleScope=teacher", {
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700">
                    <GraduationCap className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    For teachers
                </span>
                <h1 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
                    Run more classes, with less work.
                </h1>
                <p className="mt-3 text-base text-slate-600">
                    A home for your content, your classes, and your students &mdash;
                    with analytics that actually tell you who needs help. Start free,
                    upgrade when you outgrow it.
                </p>
            </header>

            {plans.some((p) => p.annualPriceINR != null) && (
                <CadenceToggle cadence={cadence} setCadence={setCadence} />
            )}

            {loading ? (
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
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
                        Teacher pricing is coming soon.
                    </p>
                    <p className="mt-2 max-w-md text-sm text-slate-500 mx-auto">
                        We&apos;re still finalising plans for teachers. In the meantime,
                        every teacher feature is free &mdash; sign up and start running
                        classes today.
                    </p>
                    <div className="mt-5">
                        <Link href="/register?role=teacher">
                            <Button variant="primary">Sign up as a teacher</Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <PlanGrid plans={plans} cadence={cadence} />
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
    const colCount = Math.min(plans.length, 3);
    return (
        <div
            className={`mt-8 grid gap-4 ${
                colCount >= 3
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
    const router = useRouter();
    const { firebaseUser, user, isTeacher } = useAuthContext();
    const teaching = useTeachingFeatures();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const supportsAnnual = plan.annualPriceINR != null;
    const effectiveCadence: Cadence =
        cadence === "annual" && supportsAnnual ? "annual" : "monthly";
    const price = effectiveCadence === "annual" ? plan.annualPriceINR! : plan.monthlyPriceINR;
    const intervalLabel = effectiveCadence === "annual" ? "/yr" : "/mo";
    const monthlyEquivalent =
        effectiveCadence === "annual" && supportsAnnual
            ? Math.round(plan.annualPriceINR! / 12)
            : null;

    // Match by plan code. `teaching.planCode` is the stable code on the
    // teacher's subscription doc — same field the entitlements resolver
    // matches against. Only relevant for signed-in teachers; everyone
    // else sees the regular CTAs.
    const isCurrent =
        isTeacher &&
        teaching.scope === "teacher" &&
        !!teaching.planCode &&
        teaching.planCode === plan.code;
    const onPaidPlan =
        isTeacher &&
        teaching.scope === "teacher" &&
        !!teaching.planCode &&
        teaching.planName !== null;

    const ctaLabel = isCurrent
        ? "Current plan"
        : plan.isFree
            ? "Start free"
            : onPaidPlan
                ? `Switch to ${plan.name}`
                : `Choose ${plan.name}`;

    const handleCheckout = useCallback(async () => {
        // Already on this plan — no checkout, just route to usage so
        // the teacher can see their entitlements. The button is also
        // disabled, this is a defensive guard.
        if (isCurrent) {
            router.push("/teacher/usage");
            return;
        }
        // Signed out — funnel to register, preserve intent so they
        // land back here after signup.
        if (!firebaseUser || !user) {
            router.push(`/register?role=teacher&intent=teacher`);
            return;
        }
        // Free plan doesn't go through Razorpay.
        if (plan.isFree) {
            router.push("/teacher/dashboard");
            return;
        }
        // Non-teacher signed-in users (e.g. an institute admin browsing
        // the page) fall through to /teacher/subscribe so its gate can
        // handle the role mismatch with appropriate copy.
        if (!isTeacher) {
            router.push("/teacher/subscribe");
            return;
        }
        setBusy(true);
        setErr("");
        try {
            const teacher = await getTeacher(firebaseUser.uid);
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/teacher/subscribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    planId: plan.code,
                    planName: plan.name,
                    amountINR: price,
                    cadence: effectiveCadence,
                    customerEmail: user.email,
                    customerName: teacher?.profile?.name,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to start checkout");
            if (!(window as any).Razorpay) {
                const s = document.createElement("script");
                s.src = "https://checkout.razorpay.com/v1/checkout.js";
                document.body.appendChild(s);
                await new Promise((r) => {
                    s.onload = r;
                });
            }
            new (window as any).Razorpay({
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: data.amount,
                currency: "INR",
                name: "PlacementRanker",
                description: `${plan.name} • ${effectiveCadence}`,
                order_id: data.razorpayOrderId,
                handler: async (response: any) => {
                    const v = await fetch("/api/teacher/webhook/payment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            orderId: data.orderId,
                            razorpayOrderId: data.razorpayOrderId,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                            planId: plan.code,
                            cadence: effectiveCadence,
                            teacherId: firebaseUser.uid,
                        }),
                    });
                    const vd = await v.json();
                    if (vd.success) router.push("/teacher/dashboard");
                    else setErr(vd.message || "Payment verification failed");
                },
                prefill: { name: teacher?.profile?.name, email: user.email },
                theme: { color: "#0d9488" },
            }).open();
        } catch (e) {
            setErr((e as Error).message || "Checkout failed");
        } finally {
            setBusy(false);
        }
    }, [firebaseUser, user, isTeacher, isCurrent, plan, price, effectiveCadence, router]);

    return (
        <Card
            className={`relative flex flex-col p-6 ${
                isCurrent
                    ? "border-emerald-300 bg-gradient-to-br from-emerald-50/70 to-white ring-2 ring-emerald-200/60"
                    : accent
                        ? "border-primary-300 bg-gradient-to-br from-primary-50/60 to-white"
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
                    <Link href="/teacher/usage" className="block">
                        <Button variant="outline" className="w-full">
                            Manage plan
                        </Button>
                    </Link>
                ) : (
                    <Button
                        variant={accent ? "primary" : "outline"}
                        className="w-full"
                        onClick={handleCheckout}
                        isLoading={busy}
                    >
                        {ctaLabel}
                    </Button>
                )}
                {err && (
                    <p className="mt-2 text-center text-xs text-rose-600">{err}</p>
                )}
            </div>
        </Card>
    );
}

function FooterFaq() {
    return (
        <section className="mt-16 grid gap-6 sm:grid-cols-2">
            <FaqItem
                q="Can I run classes on the free plan?"
                a="Yes &mdash; the free plan covers core class management, students, and content authoring. Paid plans lift caps and unlock advanced analytics."
            />
            <FaqItem
                q="Do students pay separately?"
                a="Student access to your classes is free. They only pay if they buy a PlacementRanker student membership for premium DSA/SQL content."
            />
            <FaqItem
                q="What if I'm part of an institute?"
                a="If you join an institute via invite code, the institute's plan covers you. You don't need a separate teacher subscription."
            />
            <FaqItem
                q="Can I cancel anytime?"
                a="Yes. Paid plans are month-to-month or annual, no minimum commitment. You keep your content and analytics history after cancelling."
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
