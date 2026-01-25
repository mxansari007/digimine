"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { formatCurrency } from "@digimine/utils";
import { getProduct } from "@/lib/firestore";
import type { Product, OrderItem } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";
import { load } from "@cashfreepayments/cashfree-js";

export default function CheckoutPage() {
    const searchParams = useSearchParams();
    const productId = searchParams.get("productId");
    const router = useRouter();

    const [directProduct, setDirectProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(!!productId);
    const [step, setStep] = useState<"contact" | "payment">("contact");
    const [localEmail, setLocalEmail] = useState("");
    const [guestId, setGuestId] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

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
                    const p = await getProduct(productId as string);
                    setDirectProduct(p);
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
        if (localEmail && phoneNumber) {
            setStep("payment");
        }
    };

    const handlePayment = async () => {
        setIsProcessing(true);
        setPaymentError(null);

        try {
            // Step 1: Create order via API
            const createOrderResponse = await fetch("/api/cashfree/create-order", {
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

            const { orderId, paymentSessionId } = await createOrderResponse.json();

            // Step 2: Initialize Cashfree SDK
            const cashfree = await load({
                mode: process.env.NEXT_PUBLIC_CASHFREE_ENV === "production" ? "production" : "sandbox",
            });

            // Step 3: Open Cashfree checkout
            const checkoutOptions: { paymentSessionId: string; redirectTarget: "_self" } = {
                paymentSessionId: paymentSessionId,
                redirectTarget: "_self",
            };

            const result = await cashfree.checkout(checkoutOptions);

            if (result.error) {
                // Payment was closed or failed
                console.error("Cashfree checkout error:", result.error);
                setPaymentError(result.error.message || "Payment was cancelled or failed");
            } else if (result.paymentDetails) {
                // Payment completed, redirect to verify
                router.push(`/success?orderId=${orderId}`);
            }

        } catch (error) {
            console.error("Payment error:", error);
            setPaymentError(error instanceof Error ? error.message : "Payment failed. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8">
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
                                            required
                                            value={localEmail}
                                            onChange={(e) => setLocalEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">We&apos;ll send your receipt and download links here.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                        <input
                                            type="tel"
                                            required
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="+91 98765 43210"
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 outline-none transition-all"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">For order updates and delivery notifications.</p>
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
                                            <span className="font-medium">Secure Payment via Cashfree</span>
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
                                        {isProcessing ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Processing...
                                            </span>
                                        ) : (
                                            `Pay ${formatCurrency(displaySubtotal)}`
                                        )}
                                    </Button>
                                    <p className="text-xs text-center text-gray-500 mt-2">
                                        By clicking Pay, you agree to our Terms of Service.
                                    </p>

                                    {/* Payment Methods */}
                                    <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-100">
                                        <span className="text-xs text-gray-400">Powered by</span>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">Cashfree</div>
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
