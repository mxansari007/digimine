"use client";

import { AccountProfileCard } from "@/components/account/AccountProfileCard";
import { AccountSummaryCard } from "@/components/account/AccountSummaryCard";
import { SecuritySettings } from "@/components/account/SecuritySettings";

export default function TeacherProfilePage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-display text-2xl font-bold text-gray-900">Profile &amp; settings</h1>
                <p className="mt-1 text-gray-500">
                    Manage your personal details and account security.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <AccountProfileCard
                        showLinks
                        description="How you appear to your students and institute — name, contact, and a short intro."
                    />
                    <SecuritySettings />
                </div>
                <div>
                    <AccountSummaryCard />
                </div>
            </div>
        </div>
    );
}
