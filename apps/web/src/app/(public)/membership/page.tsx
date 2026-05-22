"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { ENTITLEMENT_FEATURES, formatINR } from "@digimine/types";
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

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/subscription/config");
            const data = await res.json();
            setEnforced(Boolean(data.enforced));
            setBanner(data.promoBanner || null);
            setPlans(Array.isArray(data.plans) ? data.plans : []);
            if (firebaseUser) {
                const me = await teacherFetch(firebaseUser, "/api/subscription/me").then((r) => r.json()).catch(() => null);
                setCurrentPlan(me?.entitlements?.planCode || null);
            }
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

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
                setPromoMsg({ ok: true, text: `✓ Code valid — ${detail}` });
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
                await new Promise((r) => { s.onload = r; });
            }
            new (window as any).Razorpay({
                key: data.keyId,
                amount: data.amount,
                currency: data.currency || "INR",
                name: "Digimine",
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
        <main className="bg-slate-50 min-h-screen">
            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 text-white">
                <div className="container-page py-12 sm:py-16 text-center">
                    <h1 className="font-display text-3xl font-bold sm:text-4xl">Membership</h1>
                    <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
                        One membership unlocks DSA/SQL practice, mock tests, quizzes, and courses — whatever your plan
                        includes.
                    </p>
                    {!enforced && (
                        <div className="mx-auto mt-5 inline-block rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-medium text-emerald-300">
                            🎉 Everything is free right now — no payment needed.
                        </div>
                    )}
                    {banner && (
                        <div className="mx-auto mt-3 inline-block rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-medium text-amber-300">
                            {banner}
                        </div>
                    )}
                </div>
            </section>

            <div className="container-page py-10">
                {/* Promo */}
                <Card className="mb-6 p-4 flex flex-wrap items-center gap-3">
                    <input
                        className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase"
                        placeholder="Promo code"
                        value={promo}
                        onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoMsg(null); }}
                    />
                    <span className="text-xs text-slate-500">Apply on a paid plan below to see the discount.</span>
                    {promoMsg && (
                        <span className={`text-sm ${promoMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>{promoMsg.text}</span>
                    )}
                </Card>

                {loading ? (
                    <Card className="p-12 text-center text-sm text-slate-500">Loading plans…</Card>
                ) : plans.length === 0 ? (
                    <Card className="p-12 text-center text-sm text-slate-500">
                        No plans configured yet. (Admin: set them up in the Subscription manager.)
                    </Card>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {plans.map((plan) => {
                            const isCurrent = currentPlan === plan.code;
                            return (
                                <Card key={plan.id} className={`relative flex flex-col p-6 ${plan.recommended ? "border-primary-500 ring-2 ring-primary-200" : ""}`}>
                                    {plan.badge && <span className="absolute -top-3 left-6 chip-info">{plan.badge}</span>}
                                    {isCurrent && <span className="absolute -top-3 right-6 chip-success">Current</span>}
                                    <p className="text-xs uppercase tracking-wider text-slate-500">{plan.tagline}</p>
                                    <h3 className="mt-1 text-xl font-semibold text-slate-900">{plan.name}</h3>
                                    <div className="mt-3">
                                        <span className="text-3xl font-bold text-slate-900">{plan.priceINR > 0 ? formatINR(plan.priceINR) : "Free"}</span>
                                        {plan.compareAtINR ? <span className="ml-2 text-sm text-slate-400 line-through">{formatINR(plan.compareAtINR)}</span> : null}
                                        {plan.priceINR > 0 && <span className="ml-1 text-xs text-slate-500">/{plan.interval === "annual" ? "yr" : plan.interval === "lifetime" ? "once" : "mo"}</span>}
                                    </div>

                                    <ul className="mt-4 space-y-1.5 text-sm text-slate-700 flex-1">
                                        {(plan.highlights.length ? plan.highlights : ENTITLEMENT_FEATURES.filter((f) => plan.features[f.key]).map((f) => f.label)).map((h) => (
                                            <li key={h} className="flex gap-2"><span className="text-primary-600">✓</span><span>{h}</span></li>
                                        ))}
                                    </ul>

                                    <div className="mt-6">
                                        {isCurrent ? (
                                            <Button variant="outline" className="w-full" disabled>Current plan</Button>
                                        ) : plan.priceINR > 0 ? (
                                            <>
                                                <Button variant={plan.recommended ? "primary" : "outline"} className="w-full" isLoading={busyPlan === plan.code} onClick={() => subscribe(plan)}>
                                                    {enforced ? "Subscribe" : "Activate (free now)"}
                                                </Button>
                                                {promo && (
                                                    <button onClick={() => applyPromo(plan.code, plan.priceINR)} className="mt-2 w-full text-center text-xs text-primary-700 hover:underline">
                                                        Check promo on this plan
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <Button variant="outline" className="w-full" isLoading={busyPlan === plan.code} onClick={() => subscribe(plan)}>
                                                Get started free
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
