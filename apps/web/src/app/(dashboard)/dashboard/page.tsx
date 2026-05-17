"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

import type { Order, Product, TestSeries, TestAttempt } from "@digimine/types";
import { getUserTestPurchases, getTestSeriesBySlug, getResumableTestAttempts } from "@/lib/firestore/tests";
import { BookOpenIcon, HandIcon } from "@/components/icons/AppIcons";

export default function DashboardPage() {
    const { user, firebaseUser } = useAuthContext();
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchasedSeries, setPurchasedSeries] = useState<TestSeries[]>([]);
    const [activeAttempt, setActiveAttempt] = useState<{ attempt: TestAttempt; series: TestSeries } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firebaseUser) {
            setLoading(false);
            return;
        }

        async function fetchUserData() {
            try {
                // Fetch Orders
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

                // Fetch Purchased Products
                const purchasedItems = user?.purchasedProducts || [];
                const productIds = Array.from(
                    new Set(purchasedItems.map((p: any) => typeof p === 'string' ? p : p.productId).filter(Boolean))
                );

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

                // Fetch Test Series Purchases
                const testPurchases = await getUserTestPurchases(firebaseUser!.uid);
                let seriesData: TestSeries[] = [];
                if (testPurchases.length > 0) {
                    const seriesIds = Array.from(new Set(testPurchases.map(p => p.seriesId).filter(Boolean)));
                    const seriesPromises = seriesIds.map(seriesId => getTestSeriesBySlug(seriesId));
                    seriesData = (await Promise.all(seriesPromises)).filter(Boolean) as TestSeries[];
                    setPurchasedSeries(seriesData);
                } else {
                    setPurchasedSeries([]);
                }

                // Fetch in-progress test attempt for resume CTA
                try {
                    const resumableAttempts = await getResumableTestAttempts(firebaseUser!.uid);
                    const inProgress = resumableAttempts[0] || null;
                    if (inProgress) {
                        const series = seriesData.find(s => s.id === inProgress.seriesId)
                            || (await getTestSeriesBySlug(inProgress.seriesId));
                        if (series) setActiveAttempt({ attempt: inProgress, series });
                    } else {
                        setActiveAttempt(null);
                    }
                } catch (e) {
                    console.error("Failed to load active attempt:", e);
                }
            } catch (err) {
                console.error("Error fetching user data:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchUserData();
    }, [firebaseUser, user?.purchasedProducts]);

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
            {/* In-Progress Test Banner */}
            {activeAttempt && (
                <div className="relative bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Test in progress</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 truncate">{activeAttempt.series.title}</h3>
                        <p className="text-sm text-gray-600 mt-0.5">
                            Your progress is auto-saved. Resume where you left off before the timer ends.
                        </p>
                    </div>
                    <Link
                        href={`/tests/${activeAttempt.series.slug}/attempt?testId=${activeAttempt.attempt.testId}&attemptId=${activeAttempt.attempt.id}`}
                        className="flex-shrink-0"
                    >
                        <Button className="bg-amber-600 hover:bg-amber-700 text-white shadow-md">
                            Resume Test
                            <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Button>
                    </Link>
                </div>
            )}

            {/* Greeting Banner */}
            <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 rounded-2xl p-8 overflow-hidden text-white shadow-xl">
                <div className="absolute top-0 right-0 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
                <div className="relative z-10">
                    <p className="text-primary-300 text-sm font-medium mb-1 inline-flex items-center gap-2">
                        {greeting}
                        <HandIcon className="h-4 w-4" />
                    </p>
                    <h1 className="text-3xl font-bold font-display mb-2 text-white">{userName}</h1>
                    <p className="text-gray-400 text-base">
                        You have <span className="text-white font-semibold">{products.length} product{products.length !== 1 ? 's' : ''}</span> and <span className="text-white font-semibold">{purchasedSeries.length} test series</span> in your library.
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
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
                        label: "Test Series",
                        value: purchasedSeries.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        ),
                        color: "bg-indigo-50 text-indigo-600",
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
                {/* Test Series Section */}
            {purchasedSeries.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-xl font-bold text-gray-900">My Test Series</h2>
                        <Link href="/tests" className="text-sm text-primary-600 font-semibold hover:text-primary-700 flex items-center gap-1">
                            Browse More
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {purchasedSeries.map((series) => (
                            <div key={`${series.id}-${series.slug}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all">
                                <div className="relative h-40 bg-indigo-600">
                                    {series.thumbnailURL ? (
                                        <Image src={series.thumbnailURL} alt={series.title} fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/20">
                                            <BookOpenIcon className="h-14 w-14" />
                                        </div>
                                    )}
                                    <div className="absolute top-3 right-3">
                                        <span className="bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">Unlocked</span>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-gray-900 mb-1 line-clamp-1">{series.title}</h3>
                                    <p className="text-xs text-gray-500 mb-4">{series.totalTests} Practice Tests · {series.totalQuestions} Questions</p>
                                    <Link href={`/tests/${series.slug}`}>
                                        <Button variant="primary" size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                                            {/* We would need to fetch attempts here too to show 'Continue', but for now let's at least link to the series page which handles it */}
                                            Open Test Series
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
        </div>
    );
}
