"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { doc, updateDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { formatCurrency } from "@digimine/utils";
import { getUserTestPurchases, getTestSeriesBySlug } from "@/lib/firestore/tests";
import type { Order, TestPurchase } from "@digimine/types";
import { PageLoading } from "@/components/common";

export default function ProfilePage() {
    const { user, firebaseUser } = useAuthContext();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    // Purchase history
    const [orders, setOrders] = useState<Order[]>([]);
    const [testPurchases, setTestPurchases] = useState<Array<TestPurchase & { seriesTitle?: string }>>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);

    // Initialize form with user data
    useEffect(() => {
        if (user) {
            setFirstName(user.firstName || "");
            setLastName(user.lastName || "");
            setPhoneNumber(user.phoneNumber || "");
        }
    }, [user]);

    // Fetch purchase history
    useEffect(() => {
        if (!firebaseUser) {
            setLoadingOrders(false);
            return;
        }

        async function fetchOrders() {
            try {
                // Query by userId
                const userIdQuery = query(
                    collection(db, "orders"),
                    where("userId", "==", firebaseUser!.uid)
                );
                const userIdSnapshot = await getDocs(userIdQuery);

                // Also query by email for guest orders that weren't linked
                const emailQuery = query(
                    collection(db, "orders"),
                    where("customerEmail", "==", firebaseUser!.email)
                );
                const emailSnapshot = await getDocs(emailQuery);

                // Combine and deduplicate orders
                const orderMap = new Map<string, Order>();

                [...userIdSnapshot.docs, ...emailSnapshot.docs].forEach(doc => {
                    if (!orderMap.has(doc.id)) {
                        const data = doc.data();
                        orderMap.set(doc.id, {
                            id: doc.id,
                            ...data,
                            createdAt: data.createdAt?.toDate() || new Date(),
                            updatedAt: data.updatedAt?.toDate() || new Date(),
                        } as Order);
                    }
                });

                const orderData = Array.from(orderMap.values());

                // Sort by date descending
                orderData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                setOrders(orderData);

                // Fetch test series purchases
                const purchases = await getUserTestPurchases(firebaseUser!.uid);
                const purchasesWithTitles = await Promise.all(
                    purchases.map(async (purchase) => {
                        const series = await getTestSeriesBySlug(purchase.seriesId);
                        return { ...purchase, seriesTitle: series?.title || purchase.seriesId };
                    })
                );
                setTestPurchases(purchasesWithTitles);
            } catch (err) {
                console.error("Error fetching orders:", err);
            } finally {
                setLoadingOrders(false);
            }
        }
        fetchOrders();
    }, [firebaseUser]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firebaseUser) return;

        setSaving(true);
        setMessage(null);

        try {
            const displayName = `${firstName} ${lastName}`.trim();
            await updateDoc(doc(db, "users", firebaseUser.uid), {
                firstName,
                lastName,
                displayName,
                phoneNumber: phoneNumber || null,
                updatedAt: Timestamp.now(),
            });
            setMessage({ type: "success", text: "Profile updated successfully!" });
        } catch (err) {
            console.error("Error updating profile:", err);
            setMessage({ type: "error", text: "Failed to update profile" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    Profile Settings
                </h1>
                <p className="text-gray-600">
                    Manage your account settings and view purchases
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Profile Form */}
                <div className="lg:col-span-2 space-y-6">
                    <Card padding="lg">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                            Personal Information
                        </h2>

                        <form onSubmit={handleUpdateProfile} className="space-y-6">
                            {message && (
                                <div
                                    className={`px-4 py-3 rounded-lg text-sm ${message.type === "success"
                                        ? "bg-green-50 border border-green-200 text-green-700"
                                        : "bg-red-50 border border-red-200 text-red-700"
                                        }`}
                                >
                                    {message.text}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label
                                        htmlFor="firstName"
                                        className="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        First Name
                                    </label>
                                    <input
                                        id="firstName"
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        placeholder="John"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="lastName"
                                        className="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        Last Name
                                    </label>
                                    <input
                                        id="lastName"
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={firebaseUser?.email || ""}
                                    disabled
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Email cannot be changed
                                </p>
                            </div>

                            <div>
                                <label
                                    htmlFor="phone"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Phone Number
                                </label>
                                <input
                                    id="phone"
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                    placeholder="+91 98765 43210"
                                />
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    isLoading={saving}
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </Card>

                    {/* Purchase History */}
                    <Card padding="lg">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                            Purchase History
                        </h2>

                        {loadingOrders ? (
                            <PageLoading variant="inline" />
                        ) : orders.length === 0 ? (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                </div>
                                <p className="text-gray-500 mb-4">No purchases yet</p>
                                <Link href="/products">
                                    <Button variant="primary" size="sm">Browse Products</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {orders.map((order) => (
                                    <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    Order #{order.id.slice(0, 8)}...
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${order.status === 'completed'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-600">{item.productName}</span>
                                                    <span className="text-gray-900">{formatCurrency(item.price)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between font-medium">
                                            <span>Total</span>
                                            <span>{formatCurrency(order.total)}</span>
                                        </div>
                                    </div>
                                ))}

                                {/* Test Series Purchases */}
                                {testPurchases.length > 0 && (
                                    <>
                                        <div className="pt-2 pb-1">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Test Series Purchases</p>
                                        </div>
                                        {testPurchases.map((purchase) => (
                                            <div key={purchase.id} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">
                                                            {purchase.seriesTitle}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(purchase.purchasedAt).toLocaleDateString('en-IN', {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric'
                                                            })}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${purchase.status === 'active'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-gray-100 text-gray-600'
                                                        }`}>
                                                        {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">Test Series Access</span>
                                                    <span className="text-gray-900">{formatCurrency(purchase.price)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar */}
                <div>
                    {/* Account Info */}
                    <Card padding="lg">
                        <h3 className="font-semibold text-gray-900 mb-4">Account</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-500">Member Since</p>
                                <p className="text-gray-900">
                                    {user?.createdAt
                                        ? new Date(user.createdAt).toLocaleDateString()
                                        : "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Account Type</p>
                                <p className="text-gray-900 capitalize">{user?.role || "Customer"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Products Owned</p>
                                <p className="text-gray-900">{user?.purchasedProducts?.length || 0}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Test Series Owned</p>
                                <p className="text-gray-900">{testPurchases.length}</p>
                            </div>
                        </div>
                    </Card>

                    {/* My Downloads Quick Access */}
                    {user?.purchasedProducts && user.purchasedProducts.length > 0 && (
                        <Card padding="lg" className="mt-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Quick Downloads</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Access your purchased products
                            </p>
                            <Link href="/dashboard/downloads">
                                <Button variant="outline" className="w-full">
                                    View All Downloads
                                </Button>
                            </Link>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
