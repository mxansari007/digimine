"use client";

/**
 * Step 2 of teacher onboarding — a ₹1 refundable pre-authorisation that
 * proves the teacher's payment method is real. This is the abuse gate
 * that stops attackers spinning up free trials with throwaway cards.
 *
 * Flow:
 *   1. Create Razorpay order (₹1)
 *   2. Open Razorpay checkout overlay
 *   3. On success: verify signature server-side + record payment
 *      fingerprint via /api/teacher/onboard step="payment"
 *   4. If fingerprint was seen before, warn the user that the trial will
 *      be reduced — but still let them through
 *   5. Push to profile step
 */
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { OnboardingShell, Stepper, StepHeader } from "@/components/onboarding";

declare global {
    interface Window {
        Razorpay: any;
    }
}

const STEPS = ["Phone", "Payment", "Profile"];

export default function PaymentOnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const phone = searchParams.get("phone") || "";

    const { firebaseUser, isAuthenticated, loading: authLoading } = useAuthContext();

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [fingerprintWarning, setFingerprintWarning] = useState(false);

    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.push("/login");
    }, [authLoading, isAuthenticated, router]);

    useEffect(() => {
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.async = true;
        document.body.appendChild(s);
        return () => {
            try {
                document.body.removeChild(s);
            } catch {
                /* ignore */
            }
        };
    }, []);

    const handlePayment = async () => {
        setError("");
        setLoading(true);
        try {
            const orderRes = await fetch("/api/razorpay/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: [
                        {
                            id: "teacher_preauth",
                            name: "Teacher Verification",
                            price: 1,
                            quantity: 1,
                        },
                    ],
                    subtotal: 1,
                    customerEmail: firebaseUser?.email,
                }),
            });
            const orderData = await orderRes.json();
            if (!orderRes.ok) throw new Error(orderData.error);

            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: orderData.amount,
                currency: "INR",
                name: "PlacementRanker",
                description: "Teacher Verification (₹1)",
                order_id: orderData.razorpayOrderId,
                prefill: { email: firebaseUser?.email },
                handler: async (response: any) => {
                    // Verify signature server-side BEFORE advancing. Without
                    // awaiting + checking, a forged Razorpay callback (or a
                    // real one with a mismatched signature) could push the
                    // teacher into the next step + onboarding completion
                    // without a valid payment landing in our books.
                    const verifyRes = await fetch("/api/razorpay/verify-payment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            orderId: orderData.orderId,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                        }),
                    });
                    const verifyData = await verifyRes.json().catch(() => ({}));
                    if (!verifyRes.ok || verifyData?.success === false) {
                        setError(
                            verifyData?.error ||
                                "We couldn't verify the payment. Your card has not been charged — try again or use a different method."
                        );
                        setLoading(false);
                        return;
                    }
                    const fpRes = await teacherFetch(firebaseUser, "/api/teacher/onboard", {
                        method: "POST",
                        body: JSON.stringify({
                            step: "payment",
                            uid: firebaseUser?.uid,
                            paymentId: response.razorpay_payment_id,
                        }),
                    });
                    const fpData = await fpRes.json();
                    if (fpData.reduced) setFingerprintWarning(true);
                    router.push(`/teacher/onboarding/profile?phone=${encodeURIComponent(phone)}`);
                },
                modal: { ondismiss: () => setLoading(false) },
                theme: { color: "#4f46e5" },
            };
            new window.Razorpay(options).open();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    if (authLoading || !isAuthenticated) {
        return (
            <OnboardingShell maxWidth="md">
                <div className="flex items-center justify-center py-20 text-sm text-slate-500">
                    Loading…
                </div>
            </OnboardingShell>
        );
    }

    return (
        <OnboardingShell maxWidth="md">
            <div className="mb-8">
                <Stepper steps={STEPS} current={1} />
            </div>

            <div className="mb-6">
                <StepHeader
                    title="Verify your payment method"
                    subtitle="A ₹1 refundable pre-authorisation. We don't store your card or UPI."
                    icon={
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-6 w-6"
                            aria-hidden
                        >
                            <rect width="20" height="14" x="2" y="5" rx="2" />
                            <line x1="2" x2="22" y1="10" y2="10" />
                        </svg>
                    }
                />
            </div>

            <Card className="overflow-hidden p-6 sm:p-8">
                {/* Why we charge */}
                <div className="rounded-xl border border-primary-100 bg-primary-50 p-4">
                    <div className="flex gap-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600"
                            aria-hidden
                        >
                            <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <div className="space-y-1 text-sm">
                            <p className="font-semibold text-primary-900">Why ₹1?</p>
                            <p className="text-primary-800/90">
                                We pre-authorise ₹1 to confirm your payment method is real and
                                not disposable. It&apos;s refundable — no actual charge stays
                                on your account.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Trust row */}
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                    <TrustChip label="Secure" sub="Razorpay" />
                    <TrustChip label="Refundable" sub="Within 5 days" />
                    <TrustChip label="One-time" sub="Not recurring" />
                </div>

                {fingerprintWarning && (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                        <p className="font-semibold text-amber-900">Reused payment method</p>
                        <p className="mt-1 text-amber-800">
                            This card/UPI was used to onboard another teacher account before. Your
                            trial has been reduced to 3 days. To get the full 7-day trial, use a
                            different payment method.
                        </p>
                    </div>
                )}

                <div className="mt-6">
                    <Button
                        variant="primary"
                        className="w-full"
                        onClick={handlePayment}
                        isLoading={loading}
                    >
                        Pay ₹1 to continue
                    </Button>
                    <p className="mt-3 text-center text-xs text-slate-400">
                        Secured by Razorpay · Your card details never touch our servers
                    </p>
                </div>

                {error && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}
            </Card>
        </OnboardingShell>
    );
}

function TrustChip({ label, sub }: { label: string; sub: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-slate-700">{label}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
        </div>
    );
}
