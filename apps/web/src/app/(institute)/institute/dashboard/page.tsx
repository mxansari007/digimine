"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

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
    const teaching = useTeachingFeatures();
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

    // Progressive next-step CTA: only renders before the institute has
    // teachers/classes/students. Once everything is bootstrapped the card
    // disappears entirely so it doesn't clutter mature dashboards.
    const nextStep: { title: string; copy: string; cta: string; href: string } | null =
        institute.stats.activeTeacherCount === 0
            ? {
                  title: "Add your first teacher",
                  copy: "You can't create classes until you have at least one active teacher. Bulk-paste a list of teacher emails — anyone with an existing account is linked instantly, brand-new emails get a one-time invite.",
                  cta: "Go to Teachers",
                  href: "/institute/teachers",
              }
            : institute.stats.classCount === 0
                ? {
                      title: "Create your first class",
                      copy: "Now that you have a teacher, create a class (e.g. \"610-A\"). Each class has its own invite code and can carry multiple subjects, each taught by a different teacher.",
                      cta: "Go to Classes",
                      href: "/institute/classes",
                  }
                : institute.stats.studentCount === 0
                    ? {
                          title: "Pre-register your students",
                          copy: "Paste a list of student emails. Anyone with a student account gets attached instantly; brand-new emails auto-attach when they sign up. Then you can add them to specific classes.",
                          cta: "Go to Students",
                          href: "/institute/students",
                      }
                    : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-gray-900">{institute.name}</h1>
                        <HelpTutorial {...TUTORIALS.institute_dashboard} />
                    </div>
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

            {nextStep && (
                <Card className="border-primary-200 bg-gradient-to-br from-primary-50/80 to-white p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                        Next step
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                        {nextStep.title}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">{nextStep.copy}</p>
                    <div className="mt-3">
                        <Link href={nextStep.href}>
                            <Button variant="primary">{nextStep.cta} →</Button>
                        </Link>
                    </div>
                </Card>
            )}

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
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {teaching.planName || institute.subscription?.planId || "Trial"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                        {institute.subscription?.seats != null
                            ? `${institute.subscription.seats} seats`
                            : "Unlimited seats"}{" "}
                        · {institute.subscription?.status || "trial"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {(["question_bank_template_download", "question_bank_markdown_import", "ai_question_generation"] as const).map((k) => {
                            const labels: Record<string, string> = {
                                question_bank_template_download: "Template",
                                question_bank_markdown_import: "Import",
                                ai_question_generation: "AI",
                            };
                            const on = teaching.has(k);
                            return (
                                <span
                                    key={k}
                                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                                >
                                    {on ? "✓" : "✗"} {labels[k]}
                                </span>
                            );
                        })}
                    </div>
                    <Link
                        href="/institute/billing"
                        className="mt-3 inline-block text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                        Manage plan →
                    </Link>
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
