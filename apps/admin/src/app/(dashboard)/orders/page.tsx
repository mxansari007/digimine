"use client";

import { useCallback } from "react";
import { type Order } from "@digimine/types";
import { formatDate, formatCurrency } from "@digimine/utils";
import {
    DataTable,
    PaginationControls,
    usePaginatedTable,
    type DataTableColumn,
} from "@digimine/ui";
import { authedFetch } from "@/lib/api";

export default function OrdersPage() {
    const load = useCallback(
        async ({ page, pageSize, signal }: { page: number; pageSize: number; signal: AbortSignal }) => {
            const res = await authedFetch(`/api/admin/orders?page=${page}&pageSize=${pageSize}`, { signal });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load orders");
            const data = await res.json();
            return { items: (data.items as Order[]) || [], total: (data.total as number) || 0 };
        },
        []
    );
    const { items: orders, total, page, pageSize, loading, setPage, setPageSize } =
        usePaginatedTable<Order>({ load, initialPageSize: 20 });

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
            align: "right",
            numeric: true,
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
                <div className="text-sm text-gray-500">
                    Total Orders: {total.toLocaleString()}
                </div>
            </div>

            <DataTable
                columns={columns}
                data={orders}
                keyExtractor={(order) => order.id}
                isLoading={loading}
                emptyState="No orders found."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="orders"
                        disabled={loading}
                    />
                }
            />
        </div>
    );
}
