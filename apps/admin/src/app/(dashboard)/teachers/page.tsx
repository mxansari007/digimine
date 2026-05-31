"use client";

import { useCallback } from "react";
import {
    DataTable,
    PaginationControls,
    usePaginatedTable,
    type DataTableColumn,
} from "@digimine/ui";
import { authedFetch } from "@/lib/api";

interface TeacherRow {
    id: string;
    profile?: { name?: string; institute?: string };
    subscription?: { planId?: string; status?: string };
    usage?: { currentStudents?: number; totalEarnings?: number };
}

export default function TeachersPage() {
    const load = useCallback(
        async ({ page, pageSize, signal }: { page: number; pageSize: number; signal: AbortSignal }) => {
            const res = await authedFetch(`/api/admin/teachers?page=${page}&pageSize=${pageSize}`, { signal });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load teachers");
            const data = await res.json();
            return { items: (data.items as TeacherRow[]) || [], total: (data.total as number) || 0 };
        },
        []
    );
    const { items: teachers, total, page, pageSize, loading, setPage, setPageSize } =
        usePaginatedTable<TeacherRow>({ load, initialPageSize: 20 });

    const columns: DataTableColumn<TeacherRow>[] = [
        {
            key: "name",
            header: "Name",
            render: (t) => <span className="font-medium text-slate-800">{t.profile?.name || "—"}</span>,
        },
        {
            key: "institute",
            header: "Institute",
            render: (t) => t.profile?.institute || "—",
        },
        {
            key: "plan",
            header: "Plan",
            render: (t) => <span className="capitalize">{t.subscription?.planId || "free"}</span>,
        },
        {
            key: "status",
            header: "Status",
            render: (t) => (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusStyle(t.subscription?.status)}`}>
                    {t.subscription?.status || "free"}
                </span>
            ),
        },
        {
            key: "students",
            header: "Students",
            align: "right",
            numeric: true,
            render: (t) => t.usage?.currentStudents || 0,
        },
        {
            key: "earnings",
            header: "Earnings",
            align: "right",
            numeric: true,
            render: (t) => `₹${(t.usage?.totalEarnings || 0).toLocaleString()}`,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-2xl font-bold text-slate-950">Teachers</h1>
                <div className="text-sm text-slate-500">Total: {total.toLocaleString()}</div>
            </div>

            <DataTable
                columns={columns}
                data={teachers}
                keyExtractor={(t) => t.id}
                isLoading={loading}
                emptyState="No teachers yet."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="teachers"
                        disabled={loading}
                    />
                }
            />
        </div>
    );
}

function getStatusStyle(status?: string) {
    switch (status) {
        case "active":
            return "bg-accent-50 text-accent-700 ring-1 ring-accent-200";
        case "grace_period":
            return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
        case "expired":
        case "cancelled":
            return "bg-red-50 text-red-700 ring-1 ring-red-200";
        default:
            return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    }
}
