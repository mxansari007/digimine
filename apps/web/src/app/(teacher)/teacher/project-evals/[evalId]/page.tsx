"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    EmptyState,
    EvalRow,
    EvalStatusBadge,
    Eyebrow,
    ReleaseBadge,
    RepoLink,
    ScoreFraction,
    SubmissionRow,
    SubmissionStatusBadge,
    formatDate,
    triggerProcessing,
} from "@/components/projectEval/shared";

export default function ProjectEvalDetailPage() {
    const { firebaseUser } = useAuthContext();
    const params = useParams<{ evalId: string }>();
    const evalId = params?.evalId as string;
    const toast = useToast();

    const [evaluation, setEvaluation] = useState<EvalRow | null>(null);
    const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [briefOpen, setBriefOpen] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser || !evalId) return;
        setError("");
        try {
            const [evalRes, subsRes] = await Promise.all([
                teacherFetch(firebaseUser, `/api/teacher/project-evals/${evalId}`),
                teacherFetch(firebaseUser, `/api/teacher/project-evals/${evalId}/submissions`),
            ]);
            const evalData = await evalRes.json();
            const subsData = await subsRes.json();
            if (!evalRes.ok) throw new Error(evalData.error || "Failed to load.");
            if (!subsRes.ok) throw new Error(subsData.error || "Failed to load submissions.");
            setEvaluation(evalData.evaluation);
            setSubmissions(subsData.submissions || []);
        } catch (err: any) {
            setError(err.message || "Failed to load.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, evalId]);

    useEffect(() => {
        load();
    }, [load]);

    // Live-ish refresh while anything is queued/processing.
    const hasActive = submissions.some((s) => s.status === "queued" || s.status === "processing");
    useEffect(() => {
        if (!hasActive) return;
        const timer = setInterval(load, 12_000);
        return () => clearInterval(timer);
    }, [hasActive, load]);

    const setStatus = async (status: "draft" | "published" | "closed") => {
        if (!firebaseUser) return;
        setBusy(true);
        try {
            const res = await teacherFetch(firebaseUser, `/api/teacher/project-evals/${evalId}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update.");
            setEvaluation(data.evaluation);
            toast.success(
                status === "published" ? "Published — students can submit now." : status === "closed" ? "Submissions closed." : "Moved to draft."
            );
        } catch (err: any) {
            toast.error(err.message || "Failed to update.");
        } finally {
            setBusy(false);
        }
    };

    const retry = async (submission: SubmissionRow) => {
        if (!firebaseUser) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/project-evals/${evalId}/submissions/${submission.id}`,
                { method: "POST" }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to queue re-evaluation.");
            triggerProcessing(await firebaseUser.getIdToken(), submission.id);
            toast.success("Evaluation queued — refresh in a minute or two.");
            await load();
        } catch (err: any) {
            toast.error(err.message || "Failed.");
        }
    };

    // Release one student's scored result (or withhold it again).
    const setRowPublish = async (submission: SubmissionRow, publish: boolean) => {
        if (!firebaseUser) return;
        setBusy(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/project-evals/${evalId}/submissions/${submission.id}`,
                { method: "PATCH", body: JSON.stringify({ publish }) }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed.");
            setSubmissions((prev) => prev.map((s) => (s.id === submission.id ? data.submission : s)));
            toast.success(publish ? "Released to the student." : "Result withheld from the student.");
        } catch (err: any) {
            toast.error(err.message || "Failed.");
        } finally {
            setBusy(false);
        }
    };

    // Release (or withhold) every scored result for the evaluation at once.
    const bulkPublish = async (publish: boolean) => {
        if (!firebaseUser) return;
        setBusy(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/project-evals/${evalId}/publish`,
                { method: "POST", body: JSON.stringify({ publish }) }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed.");
            const n = data.count ?? 0;
            toast.success(
                publish
                    ? `Released ${n} result${n === 1 ? "" : "s"} to students.`
                    : `Withheld ${n} result${n === 1 ? "" : "s"}.`
            );
            await load();
        } catch (err: any) {
            toast.error(err.message || "Failed.");
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }
    if (error || !evaluation) {
        return <Card intent="danger" className="p-6 text-danger-700">{error || "Not found."}</Card>;
    }

    const scoredCount = submissions.filter((s) => s.status === "scored").length;
    const releasedCount = submissions.filter(
        (s) => s.status === "scored" && s.resultPublished
    ).length;
    const heldCount = scoredCount - releasedCount;

    return (
        <div className="space-y-6">
            {/* Document header */}
            <div>
                <Link
                    href="/teacher/project-evals"
                    className="text-xs text-slate-500 hover:text-primary-700 focus-visible:underline"
                >
                    ← All evaluations
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="font-display text-2xl font-bold text-gray-900">{evaluation.title}</h1>
                            <EvalStatusBadge status={evaluation.status} />
                        </div>
                        <p className="mt-1.5 text-sm text-slate-500">
                            Due {formatDate(evaluation.dueAt)} ·{" "}
                            <span className="tabular-nums">{evaluation.maxTotalScore}</span> marks ·{" "}
                            {evaluation.assignedMode === "all_students"
                                ? "all your students"
                                : `${evaluation.classIds.length} class${evaluation.classIds.length === 1 ? "" : "es"}`}
                            {evaluation.techStack ? ` · ${evaluation.techStack}` : ""}
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        {evaluation.status !== "published" && (
                            <Button variant="primary" disabled={busy} onClick={() => setStatus("published")}>
                                Publish
                            </Button>
                        )}
                        {evaluation.status === "published" && (
                            <Button variant="outline" disabled={busy} onClick={() => setStatus("closed")}>
                                Close submissions
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Rubric strip — what the marks are made of */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                <div className="flex items-baseline justify-between">
                    <Eyebrow>Rubric</Eyebrow>
                    <button
                        type="button"
                        onClick={() => setBriefOpen((v) => !v)}
                        className="text-xs text-primary-700 dark:text-primary-300 hover:underline focus-visible:underline"
                    >
                        {briefOpen ? "Hide brief" : "Show brief"}
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {evaluation.parameters.map((p) => (
                        <span
                            key={p.id}
                            title={p.description}
                            className="inline-flex items-baseline gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-sm"
                        >
                            <span className="text-gray-900">{p.title}</span>
                            <span className="font-mono text-xs text-slate-400 tabular-nums">{p.maxScore}</span>
                        </span>
                    ))}
                </div>
                {briefOpen && (
                    <p className="mt-4 max-w-prose whitespace-pre-wrap border-t border-slate-100 dark:border-slate-800 pt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {evaluation.brief}
                    </p>
                )}
            </div>

            {/* Submissions ledger */}
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="font-display text-lg font-semibold text-gray-900">Submissions</h2>
                        {submissions.length > 0 && (
                            <span className="text-xs text-slate-500">
                                <span className="tabular-nums">{scoredCount}</span> of{" "}
                                <span className="tabular-nums">{submissions.length}</span> scored
                                {scoredCount > 0 && (
                                    <>
                                        {" · "}
                                        <span className="tabular-nums">{releasedCount}</span> released
                                    </>
                                )}
                            </span>
                        )}
                    </div>
                    {scoredCount > 0 && (
                        <div className="flex items-center gap-2">
                            {heldCount > 0 && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => bulkPublish(true)}
                                >
                                    Publish {heldCount} result{heldCount === 1 ? "" : "s"}
                                </Button>
                            )}
                            {releasedCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => bulkPublish(false)}
                                >
                                    Withhold all
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                {heldCount > 0 && (
                    <p className="mb-3 -mt-1 text-xs text-warning-700 dark:text-warning-300">
                        {heldCount} scored result{heldCount === 1 ? "" : "s"} not yet visible to
                        students. Review and adjust marks, then publish.
                    </p>
                )}

                {submissions.length === 0 ? (
                    <EmptyState
                        title="No submissions yet"
                        body={
                            evaluation.status === "draft"
                                ? "This evaluation is still a draft. Publish it and your students will see it in their dashboard and classroom."
                                : "Students haven't submitted yet. They'll appear here the moment a repo comes in — scoring runs automatically."
                        }
                        action={
                            evaluation.status === "draft" ? (
                                <Button variant="primary" disabled={busy} onClick={() => setStatus("published")}>
                                    Publish now
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface shadow-soft-sm">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                    <th className="px-5 py-3">Student</th>
                                    <th className="hidden px-4 py-3 md:table-cell">Repository</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Score</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((s) => {
                                    const final = s.teacherReview?.finalScore ?? s.totalScore;
                                    return (
                                        <tr
                                            key={s.id}
                                            className="border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                                        >
                                            <td className="px-5 py-3.5">
                                                <div className="font-medium text-gray-900">{s.studentName}</div>
                                                <div className="text-[11px] text-slate-400">
                                                    {formatDate(s.submittedAt)}
                                                    {s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}
                                                    {s.teacherReview ? " · reviewed" : ""}
                                                </div>
                                                {s.status === "failed" && s.error && (
                                                    <p className="mt-1 max-w-sm text-xs text-danger-600">{s.error}</p>
                                                )}
                                            </td>
                                            <td className="hidden max-w-[220px] px-4 py-3.5 md:table-cell">
                                                <RepoLink url={s.repoUrl} repoRef={s.repoRef} />
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-col items-start gap-1.5">
                                                    <SubmissionStatusBadge status={s.status} />
                                                    {s.status === "scored" && (
                                                        <ReleaseBadge published={s.resultPublished} />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-right">
                                                {s.status === "scored" && final !== null ? (
                                                    <ScoreFraction
                                                        score={final}
                                                        maxScore={s.maxTotalScore ?? evaluation.maxTotalScore}
                                                    />
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    {s.status === "scored" &&
                                                        (s.resultPublished ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                disabled={busy}
                                                                onClick={() => setRowPublish(s, false)}
                                                            >
                                                                Withhold
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="primary"
                                                                size="sm"
                                                                disabled={busy}
                                                                onClick={() => setRowPublish(s, true)}
                                                            >
                                                                Publish
                                                            </Button>
                                                        ))}
                                                    {(s.status === "failed" || s.status === "scored") && (
                                                        <Button variant="ghost" size="sm" onClick={() => retry(s)}>
                                                            {s.status === "failed" ? "Retry" : "Re-run"}
                                                        </Button>
                                                    )}
                                                    {(s.status === "scored" || s.status === "failed") && (
                                                        <Link href={`/teacher/project-evals/${evalId}/submissions/${s.id}`}>
                                                            <Button variant="outline" size="sm">
                                                                {s.status === "failed" ? "Grade manually" : "Open report"}
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
