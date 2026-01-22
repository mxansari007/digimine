"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSignInWithEmailLink } from "firebase/auth";
import { auth } from "@/lib/firebase/client"; // Use client for internal checks
import { signInWithMagicLink } from "@/lib/firebase/auth"; // Use our wrapper
import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export default function AuthActionPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState("Verifying magic link...");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleAuth = async () => {
            const email = window.localStorage.getItem("emailForSignIn") || searchParams.get("email");
            const href = window.location.href;

            if (isSignInWithEmailLink(auth, href)) {
                if (!email) {
                    // User opened link on a different device. Ask for email.
                    // Simple prompt for now, could be a better UI
                    const userEmail = window.prompt("Please provide your email for confirmation");
                    if (!userEmail) {
                        setError("Email is required to sign in.");
                        return;
                    }
                    // Recursively call or just proceed
                    await completeSignIn(userEmail, href);
                } else {
                    await completeSignIn(email, href);
                }
            } else {
                setError("Invalid authentication link.");
            }
        };

        const completeSignIn = async (email: string, href: string) => {
            try {
                setStatus("Signing you in...");
                const result = await signInWithMagicLink(email, href);
                window.localStorage.removeItem("emailForSignIn");

                setStatus("Linking your orders...");
                await linkGuestOrders(result.user.uid, result.user.email!);

                setStatus("Success! Redirecting...");
                setTimeout(() => router.push("/dashboard"), 1000);
            } catch (err: any) {
                console.error(err);
                setError(err.message || "Failed to sign in.");
            }
        };

        const linkGuestOrders = async (userId: string, email: string) => {
            try {
                // Find all orders for this email that have NO userId
                const q = query(
                    collection(db, "orders"),
                    where("customerEmail", "==", email),
                    where("userId", "==", null)
                );

                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const batch = writeBatch(db);
                    const purchasedProductIds: string[] = [];

                    snapshot.docs.forEach(orderDoc => {
                        batch.update(doc(db, "orders", orderDoc.id), { userId: userId });

                        // Collect all product IDs from this order
                        const orderData = orderDoc.data();
                        if (orderData.items && Array.isArray(orderData.items)) {
                            orderData.items.forEach((item: any) => {
                                if (item.productId && !purchasedProductIds.includes(item.productId)) {
                                    purchasedProductIds.push(item.productId);
                                }
                            });
                        }
                    });

                    // Update user's purchasedProducts array
                    if (purchasedProductIds.length > 0) {
                        const userRef = doc(db, "users", userId);
                        const { arrayUnion } = await import("firebase/firestore");
                        batch.update(userRef, {
                            purchasedProducts: arrayUnion(...purchasedProductIds)
                        });
                    }

                    await batch.commit();
                    console.log(`Linked ${snapshot.size} orders and ${purchasedProductIds.length} products to user ${userId}`);
                }
            } catch (e) {
                console.error("Error linking orders:", e);
                // Don't block login on linking failure
            }
        };

        handleAuth();
    }, [router, searchParams]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="bg-red-50 text-red-800 p-6 rounded-lg max-w-md text-center">
                    <h2 className="font-bold text-lg mb-2">Authentication Failed</h2>
                    <p>{error}</p>
                    <button
                        onClick={() => router.push("/login")}
                        className="mt-4 px-4 py-2 bg-red-100 rounded hover:bg-red-200 transition-colors"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-6"></div>
                <h2 className="text-xl font-medium text-gray-900">{status}</h2>
            </div>
        </div>
    );
}
