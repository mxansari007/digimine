"use client";

/**
 * Teacher Usage page — surfaces the caps configured by admins in
 * /admin/subscription (the AppSubscriptionPlan.teachingLimits block).
 *
 * Data flow:
 *   - useTeachingFeatures() resolves the plan via /api/me/teaching-features
 *     (server-side: lib/server/teachingEntitlements.ts) and returns
 *     teachingLimits + planName + scope.
 *   - teachers/{uid}.usage holds the current counters (currentStudents,
 *     currentTests, currentQuizzes, currentContests, currentCourses,
 *     currentQuestions) maintained server-side as content is created.
 *   - Class count is derived from the teacher's classes collection so
 *     the maxClasses bar reflects reality even before a usage counter
 *     is in place.
 *
 * Same resolver path the server-side enforcement (checkPlanLimits)
 * uses — so what teachers see here matches what gets blocked.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import { getTeacher } from "@/lib/firestore/teachers";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { PlanUsageBar } from "@/components/teacher/PlanUsageBar";
import type { Teacher, TeacherUsage } from "@digimine/types";

function toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return null;
}

function formatDate(d: Date | null): string {
    if (!d) return "—";
    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

const STATUS_LABELS: Record<string, { text: string; chip: string }> = {
    trial: { text: "Trial", chip: "bg-primary-50 text-primary-700" },
    active: { text: "Active", chip: "bg-emerald-50 text-emerald-700" },
    grace_period: { text: "Grace period", chip: "bg-amber-50 text-amber-700" },
    expired: { text: "Expired", chip: "bg-red-50 text-red-700" },
    cancelled: { text: "Cancelled", chip: "bg-slate-100 text-slate-600" },
};

export default function TeacherUsagePage() {
    const { firebaseUser } = useAuthContext();
    const teaching = useTeachingFeatures();
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [classCount, setClassCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!firebaseUser) return;
        (async () => {
            try {
                const [t, classesRes] = await Promise.all([
                    getTeacher(firebaseUser.uid),
                    teacherFetch(firebaseUser, "/api/teacher/classes").catch(() => null),
                ]);
                if (!t) {
                    setError("Teacher profile not found.");
                    setLoading(false);
                    return;
                }
                setTeacher(t);
                if (classesRes && classesRes.ok) {
                    const body = await classesRes.json().catch(() => null);
                    const list = Array.isArray(body?.classes)
                        ? body.classes
                        : Array.isArray(body)
                          ? body
                          : [];
                    setClassCount(list.length);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load usage.");
            } finally {
                setLoading(false);
            }
        })();
    }, [firebaseUser]);

    if (loading || teaching.loading) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                Loading…
            </div>
        );
    }

    if (error || !teacher) {
        return (
            <Card className="p-8 text-center text-slate-500">
                {error || "Teacher profile not found."}{" "}
                <Link
                    href="/teacher/onboarding"
                    className="text-primary-700 hover:text-primary-800"
                >
                    Complete onboarding →
                </Link>
            </Card>
        );
    }

    const usage: TeacherUsage = teacher.usage || {
        currentStudents: 0,
        currentTests: 0,
        currentQuizzes: 0,
        currentContests: 0,
        currentCourses: 0,
        currentQuestions: 0,
        totalEarnings: 0,
        pendingPayout: 0,
    };

    const limits = teaching.limits;
    const status = teacher.subscription?.status ?? "trial";
    const statusMeta = STATUS_LABELS[status] || STATUS_LABELS.trial;
    const expiresAt = toDate(teacher.subscription?.expiresAt);
    const planName =
        teaching.planName ||
        teacher.subscription?.planId ||
        "—";

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Usage</h1>
                <p className="mt-1 text-slate-500">
                    Track how much of your plan you&apos;re using. Limits are configured by{" "}
                    <span className="font-medium">admins</span> on each subscription plan.
                </p>
            </div>

            <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Current plan
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                            <p className="text-lg font-bold text-slate-900">{planName}</p>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.chip}`}
                            >
                                {statusMeta.text}
                            </span>
                        </div>
                        {expiresAt && (
                            <p className="mt-2 text-xs text-slate-500">
                                {status === "trial" ? "Trial ends" : "Renews"} on{" "}
                                {formatDate(expiresAt)}.
                            </p>
                        )}
                    </div>
                    <Link
                        href={teaching.upgradeHref}
                        className="rounded-xl border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
                    >
                        {status === "expired" || status === "cancelled"
                            ? "Renew"
                            : "Manage plan"}
                    </Link>
                </div>
            </Card>

            <Card className="p-6">
                <h2 className="mb-5 text-lg font-semibold text-slate-900">Plan limits</h2>
                <div className="space-y-5">
                    <PlanUsageBar
                        label="Classes"
                        current={classCount}
                        max={limits.maxClasses}
                    />
                    <PlanUsageBar
                        label="Students enrolled"
                        current={usage.currentStudents}
                        max={limits.maxStudents}
                    />
                    <PlanUsageBar
                        label="Test series"
                        current={usage.currentTests}
                        max={limits.maxTests}
                    />
                    <PlanUsageBar
                        label="Quizzes"
                        current={usage.currentQuizzes}
                        max={limits.maxQuizzes}
                    />
                    <PlanUsageBar
                        label="Contests"
                        current={usage.currentContests}
                        max={limits.maxContests}
                    />
                    <PlanUsageBar
                        label="Courses"
                        current={usage.currentCourses}
                        max={limits.maxCourses}
                    />
                    <PlanUsageBar
                        label="Question bank items"
                        current={usage.currentQuestions}
                        max={limits.maxQuestions}
                    />
                </div>
                <p className="mt-6 text-xs text-slate-500">
                    Concurrent code-runner slots:{" "}
                    {limits.pistonConcurrency === -1 ? "Unlimited" : limits.pistonConcurrency}{" "}
                    · Limits apply at creation time. Existing content stays accessible if you
                    downgrade.
                </p>
            </Card>
        </div>
    );
}
