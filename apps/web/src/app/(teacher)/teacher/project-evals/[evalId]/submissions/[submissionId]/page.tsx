"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    EvalRow,
    Eyebrow,
    ReleaseBadge,
    RepoLink,
    ScoreRing,
    SubmissionRow,
    SubmissionStatusBadge,
    formatDate,
} from "@/components/projectEval/shared";
import { RubricLedger } from "@/components/projectEval/RubricLedger";

const overrideInput =
    "w-16 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

export default function SubmissionReportPage() {
    const { firebaseUser } = useAuthContext();
    const params = useParams<{ evalId: string; submissionId: string }>();
    const evalId = params?.evalId as string;
    const submissionId = params?.submissionId as string;
    const toast = useToast();

    const [evaluation, setEvaluation] = useState<EvalRow | null>(null);
    const [submission, setSubmission] = useState<SubmissionRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Review form state.
    const [adjusted, setAdjusted] = useState<Record<string, string>>({});
    const [comment, setComment] = useState("");
    const [savingReview, setSavingReview] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser || !evalId || !submissionId) return;
        try {
            const [evalRes, subRes] = await Promise.all([
                teacherFetch(firebaseUser, `/api/teacher/project-evals/${evalId}`),
                teacherFetch(
                    firebaseUser,
                    `/api/teacher/project-evals/${evalId}/submissions/${submissionId}`
                ),
            ]);
            const evalData = await evalRes.json();
            const subData = await subRes.json();
            if (!evalRes.ok) throw new Error(evalData.error || "Failed to load.");
            if (!subRes.ok) throw new Error(subData.error || "Failed to load submission.");
            setEvaluation(evalData.evaluation);
            setSubmission(subData.submission);
            const review = subData.submission?.teacherReview;
            if (review) {
                setComment(review.comment || "");
                setAdjusted(
                    Object.fromEntries(
                        Object.entries(review.adjustedScores || {}).map(([k, v]) => [k, String(v)])
                    )
                );
            }
        } catch (err: any) {
            setError(err.message || "Failed to load.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, evalId, submissionId]);

    useEffect(() => {
        load();
    }, [load]);

    const effectiveTotal = useMemo(() => {
        if (!submission?.scores) return null;
        return submission.scores.reduce((sum, s) => {
            const raw = adjusted[s.parameterId];
            const v = raw !== undefined && raw !== "" ? Number(raw) : NaN;
            return sum + (Number.isFinite(v) ? Math.min(s.maxScore, Math.max(0, v)) : s.score);
        }, 0);
    }, [submission, adjusted]);

    /**
     * Save the review and, optionally, flip release state in the same call.
     * `publish` undefined → save only (leaves visibility unchanged);
     * true → save & release to the student; false → save & withhold.
     */
    const submitReview = async (publish?: boolean) => {
        if (!firebaseUser) return;
        setSavingReview(true);
        try {
            const adjustedScores: Record<string, number> = {};
            for (const [k, v] of Object.entries(adjusted)) {
                if (v !== "" && Number.isFinite(Number(v))) adjustedScores[k] = Number(v);
            }
            const payload: Record<string, unknown> = { adjustedScores, comment };
            if (typeof publish === "boolean") payload.publish = publish;
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/project-evals/${evalId}/submissions/${submissionId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save review.");
            setSubmission(data.submission);
            toast.success(
                publish === true
                    ? "Saved — the student can now see the result."
                    : publish === false
                      ? "Saved and withheld from the student."
                      : "Review saved — publish it when you're ready."
            );
        } catch (err: any) {
            toast.error(err.message || "Failed to save review.");
        } finally {
            setSavingReview(false);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-4xl space-y-3">
                <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }
    if (error || !submission || !evaluation) {
        return <Card intent="danger" className="p-6 text-danger-700">{error || "Not found."}</Card>;
    }

    const meta = submission.repoMeta;
    const displayTotal =
        adjusted && Object.keys(adjusted).length > 0
            ? effectiveTotal
            : submission.teacherReview?.finalScore ?? submission.totalScore;

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            {/* Report header — reads like a document, not a dashboard */}
            <div>
                <Link
                    href={`/teacher/project-evals/${evalId}`}
                    className="text-xs text-slate-500 hover:text-primary-700 focus-visible:underline"
                >
                    ← {evaluation.title}
                </Link>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                    <div className="min-w-0">
                        <Eyebrow>Evaluation report</Eyebrow>
                        <h1 className="mt-1 font-display text-2xl font-bold text-gray-900">
                            {submission.studentName}
                        </h1>
                        <div className="mt-1.5">
                            <RepoLink url={submission.repoUrl} repoRef={submission.repoRef} />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                            Submitted {formatDate(submission.submittedAt)}
                            {submission.attempt > 1 ? ` · attempt ${submission.attempt}` : ""}
                            {submission.teacherReview?.reviewedAt
                                ? ` · reviewed ${formatDate(submission.teacherReview.reviewedAt)}`
                                : ""}
                        </p>
                    </div>
                    {submission.status === "scored" && displayTotal !== null ? (
                        <div className="flex flex-col items-center gap-2">
                            <ScoreRing
                                score={Math.round((displayTotal ?? 0) * 10) / 10}
                                maxScore={submission.maxTotalScore ?? evaluation.maxTotalScore}
                                size="lg"
                            />
                            <ReleaseBadge published={submission.resultPublished} />
                        </div>
                    ) : (
                        <SubmissionStatusBadge status={submission.status} />
                    )}
                </div>
            </div>

            {submission.status !== "scored" ? (
                <Card className="p-10 text-center text-sm text-slate-500">
                    {submission.status === "failed"
                        ? `Evaluation failed: ${submission.error || "unknown error"}. Use Retry on the submissions list to run it again.`
                        : "This submission hasn't been scored yet — the report appears here once the analysis finishes."}
                </Card>
            ) : (
                <>
                    {/* What is this project? */}
                    {submission.overview && (
                        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                            <Eyebrow>What the student built</Eyebrow>
                            <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                                {submission.overview.summary}
                            </p>
                            {submission.overview.architecture && (
                                <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                    {submission.overview.architecture}
                                </p>
                            )}

                            {meta && (
                                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3.5 text-xs text-slate-500">
                                    <div>
                                        <dt className="sr-only">Stack</dt>
                                        <dd>
                                            <span className="font-medium text-gray-900">{meta.detectedStack}</span>
                                        </dd>
                                    </div>
                                    <div><dd className="tabular-nums">{meta.fileCount} files</dd></div>
                                    {meta.languages.length > 0 && <div><dd>{meta.languages.join(" · ")}</dd></div>}
                                    {meta.commitCount !== null && (
                                        <div><dd className="tabular-nums">{meta.commitCount} commits</dd></div>
                                    )}
                                    {meta.lastCommitAt && <div><dd>last commit {formatDate(meta.lastCommitAt)}</dd></div>}
                                    <div><dd>{meta.hasReadme ? "README present" : "no README"}</dd></div>
                                    {meta.truncated && (
                                        <div>
                                            <dd className="text-warning-700 dark:text-warning-300">
                                                large repo — most relevant files analyzed
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            )}

                            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-success-700 dark:text-success-300">
                                        Working well
                                    </h3>
                                    <ul className="mt-2 space-y-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
                                        {submission.overview.strengths.length === 0 ? (
                                            <li className="text-slate-400">Nothing noted.</li>
                                        ) : (
                                            submission.overview.strengths.map((s, i) => (
                                                <li key={i} className="flex gap-2">
                                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success-500" aria-hidden />
                                                    {s}
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-warning-700 dark:text-warning-300">
                                        Needs work
                                    </h3>
                                    <ul className="mt-2 space-y-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
                                        {submission.overview.improvements.length === 0 ? (
                                            <li className="text-slate-400">Nothing noted.</li>
                                        ) : (
                                            submission.overview.improvements.map((s, i) => (
                                                <li key={i} className="flex gap-2">
                                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning-500" aria-hidden />
                                                    {s}
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                </div>
                            </div>

                            {submission.overview.redFlags.length > 0 && (
                                <div className="mt-4 rounded-xl border border-danger-200 dark:border-danger-500/30 bg-danger-50/60 dark:bg-danger-500/10 px-4 py-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-danger-700 dark:text-danger-300">
                                        Check before grading
                                    </h3>
                                    <ul className="mt-1.5 space-y-1 text-sm text-danger-700 dark:text-danger-300">
                                        {submission.overview.redFlags.map((s, i) => (
                                            <li key={i}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>
                    )}

                    {/* The rubric ledger — signature element */}
                    <section>
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="font-display text-lg font-semibold text-gray-900">Marksheet</h2>
                            <p className="text-xs text-slate-500">
                                AI-suggested scores with cited files. Type a final mark to override any of them.
                            </p>
                        </div>
                        <RubricLedger
                            scores={submission.scores || []}
                            renderScoreControl={(s) => (
                                <label className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
                                    Final
                                    <input
                                        className={overrideInput}
                                        value={adjusted[s.parameterId] ?? ""}
                                        placeholder={String(s.score)}
                                        inputMode="decimal"
                                        onChange={(e) =>
                                            setAdjusted((prev) => ({
                                                ...prev,
                                                [s.parameterId]: e.target.value.replace(/[^0-9.]/g, ""),
                                            }))
                                        }
                                        aria-label={`Final score for ${s.title} out of ${s.maxScore}`}
                                    />
                                </label>
                            )}
                        />
                    </section>

                    {/* Review */}
                    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <Eyebrow>Your review</Eyebrow>
                            {effectiveTotal !== null && (
                                <p className="text-sm text-slate-500">
                                    Final total{" "}
                                    <span className="font-display text-lg font-bold tabular-nums text-gray-900">
                                        {Math.round(effectiveTotal * 10) / 10}
                                    </span>
                                    <span className="font-mono text-xs text-slate-400">
                                        /{submission.maxTotalScore}
                                    </span>
                                </p>
                            )}
                        </div>
                        <textarea
                            className="mt-3 min-h-[88px] w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm leading-relaxed text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="Feedback for the student — shown with their report."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            maxLength={3000}
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                            <p className="text-xs text-slate-500">
                                {submission.resultPublished ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <ReleaseBadge published />
                                        <span className="text-primary-700 dark:text-primary-300">
                                            Visible to the student
                                            {submission.resultPublishedAt
                                                ? ` · released ${formatDate(submission.resultPublishedAt)}`
                                                : ""}
                                        </span>
                                    </span>
                                ) : (
                                    "Adjust marks, then publish to make the result visible to the student."
                                )}
                            </p>
                            <div className="flex gap-2">
                                {submission.resultPublished ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            disabled={savingReview}
                                            onClick={() => submitReview(false)}
                                        >
                                            Withhold
                                        </Button>
                                        <Button
                                            variant="primary"
                                            disabled={savingReview}
                                            onClick={() => submitReview(true)}
                                        >
                                            {savingReview ? "Saving…" : "Save changes"}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            disabled={savingReview}
                                            onClick={() => submitReview()}
                                        >
                                            Save draft
                                        </Button>
                                        <Button
                                            variant="primary"
                                            disabled={savingReview}
                                            onClick={() => submitReview(true)}
                                        >
                                            {savingReview ? "Saving…" : "Save & publish"}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Provenance */}
                    {meta && meta.analyzedFiles.length > 0 && (
                        <details className="group rounded-2xl border border-slate-200 dark:border-slate-700 px-5 py-4">
                            <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-gray-900 focus-visible:underline">
                                <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>
                                Files the AI read ({meta.analyzedFiles.length})
                            </summary>
                            <ul className="mt-3 grid gap-x-6 gap-y-0.5 font-mono text-[11px] leading-relaxed text-slate-500 sm:grid-cols-2">
                                {meta.analyzedFiles.map((f) => (
                                    <li key={f} className="truncate">{f}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </>
            )}
        </div>
    );
}
