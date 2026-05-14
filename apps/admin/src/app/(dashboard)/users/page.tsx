"use client";

import { useEffect, useState } from "react";
import { getAllUsers, updateUserRole } from "@/lib/firestore/admin";
import { type User } from "@digimine/types";
import { formatDate } from "@digimine/utils";
import { Card, Button } from "@digimine/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
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

    if (loading) return <div className="p-8">Loading users...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                <div className="text-sm text-gray-500">
                    Total Users: {users.length}
                </div>
            </div>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    User
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    Role
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                    Joined
                                </th>
                                {isSuperAdmin && (
                                    <th
                                        scope="col"
                                        className="relative px-6 py-3"
                                    >
                                        <span className="sr-only">Actions</span>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                                                {user.displayName?.[0] || user.email[0].toUpperCase()}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {user.displayName || "No Name"}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {user.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === "super_admin"
                                                    ? "bg-purple-100 text-purple-800"
                                                    : user.role === "admin"
                                                        ? "bg-blue-100 text-blue-800"
                                                        : "bg-gray-100 text-gray-800"
                                                }`}
                                        >
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(user.createdAt)}
                                    </td>
                                    {isSuperAdmin && (
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {user.role !== "super_admin" && user.email !== "mxansari007@gmail.com" && (
                                                <Button
                                                    variant={user.role === "admin" ? "outline" : "primary"}
                                                    size="sm"
                                                    isLoading={updatingId === user.id}
                                                    onClick={() => handleToggleAdmin(user)}
                                                >
                                                    {user.role === "admin" ? "Demote to Customer" : "Promote to Admin"}
                                                </Button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
