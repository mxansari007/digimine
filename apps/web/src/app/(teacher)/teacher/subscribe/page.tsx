"use client";

/**
 * Teacher subscribe / upgrade.
 *
 * Pulls plans from /api/subscription/plans?roleScope=teacher. Each card
 * exposes both the monthly and annual price; a single cadence toggle at
 * the top swaps the price shown across all cards.
 *
 * If the teacher is already on a paid plan, that card gets a "Current
 * plan" pill, the CTA flips to "Upgrade" on higher-tier rows, "Switch
 * cadence" on the same row at the other cadence, and is suppressed
 * entirely on lower tiers (downgrades go through support — out of scope
 * for this self-serve flow).
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { formatINR } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { getTeacher } from "@/lib/firestore/teachers";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type Plan = {
    id: string;
    code: string;
    name: string;
    tagline: string;
    highlights: string[];
    monthlyPriceINR: number;
    annualPriceINR: number | null;
    compareAtINR: number | null;
    isFree: boolean;
    recommended: boolean;
    badge: string | null;
    sortOrder: number;
};

type Cadence = "monthly" | "annual";

function priceFor(plan: Plan, cadence: Cadence): number {
    if (cadence === "annual" && plan.annualPriceINR != null) return plan.annualPriceINR;
    return plan.monthlyPriceINR;
}

function intervalLabel(cadence: Cadence): string {
    return cadence === "annual" ? "/yr" : "/mo";
}

export default function SubscribePage() {
    const router = useRouter();
    const { firebaseUser, user } = useAuthContext();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [plansError, setPlansError] = useState("");
    const [teacher, setTeacher] = useState<any>(null);
    const [cadence, setCadence] = useState<Cadence>("annual");
    const [loading, setLoading] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser) return;
        getTeacher(firebaseUser.uid).then((t) => setTeacher(t));
    }, [firebaseUser]);

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
                if (!cancelled) setPlansError((err as Error).message || "Failed");
            } finally {
                if (!cancelled) setPlansLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const currentPlanCode: string | null =
        teacher?.subscription?.planCode ||
        teacher?.subscription?.planId ||
        null;
    const currentCadence: Cadence =
        teacher?.subscription?.cadence === "annual" ? "annual" : "monthly";
    const currentSortOrder = useMemo(() => {
        const cur = plans.find((p) => p.code === currentPlanCode);
        return cur?.sortOrder ?? -1;
    }, [plans, currentPlanCode]);

    const handleSubscribe = async (plan: Plan) => {
        if (!firebaseUser || !teacher) {
            setError("Complete onboarding first.");
            return;
        }
        setSelectedPlanId(plan.id);
        setLoading(true);
        setError(null);
        try {
            const amountINR = priceFor(plan, cadence);
            // Free / zero-priced switch — bypass Razorpay via the
            // dedicated /switch-plan endpoint. Previously this forged a
            // Razorpay payload into /webhook/payment, which fails
            // signature verification outside of dev (BYPASS flag).
            if (amountINR <= 0 || plan.isFree) {
                const token = await firebaseUser.getIdToken();
                const res = await fetch("/api/teacher/switch-plan", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        planCode: plan.code,
                        cadence,
                    }),
                });
                const vd = await res.json();
                if (vd.success) router.push("/teacher/dashboard");
                else throw new Error(vd.message || vd.error || "Failed to switch plan");
                return;
            }
            const res = await fetch("/api/teacher/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: plan.code,
                    planName: plan.name,
                    amountINR,
                    cadence,
                    customerEmail: user?.email,
                    customerName: teacher.profile?.name,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
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
                description: `${plan.name} • ${cadence}`,
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
                            cadence,
                            teacherId: firebaseUser.uid,
                        }),
                    });
                    const vd = await v.json();
                    if (vd.success) router.push("/teacher/dashboard");
                    else setError(vd.message);
                },
                prefill: { name: teacher.profile?.name, email: user?.email },
                theme: { color: "#0d9488" },
            }).open();
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-3xl font-bold text-gray-900">Choose your plan</h1>
                        <HelpTutorial {...TUTORIALS.teacher_subscribe} />
                    </div>
                    <p className="mt-2 text-gray-500">
                        {currentPlanCode
                            ? `You're currently on ${plans.find((p) => p.code === currentPlanCode)?.name || currentPlanCode} (${currentCadence}).`
                            : "You're on Free by default. Upgrade for more classes, students, and unlimited content."}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/pricing/teacher"
                        className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                    >
                        Compare all plans →
                    </Link>
                </div>
            </div>

            {error && (
                <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-sm text-center">{error}</Card>
            )}

            {plans.some((p) => p.annualPriceINR != null) && (
                <div className="flex justify-center">
                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setCadence("monthly")}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                                cadence === "monthly" ? "bg-primary-600 text-white" : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            Monthly
                        </button>
                        <button
                            type="button"
                            onClick={() => setCadence("annual")}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                                cadence === "annual" ? "bg-primary-600 text-white" : "text-slate-600 hover:text-slate-900"
                            }`}
                        >
                            Annual
                            <span className="ml-1.5 text-[10px] uppercase tracking-wider">save ~17%</span>
                        </button>
                    </div>
                </div>
            )}

            {plansLoading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                </div>
            ) : plansError ? (
                <Card className="p-6 text-center text-rose-700">{plansError}</Card>
            ) : plans.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-lg font-semibold text-slate-900">
                        No plans are published yet.
                    </p>
                    <p className="mt-2 max-w-md text-sm text-slate-500 mx-auto">
                        Every teacher feature is currently free. Check back later — your admin
                        will publish paid tiers from the admin console.
                    </p>
                </Card>
            ) : (
                <div className={`grid gap-6 md:grid-cols-2 ${plans.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                    {plans.map((plan) => {
                        const isLoading = loading && selectedPlanId === plan.id;
                        const price = priceFor(plan, cadence);
                        const supportsAnnual = plan.annualPriceINR != null;
                        const effective = cadence === "annual" && !supportsAnnual ? "monthly" : cadence;
                        const isCurrent = currentPlanCode === plan.code;
                        const isCurrentExact = isCurrent && currentCadence === effective;
                        const isUpgrade = plan.sortOrder > currentSortOrder;
                        const isDowngrade = plan.sortOrder < currentSortOrder && currentPlanCode !== null;
                        let ctaLabel = `Subscribe to ${plan.name}`;
                        if (isCurrentExact) ctaLabel = "Current plan";
                        else if (isCurrent) ctaLabel = `Switch to ${effective}`;
                        else if (currentPlanCode && isUpgrade) ctaLabel = `Upgrade to ${plan.name}`;
                        else if (isDowngrade) ctaLabel = `Downgrade to ${plan.name}`;
                        return (
                            <Card
                                key={plan.id}
                                className={`relative flex flex-col p-6 ${
                                    plan.recommended ? "border-primary-300 ring-2 ring-primary-100" : ""
                                } ${isCurrent ? "border-emerald-300 ring-2 ring-emerald-100" : ""}`}
                            >
                                {plan.badge && !isCurrent && (
                                    <span className="absolute -top-3 left-6 chip-info">{plan.badge}</span>
                                )}
                                {isCurrent && (
                                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                        Current plan
                                    </span>
                                )}
                                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                                {plan.tagline && (
                                    <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
                                )}
                                <div className="mt-4 flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-gray-900">
                                        {price > 0 ? formatINR(price) : "Free"}
                                    </span>
                                    {price > 0 && (
                                        <span className="text-xs text-slate-500">{intervalLabel(effective)}</span>
                                    )}
                                    {plan.compareAtINR && plan.compareAtINR > price && (
                                        <span className="text-xs text-slate-400 line-through">
                                            {formatINR(plan.compareAtINR)}
                                        </span>
                                    )}
                                </div>
                                {effective === "annual" && supportsAnnual && plan.annualPriceINR != null && (
                                    <p className="mt-0.5 text-xs text-emerald-700">
                                        ≈ {formatINR(Math.round(plan.annualPriceINR / 12))} / month
                                    </p>
                                )}
                                {cadence === "annual" && !supportsAnnual && price > 0 && (
                                    <p className="mt-0.5 text-xs text-slate-400">
                                        Monthly billing only — no annual variant.
                                    </p>
                                )}
                                {plan.highlights.length > 0 && (
                                    <ul className="mt-5 flex-1 space-y-1.5 text-sm text-gray-700">
                                        {plan.highlights.map((h, i) => (
                                            <li key={i}>• {h}</li>
                                        ))}
                                    </ul>
                                )}
                                <div className="mt-6">
                                    <Button
                                        variant={isCurrentExact ? "outline" : plan.recommended ? "primary" : "outline"}
                                        className="w-full"
                                        onClick={() => handleSubscribe(plan)}
                                        isLoading={isLoading}
                                        disabled={isLoading || isCurrentExact}
                                    >
                                        {ctaLabel}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Card intent="info" className="p-5 text-sm">
                <p className="font-semibold text-info-700">Running an institute with multiple teachers?</p>
                <p className="text-info-700/80 mt-0.5">
                    Institute plans cover multiple teacher seats, a centralised question bank, and institute-wide tests.{" "}
                    <Link href="/pricing/institute" className="font-semibold underline">
                        Compare institute plans →
                    </Link>
                </p>
            </Card>
        </div>
    );
}
