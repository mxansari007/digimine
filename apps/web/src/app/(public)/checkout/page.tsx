"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { formatCurrency } from "@digimine/utils";
import { useCart } from "@/contexts/CartContext";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/client"; // Ensure this client init exists or use relative path
import type { Order, OrderStatus, PaymentMethod } from "@digimine/types";
import { v4 as uuidv4 } from "uuid";

export default function CheckoutPage() {
    const { items, subtotal, email, setEmail, guestId, clearCart } = useCart();
    const router = useRouter();
    const [step, setStep] = useState<"email" | "payment">("email");
    const [localEmail, setLocalEmail] = useState(email || "");
    const [isProcessing, setIsProcessing] = useState(false);

    if (items.length === 0) {
        return (
            <div className="bg-gray-50 min-h-screen py-16">
                <div className="container-page text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
                    <p className="text-gray-500 mb-8">Add some awesome products to get started.</p>
                    <Link href="/products">
                        <Button variant="primary" size="lg">Browse Products</Button>
                    </Link>
                </div>
            </div>
        );
    }

    const handleEmailSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (localEmail) {
            setEmail(localEmail);
            setStep("payment");
        }
    };

    const handlePayment = async () => {
        setIsProcessing(true);
        try {
            // 1. Create Order Data
            const orderId = uuidv4();
            const orderRef = doc(db, "orders", orderId);

            const newOrder: Order = {
                id: orderId,
                userId: null, // Guest
                customerEmail: localEmail,
                guestId: guestId,
                items: items,
                subtotal: subtotal,
                discount: 0,
                total: subtotal,
                status: "completed" as OrderStatus, // Auto-complete for digital friction-less
                paymentMethod: "stripe" as PaymentMethod,
                paymentId: "mock_payment_" + uuidv4(),
                createdAt: Timestamp.now().toDate(),
                updatedAt: Timestamp.now().toDate(),
            };

            // 2. Write to Firestore (Client-side)
            // Note: Rules must allow public creation for this to work, or use Server Actions
            await setDoc(orderRef, newOrder);

            // 3. Clear Cart & Redirect
            clearCart();
            router.push(`/success?orderId=${orderId}`);

        } catch (error) {
            console.error("Checkout failed:", error);
            alert("Checkout failed. Please try again.");
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
                        <span className={step === "email" ? "text-primary-600 font-medium" : "text-green-600"}>1. Email</span>
                        <span>/</span>
                        <span className={step === "payment" ? "text-primary-600 font-medium" : ""}>2. Payment</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Form Steps */}
                    <div className="lg:col-span-2 space-y-6">
                        {step === "email" ? (
                            <Card padding="lg">
                                <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
                                <form onSubmit={handleEmailSubmit}>
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                        <input
                                            type="email"
                                            required
                                            value={localEmail}
                                            onChange={(e) => setLocalEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 outline-none"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">We'll send your receipt and download links here.</p>
                                    </div>
                                    <Button type="submit" variant="primary" className="w-full">Continue to Payment</Button>
                                </form>
                            </Card>
                        ) : (
                            <Card padding="lg">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="font-display text-lg font-semibold text-gray-900">Payment Details</h2>
                                    <button onClick={() => setStep("email")} className="text-sm text-primary-600 hover:underline">Edit Email</button>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 text-sm">
                                        <div className="font-medium text-gray-900">Test Payment Mode</div>
                                        <div className="text-gray-500">No real charge will be made.</div>
                                    </div>
                                    {/* Mock Card Input */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                                        <input type="text" placeholder="4242 4242 4242 4242" disabled className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Expiration</label>
                                            <input type="text" placeholder="MM/YY" disabled className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CVC</label>
                                            <input type="text" placeholder="123" disabled className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50" />
                                        </div>
                                    </div>
                                    <Button
                                        onClick={handlePayment}
                                        variant="primary"
                                        className="w-full"
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? "Processing..." : `Pay ${formatCurrency(subtotal)}`}
                                    </Button>
                                    <p className="text-xs text-center text-gray-500 mt-2">
                                        By clicking Pay, you agree to our Terms.
                                    </p>
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* Right Column: Order Summary */}
                    <div>
                        <Card padding="lg" className="sticky top-8">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
                            <div className="space-y-4 mb-6">
                                {items.map((item, i) => (
                                    <div key={i} className="flex gap-3">
                                        <div className="w-12 h-12 bg-gray-100 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200">
                                            {item.productImage ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
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
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
