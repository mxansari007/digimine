"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import {
    TEACHER_BILLING_PLANS,
    annualMonthlyEquivalent,
    formatINR,
    formatLimit,
    type TeacherBillingPlan,
    type TeacherBillingPlanId,
} from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { getTeacher } from "@/lib/firestore/teachers";

type Cadence = "monthly" | "annual";

const PAID_PLAN_ORDER: TeacherBillingPlanId[] = ["starter", "pro"];

export default function SubscribePage() {
    const router = useRouter();
    const { firebaseUser, user } = useAuthContext();
    const [loading, setLoading] = useState(false);
    const [teacher, setTeacher] = useState<any>(null);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cadence, setCadence] = useState<Cadence>("annual");

    useEffect(() => {
        if (!firebaseUser) return;
        getTeacher(firebaseUser.uid).then((t) => setTeacher(t));
    }, [firebaseUser]);

    const plans = PAID_PLAN_ORDER.map((id) => TEACHER_BILLING_PLANS[id]).filter(Boolean);

    const priceFor = (plan: TeacherBillingPlan) =>
        cadence === "annual" ? plan.annualPriceINR : plan.monthlyPriceINR;

    const handleSubscribe = async (plan: TeacherBillingPlan) => {
        if (!firebaseUser || !teacher) {
            setError("Complete onboarding first.");
            return;
        }
        const tag = `${plan.id}:${cadence}`;
        setSelectedPlan(tag);
        setLoading(true);
        setError(null);
        try {
            const amountINR = priceFor(plan);
            const planName = `${plan.name}${cadence === "annual" ? " (Annual)" : ""}`;
            const res = await fetch("/api/teacher/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: plan.id,
                    planName,
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
                description: `${plan.name} • ${cadence === "annual" ? "Annual" : "Monthly"}`,
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
                            planId: plan.id,
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
                    <h1 className="text-3xl font-bold text-gray-900">Choose your plan</h1>
                    <p className="mt-2 text-gray-500">
                        You&apos;re on Free by default. Upgrade for more classes, students, and unlimited content.
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

            {error && (
                <Card className="p-4 bg-red-50 border-red-200 text-red-700 text-sm text-center">{error}</Card>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {plans.map((plan) => {
                    const headline = cadence === "annual" ? annualMonthlyEquivalent(plan) : plan.monthlyPriceINR;
                    const isLoading = loading && selectedPlan === `${plan.id}:${cadence}`;
                    return (
                        <Card
                            key={plan.id}
                            className={`relative flex flex-col p-6 ${
                                plan.recommended ? "border-primary-300 ring-2 ring-primary-100" : ""
                            }`}
                        >
                            {plan.recommended && (
                                <span className="absolute -top-3 left-6 chip-info">Most popular</span>
                            )}
                            <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                            <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
                            <div className="mt-4">
                                <span className="text-3xl font-bold text-gray-900">{formatINR(headline)}</span>
                                <span className="ml-2 text-sm text-gray-500">
                                    /mo {cadence === "annual" ? "(billed yearly)" : ""}
                                </span>
                            </div>
                            {cadence === "annual" && (
                                <p className="mt-0.5 text-xs text-emerald-700">
                                    {formatINR(plan.annualPriceINR)} billed once a year • 2 months free
                                </p>
                            )}
                            <ul className="mt-5 space-y-1.5 text-sm text-gray-700">
                                <li>
                                    {formatLimit(plan.limits.classes)} classes ·{" "}
                                    {formatLimit(plan.limits.students)} students
                                </li>
                                <li>
                                    {formatLimit(plan.limits.tests)} test series ·{" "}
                                    {formatLimit(plan.limits.quizzes)} quizzes
                                </li>
                                <li>{formatLimit(plan.limits.questions)} questions in personal bank</li>
                                {plan.limits.publicMarketplace && <li>Sell on the public marketplace</li>}
                                {plan.limits.customBranding && <li>Custom classroom branding</li>}
                                <li>
                                    Support SLA:{" "}
                                    {plan.limits.supportSlaHours < 0
                                        ? "Community"
                                        : `${plan.limits.supportSlaHours}h`}
                                </li>
                            </ul>
                            <div className="mt-6">
                                <Button
                                    variant={plan.recommended ? "primary" : "outline"}
                                    className="w-full"
                                    onClick={() => handleSubscribe(plan)}
                                    isLoading={isLoading}
                                >
                                    Subscribe to {plan.name}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Card intent="info" className="p-5 text-sm">
                <p className="font-semibold text-info-700">Running an institute with multiple teachers?</p>
                <p className="text-info-700/80 mt-0.5">
                    Institute plans cover multiple teacher seats, a centralised question bank, and institute-wide tests.{" "}
                    <Link href="/for-institutes" className="font-semibold underline">
                        Compare institute plans →
                    </Link>
                </p>
            </Card>
        </div>
    );
}
