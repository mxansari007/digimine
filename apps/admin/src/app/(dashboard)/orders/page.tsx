"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllOrders } from "@/lib/firestore/admin";
import { type Order } from "@digimine/types";
import { formatDate, formatCurrency } from "@digimine/utils";
import { DataTable, PaginationControls, getPaginatedItems, type DataTableColumn } from "@digimine/ui";

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        async function fetchOrders() {
            try {
                const data = await getAllOrders();
                setOrders(data);
            } catch (error) {
                console.error("Error fetching orders:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchOrders();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [orders.length, pageSize]);

    const paginatedOrders = useMemo(
        () => getPaginatedItems(orders, page, pageSize),
        [orders, page, pageSize]
    );

    const columns: DataTableColumn<Order>[] = [
        {
            key: "order",
            header: "Order ID",
            render: (order) => (
                <span title={order.id} className="font-semibold text-slate-900">
                    #{order.id.slice(0, 8)}...
                </span>
            ),
        },
        {
            key: "customer",
            header: "Customer",
            render: (order) => (
                <div className="min-w-[220px]">
                    <div className="font-medium text-slate-900 truncate">{order.customerEmail || "Guest customer"}</div>
                    <div className="text-xs text-slate-400 truncate">{order.userId || order.guestId || "No user ID"}</div>
                </div>
            ),
        },
        {
            key: "amount",
            header: "Amount",
            render: (order) => (
                <span className="font-bold text-slate-900">{formatCurrency(order.total)}</span>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (order) => (
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    order.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : order.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : order.status === "refunded"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                }`}>
                    {order.status}
                </span>
            ),
        },
        {
            key: "date",
            header: "Date",
            render: (order) => formatDate(order.createdAt),
        },
    ];

    if (loading) return <div className="p-8">Loading orders...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
                <div className="text-sm text-gray-500">
                    Total Orders: {orders.length}
                </div>
            </div>

            <DataTable
                columns={columns}
                data={paginatedOrders}
                keyExtractor={(order) => order.id}
                emptyState="No orders found."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={orders.length}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="orders"
                    />
                }
            />
        </div>
    );
}
