"use client";

import { Card } from "@digimine/ui";

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

            <Card padding="lg">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Store Configuration</h2>
                <p className="text-gray-500">Settings placeholder.</p>
            </Card>

            <Card padding="lg">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Admin Management</h2>
                <p className="text-gray-500">Role management placeholder.</p>
            </Card>
        </div>
    );
}
