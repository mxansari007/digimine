"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function TeacherProjectEvalsPage() {
    const { firebaseUser } = useAuthContext();
    const router = useRouter();
    const [evaluations, setEvaluations] = useState<EvalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const res = await teacherFetch(firebaseUser, "/api/teacher/project-evals");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load evaluations.");
            setEvaluations(data.evaluations || []);
        } catch (err: any) {
            setError(err.message || "Failed to load evaluations.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const open = evaluations.filter((e) => e.status === "published");
    const totalSubmitted = evaluations.reduce((s, e) => s + e.submissionCount, 0);
    const awaitingReview = evaluations.reduce(
        (s, e) => s + Math.max(0, e.submissionCount - e.evaluatedCount),
        0
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Eyebrow>AI-assisted grading</Eyebrow>
                    <h1 className="mt-1 font-display text-2xl font-bold text-gray-900">
                        Project evaluations
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                        Students submit a GitHub repo. The AI reads the code and scores your
                        rubric with file-cited evidence — you finalize every grade.
                    </p>
                </div>
                <Link href="/teacher/project-evals/new">
                    <Button variant="primary">New evaluation</Button>
                </Link>
            </div>

            {error && (
                <Card intent="danger" className="p-4 text-sm text-danger-700">
                    {error}
                </Card>
            )}

            {/* Ledger header strip */}
            {!loading && evaluations.length > 0 && (
                <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface shadow-soft-sm">
                    {[
                        { label: "Open evaluations", value: open.length },
                        { label: "Projects submitted", value: totalSubmitted },
                        { label: "Awaiting score", value: awaitingReview },
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
                    title="Grade real projects, not just MCQs"
                    body="Write a project brief and the parameters you care about — authentication, database design, code quality. Students submit their repos; you get a scored report with evidence for every parameter."
                    action={
                        <Link href="/teacher/project-evals/new">
                            <Button variant="primary">Create your first evaluation</Button>
                        </Link>
                    }
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface shadow-soft-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                <th className="px-5 py-3">Evaluation</th>
                                <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                                <th className="hidden px-4 py-3 md:table-cell">Due</th>
                                <th className="px-4 py-3">Submissions</th>
                                <th className="w-8 px-3 py-3" aria-hidden />
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
                                        onClick={() => router.push(`/teacher/project-evals/${ev.id}`)}
                                        className="cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                    >
                                        <td className="px-5 py-3.5">
                                            <Link
                                                href={`/teacher/project-evals/${ev.id}`}
                                                className="font-medium text-gray-900 outline-none focus-visible:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {ev.title}
                                            </Link>
                                            <div className="mt-0.5 text-xs text-slate-500">
                                                {ev.parameters.length} parameters ·{" "}
                                                <span className="tabular-nums">{ev.maxTotalScore}</span> marks
                                                {ev.techStack ? (
                                                    <span className="hidden lg:inline"> · {ev.techStack}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="hidden px-4 py-3.5 sm:table-cell">
                                            <EvalStatusBadge status={ev.status} />
                                        </td>
                                        <td className="hidden px-4 py-3.5 text-slate-600 dark:text-slate-300 md:table-cell">
                                            {formatDate(ev.dueAt)}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-14 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                    {ev.evaluatedCount}/{ev.submissionCount}
                                                </span>
                                                <Meter
                                                    value={scoredPct}
                                                    max={100}
                                                    tone="neutral"
                                                    className="w-20"
                                                />
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-slate-400">scored / submitted</div>
                                        </td>
                                        <td className="px-3 py-3.5 text-slate-300">
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
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
