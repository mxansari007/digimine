"use client";

import { AccountProfileCard } from "@/components/account/AccountProfileCard";
import { AccountSummaryCard } from "@/components/account/AccountSummaryCard";
import { SecuritySettings } from "@/components/account/SecuritySettings";

export default function InstituteProfilePage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-display text-2xl font-bold text-gray-900">My profile</h1>
                <p className="mt-1 text-gray-500">
                    Your personal account details and security. Institute identity and branding
                    live under <span className="font-medium text-gray-700 dark:text-gray-200">Settings</span>.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <AccountProfileCard description="Your personal name, contact details, and avatar as the institute administrator." />
                    <SecuritySettings />
                </div>
                <div>
                    <AccountSummaryCard />
                </div>
            </div>
        </div>
    );
}
