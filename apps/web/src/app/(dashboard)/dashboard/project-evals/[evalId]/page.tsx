"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    EvalRow,
    Eyebrow,
    RepoLink,
    ScoreRing,
    SubmissionRow,
    SubmissionStatusBadge,
    formatDate,
    triggerProcessing,
} from "@/components/projectEval/shared";
import { RubricLedger } from "@/components/projectEval/RubricLedger";

const repoInput =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 font-mono text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

/** Scored, but the teacher hasn't released the result yet. */
function UnderReviewBadge() {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-info-700 dark:text-info-300">
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info-500 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-info-500" />
            </span>
            Under review
        </span>
    );
}

/** Honest description of what happens while status is queued/processing. */
function AnalysisInProgress() {
    return (
        <div className="rounded-xl border border-info-200 dark:border-info-500/30 bg-info-50/60 dark:bg-info-500/10 px-4 py-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-info-700 dark:text-info-300">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info-500 opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-info-500" />
                </span>
                Analyzing your repository
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-info-700/80 dark:text-info-300/80">
                Fetching the repo, reading the most relevant source files, then scoring each
                rubric parameter. Usually takes 1–3 minutes — this page refreshes itself.
            </p>
        </div>
    );
}

export default function StudentProjectEvalPage() {
    const { firebaseUser } = useAuthContext();
    const params = useParams<{ evalId: string }>();
    const evalId = params?.evalId as string;
    const toast = useToast();

    const [evaluation, setEvaluation] = useState<EvalRow | null>(null);
    const [submission, setSubmission] = useState<SubmissionRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [showResubmit, setShowResubmit] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser || !evalId) return;
        try {
            const [evalRes, subRes] = await Promise.all([
                teacherFetch(firebaseUser, `/api/project-evals/${evalId}`),
                teacherFetch(firebaseUser, `/api/project-evals/${evalId}/my-submission`),
            ]);
            const evalData = await evalRes.json();
            const subData = await subRes.json();
            if (!evalRes.ok) throw new Error(evalData.error || "Failed to load.");
            setEvaluation(evalData.evaluation);
            setSubmission(subData.submission ?? null);
        } catch (err: any) {
            setError(err.message || "Failed to load.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, evalId]);

    useEffect(() => {
        load();
    }, [load]);

    // Poll while the evaluation is running, and keep polling (slower) while
    // the result is scored but the teacher hasn't released it — so the score
    // appears the moment they publish, without a manual refresh.
    const active = submission?.status === "queued" || submission?.status === "processing";
    const released = submission?.resultPublished === true;
    const awaitingRelease = submission?.status === "scored" && !released;
    useEffect(() => {
        if (!active && !awaitingRelease) return;
        const timer = setInterval(load, active ? 8_000 : 20_000);
        return () => clearInterval(timer);
    }, [active, awaitingRelease, load]);

    const submit = async () => {
        if (!firebaseUser || !repoUrl.trim()) return;
        setSubmitting(true);
        try {
            const res = await teacherFetch(firebaseUser, `/api/project-evals/${evalId}/submit`, {
                method: "POST",
                body: JSON.stringify({ repoUrl: repoUrl.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to submit.");
            setSubmission(data.submission);
            setShowResubmit(false);
            // Kick off the analysis — runs server-side; we just poll status.
            triggerProcessing(await firebaseUser.getIdToken(), data.submission.id);
            toast.success("Submitted — analysis started.");
        } catch (err: any) {
            toast.error(err.message || "Failed to submit.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-3xl space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                <div className="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }
    if (error || !evaluation) {
        return <Card intent="danger" className="p-6 text-danger-700">{error || "Not found."}</Card>;
    }

    const pastDue = Boolean(evaluation.dueAt && new Date(evaluation.dueAt).getTime() <= Date.now());
    const canSubmit = evaluation.status === "published" && !pastDue && !active;
    const showSubmitForm = canSubmit && (!submission || showResubmit || submission.status === "failed");
    const finalScore = submission?.teacherReview?.finalScore ?? submission?.totalScore ?? null;

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            {/* Header */}
            <div>
                <Link
                    href="/dashboard/project-evals"
                    className="text-xs text-slate-500 hover:text-primary-700 focus-visible:underline"
                >
                    ← Project evaluations
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="font-display text-2xl font-bold text-gray-900">{evaluation.title}</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Due {formatDate(evaluation.dueAt)} ·{" "}
                            <span className="tabular-nums">{evaluation.maxTotalScore}</span> marks
                            {evaluation.techStack ? ` · ${evaluation.techStack}` : ""}
                        </p>
                    </div>
                    {released && submission?.status === "scored" && finalScore !== null && (
                        <ScoreRing
                            score={finalScore}
                            maxScore={submission.maxTotalScore ?? evaluation.maxTotalScore}
                            size="lg"
                        />
                    )}
                </div>
            </div>

            {/* The assignment */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                <Eyebrow>The assignment</Eyebrow>
                <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {evaluation.brief}
                </p>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    How you&apos;ll be scored
                </h3>
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    {evaluation.parameters.map((p, i) => (
                        <div
                            key={p.id}
                            className={`flex items-start justify-between gap-4 px-4 py-2.5 ${
                                i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""
                            }`}
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">{p.title}</div>
                                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{p.description}</p>
                            </div>
                            <span className="shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                                {p.maxScore} marks
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Submission zone */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Eyebrow>Your submission</Eyebrow>
                    {submission &&
                        (awaitingRelease ? (
                            <UnderReviewBadge />
                        ) : (
                            <SubmissionStatusBadge status={submission.status} />
                        ))}
                </div>

                {submission && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <RepoLink url={submission.repoUrl} repoRef={submission.repoRef} />
                        <span className="text-[11px] text-slate-400">
                            attempt {submission.attempt} · {formatDate(submission.submittedAt)}
                        </span>
                    </div>
                )}

                {active && (
                    <div className="mt-3">
                        <AnalysisInProgress />
                    </div>
                )}

                {submission?.status === "failed" && (
                    <div className="mt-3 rounded-xl border border-danger-200 dark:border-danger-500/30 bg-danger-50/60 dark:bg-danger-500/10 px-4 py-3 text-sm text-danger-700 dark:text-danger-300">
                        {submission.error || "Evaluation failed."} Fix the issue and submit again below.
                    </div>
                )}

                {showSubmitForm && (
                    <div className="mt-4 space-y-2">
                        <label htmlFor="repo-url" className="block text-sm font-medium text-gray-900">
                            Public GitHub repository
                        </label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                id="repo-url"
                                className={repoInput}
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/you/your-project"
                                spellCheck={false}
                            />
                            <Button
                                variant="primary"
                                disabled={submitting || !repoUrl.trim()}
                                onClick={submit}
                                className="shrink-0"
                            >
                                {submitting ? "Submitting…" : submission ? "Resubmit" : "Submit for review"}
                            </Button>
                        </div>
                        <p className="text-xs text-slate-400">
                            The repo must be public so it can be fetched.
                            {submission ? " Resubmitting replaces your previous result." : ""}
                        </p>
                    </div>
                )}

                {!showSubmitForm && canSubmit && submission && (
                    <button
                        type="button"
                        onClick={() => setShowResubmit(true)}
                        className="mt-3 text-xs text-primary-700 dark:text-primary-300 hover:underline focus-visible:underline"
                    >
                        Submit a different repo
                    </button>
                )}

                {!canSubmit && !submission && (
                    <p className="mt-3 text-sm text-slate-500">
                        {pastDue
                            ? "The due date has passed — submissions are closed."
                            : "This evaluation isn't accepting submissions right now."}
                    </p>
                )}
            </section>

            {/* Scored, awaiting the teacher's release. */}
            {awaitingRelease && (
                <section className="rounded-2xl border border-info-200 dark:border-info-500/30 bg-info-50/60 dark:bg-info-500/10 p-5">
                    <Eyebrow>Under review</Eyebrow>
                    <p className="mt-2 max-w-prose text-sm leading-relaxed text-info-800 dark:text-info-200">
                        Your project has been evaluated. Your teacher is reviewing the
                        results — your score and feedback will appear here once they release
                        it. This page updates on its own.
                    </p>
                </section>
            )}

            {/* Result */}
            {submission?.status === "scored" && released && (
                <>
                    {submission.teacherReview?.comment && (
                        <section className="rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-primary-50/60 dark:bg-primary-500/10 p-5">
                            <Eyebrow>From your teacher</Eyebrow>
                            <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                                {submission.teacherReview.comment}
                            </p>
                        </section>
                    )}

                    {submission.overview && (
                        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                            <Eyebrow>Review summary</Eyebrow>
                            <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                                {submission.overview.summary}
                            </p>
                            {!submission.teacherReview && (
                                <p className="mt-3 text-xs text-slate-400">
                                    Your teacher released this result based on the AI review.
                                </p>
                            )}
                        </section>
                    )}

                    <section>
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="font-display text-lg font-semibold text-gray-900">Marksheet</h2>
                            <p className="text-xs text-slate-500">
                                {submission.scoredBy === "manual"
                                    ? "Graded by your teacher."
                                    : "AI-reviewed, released by your teacher."}
                            </p>
                        </div>
                        <RubricLedger
                            scores={submission.scores || []}
                            adjustedScores={submission.teacherReview?.adjustedScores}
                        />
                    </section>

                    {submission.overview && submission.overview.improvements.length > 0 && (
                        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                            <Eyebrow>To improve your project</Eyebrow>
                            <ul className="mt-2 space-y-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
                                {submission.overview.improvements.map((s, i) => (
                                    <li key={i} className="flex gap-2">
                                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning-500" aria-hidden />
                                        {s}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
