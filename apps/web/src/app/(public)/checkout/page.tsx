"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { formatCurrency } from "@digimine/utils";
import { useAuthContext } from "@/contexts/AuthContext";
import { getProduct } from "@/lib/firestore";
import type { Product, OrderItem } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";
import Script from "next/script";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { initiateCheckout, addPaymentInfo } from "@/lib/fpixel";

export default function CheckoutPage() {
    const searchParams = useSearchParams();
    const productId = searchParams.get("productId");
    const productType = searchParams.get("type");
    const { firebaseUser } = useAuthContext();

    const [directProduct, setDirectProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(!!productId);
    const [step, setStep] = useState<"contact" | "payment">("contact");
    const [localEmail, setLocalEmail] = useState("");
    const [guestId, setGuestId] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const paymentCompletedRef = useRef(false);

    useEffect(() => {
        // Init guest ID
        let id = localStorage.getItem("guestId");
        if (!id) {
            id = uuidv4();
            localStorage.setItem("guestId", id);
        }
        setGuestId(id);

        if (productId) {
            const fetchProduct = async () => {
                try {
                    let p: any = null;
                    if (productType === "test_series") {
                        const { getTestSeries } = await import("@/lib/firestore/tests");
                        const seriesData = await getTestSeries(productId as string);
                        if (seriesData) {
                            p = {
                                id: seriesData.id,
                                name: seriesData.title,
                                price: seriesData.price,
                                thumbnailURL: seriesData.thumbnailURL,
                                type: "test_series"
                            };
                        }
                    } else {
                        p = await getProduct(productId as string);
                    }
                    setDirectProduct(p);
                    // Fire InitiateCheckout when product is loaded
                    if (p) {
                        initiateCheckout({
                            value: p.price,
                            contentIds: [p.id],
                            numItems: 1,
                        });
                    }
                } catch (err) {
                    console.error("Error fetching product for checkout:", err);
                } finally {
                    setLoading(false);
                }
            }
            fetchProduct();
        }
    }, [productId]);

    // Use either direct product or cart items
    const displayItems: OrderItem[] = directProduct
        ? [{
            productId: directProduct.id,
            productName: directProduct.name,
            price: directProduct.price,
            quantity: 1,
            productImage: directProduct.thumbnailURL || null
        }]
        : [];

    const displaySubtotal = directProduct ? directProduct.price : 0;

    if (loading) {
        return (
            <div className="bg-gray-50 min-h-screen py-16 flex items-center justify-center">
                <div className="text-center font-medium text-gray-500">Loading checkout...</div>
            </div>
        );
    }

    if (displayItems.length === 0) {
        return (
            <div className="bg-gray-50 min-h-screen py-16">
                <div className="container-page text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">No product selected</h1>
                    <p className="text-gray-500 mb-8">Please select a product to purchase.</p>
                    <Link href="/products">
                        <Button variant="primary" size="lg">Browse Products</Button>
                    </Link>
                </div>
            </div>
        );
    }

    const handleContactSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFieldErrors({});
        
        const errors: { email?: string; phone?: string } = {};
        
        if (!localEmail || !/\S+@\S+\.\S+/.test(localEmail)) {
            errors.email = "Please enter a valid email address";
        }
        
        // Basic phone validation (react-international-phone handles format, but we check if it's too short)
        if (!phoneNumber || phoneNumber.length < 8) {
            errors.phone = "Please enter a valid phone number";
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        // Fire AddPaymentInfo event
        addPaymentInfo({
            value: displaySubtotal,
            contentIds: displayItems.map((item) => item.productId),
        });

        setStep("payment");
    };

    const handlePayment = async () => {
        setIsProcessing(true);
        setPaymentError(null);
        paymentCompletedRef.current = false;

        if (displaySubtotal === 0) {
            try {
                const createOrderResponse = await fetch("/api/orders/create-free", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        items: displayItems,
                        subtotal: displaySubtotal,
                        customerEmail: localEmail,
                        customerPhone: phoneNumber,
                        guestId: guestId,
                    }),
                });

                if (!createOrderResponse.ok) {
                    const errorData = await createOrderResponse.json();
                    throw new Error(errorData.error || "Failed to create order");
                }

                const { orderId, accessKey } = await createOrderResponse.json();
                window.location.href = `/success?orderId=${orderId}&accessKey=${accessKey}`;
            } catch (error) {
                console.error("Order error:", error);
                setPaymentError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
                setIsProcessing(false);
            }
            return;
        }

        // Check Razorpay script is loaded
        if (!(window as any).Razorpay) {
            setPaymentError("Payment gateway is still loading. Please wait a moment and try again.");
            setIsProcessing(false);
            return;
        }

        try {
            // Step 1: Create order via API. Pass the bearer token when the
            // shopper is signed in so the order gets linked to their uid
            // and `purchasedProducts` is updated after verify.
            const authHeader: Record<string, string> = {};
            if (firebaseUser) {
                try {
                    const token = await firebaseUser.getIdToken();
                    authHeader.Authorization = `Bearer ${token}`;
                } catch {
                    /* fall back to guest */
                }
            }
            const createOrderResponse = await fetch("/api/razorpay/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeader },
                body: JSON.stringify({
                    items: displayItems,
                    subtotal: displaySubtotal,
                    customerEmail: localEmail,
                    customerPhone: phoneNumber,
                    guestId: guestId,
                }),
            });

            if (!createOrderResponse.ok) {
                const errorData = await createOrderResponse.json();
                throw new Error(errorData.error || "Failed to create order");
            }

            const { orderId, razorpayOrderId, amount, currency } = await createOrderResponse.json();

            // Step 2: Open Razorpay checkout
            const options: any = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: amount,
                currency: currency,
                name: "PlacementRanker",
                description: "Purchase from PlacementRanker",
                order_id: razorpayOrderId,
                handler: async function (response: any) {
                    paymentCompletedRef.current = true;
                    setIsVerifying(true);
                    setIsProcessing(true);
                    try {
                        const verifyRes = await fetch("/api/razorpay/verify-payment", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                orderId: orderId,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                            }),
                        });
                        const verifyData = await verifyRes.json();
                        if (verifyData.success) {
                            window.location.href = `/success?orderId=${orderId}&accessKey=${verifyData.accessKey}`;
                        } else {
                            setPaymentError(verifyData.error || "Payment verification failed. Please contact support.");
                            setIsVerifying(false);
                            setIsProcessing(false);
                        }
                    } catch (error) {
                        setPaymentError("Payment verification failed. Please contact support if money was deducted.");
                        setIsVerifying(false);
                        setIsProcessing(false);
                    }
                },
                prefill: {
                    email: localEmail,
                    contact: phoneNumber,
                },
                theme: {
                    color: "#0F172A",
                },
                modal: {
                    ondismiss: function () {
                        if (!paymentCompletedRef.current) {
                            setPaymentError("Payment was cancelled. You can try again whenever you're ready.");
                            setIsProcessing(false);
                            setIsVerifying(false);
                        }
                    },
                    confirm_close: true,
                },
            };

            const rzp1 = new (window as any).Razorpay(options);

            rzp1.on("payment.failed", function (response: any) {
                const errorDesc = response.error?.description || "Payment failed";
                const errorReason = response.error?.reason || "";
                let userMessage = errorDesc;

                if (errorReason === "payment_cancelled") {
                    userMessage = "Payment was cancelled. You can try again whenever you're ready.";
                } else if (errorReason === "payment_failed") {
                    userMessage = "Payment failed. Please try a different payment method or try again later.";
                }

                setPaymentError(userMessage);
                setIsProcessing(false);
                setIsVerifying(false);
            });

            rzp1.open();

        } catch (error) {
            console.error("Payment error:", error);
            setPaymentError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
            <div className="container-page">
                <div className="mb-8">
                    <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">Checkout</h1>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className={step === "contact" ? "text-primary-600 font-medium" : "text-green-600"}>1. Contact</span>
                        <span>/</span>
                        <span className={step === "payment" ? "text-primary-600 font-medium" : ""}>2. Payment</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Form Steps */}
                    <div className="lg:col-span-2 space-y-6">
                        {step === "contact" ? (
                            <Card padding="lg">
                                <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
                                <form onSubmit={handleContactSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                        <input
                                            type="email"
                                            value={localEmail}
                                            onChange={(e) => {
                                                setLocalEmail(e.target.value);
                                                if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                                            }}
                                            placeholder="you@example.com"
                                            className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.email ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`}
                                        />
                                        {fieldErrors.email ? (
                                            <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                {fieldErrors.email}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-gray-500 mt-1">We&apos;ll send your receipt and download links here.</p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                        <PhoneInput
                                            defaultCountry="in"
                                            value={phoneNumber}
                                            onChange={(phone) => {
                                                setPhoneNumber(phone);
                                                if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: undefined });
                                            }}
                                            inputClassName={`!w-full !px-4 !py-3 !rounded-r-lg !border-y !border-r ${fieldErrors.phone ? "!border-red-500 focus:!ring-red-200" : "!border-gray-300 focus:!ring-primary-200"} focus:!ring-2 !outline-none !transition-all !text-base`}
                                            countrySelectorStyleProps={{
                                                buttonClassName: `!px-3 !py-3 ${fieldErrors.phone ? "!border-red-500" : "!border-gray-300"} !rounded-l-lg hover:!bg-gray-50 !transition-all`,
                                            }}
                                            className="!w-full"
                                        />
                                        {fieldErrors.phone ? (
                                            <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                {fieldErrors.phone}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-gray-500 mt-1">For order updates and delivery notifications.</p>
                                        )}
                                    </div>
                                    <div className="pt-2">
                                        <Button type="submit" variant="primary" className="w-full" size="lg">Continue to Payment</Button>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        <span>Your information is secure and encrypted</span>
                                    </div>
                                </form>
                            </Card>
                        ) : (
                            <Card padding="lg">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="font-display text-lg font-semibold text-gray-900">Payment Details</h2>
                                    <button onClick={() => setStep("contact")} className="text-sm text-primary-600 hover:underline">Edit Contact</button>
                                </div>
                                <div className="space-y-4">
                                    {/* Contact Summary */}
                                    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                                        <div className="text-sm">
                                            <div className="font-medium text-gray-900">{localEmail}</div>
                                            <div className="text-gray-500">{phoneNumber}</div>
                                        </div>
                                    </div>

                                    {/* Payment Info */}
                                    <div className="p-4 border border-green-200 rounded-lg bg-green-50">
                                        <div className="flex items-center gap-2 text-green-700">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                            <span className="font-medium">Secure Payment via Razorpay</span>
                                        </div>
                                        <p className="text-sm text-green-600 mt-1">
                                            Pay securely with UPI, Cards, Net Banking, or Wallets
                                        </p>
                                    </div>

                                    {/* Payment Error */}
                                    {paymentError && (
                                        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                                            <div className="flex items-center gap-2 text-red-700">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="font-medium">Payment Error</span>
                                            </div>
                                            <p className="text-sm text-red-600 mt-1">{paymentError}</p>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handlePayment}
                                        variant="primary"
                                        className="w-full"
                                        disabled={isProcessing}
                                    >
                                        {isVerifying ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Verifying Payment...
                                            </span>
                                        ) : isProcessing ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Opening Razorpay...
                                            </span>
                                        ) : (
                                            displaySubtotal === 0 ? "Get Free Access" : `Pay ${formatCurrency(displaySubtotal)}`
                                        )}
                                    </Button>
                                    <p className="text-xs text-center text-gray-500 mt-2">
                                        By clicking Pay, you agree to our Terms of Service.
                                    </p>

                                    {/* Payment Methods */}
                                    <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-100">
                                        <span className="text-xs text-gray-400">Powered by</span>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">Razorpay</div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* Right Column: Order Summary */}
                    <div>
                        <Card padding="lg" className="sticky top-8">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
                            <div className="space-y-4 mb-6">
                                {displayItems.map((item, i) => (
                                    <div key={i} className="flex gap-3">
                                        <div className="w-12 h-12 bg-gray-100 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 relative">
                                            {item.productImage ? (
                                                <Image src={item.productImage} alt={item.productName} fill sizes="48px" className="object-cover" />
                                            ) : (
                                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-900 truncate">{item.productName}</div>
                                            <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
                                        </div>
                                        <div className="text-sm font-medium">{formatCurrency(item.price * item.quantity)}</div>
                                    </div>
                                ))}
                            </div>
                            <hr className="my-4" />
                            <div className="flex justify-between font-bold text-gray-900 text-lg">
                                <span>Total</span>
                                <span>{formatCurrency(displaySubtotal)}</span>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
