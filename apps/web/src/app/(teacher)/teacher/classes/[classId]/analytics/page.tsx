"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ActivityHeatmap } from "@/components/teacher/ActivityHeatmap";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

type RiskBand = "low" | "medium" | "high";

type StudentSummary = {
    studentId: string;
    studentName: string;
    studentEmail: string;
    risk: {
        score: number;
        band: RiskBand;
        reasons: string[];
        metrics: {
            averagePercentage: number | null;
            recentTrend: number;
            daysSinceLastActive: number | null;
            coveragePercent: number;
        };
    };
    stats: {
        totalAttempts: number;
        completedAttempts: number;
        inProgressAttempts: number;
        averagePercentage: number | null;
        bestPercentage: number | null;
        coveragePercent: number;
        lastActiveAt: string | null;
    };
};

type ClassAnalytics = {
    totals: {
        totalStudents: number;
        activeStudents: number;
        totalAssignedContent: number;
        totalAttempts: number;
        completedAttempts: number;
        classAverage: number | null;
        classMedian: number | null;
        classTop: number | null;
        passRate: number | null;
    };
    histogram: number[];
    daily: { date: string; count: number; avgPercentage: number | null }[];
    topPerformers: Array<{ studentId: string; studentName: string; averagePercentage: number | null; completedAttempts: number }>;
    bottomPerformers: Array<{ studentId: string; studentName: string; averagePercentage: number | null; completedAttempts: number }>;
    atRisk: StudentSummary[];
    topicMastery: Array<{ category: string; attempts: number; averagePercentage: number }>;
    sectionMastery: Array<{ key: string; title: string; averagePercentage: number; attempts: number }>;
    mostMissed: Array<{ questionId: string; contentTitle: string; totalAttempts: number; wrongCount: number; wrongRate: number }>;
    dropOffStudents: Array<{ studentId: string; studentName: string; inProgressAttempts: number }>;
    notAttempted: Array<{ studentId: string; studentName: string; studentEmail: string; enrolledAt: string | null }>;
    projectEvals: Array<{
        id: string;
        title: string;
        status: string;
        dueAt: string | null;
        maxTotalScore: number;
        submitted: number;
        scored: number;
        pending: number;
        averagePercent: number | null;
    }>;
};

function formatPct(n: number | null | undefined) {
    return n === null || n === undefined ? "-" : `${n}%`;
}

const riskBg: Record<RiskBand, string> = {
    low: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-500/25",
    medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-500/25",
    high: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-500/25",
};

export default function ClassAnalyticsPage() {
    const params = useParams();
    const classId = params.classId as string;
    const { firebaseUser } = useAuthContext();
    const [data, setData] = useState<ClassAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/classes/${encodeURIComponent(classId)}/analytics`
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Failed to load class analytics");
            setData(json);
        } catch (err: any) {
            setError(err.message || "Failed to load analytics.");
        } finally {
            setLoading(false);
        }
    }, [classId, firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) return <div className="py-20 text-center text-gray-500">Loading analytics...</div>;
    if (error) {
        return (
            <Card className="p-8 text-center text-red-700">
                Couldn&apos;t load analytics: {error}
                <Link href={`/teacher/classes/${classId}`} className="ml-2 text-primary-700 underline">
                    Back to class
                </Link>
            </Card>
        );
    }
    if (!data) {
        return (
            <Card className="p-8 text-center text-slate-600">
                No student activity yet — once students start completing attempts, insights will appear here.
                <Link href={`/teacher/classes/${classId}`} className="ml-2 text-primary-700 underline">
                    Back to class
                </Link>
            </Card>
        );
    }

    const maxHist = Math.max(1, ...data.histogram);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link
                        href={`/teacher/classes/${classId}`}
                        className="text-sm text-primary-700 hover:text-primary-800"
                    >
                        ← Back to class
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-gray-900">Class analytics</h1>
                        <HelpTutorial {...TUTORIALS.teacher_class_analytics} />
                    </div>
                    <p className="text-sm text-gray-500">Every student, every attempt — synthesised.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={load}>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Headline metric cards */}
            <div className="grid gap-3 md:grid-cols-4">
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Class average</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{formatPct(data.totals.classAverage)}</p>
                    <p className="mt-1 text-xs text-gray-500">
                        Median {formatPct(data.totals.classMedian)} · Top {formatPct(data.totals.classTop)}
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pass rate</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{formatPct(data.totals.passRate)}</p>
                    <p className="mt-1 text-xs text-gray-500">
                        {data.totals.completedAttempts} completed attempts
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reach</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                        {data.totals.activeStudents}/{data.totals.totalStudents}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Active students in this class</p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Content live</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{data.totals.totalAssignedContent}</p>
                    <p className="mt-1 text-xs text-gray-500">Quizzes + test series available</p>
                </Card>
            </div>

            {/* Distribution + activity */}
            <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Score distribution</h3>
                    <p className="text-xs text-gray-500">All completed attempts, 10% bands</p>
                    <div className="mt-4 flex h-40 items-end gap-1.5">
                        {data.histogram.map((count, i) => (
                            <div key={i} className="flex flex-1 flex-col items-center">
                                <div className="flex h-full w-full items-end">
                                    <div
                                        className="w-full rounded-t bg-primary-500"
                                        style={{ height: `${(count / maxHist) * 100}%`, minHeight: count > 0 ? 4 : 0 }}
                                        title={`${i * 10}-${i === 9 ? 100 : (i + 1) * 10}%: ${count}`}
                                    />
                                </div>
                                <div className="mt-1 text-[10px] text-gray-500">{i * 10}</div>
                                <div className="text-[10px] font-semibold text-gray-700">{count}</div>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="p-6">
                    <ActivityHeatmap daily={data.daily} label="Daily activity (last 90 days)" />
                </Card>
            </div>

            {/* At-risk students */}
            <Card className="p-0 overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">At-risk students</h3>
                        <p className="text-xs text-gray-500">
                            Composite of low scores, downward trend, low engagement, and weak coverage.
                        </p>
                    </div>
                    <span className="text-xs text-gray-500">{data.atRisk.length} flagged</span>
                </div>
                {data.atRisk.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">
                        Nothing to worry about — everyone is in a healthy range.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                                    <th className="px-5 py-3 text-left">Student</th>
                                    <th className="px-5 py-3 text-left">Risk</th>
                                    <th className="px-5 py-3 text-left">Why</th>
                                    <th className="px-5 py-3 text-left">Avg</th>
                                    <th className="px-5 py-3 text-left">Coverage</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.atRisk.map((r) => (
                                    <tr key={r.studentId} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-5 py-3">
                                            <Link href={`/teacher/students/${r.studentId}`} className="font-medium text-gray-900 hover:text-primary-700">
                                                {r.studentName}
                                            </Link>
                                            <div className="text-xs text-gray-500">{r.studentEmail}</div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskBg[r.risk.band]}`}>
                                                <span>{r.risk.band.toUpperCase()}</span>
                                                <span className="text-[10px] opacity-70">{r.risk.score}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-xs text-gray-600">
                                            <ul className="space-y-0.5">
                                                {r.risk.reasons.slice(0, 3).map((reason) => (
                                                    <li key={reason}>• {reason}</li>
                                                ))}
                                            </ul>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">{formatPct(r.stats.averagePercentage)}</td>
                                        <td className="px-5 py-3 text-gray-700">{r.stats.coveragePercent}%</td>
                                        <td className="px-5 py-3 text-right">
                                            <Link href={`/teacher/students/${r.studentId}`} className="text-xs text-primary-700 hover:text-primary-800">
                                                View →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Performers */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Top performers</h3>
                    {data.topPerformers.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-500">No completed attempts yet.</p>
                    ) : (
                        <ol className="mt-3 space-y-2 text-sm">
                            {data.topPerformers.map((p, i) => (
                                <li key={p.studentId} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                            {i + 1}
                                        </span>
                                        <Link href={`/teacher/students/${p.studentId}`} className="hover:text-primary-700">
                                            {p.studentName}
                                        </Link>
                                    </div>
                                    <span className="text-sm font-semibold text-emerald-700">
                                        {formatPct(p.averagePercentage)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </Card>

                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Need attention</h3>
                    {data.bottomPerformers.length === 0 ? (
                        <p className="mt-3 text-xs text-gray-500">No completed attempts yet.</p>
                    ) : (
                        <ol className="mt-3 space-y-2 text-sm">
                            {data.bottomPerformers.map((p, i) => (
                                <li key={p.studentId} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-500/10 text-xs font-bold text-rose-700 dark:text-rose-300">
                                            {i + 1}
                                        </span>
                                        <Link href={`/teacher/students/${p.studentId}`} className="hover:text-primary-700">
                                            {p.studentName}
                                        </Link>
                                    </div>
                                    <span className="text-sm font-semibold text-rose-700">{formatPct(p.averagePercentage)}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </Card>
            </div>

            {/* Topic + section mastery */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Topic mastery</h3>
                    <p className="text-xs text-gray-500">Average class percentage by topic.</p>
                    <div className="mt-4 space-y-2">
                        {data.topicMastery.length === 0 ? (
                            <p className="text-xs text-gray-500">No data yet.</p>
                        ) : (
                            data.topicMastery.map((t) => (
                                <div key={t.category}>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-700">{t.category}</span>
                                        <span className="text-gray-500">
                                            {t.averagePercentage}% · {t.attempts} attempts
                                        </span>
                                    </div>
                                    <div className="mt-1 h-2 overflow-hidden rounded bg-gray-100">
                                        <div
                                            className={`h-full ${
                                                t.averagePercentage >= 70
                                                    ? "bg-emerald-500"
                                                    : t.averagePercentage >= 50
                                                    ? "bg-amber-500"
                                                    : "bg-rose-500"
                                            }`}
                                            style={{ width: `${t.averagePercentage}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Weakest sections</h3>
                    <p className="text-xs text-gray-500">Lowest-average test sections across the class.</p>
                    <div className="mt-4 space-y-2">
                        {data.sectionMastery.length === 0 ? (
                            <p className="text-xs text-gray-500">No test sections recorded yet.</p>
                        ) : (
                            data.sectionMastery.map((s) => (
                                <div key={s.key}>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="truncate font-medium text-gray-700" title={s.title}>
                                            {s.title}
                                        </span>
                                        <span className="text-gray-500">{s.averagePercentage}%</span>
                                    </div>
                                    <div className="mt-1 h-2 overflow-hidden rounded bg-gray-100">
                                        <div className="h-full bg-rose-500" style={{ width: `${s.averagePercentage}%` }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            {/* Project evaluations */}
            {(data.projectEvals || []).length > 0 && (
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Project evaluations</h3>
                    <p className="text-xs text-gray-500">
                        Submission and scoring progress for AI-graded projects assigned to this class.
                    </p>
                    <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                        {data.projectEvals.map((ev) => {
                            const total = ev.submitted + ev.pending;
                            const submitPct = total > 0 ? Math.round((ev.submitted / total) * 100) : 0;
                            return (
                                <div key={ev.id} className="flex flex-wrap items-center gap-3 py-3">
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/teacher/project-evals/${ev.id}`}
                                            className="truncate text-sm font-medium text-gray-900 hover:text-primary-700"
                                        >
                                            {ev.title}
                                        </Link>
                                        <div className="mt-1 h-2 max-w-xs overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                                            <div className="h-full bg-primary-500" style={{ width: `${submitPct}%` }} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5 text-xs text-gray-500">
                                        <span>
                                            <span className="font-semibold text-gray-900">{ev.submitted}</span>/{total} submitted
                                        </span>
                                        <span>
                                            <span className="font-semibold text-gray-900">{ev.scored}</span> scored
                                        </span>
                                        <span>
                                            class avg{" "}
                                            <span className="font-semibold text-gray-900">
                                                {ev.averagePercent === null ? "—" : `${ev.averagePercent}%`}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Most-missed questions + dropoffs */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Most-missed questions</h3>
                    <p className="text-xs text-gray-500">Questions students get wrong most often (≥3 attempts).</p>
                    <div className="mt-3 overflow-hidden">
                        {data.mostMissed.length === 0 ? (
                            <p className="text-xs text-gray-500">Nothing standing out yet.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 text-sm">
                                {data.mostMissed.map((q) => (
                                    <li key={q.questionId} className="py-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="truncate font-medium text-gray-900">{q.contentTitle}</span>
                                            <span className="rounded-full bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                                                {q.wrongRate}% wrong
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-gray-500">
                                            {q.wrongCount} wrong of {q.totalAttempts} attempts · qid {q.questionId.slice(0, 8)}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Card>

                <div className="grid gap-4 grid-rows-2">
                    <Card className="p-6">
                        <h3 className="text-sm font-semibold text-gray-900">Dropped off</h3>
                        <p className="text-xs text-gray-500">Started something but never finished anything.</p>
                        {data.dropOffStudents.length === 0 ? (
                            <p className="mt-3 text-xs text-gray-500">Nobody stuck.</p>
                        ) : (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {data.dropOffStudents.map((s) => (
                                    <Link
                                        key={s.studentId}
                                        href={`/teacher/students/${s.studentId}`}
                                        className="rounded-full border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3 py-1 text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                                    >
                                        {s.studentName} ({s.inProgressAttempts})
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                    <Card className="p-6">
                        <h3 className="text-sm font-semibold text-gray-900">Not attempted yet</h3>
                        <p className="text-xs text-gray-500">Active students with zero attempts on any content.</p>
                        {data.notAttempted.length === 0 ? (
                            <p className="mt-3 text-xs text-gray-500">Everyone has at least started.</p>
                        ) : (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {data.notAttempted.map((s) => (
                                    <Link
                                        key={s.studentId}
                                        href={`/teacher/students/${s.studentId}`}
                                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-500/10"
                                        title={s.studentEmail}
                                    >
                                        {s.studentName}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
