"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllUsers, updateUserRole } from "@/lib/firestore/admin";
import { type User } from "@digimine/types";
import { formatDate } from "@digimine/utils";
import { Button, DataTable, PaginationControls, getPaginatedItems, type DataTableColumn } from "@digimine/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const { isSuperAdmin } = useAdminAuth();

    async function fetchUsers() {
        try {
            const data = await getAllUsers();
            setUsers(data);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        setPage(1);
    }, [users.length, pageSize]);

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
            await fetchUsers(); // Refresh list
        } catch (error) {
            console.error("Error updating role:", error);
            alert("Failed to update user role.");
        } finally {
            setUpdatingId(null);
        }
    };

    const paginatedUsers = useMemo(
        () => getPaginatedItems(users, page, pageSize),
        [users, page, pageSize]
    );

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

    if (loading) return <div className="p-8">Loading users...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                <div className="text-sm text-gray-500">
                    Total Users: {users.length}
                </div>
            </div>

            <DataTable
                columns={columns}
                data={paginatedUsers}
                keyExtractor={(user) => user.id}
                emptyState="No users found."
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={users.length}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="users"
                    />
                }
            />
        </div>
    );
}
