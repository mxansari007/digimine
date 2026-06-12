"use client";

/**
 * Read-only account summary shown in the sidebar of the profile pages —
 * account type, sign-in email, and member-since date. Pure presentation off
 * the auth context.
 */
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";

const ROLE_LABELS: Record<string, string> = {
    customer: "Student",
    teacher: "Teacher",
    institute_admin: "Institute admin",
    admin: "Admin",
    super_admin: "Admin",
};

export function AccountSummaryCard() {
    const { user, firebaseUser } = useAuthContext();

    return (
        <Card padding="lg">
            <h3 className="font-semibold text-gray-900">Account</h3>
            <dl className="mt-4 space-y-4 text-sm">
                <div>
                    <dt className="text-gray-500">Account type</dt>
                    <dd className="text-gray-900">{ROLE_LABELS[user?.role || ""] || "Member"}</dd>
                </div>
                <div>
                    <dt className="text-gray-500">Signed in as</dt>
                    <dd className="truncate text-gray-900">{firebaseUser?.email || "—"}</dd>
                </div>
                <div>
                    <dt className="text-gray-500">Member since</dt>
                    <dd className="text-gray-900">
                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                    </dd>
                </div>
            </dl>
        </Card>
    );
}
