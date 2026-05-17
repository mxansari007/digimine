"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { getAllOrders, getAllUsers, getAllProducts } from "@/lib/firestore/admin";
import { formatCurrency } from "@digimine/utils";

export default function DashboardPage() {
    const [stats, setStats] = useState({
        users: 0,
        products: 0,
        orders: 0,
        revenue: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const [users, products, orders] = await Promise.all([
                    getAllUsers(),
                    getAllProducts(),
                    getAllOrders(),
                ]);

                const revenue = orders.reduce((sum, order) => sum + order.total, 0);

                setStats({
                    users: users.length,
                    products: products.length,
                    orders: orders.length,
                    revenue,
                });
            } catch (error) {
                console.error("Error fetching dashboard stats:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchStats();
    }, []);

    if (loading) {
        return <div className="text-gray-500">Loading dashboard...</div>;
    }

    const statCards = [
        {
            label: "Total Revenue",
            value: formatCurrency(stats.revenue),
            hint: "Gross tracked sales",
            accent: "from-emerald-500 to-teal-500",
            bg: "bg-emerald-50 text-emerald-700",
            icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 4V3m0 18v-1m8-8h1M3 12h1m14.95 6.95l-.707-.707M5.757 5.757l-.707-.707m13.9 0l-.707.707M5.757 18.243l-.707.707",
        },
        {
            label: "Active Orders",
            value: stats.orders,
            hint: "All customer orders",
            accent: "from-primary-500 to-blue-600",
            bg: "bg-primary-50 text-primary-700",
            icon: "M3 7h18M6 7v11a2 2 0 002 2h8a2 2 0 002-2V7M9 7V5a3 3 0 016 0v2",
        },
        {
            label: "Products",
            value: stats.products,
            hint: "Published inventory",
            accent: "from-violet-500 to-indigo-500",
            bg: "bg-violet-50 text-violet-700",
            icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
        },
        {
            label: "Total Users",
            value: stats.users,
            hint: "Registered accounts",
            accent: "from-amber-500 to-orange-500",
            bg: "bg-amber-50 text-amber-700",
            icon: "M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4 6v-2a4 4 0 00-8 0v2m8 0h-8m12-10a4 4 0 10-8 0 4 4 0 008 0m6 0a3 3 0 11-6 0 3 3 0 016 0",
        },
    ];

    return (
        <div className="space-y-8">
            <div className="admin-panel overflow-hidden p-6 sm:p-8">
                <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
                    <div>
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
                            Admin command
                        </div>
                        <h1 className="text-3xl font-bold text-slate-950 sm:text-4xl">Dashboard Overview</h1>
                        <p className="mt-2 max-w-2xl text-slate-500">
                            Monitor the marketplace, orders, customers, and test content from one sharper workspace.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-950 p-4 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-200">Revenue pulse</p>
                        <p className="mt-3 text-3xl font-bold">{formatCurrency(stats.revenue)}</p>
                        <div className="mt-4 h-2 rounded-full bg-white/10">
                            <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-primary-400 to-emerald-400" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, i) => (
                    <Card key={i} padding="lg" hoverable>
                        <div className="flex items-start justify-between gap-4">
                            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.bg}`}>
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={stat.icon} />
                                </svg>
                            </div>
                            <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${stat.accent}`} />
                        </div>
                        <p className="mt-5 text-sm font-semibold text-slate-500">{stat.label}</p>
                        <p className="mt-1 text-3xl font-bold text-slate-950">{stat.value}</p>
                        <p className="mt-2 text-xs font-medium text-slate-400">{stat.hint}</p>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card padding="lg">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-950">Recent Activity</h2>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Live</span>
                    </div>
                    <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
                        <p className="text-sm font-semibold text-slate-700">No recent activity yet</p>
                        <p className="mt-1 text-sm text-slate-500">New orders, imports, and product changes will appear here.</p>
                    </div>
                </Card>

                <Card padding="lg">
                    <h2 className="text-lg font-bold text-slate-950 mb-4">Quick Actions</h2>
                    <div className="grid gap-3">
                        {[
                            { href: "/courses/create", label: "Create Course Notes", detail: "Build chapters, subtopics, videos, quizzes, and tests" },
                            { href: "/quizzes/create", label: "Create Quiz", detail: "Build a short topic drill with rich questions" },
                            { href: "/products/create", label: "Create New Product", detail: "Add a digital product, template, or downloadable asset" },
                            { href: "/tests/create", label: "Create Test Series", detail: "Build a new assessment bundle" },
                            { href: "/orders", label: "Review Orders", detail: "Open payment and access history" },
                        ].map((action) => (
                            <Link
                                key={action.href}
                                href={action.href}
                                className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition-all hover:border-primary-200 hover:bg-primary-50/60"
                            >
                                <span>
                                    <span className="block text-sm font-bold text-slate-900">{action.label}</span>
                                    <span className="text-xs text-slate-500">{action.detail}</span>
                                </span>
                                <svg className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
