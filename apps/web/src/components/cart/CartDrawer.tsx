"use client";

import { useCart } from "@/contexts/CartContext";
import { Button } from "@digimine/ui";
import { formatCurrency } from "@digimine/utils";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function CartDrawer() {
    const { items, removeItem, subtotal, isDrawerOpen, closeDrawer } = useCart();
    const router = useRouter();

    // Lock body scroll when drawer is open
    useEffect(() => {
        if (isDrawerOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isDrawerOpen]);

    // Handle Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isDrawerOpen) {
                closeDrawer();
            }
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isDrawerOpen, closeDrawer]);

    const handleCheckout = () => {
        closeDrawer();
        router.push("/checkout");
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                onClick={closeDrawer}
                aria-hidden="true"
            />

            {/* Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${isDrawerOpen ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="font-display text-xl font-bold text-gray-900">
                        Your Cart
                        {items.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-gray-500">
                                ({items.length} {items.length === 1 ? "item" : "items"})
                            </span>
                        )}
                    </h2>
                    <button
                        onClick={closeDrawer}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Close cart"
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col h-[calc(100%-72px)]">
                    {items.length === 0 ? (
                        /* Empty State */
                        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <h3 className="font-display text-lg font-semibold text-gray-900 mb-2">
                                Your cart is empty
                            </h3>
                            <p className="text-gray-500 mb-6">
                                Discover amazing digital products to get started
                            </p>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    closeDrawer();
                                    router.push("/products");
                                }}
                            >
                                Browse Products
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Cart Items */}
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="space-y-4">
                                    {items.map((item) => (
                                        <div
                                            key={item.productId}
                                            className="flex gap-4 p-4 bg-gray-50 rounded-xl"
                                        >
                                            {/* Thumbnail */}
                                            <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200">
                                                {item.productImage ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                )}
                                            </div>

                                            {/* Details */}
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-gray-900 truncate">
                                                    {item.productName}
                                                </h4>
                                                <p className="text-sm text-gray-500">
                                                    Digital Product
                                                </p>
                                                <p className="font-semibold text-gray-900 mt-1">
                                                    {formatCurrency(item.price)}
                                                </p>
                                            </div>

                                            {/* Remove Button */}
                                            <button
                                                onClick={() => removeItem(item.productId)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                aria-label="Remove item"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer with Summary & Checkout */}
                            <div className="border-t border-gray-200 px-6 py-4 bg-white">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-gray-600">Subtotal</span>
                                    <span className="text-xl font-bold text-gray-900">
                                        {formatCurrency(subtotal)}
                                    </span>
                                </div>
                                <Button
                                    variant="primary"
                                    className="w-full text-lg py-3"
                                    onClick={handleCheckout}
                                >
                                    Checkout
                                </Button>
                                <p className="text-xs text-center text-gray-500 mt-3">
                                    Secure checkout. Instant access after payment.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
