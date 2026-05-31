"use client";

import { useCallback, useState } from "react";
import {
    Button,
    DataTable,
    PaginationControls,
    usePaginatedTable,
    type DataTableColumn,
} from "@digimine/ui";
import { authedFetch } from "@/lib/api";

interface PayoutRow {
    id: string;
    teacherId?: string;
    amount?: number;
    method?: string;
    status?: string;
}

export default function PayoutsPage() {
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(
        async ({ page, pageSize, signal }: { page: number; pageSize: number; signal: AbortSignal }) => {
            const res = await authedFetch(`/api/admin/payouts?page=${page}&pageSize=${pageSize}`, { signal });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load payouts");
            const data = await res.json();
            return { items: (data.items as PayoutRow[]) || [], total: (data.total as number) || 0 };
        },
        []
    );
    const { items: payouts, total, page, pageSize, loading, setPage, setPageSize, reload } =
        usePaginatedTable<PayoutRow>({ load, initialPageSize: 20 });

    const handleProcess = async (payoutId: string, status: "processing" | "completed" | "failed") => {
        setError(null);
        try {
            const res = await authedFetch("/api/admin/payouts/process", {
                method: "POST",
                body: JSON.stringify({ payoutId, status }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Failed (${res.status})`);
            }
            reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to update payout");
        }
    };

    const columns: DataTableColumn<PayoutRow>[] = [
        {
            key: "teacher",
            header: "Teacher",
            render: (p) => <span className="font-medium text-slate-800">{p.teacherId}</span>,
        },
        {
            key: "amount",
            header: "Amount",
            align: "right",
            numeric: true,
            render: (p) => `₹${(p.amount || 0).toLocaleString()}`,
        },
        {
            key: "method",
            header: "Method",
            render: (p) => <span className="uppercase text-slate-600">{p.method}</span>,
        },
        {
            key: "status",
            header: "Status",
            render: (p) => (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusStyle(p.status)}`}>
                    {p.status}
                </span>
            ),
        },
        {
            key: "actions",
            header: "",
            align: "right",
            render: (p) =>
                p.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="success" onClick={() => handleProcess(p.id, "completed")}>
                            Complete
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleProcess(p.id, "failed")}>
                            Fail
                        </Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-2xl font-bold text-slate-950">Payouts</h1>
                <div className="text-sm text-slate-500">Total: {total.toLocaleString()}</div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
            )}

            <DataTable
                columns={columns}
                data={payouts}
                keyExtractor={(p) => p.id}
                isLoading={loading}
                emptyState="No payout requests yet."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="payouts"
                        disabled={loading}
                    />
                }
            />
        </div>
    );
}

function getStatusStyle(status?: string) {
    switch (status) {
        case "pending":
            return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        case "processing":
            return "bg-primary-50 text-primary-700 ring-1 ring-primary-200";
        case "completed":
            return "bg-accent-50 text-accent-700 ring-1 ring-accent-200";
        case "failed":
            return "bg-red-50 text-red-700 ring-1 ring-red-200";
        default:
            return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    }
}
