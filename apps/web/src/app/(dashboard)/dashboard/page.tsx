"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { formatCurrency } from "@digimine/utils";
import type { Order, Product } from "@digimine/types";

export default function DashboardPage() {
    const { user, firebaseUser } = useAuthContext();
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firebaseUser) {
            setLoading(false);
            return;
        }

        async function fetchUserData() {
            try {
                const ordersQuery = query(
                    collection(db, "orders"),
                    where("userId", "==", firebaseUser!.uid)
                );
                const ordersSnapshot = await getDocs(ordersQuery);
                const orderData = ordersSnapshot.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    createdAt: d.data().createdAt?.toDate() || new Date(),
                    updatedAt: d.data().updatedAt?.toDate() || new Date(),
                })) as Order[];
                setOrders(orderData);

                const purchasedItems = user?.purchasedProducts || [];
                const productIds = purchasedItems.map((p: any) => typeof p === 'string' ? p : p.productId);

                if (productIds.length > 0) {
                    const productPromises = productIds.map(async (productId) => {
                        try {
                            const productDoc = await getDoc(doc(db, "products", productId));
                            if (productDoc.exists()) {
                                return { id: productDoc.id, ...productDoc.data() } as Product;
                            }
                            return null;
                        } catch {
                            return null;
                        }
                    });
                    const productData = (await Promise.all(productPromises)).filter(Boolean) as Product[];
                    setProducts(productData);
                }
            } catch (err) {
                console.error("Error fetching user data:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchUserData();
    }, [firebaseUser, user?.purchasedProducts]);

    const totalSpent = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const userName = user?.firstName || user?.displayName?.split(' ')[0] || "there";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Loading your library...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Greeting Banner */}
            <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 rounded-2xl p-8 overflow-hidden text-white shadow-xl">
                <div className="absolute top-0 right-0 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
                <div className="relative z-10">
                    <p className="text-primary-300 text-sm font-medium mb-1">{greeting} 👋</p>
                    <h1 className="text-3xl font-bold font-display mb-2 text-white">{userName}</h1>
                    <p className="text-gray-400 text-base">
                        You have <span className="text-white font-semibold">{products.length} product{products.length !== 1 ? 's' : ''}</span> in your library.
                    </p>
                    <Link href="/products" className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-white text-gray-900 font-semibold rounded-xl text-sm hover:bg-gray-100 transition-colors shadow-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        Browse Store
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    {
                        label: "Products Owned",
                        value: products.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        ),
                        color: "bg-primary-50 text-primary-600",
                    },
                    {
                        label: "Total Orders",
                        value: orders.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        ),
                        color: "bg-green-50 text-green-600",
                    },
                    {
                        label: "Total Spent",
                        value: formatCurrency(totalSpent),
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ),
                        color: "bg-orange-50 text-orange-600",
                    },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                        <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center mb-4`}>
                            {stat.icon}
                        </div>
                        <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Products Section */}
            <div>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-bold text-gray-900">My Library</h2>
                    <Link href="/dashboard/downloads" className="text-sm text-primary-600 font-semibold hover:text-primary-700 flex items-center gap-1">
                        View Downloads
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                </div>

                {products.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-5">
                            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Your library is empty</h3>
                        <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">
                            Once you purchase a product, it will appear here.
                        </p>
                        <Link href="/products">
                            <Button variant="primary" size="lg">Browse Products</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {products.map((product) => (
                            <div key={product.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                                <div className="relative h-40 bg-gray-100">
                                    {product.thumbnailURL ? (
                                        <Image src={product.thumbnailURL} alt={product.name} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="absolute top-3 right-3">
                                        <span className="bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">Owned</span>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-gray-900 mb-1 line-clamp-1">{product.name}</h3>
                                    <p className="text-xs text-gray-500 capitalize mb-4">{product.type} · {product.purchaseType === 'subscription' ? 'Subscription' : 'Lifetime Access'}</p>
                                    <Link href="/dashboard/downloads" className="block">
                                        <Button variant="outline" size="sm" className="w-full">
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Download Files
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
