"use client";

import { useState } from "react";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";

export default function ProfilePage() {
    const { user, firebaseUser } = useAuthContext();

    const [displayName, setDisplayName] = useState(user?.displayName || "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            // TODO: Implement profile update with Firebase and Firestore
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
            setMessage({ type: "success", text: "Profile updated successfully!" });
        } catch {
            setMessage({ type: "error", text: "Failed to update profile" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    Profile Settings
                </h1>
                <p className="text-gray-600">
                    Manage your account settings and preferences
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Profile Form */}
                <div className="lg:col-span-2">
                    <Card padding="lg">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                            Personal Information
                        </h2>

                        <form onSubmit={handleUpdateProfile} className="space-y-6">
                            {message && (
                                <div
                                    className={`px-4 py-3 rounded-lg text-sm ${message.type === "success"
                                            ? "bg-green-50 border border-green-200 text-green-700"
                                            : "bg-red-50 border border-red-200 text-red-700"
                                        }`}
                                >
                                    {message.text}
                                </div>
                            )}

                            <div>
                                <label
                                    htmlFor="displayName"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Display Name
                                </label>
                                <input
                                    id="displayName"
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                    placeholder="Your name"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={firebaseUser?.email || ""}
                                    disabled
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Email cannot be changed
                                </p>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    isLoading={saving}
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </Card>

                    {/* Password Change */}
                    <Card padding="lg" className="mt-6">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                            Change Password
                        </h2>

                        <form className="space-y-6">
                            <div>
                                <label
                                    htmlFor="currentPassword"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Current Password
                                </label>
                                <input
                                    id="currentPassword"
                                    type="password"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="newPassword"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    New Password
                                </label>
                                <input
                                    id="newPassword"
                                    type="password"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="confirmNewPassword"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Confirm New Password
                                </label>
                                <input
                                    id="confirmNewPassword"
                                    type="password"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div className="flex justify-end">
                                <Button type="button" variant="outline">
                                    Update Password
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>

                {/* Sidebar */}
                <div>
                    {/* Account Info */}
                    <Card padding="lg">
                        <h3 className="font-semibold text-gray-900 mb-4">Account</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-500">Member Since</p>
                                <p className="text-gray-900">
                                    {user?.createdAt
                                        ? new Date(user.createdAt).toLocaleDateString()
                                        : "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Account Type</p>
                                <p className="text-gray-900 capitalize">{user?.role || "Customer"}</p>
                            </div>
                        </div>
                    </Card>

                    {/* Danger Zone */}
                    <Card padding="lg" className="mt-6 border-red-200">
                        <h3 className="font-semibold text-red-600 mb-4">Danger Zone</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Once you delete your account, there is no going back. Please be
                            certain.
                        </p>
                        <Button
                            variant="danger"
                            size="sm"
                            className="w-full"
                            onClick={() => alert("Account deletion not implemented")}
                        >
                            Delete Account
                        </Button>
                    </Card>
                </div>
            </div>
        </div>
    );
}
