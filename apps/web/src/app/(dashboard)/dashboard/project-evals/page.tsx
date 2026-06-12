"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    EmptyState,
    EvalRow,
    Eyebrow,
    ScoreRing,
    SubmissionRow,
    SubmissionStatusBadge,
    formatDate,
} from "@/components/projectEval/shared";

type AssignedEval = EvalRow & { mySubmission: SubmissionRow | null };

export default function StudentProjectEvalsPage() {
    const { firebaseUser } = useAuthContext();
    const [evaluations, setEvaluations] = useState<AssignedEval[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const res = await teacherFetch(firebaseUser, "/api/project-evals/assigned");
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

    const pending = evaluations.filter((e) => !e.mySubmission && e.status === "published");

    return (
        <div className="space-y-6">
            <div>
                <Eyebrow>Build · submit · get scored</Eyebrow>
                <h1 className="mt-1 font-display text-2xl font-bold text-gray-900">
                    Project evaluations
                </h1>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                    Submit a GitHub repo for each assigned project. The AI reviews your code
                    against your teacher&apos;s rubric; your teacher finalizes the score.
                </p>
            </div>

            {error && (
                <Card intent="danger" className="p-4 text-sm text-danger-700">{error}</Card>
            )}

            {pending.length > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-accent-700 dark:text-accent-300">
                        {pending.length} project{pending.length === 1 ? "" : "s"}
                    </span>{" "}
                    waiting for your submission.
                </p>
            )}

            {loading ? (
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
            ) : evaluations.length === 0 ? (
                <EmptyState
                    title="Nothing assigned yet"
                    body="When a teacher publishes a project evaluation for your class, it appears here. You'll submit a GitHub repo and get a scored report back."
                />
            ) : (
                <div className="space-y-2.5">
                    {evaluations.map((ev) => {
                        const sub = ev.mySubmission;
                        const finalScore = sub?.teacherReview?.finalScore ?? sub?.totalScore ?? null;
                        const awaitingRelease = sub?.status === "scored" && !sub.resultPublished;
                        const needsAction = !sub && ev.status === "published";
                        return (
                            <Link
                                key={ev.id}
                                href={`/dashboard/project-evals/${ev.id}`}
                                className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                            >
                                <div
                                    className={`flex flex-wrap items-center gap-4 rounded-2xl border bg-white dark:bg-surface p-4 pl-5 shadow-soft-sm transition-colors hover:border-primary-300 ${
                                        needsAction
                                            ? "border-accent-300 dark:border-accent-500/40"
                                            : "border-slate-200 dark:border-slate-700"
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <h2 className="truncate font-display text-[15px] font-semibold text-gray-900">
                                            {ev.title}
                                        </h2>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Due {formatDate(ev.dueAt)} ·{" "}
                                            <span className="tabular-nums">{ev.maxTotalScore}</span> marks ·{" "}
                                            {ev.parameters.length} parameters
                                            {ev.status === "closed" ? " · closed" : ""}
                                        </p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-4">
                                        {sub ? (
                                            awaitingRelease ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-info-700 dark:text-info-300">
                                                    <span className="h-2 w-2 rounded-full bg-info-500" aria-hidden />
                                                    Under review
                                                </span>
                                            ) : sub.status === "scored" && finalScore !== null ? (
                                                <div className="flex items-center gap-3">
                                                    {sub.teacherReview && (
                                                        <span className="text-[11px] text-success-700 dark:text-success-300">
                                                            teacher reviewed
                                                        </span>
                                                    )}
                                                    <ScoreRing
                                                        score={finalScore}
                                                        maxScore={sub.maxTotalScore ?? ev.maxTotalScore}
                                                    />
                                                </div>
                                            ) : (
                                                <SubmissionStatusBadge status={sub.status} />
                                            )
                                        ) : (
                                            <Button
                                                variant={needsAction ? "primary" : "outline"}
                                                size="sm"
                                                tabIndex={-1}
                                            >
                                                {needsAction ? "Submit project" : "View"}
                                            </Button>
                                        )}
                                        <svg className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
