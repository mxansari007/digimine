"use client";

/**
 * Institute → Project Evaluations overview. Lists every project
 * evaluation created by the institute's teachers with submission
 * progress. Drill-down links open the teacher report pages — the
 * teacher API routes authorize institute admins via canManageEvaluation,
 * and the (teacher) layout already admits institute admins.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    EmptyState,
    EvalRow,
    EvalStatusBadge,
    Eyebrow,
    Meter,
    formatDate,
} from "@/components/projectEval/shared";

type InstituteEvalRow = EvalRow & { teacherName: string };

export default function InstituteProjectEvalsPage() {
    const { firebaseUser } = useAuthContext();
    const [evaluations, setEvaluations] = useState<InstituteEvalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const meRes = await teacherFetch(firebaseUser, "/api/institute/me");
            const me = await meRes.json();
            const instituteId = me?.institute?.id;
            if (!instituteId) throw new Error("No institute found for this account.");
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/project-evals`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load.");
            setEvaluations(data.evaluations || []);
        } catch (err: any) {
            setError(err.message || "Failed to load.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const totalSubmitted = evaluations.reduce((s, e) => s + e.submissionCount, 0);
    const totalScored = evaluations.reduce((s, e) => s + e.evaluatedCount, 0);
    const teachers = new Set(evaluations.map((e) => e.teacherId)).size;

    return (
        <div className="space-y-6">
            <div>
                <Eyebrow>Across your teachers</Eyebrow>
                <h1 className="mt-1 font-display text-2xl font-bold text-gray-900">
                    Project evaluations
                </h1>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                    AI-assisted project grading across the institute — every evaluation, its
                    submission progress, and the scored reports.
                </p>
            </div>

            {error && <Card intent="danger" className="p-4 text-sm text-danger-700">{error}</Card>}

            {!loading && evaluations.length > 0 && (
                <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface shadow-soft-sm">
                    {[
                        { label: "Evaluations", value: evaluations.length },
                        { label: "Teachers running them", value: teachers },
                        { label: "Projects scored", value: `${totalScored}/${totalSubmitted}` },
                    ].map((s) => (
                        <div key={s.label} className="px-5 py-4">
                            <div className="font-display text-2xl font-bold tabular-nums text-gray-900">
                                {s.value}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
            ) : evaluations.length === 0 ? (
                <EmptyState
                    title="No project evaluations yet"
                    body="When your teachers create project evaluations, they appear here with submission and scoring progress for the whole institute."
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface shadow-soft-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                <th className="px-5 py-3">Evaluation</th>
                                <th className="hidden px-4 py-3 md:table-cell">Teacher</th>
                                <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                                <th className="px-4 py-3">Progress</th>
                                <th className="w-24 px-4 py-3 text-right">Reports</th>
                            </tr>
                        </thead>
                        <tbody>
                            {evaluations.map((ev) => {
                                const scoredPct =
                                    ev.submissionCount > 0
                                        ? (ev.evaluatedCount / ev.submissionCount) * 100
                                        : 0;
                                return (
                                    <tr
                                        key={ev.id}
                                        className="border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                                    >
                                        <td className="px-5 py-3.5">
                                            <div className="font-medium text-gray-900">{ev.title}</div>
                                            <div className="mt-0.5 text-[11px] text-slate-400">
                                                due {formatDate(ev.dueAt)} ·{" "}
                                                <span className="tabular-nums">{ev.maxTotalScore}</span> marks
                                            </div>
                                        </td>
                                        <td className="hidden px-4 py-3.5 text-slate-600 dark:text-slate-300 md:table-cell">
                                            {ev.teacherName}
                                        </td>
                                        <td className="hidden px-4 py-3.5 sm:table-cell">
                                            <EvalStatusBadge status={ev.status} />
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-14 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                    {ev.evaluatedCount}/{ev.submissionCount}
                                                </span>
                                                <Meter value={scoredPct} max={100} tone="neutral" className="w-20" />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-right">
                                            <Link href={`/teacher/project-evals/${ev.id}`}>
                                                <Button variant="outline" size="sm">Open</Button>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
