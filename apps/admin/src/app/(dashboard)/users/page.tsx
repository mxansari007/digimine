"use client";

import { useCallback, useState } from "react";
import { updateUserRole } from "@/lib/firestore/admin";
import { type User } from "@digimine/types";
import { formatDate } from "@digimine/utils";
import {
    Button,
    DataTable,
    PaginationControls,
    usePaginatedTable,
    type DataTableColumn,
} from "@digimine/ui";
import { authedFetch } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function UsersPage() {
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const { isSuperAdmin } = useAdminAuth();

    // Server-paginated: each page fetch hits /api/admin/users?page=&pageSize=
    // and returns only that page's rows + the total count — never the whole
    // users collection.
    const load = useCallback(
        async ({ page, pageSize, signal }: { page: number; pageSize: number; signal: AbortSignal }) => {
            const res = await authedFetch(`/api/admin/users?page=${page}&pageSize=${pageSize}`, { signal });
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Failed to load users");
            const data = await res.json();
            return { items: (data.items as User[]) || [], total: (data.total as number) || 0 };
        },
        []
    );
    const {
        items: users,
        total,
        page,
        pageSize,
        loading,
        setPage,
        setPageSize,
        reload,
    } = usePaginatedTable<User>({ load, initialPageSize: 20 });

    const handleToggleAdmin = async (user: User) => {
        if (!isSuperAdmin) return;
        if (user.email === "mxansari007@gmail.com") {
            alert("The primary super admin cannot be demoted.");
            return;
        }
        
        const newRole = user.role === "admin" ? "customer" : "admin";
        if (!confirm(`Are you sure you want to change ${user.email}'s role to ${newRole}?`)) return;

        setUpdatingId(user.id);
        try {
            await updateUserRole(user.id, newRole);
            reload(); // Refresh the current page
        } catch (error) {
            console.error("Error updating role:", error);
            alert("Failed to update user role.");
        } finally {
            setUpdatingId(null);
        }
    };

    const columns: DataTableColumn<User>[] = [
        {
            key: "user",
            header: "User",
            render: (user) => (
                <div className="flex min-w-[240px] items-center">
                    <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                        {user.displayName?.[0] || user.email[0].toUpperCase()}
                    </div>
                    <div className="ml-4 min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                            {user.displayName || "No Name"}
                        </div>
                        <div className="text-slate-500 truncate">
                            {user.email}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: "role",
            header: "Role",
            render: (user) => (
                <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${user.role === "super_admin"
                        ? "bg-slate-100 text-slate-700"
                        : user.role === "admin"
                            ? "bg-primary-50 text-primary-700"
                            : "bg-slate-100 text-slate-700"
                    }`}
                >
                    {user.role}
                </span>
            ),
        },
        {
            key: "joined",
            header: "Joined",
            render: (user) => formatDate(user.createdAt),
        },
    ];

    if (isSuperAdmin) {
        columns.push({
            key: "actions",
            header: "",
            className: "text-right",
            render: (user) => (
                user.role !== "super_admin" && user.email !== "mxansari007@gmail.com" ? (
                    <Button
                        variant={user.role === "admin" ? "outline" : "primary"}
                        size="sm"
                        isLoading={updatingId === user.id}
                        onClick={() => handleToggleAdmin(user)}
                    >
                        {user.role === "admin" ? "Demote" : "Promote"}
                    </Button>
                ) : null
            ),
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                <div className="text-sm text-gray-500">
                    Total Users: {total.toLocaleString()}
                </div>
            </div>

            <DataTable
                columns={columns}
                data={users}
                keyExtractor={(user) => user.id}
                isLoading={loading}
                emptyState="No users found."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="users"
                        disabled={loading}
                    />
                }
            />
        </div>
    );
}
