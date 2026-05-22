"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

declare global { interface Window { Razorpay: any; } }

export default function PaymentOnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const phone = searchParams.get("phone") || "";
    const { firebaseUser, isAuthenticated, loading: authLoading } = useAuthContext();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [fingerprintWarning, setFingerprintWarning] = useState(false);

    useEffect(() => { if (!authLoading && !isAuthenticated) router.push("/login"); }, [authLoading, isAuthenticated]);
    useEffect(() => { const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true; document.body.appendChild(s); }, []);

    if (authLoading || !isAuthenticated) return <div className="flex items-center justify-center min-h-screen bg-slate-100"><div className="text-gray-500">Loading...</div></div>;

    const handlePayment = async () => {
        setError(""); setLoading(true);
        try {
            const orderRes = await fetch("/api/razorpay/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ id: "teacher_preauth", name: "Teacher Verification", price: 1, quantity: 1 }], subtotal: 1, customerEmail: firebaseUser?.email }) });
            const orderData = await orderRes.json();
            if (!orderRes.ok) throw new Error(orderData.error);

            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, amount: orderData.amount, currency: "INR", name: "Digimine", description: "Teacher Verification (₹1)", order_id: orderData.razorpayOrderId,
                prefill: { email: firebaseUser?.email },
                handler: async (response: any) => {
                    await fetch("/api/razorpay/verify-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: orderData.orderId, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }) });
                    const fpRes = await teacherFetch(firebaseUser, "/api/teacher/onboard", { method: "POST", body: JSON.stringify({ step: "payment", uid: firebaseUser?.uid, paymentId: response.razorpay_payment_id }) });
                    const fpData = await fpRes.json();
                    if (fpData.reduced) setFingerprintWarning(true);
                    router.push(`/teacher/onboarding/profile?phone=${encodeURIComponent(phone)}`);
                },
                modal: { ondismiss: () => setLoading(false) },
                theme: { color: "#4f46e5" },
            };
            new window.Razorpay(options).open();
        } catch (err: any) { setError(err.message); setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
            <Card className="w-full max-w-md p-8">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Verify Payment Method</h1>
                    <p className="mt-1 text-gray-500">Step 2 of 3 — ₹1 Pre-Authorization</p>
                </div>

                <Card className="p-4 mb-6 bg-primary-50 border-primary-200">
                    <p className="text-primary-800 text-sm">We charge ₹1 to verify your payment method. This is refundable and prevents abuse of the free trial.</p>
                </Card>

                {fingerprintWarning && (
                    <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
                        <p className="text-amber-700 text-sm">This payment method was used before. Trial reduced to 3 days.</p>
                    </Card>
                )}

                <Button variant="primary" className="w-full" onClick={handlePayment} isLoading={loading}>Pay ₹1 to Continue</Button>
                <p className="text-gray-400 text-xs text-center mt-3">Secure via Razorpay. We never store your UPI or card details.</p>

                {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
                <div className="flex justify-center gap-2 mt-6">
                    <div className="h-1.5 w-12 bg-primary-500 rounded-full" /><div className="h-1.5 w-12 bg-primary-500 rounded-full" /><div className="h-1.5 w-12 bg-gray-300 rounded-full" />
                </div>
            </Card>
        </div>
    );
}
