"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Institute = {
    id: string;
    name: string;
    description: string | null;
    inviteCode: string;
    stats: {
        teacherCount: number;
        activeTeacherCount: number;
        classCount: number;
        studentCount: number;
    };
    subscription: { planId: string; status: string; seats: number; expiresAt: string | null } | null;
};

export default function InstituteDashboardPage() {
    const { firebaseUser } = useAuthContext();
    const [institute, setInstitute] = useState<Institute | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/institute/me");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setInstitute(data.institute);
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) return <div className="py-20 text-center text-gray-500">Loading...</div>;
    if (error || !institute) {
        return <Card className="p-8 text-center text-rose-700">{error || "Institute not found"}</Card>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{institute.name}</h1>
                    {institute.description && (
                        <p className="text-sm text-gray-500 mt-1">{institute.description}</p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Link href="/institute/settings">
                        <Button variant="outline">Settings</Button>
                    </Link>
                </div>
            </div>

            <Card className="p-6 accent-card">
                <p className="stat-label">Teacher invite code</p>
                <p className="mt-2 font-mono text-3xl font-bold text-primary-700">{institute.inviteCode}</p>
                <p className="mt-1 text-xs text-gray-500">
                    Share this with teachers — they redeem from their teacher portal to join your institute.
                </p>
                <div className="mt-4 flex gap-2">
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(institute.inviteCode);
                        }}
                        className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                        Copy code
                    </button>
                </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-5">
                    <p className="stat-label">Teachers</p>
                    <p className="stat-number mt-2">{institute.stats.activeTeacherCount}</p>
                    <p className="mt-1 text-xs text-gray-500">{institute.stats.teacherCount} total on roster</p>
                </Card>
                <Card className="p-5">
                    <p className="stat-label">Classes</p>
                    <p className="stat-number mt-2">{institute.stats.classCount}</p>
                    <p className="mt-1 text-xs text-gray-500">Active batches</p>
                </Card>
                <Card className="p-5">
                    <p className="stat-label">Students</p>
                    <p className="stat-number mt-2">{institute.stats.studentCount}</p>
                    <p className="mt-1 text-xs text-gray-500">Enrolled across classes</p>
                </Card>
                <Card className="p-5">
                    <p className="stat-label">Plan</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900 capitalize">
                        {institute.subscription?.planId || "trial"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                        {institute.subscription?.seats || 5} seats ·{" "}
                        {institute.subscription?.status || "trial"}
                    </p>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-6 hover:shadow-soft cursor-pointer transition-shadow" hoverable>
                    <Link href="/institute/teachers" className="block">
                        <p className="stat-label">Roster</p>
                        <h3 className="mt-1 text-lg font-bold text-gray-900">Manage teachers</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Invite, activate or remove teachers under your institute.
                        </p>
                    </Link>
                </Card>
                <Card className="p-6 hover:shadow-soft cursor-pointer transition-shadow" hoverable>
                    <Link href="/institute/classes" className="block">
                        <p className="stat-label">Classes</p>
                        <h3 className="mt-1 text-lg font-bold text-gray-900">Create &amp; assign classes</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Make batches, attach a teacher to each, share invite links with students.
                        </p>
                    </Link>
                </Card>
                <Card className="p-6 hover:shadow-soft cursor-pointer transition-shadow" hoverable>
                    <Link href="/institute/question-bank" className="block">
                        <p className="stat-label">Shared bank</p>
                        <h3 className="mt-1 text-lg font-bold text-gray-900">Question bank</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Maintain a central pool of vetted questions every teacher can reuse.
                        </p>
                    </Link>
                </Card>
            </div>
        </div>
    );
}
