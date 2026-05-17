"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { getTestBySlug } from "@/lib/firestore/tests";
import { useAuthContext } from "@/contexts/AuthContext";
import type { TestSeries } from "@digimine/types";

// Declare Razorpay
declare global {
    interface Window {
        Razorpay: any;
    }
}

export default function TestPurchasePage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthContext();
    const slug = params.slug as string;

    const [test, setTest] = useState<TestSeries | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [razorpayReady, setRazorpayReady] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            router.push(`/login?redirect=/tests/${slug}/purchase`);
            return;
        }
        loadTest();
    }, [user, slug]);

    useEffect(() => {
        if (typeof window !== "undefined" && typeof window.Razorpay === "function") {
            setRazorpayReady(true);
        }
    }, []);

    async function loadTest() {
        try {
            setLoading(true);
            const testData = await getTestBySlug(slug);
            if (!testData) {
                router.push("/tests");
                return;
            }
            
            // Check if test is free
            if (testData.accessType === "free") {
                router.push(`/tests/${slug}`);
                return;
            }
            
            setTest(testData);
        } catch (error) {
            console.error("Error loading test:", error);
        } finally {
            setLoading(false);
        }
    }

    const handlePurchase = async () => {
        if (!test || !user) return;

        setProcessing(true);
        setPaymentError(null);

        if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
            setPaymentError("Payment gateway key is not configured. Please contact support.");
            setProcessing(false);
            return;
        }

        if (!razorpayReady || typeof window.Razorpay !== "function") {
            setPaymentError("Payment gateway is still loading. Please wait a moment and try again.");
            setProcessing(false);
            return;
        }

        try {
            // Create order
            const response = await fetch("/api/razorpay/create-test-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    testId: test.id,
                    amount: test.price,
                    userId: user.id,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to create order");
            }

            if (data.alreadyPurchased) {
                router.push(`/tests/${test.slug}`);
                return;
            }

            // Initialize Razorpay
            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: data.amount,
                currency: data.currency,
                name: "Digimine",
                description: `Purchase: ${test.title}`,
                order_id: data.razorpayOrderId,
                handler: async (response: any) => {
                    try {
                        // Verify payment
                        const verifyResponse = await fetch("/api/razorpay/verify-test-payment", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                                orderId: data.orderId,
                                testId: test.id,
                                userId: user.id,
                            }),
                        });

                        const verifyData = await verifyResponse.json();

                        if (verifyResponse.ok) {
                            // Redirect to the series so the user can choose a specific test.
                            router.push(`/tests/${test.slug}`);
                        } else {
                            throw new Error(verifyData.error || "Payment verification failed");
                        }
                    } catch (error) {
                        console.error("Payment verification error:", error);
                        alert("Payment verification failed. Please contact support.");
                        setProcessing(false);
                    }
                },
                prefill: {
                    email: user.email,
                },
                theme: {
                    color: "#4F46E5",
                },
                modal: {
                    ondismiss: () => {
                        setPaymentError("Payment was cancelled. You can try again whenever you're ready.");
                        setProcessing(false);
                    },
                    confirm_close: true,
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on("payment.failed", (response: any) => {
                setPaymentError(response.error?.description || "Payment failed. Please try again.");
                setProcessing(false);
            });
            rzp.open();
        } catch (error) {
            console.error("Purchase error:", error);
            setPaymentError(error instanceof Error ? error.message : "Failed to process purchase");
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!test) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <Script
                src="https://checkout.razorpay.com/v1/checkout.js"
                strategy="afterInteractive"
                onLoad={() => setRazorpayReady(typeof window.Razorpay === "function")}
                onReady={() => setRazorpayReady(typeof window.Razorpay === "function")}
                onError={() => setPaymentError("Payment gateway could not be loaded. Please check your connection and refresh.")}
            />
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Breadcrumb */}
                <nav className="mb-6">
                    <ol className="flex items-center gap-2 text-sm text-gray-500">
                        <li>
                            <Link href="/tests" className="hover:text-gray-700">
                                Tests
                            </Link>
                        </li>
                        <li>/</li>
                        <li>
                            <Link href={`/tests/${test.slug}`} className="hover:text-gray-700">
                                {test.title}
                            </Link>
                        </li>
                        <li>/</li>
                        <li className="text-gray-900 font-medium">Purchase</li>
                    </ol>
                </nav>

                <Card className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Purchase</h1>
                        <p className="text-gray-600">You are purchasing access to the following test:</p>
                    </div>

                    {/* Test Summary */}
                    <div className="bg-gray-50 rounded-xl p-6 mb-8">
                        <div className="flex items-start gap-4">
                            <div className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center text-3xl">
                                {test.thumbnailURL ? (
                                    <img src={test.thumbnailURL} alt={test.title} className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                    "📝"
                                )}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-gray-900">{test.title}</h2>
                                <p className="text-gray-600 text-sm mt-1">{test.shortDescription}</p>
                                <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                                    <span>🧪 {test.totalTests} tests</span>
                                    <span>📝 {test.totalQuestions} questions</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pricing */}
                    <div className="border-t border-gray-200 pt-6 mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-gray-600">Test Price</span>
                            <span className="text-lg font-medium text-gray-900">₹{test.price}</span>
                        </div>
                        {test.compareAtPrice && test.compareAtPrice > test.price && (
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-gray-600">Original Price</span>
                                <span className="text-lg text-gray-500 line-through">₹{test.compareAtPrice}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                            <span className="text-xl font-bold text-gray-900">Total</span>
                            <span className="text-2xl font-bold text-indigo-600">₹{test.price}</span>
                        </div>
                    </div>

                    {paymentError && (
                        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {paymentError}
                        </div>
                    )}

                    {/* CTA */}
                    <Button
                        onClick={handlePurchase}
                        disabled={processing || !razorpayReady}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 text-lg font-medium"
                    >
                        {processing ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                                Processing...
                            </span>
                        ) : !razorpayReady ? (
                            "Loading Payment Gateway..."
                        ) : (
                            `Pay ₹${test.price}`
                        )}
                    </Button>

                    <p className="text-center text-sm text-gray-500 mt-4">
                        Secure payment powered by Razorpay
                    </p>
                </Card>
            </div>
        </div>
    );
}
