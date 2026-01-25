"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Button } from "@digimine/ui";
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
                // Fetch user's orders
                const ordersQuery = query(
                    collection(db, "orders"),
                    where("userId", "==", firebaseUser!.uid)
                );
                const ordersSnapshot = await getDocs(ordersQuery);
                const orderData = ordersSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
                })) as Order[];
                setOrders(orderData);

                // Get unique product IDs from user's purchasedProducts
                // Get unique product IDs from user's purchasedProducts
                const purchasedItems = user?.purchasedProducts || [];
                const productIds = purchasedItems.map((p: any) => typeof p === 'string' ? p : p.productId);

                if (productIds.length > 0) {
                    // Fetch product details
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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-gray-500">Loading your products...</div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    My Products
                </h1>
                <p className="text-gray-600">
                    Access your purchased digital products and downloads
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-primary-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Products Owned</p>
                            <p className="text-2xl font-bold text-gray-900">{products.length}</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Total Downloads</p>
                            <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-accent-100 rounded-xl flex items-center justify-center">
                            <svg
                                className="w-6 h-6 text-accent-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Total Spent</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Products List */}
            <Card padding="lg">
                <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                    Purchased Products
                </h2>

                {products.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg
                                className="w-8 h-8 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No products yet
                        </h3>
                        <p className="text-gray-500 mb-6">
                            Once you purchase a product, it will appear here.
                        </p>
                        <Link
                            href="/products"
                            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                        >
                            Browse Products
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                                />
                            </svg>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {products.map((product) => (
                            <div key={product.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-primary-200 transition-colors">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                    {product.thumbnailURL ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={product.thumbnailURL} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                                    <p className="text-sm text-gray-500">Digital Product</p>
                                </div>
                                <Link href="/dashboard/downloads">
                                    <Button variant="outline" size="sm">
                                        Download
                                    </Button>
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
