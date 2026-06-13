"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useCredits } from "@/contexts/CreditsContext";

import type { Order, Product, TestSeries, TestAttempt } from "@digimine/types";
import { BookOpenIcon } from "@/components/icons/AppIcons";

export default function DashboardPage() {
    const { user, firebaseUser } = useAuthContext();
    const credits = useCredits();
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [purchasedSeries, setPurchasedSeries] = useState<TestSeries[]>([]);
    const [activeAttempt, setActiveAttempt] = useState<{ attempt: TestAttempt; series: TestSeries } | null>(null);
    const [loading, setLoading] = useState(true);
    const [classrooms, setClassrooms] = useState<any[]>([]);

    useEffect(() => {
        if (!firebaseUser) {
            setLoading(false);
            return;
        }

        async function fetchUserData() {
            try {
                const token = await firebaseUser!.getIdToken();
                const res = await fetch(`/api/dashboard?userId=${firebaseUser!.uid}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                setOrders(data.orders || []);
                setProducts(data.products || []);
                setPurchasedSeries(data.purchasedSeries || []);
                setActiveAttempt(data.activeAttempt || null);
                setClassrooms(data.classrooms || []);
            } catch (err) {
                console.error("Error fetching dashboard data:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchUserData();
    }, [firebaseUser]);

    const userName = user?.firstName || user?.displayName?.split(' ')[0] || "there";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    // Defensive: only render the resume banner when the attempt is still
    // genuinely resumable. The API already filters by status + endTime, but
    // we double-check here so that
    //   (a) submitted attempts never flash a banner before the API responds
    //   (b) stale data (e.g. response cached during a refresh) can't show it
    const resumable = (() => {
        if (!activeAttempt) return null;
        const status = (activeAttempt.attempt as any)?.status;
        if (status && status !== "in_progress") return null;
        const endVal = (activeAttempt.attempt as any)?.endTime;
        const endMs = endVal
            ? endVal instanceof Date
                ? endVal.getTime()
                : new Date(endVal).getTime()
            : 0;
        if (endMs > 0 && endMs <= Date.now()) return null;
        return activeAttempt;
    })();

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
            {resumable && (
                <div className="relative overflow-hidden rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-gradient-to-r from-amber-50 dark:from-amber-500/10 via-white dark:via-surface to-orange-50 dark:to-orange-500/10 p-5 shadow-[0_18px_45px_rgba(245,158,11,0.12)] sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Test in progress</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 truncate">{resumable.series.title}</h3>
                        <p className="text-sm text-gray-600 mt-0.5">
                            Your progress is auto-saved. Resume where you left off before the timer ends.
                        </p>
                    </div>
                    <Link
                        href={`/tests/${resumable.series.slug}/attempt?testId=${resumable.attempt.testId}&attemptId=${resumable.attempt.id}`}
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

            {/* Greeting Banner. Empty-state copy switches to an inviting
                onboarding prompt so a brand-new user doesn't see
                "0 products, 0 test series, 0 classrooms" — which reads as
                a failure even though it's the expected starting state. */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#020617] via-[#0f172a] to-primary-950 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:p-8">
                <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-300/70 to-transparent" />
                <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-300">
                            {greeting}
                        </p>
                        <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
                            {userName}
                        </h1>
                        <p className="mt-2 text-sm text-white/70 sm:text-base">
                            {(() => {
                                const totals = products.length + purchasedSeries.length + classrooms.length;
                                if (totals === 0) {
                                    return "Welcome aboard. Pick a starting point below to populate your library.";
                                }
                                const parts: string[] = [];
                                if (products.length) parts.push(`${products.length} product${products.length === 1 ? "" : "s"}`);
                                if (purchasedSeries.length) parts.push(`${purchasedSeries.length} test series`);
                                if (classrooms.length) parts.push(`${classrooms.length} classroom${classrooms.length === 1 ? "" : "s"}`);
                                const formatted =
                                    parts.length === 1
                                        ? parts[0]
                                        : parts.length === 2
                                          ? `${parts[0]} and ${parts[1]}`
                                          : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
                                return `${formatted} in your library.`;
                            })()}
                        </p>
                    </div>
                    {/* Stacked CTA pair on wide screens; full-width on mobile.
                        The secondary "Join classroom" link only appears when
                        the user has no classrooms yet, since otherwise it
                        duplicates the My Classrooms section below. */}
                    <div className="flex flex-wrap gap-2 md:flex-nowrap md:justify-end">
                        <Link
                            href="/products"
                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-primary-50 dark:hover:bg-primary-500/10"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            Browse Store
                        </Link>
                        {classrooms.length === 0 && (
                            <Link
                                href="/join"
                                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:border-white/40 hover:bg-white/10"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Join classroom
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Credits — only shown when credit metering is enabled. Gives
                students a glanceable balance + a fast path to top up, since
                the wallet powers AI interviews and other AI features. */}
            {credits.enabled && (
                <Link
                    href="/credits"
                    className="group relative block overflow-hidden rounded-2xl border border-amber-200/80 dark:border-amber-500/25 bg-gradient-to-r from-amber-50 dark:from-amber-500/10 via-white dark:via-surface to-orange-50/60 dark:to-orange-500/10 p-5 shadow-[0_18px_45px_rgba(245,158,11,0.10)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(245,158,11,0.16)] sm:p-6"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
                                <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
                            </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">AI Credits</p>
                            <p className="mt-0.5 flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold text-gray-900 tabular-nums">{credits.balance ?? "—"}</span>
                                <span className="text-sm text-gray-500">available</span>
                            </p>
                            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">Powers AI mock interviews and other AI features.</p>
                        </div>
                        <span className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-colors group-hover:bg-amber-700 sm:inline-flex">
                            Buy credits
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </span>
                    </div>
                </Link>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        label: "Products Owned",
                        value: products.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        ),
                        color: "bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-300",
                    },
                    {
                        label: "Test Series",
                        value: purchasedSeries.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        ),
                        color: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
                    },
                    {
                        label: "My Classrooms",
                        value: classrooms.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                            </svg>
                        ),
                        color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                    },
                    {
                        label: "Total Orders",
                        value: orders.length,
                        icon: (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        ),
                        color: "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-300",
                    },
                ].map((stat) => (
                    <div key={stat.label} className="surface-panel p-6 transition-all hover:-translate-y-0.5 hover:border-primary-200/80 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                        <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center mb-4`}>
                            {stat.icon}
                        </div>
                        <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* My Classrooms Section */}
            {classrooms.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-xl font-bold text-gray-900">My Classrooms</h2>
                        <Link href="/join" className="text-sm text-primary-600 font-semibold hover:text-primary-700 flex items-center gap-1">
                            Join Classroom
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {classrooms.map((classroom) => (
                            <Link key={classroom.teacherId} href={`/classroom/${classroom.teacherId}`} className="block">
                                <div className="surface-panel overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-200/80 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] cursor-pointer">
                                    <div className="relative h-24 bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
                                        {classroom.teacherAvatar ? (
                                            <Image src={classroom.teacherAvatar} alt={classroom.teacherName} width={56} height={56} className="rounded-full border-2 border-white/80" />
                                        ) : (
                                            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold">
                                                {classroom.teacherName.charAt(0)}
                                            </div>
                                        )}
                                        <div className="absolute top-3 right-3">
                                            <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                                                {classroom.inviteCode}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-bold text-gray-900 line-clamp-1">{classroom.teacherName}</h3>
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{classroom.teacherInstitute}</p>
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                                Enrolled
                                            </span>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

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
                    <div className="surface-panel border-dashed py-20 text-center">
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
                            <div key={product.id} className="surface-panel overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200/80 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
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
                            <div key={`${series.id}-${series.slug}`} className="surface-panel overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary-200/80 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
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
