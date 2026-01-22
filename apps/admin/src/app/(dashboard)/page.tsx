"use client";

import { useEffect, useState } from "react";
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
        { label: "Total Revenue", value: formatCurrency(stats.revenue), color: "text-green-600" },
        { label: "Active Orders", value: stats.orders, color: "text-blue-600" },
        { label: "Products", value: stats.products, color: "text-purple-600" },
        { label: "Total Users", value: stats.users, color: "text-orange-600" },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
                <p className="text-gray-500">Welcome back to the control center.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, i) => (
                    <Card key={i} padding="lg">
                        <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                        <p className={`text-3xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card padding="lg">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
                    <p className="text-gray-500 text-sm">No recent activity found.</p>
                </Card>

                <Card padding="lg">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
                    <div className="space-y-3">
                        <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-900 transition-colors">
                            + Create New Product
                        </button>
                        <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-900 transition-colors">
                            View Pending Orders
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
