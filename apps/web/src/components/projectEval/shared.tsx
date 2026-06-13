"use client";

/**
 * Shared presentation kit for the project evaluation surfaces (teacher,
 * student, classroom, institute). Visual language: "the marksheet meets
 * the code review" — scores are documents with proof, so file evidence
 * is set in mono, numbers are tabular, statuses are quiet dots, and the
 * per-parameter ledger row (verdict spine + meter + citations) is the
 * signature element. Row types mirror the API serializers in
 * `lib/server/projectEval/store.ts`.
 */
import type { ReactNode } from "react";

export type EvalRow = {
    id: string;
    title: string;
    brief: string;
    techStack: string | null;
    parameters: Array<{ id: string; title: string; description: string; maxScore: number }>;
    maxTotalScore: number;
    teacherId: string;
    instituteId: string | null;
    assignedMode: "classes" | "all_students";
    classIds: string[];
    status: "draft" | "published" | "closed";
    dueAt: string | null;
    submissionCount: number;
    evaluatedCount: number;
    createdAt: string | null;
    updatedAt: string | null;
};

export type SubmissionRow = {
    id: string;
    evaluationId: string;
    studentId: string;
    studentName: string;
    studentEmail?: string;
    repoUrl: string;
    repoRef: string | null;
    status: "queued" | "processing" | "scored" | "failed";
    attempt: number;
    repoMeta: {
        fileCount: number;
        totalBytes: number;
        languages: string[];
        detectedStack: string;
        hasReadme: boolean;
        analyzedFiles: string[];
        truncated: boolean;
        commitCount: number | null;
        lastCommitAt: string | null;
        defaultBranch: string | null;
    } | null;
    overview: {
        summary: string;
        architecture: string;
        strengths: string[];
        improvements: string[];
        redFlags: string[];
    } | null;
    scores: Array<{
        parameterId: string;
        title: string;
        score: number;
        maxScore: number;
        verdict: "met" | "partial" | "not_met";
        confidence: "high" | "medium" | "low";
        reasoning: string;
        evidence: string[];
    }> | null;
    totalScore: number | null;
    maxTotalScore: number | null;
    error: string | null;
    /** How the scores were produced — "ai" pipeline or teacher "manual" grade. */
    scoredBy?: "ai" | "manual" | null;
    teacherReview: {
        adjustedScores: Record<string, number>;
        finalScore: number;
        comment: string;
        reviewedBy: string;
        reviewedAt: string | null;
    } | null;
    /** Whether the teacher has released this result to the student. */
    resultPublished: boolean;
    resultPublishedAt: string | null;
    submittedAt: string | null;
    processedAt: string | null;
    updatedAt: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// Status language — one quiet dot + label, used on every surface.
// ─────────────────────────────────────────────────────────────────────

const SUBMISSION_STATUS: Record<
    SubmissionRow["status"],
    { label: string; dot: string; text: string; pulse?: boolean }
> = {
    queued: { label: "Queued", dot: "bg-warning-500", text: "text-warning-700 dark:text-warning-300", pulse: true },
    processing: { label: "Evaluating", dot: "bg-info-500", text: "text-info-700 dark:text-info-300", pulse: true },
    scored: { label: "Scored", dot: "bg-success-500", text: "text-success-700 dark:text-success-300" },
    failed: { label: "Failed", dot: "bg-danger-500", text: "text-danger-700 dark:text-danger-300" },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionRow["status"] }) {
    const s = SUBMISSION_STATUS[status] ?? SUBMISSION_STATUS.queued;
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
            <span className="relative flex h-2 w-2">
                {s.pulse && (
                    <span
                        className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-60 animate-ping motion-reduce:animate-none`}
                    />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
            </span>
            {s.label}
        </span>
    );
}

const EVAL_STATUS: Record<EvalRow["status"], { label: string; cls: string }> = {
    draft: {
        label: "Draft",
        cls: "border border-dashed border-slate-300 dark:border-slate-600 text-slate-500",
    },
    published: {
        label: "Open",
        cls: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-300 ring-1 ring-success-200 dark:ring-success-500/30",
    },
    closed: {
        label: "Closed",
        cls: "bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-600",
    },
};

export function EvalStatusBadge({ status }: { status: EvalRow["status"] }) {
    const s = EVAL_STATUS[status] ?? EVAL_STATUS.draft;
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
            {s.label}
        </span>
    );
}

/**
 * Whether a scored result has been released to the student. Teacher-only
 * surface — "Released" (teal) vs "Held" (dashed, needs the teacher's
 * attention before the student can see anything).
 */
export function ReleaseBadge({ published }: { published: boolean }) {
    return published ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-500/15 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300 ring-1 ring-primary-200 dark:ring-primary-500/30">
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current" aria-hidden>
                <path d="M10.3 3.3 4.8 8.8 1.7 5.7l.9-.9 2.2 2.2 4.6-4.6z" />
            </svg>
            Released
        </span>
    ) : (
        <span className="inline-flex items-center rounded-full border border-dashed border-warning-400 dark:border-warning-500/50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 dark:text-warning-300">
            Held
        </span>
    );
}

const VERDICT: Record<
    "met" | "partial" | "not_met",
    { label: string; spine: string; chip: string }
> = {
    met: {
        label: "Met",
        spine: "bg-success-500",
        chip: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-300",
    },
    partial: {
        label: "Partial",
        spine: "bg-warning-500",
        chip: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-300",
    },
    not_met: {
        label: "Not met",
        spine: "bg-danger-500",
        chip: "bg-danger-50 dark:bg-danger-500/15 text-danger-700 dark:text-danger-300",
    },
};

export function VerdictBadge({ verdict }: { verdict: "met" | "partial" | "not_met" }) {
    const v = VERDICT[verdict] ?? VERDICT.partial;
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${v.chip}`}>
            {v.label}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Score language — tabular fractions, ring, hairline meter.
// ─────────────────────────────────────────────────────────────────────

function scoreTone(pct: number): { stroke: string; text: string; bar: string } {
    if (pct >= 70) return { stroke: "stroke-success-500", text: "text-success-700 dark:text-success-300", bar: "bg-success-500" };
    if (pct >= 40) return { stroke: "stroke-warning-500", text: "text-warning-700 dark:text-warning-300", bar: "bg-warning-500" };
    return { stroke: "stroke-danger-500", text: "text-danger-700 dark:text-danger-300", bar: "bg-danger-500" };
}

/** Circular score indicator. `size="lg"` for report headers, `sm` for rows. */
export function ScoreRing({
    score,
    maxScore,
    size = "sm",
}: {
    score: number;
    maxScore: number;
    size?: "sm" | "lg";
}) {
    const pct = maxScore > 0 ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0;
    const tone = scoreTone(pct);
    const px = size === "lg" ? 88 : 40;
    const strokeW = size === "lg" ? 7 : 4;
    const r = (px - strokeW) / 2;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: px, height: px }}>
            <svg width={px} height={px} className="-rotate-90" aria-hidden>
                <circle cx={px / 2} cy={px / 2} r={r} fill="none" strokeWidth={strokeW} className="stroke-slate-200 dark:stroke-slate-700" />
                <circle
                    cx={px / 2}
                    cy={px / 2}
                    r={r}
                    fill="none"
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c - (pct / 100) * c}
                    className={`${tone.stroke} transition-[stroke-dashoffset] duration-700 ease-out`}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                {size === "lg" ? (
                    <>
                        <span className={`font-display text-2xl font-bold tabular-nums leading-none text-gray-900`}>
                            {score}
                        </span>
                        <span className="mt-0.5 font-mono text-[10px] text-slate-500">/ {maxScore}</span>
                    </>
                ) : (
                    <span className="text-[11px] font-bold tabular-nums text-gray-900">{Math.round(pct)}</span>
                )}
            </div>
        </div>
    );
}

/** Hairline progress meter. */
export function Meter({
    value,
    max,
    tone,
    className = "",
}: {
    value: number;
    max: number;
    /** "score" colors by band; "neutral" is always teal. */
    tone?: "score" | "neutral";
    className?: string;
}) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    const bar = tone === "neutral" ? "bg-primary-500" : scoreTone(pct).bar;
    return (
        <div className={`h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}>
            <div className={`h-full rounded-full ${bar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Inline `score/max` fraction with tabular digits. */
export function ScoreFraction({
    score,
    maxScore,
    size = "md",
}: {
    score: number;
    maxScore: number;
    size?: "md" | "lg";
}) {
    return (
        <span className={`tabular-nums ${size === "lg" ? "text-2xl" : "text-sm"} font-bold text-gray-900`}>
            {score}
            <span className={`font-mono font-normal text-slate-400 ${size === "lg" ? "text-sm" : "text-xs"}`}>
                /{maxScore}
            </span>
        </span>
    );
}

/** Legacy alias — thin meter + fraction, used in submission rows. */
export function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
    return (
        <div className="flex w-32 flex-col gap-1">
            <ScoreFraction score={score} maxScore={maxScore} />
            <Meter value={score} max={maxScore} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Document furniture
// ─────────────────────────────────────────────────────────────────────

/** Small-caps section label — the platform's eyebrow idiom. */
export function Eyebrow({ children }: { children: ReactNode }) {
    return (
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</p>
    );
}

/** GitHub repo reference, always in mono — repo paths are code. */
export function RepoLink({ url, repoRef }: { url: string; repoRef?: string | null }) {
    const short = url.replace(/^https:\/\/(www\.)?github\.com\//, "");
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex max-w-full items-center gap-1 font-mono text-xs text-slate-600 dark:text-slate-300 hover:text-primary-700 dark:hover:text-primary-300"
        >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current opacity-70" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="truncate underline-offset-2 group-hover:underline">{short}</span>
            {repoRef && <span className="shrink-0 rounded bg-slate-100 dark:bg-slate-700/60 px-1 text-[10px]">{repoRef}</span>}
        </a>
    );
}

/** Empty state: repo → rubric line art, one job, one action. */
export function EmptyState({
    title,
    body,
    action,
}: {
    title: string;
    body: string;
    action?: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-14 text-center">
            <svg viewBox="0 0 120 44" className="mx-auto h-11 w-auto text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                {/* repo */}
                <rect x="2" y="8" width="34" height="28" rx="4" />
                <path d="M9 17h14M9 23h20M9 29h11" strokeLinecap="round" />
                {/* flow */}
                <path d="M42 22h28" strokeDasharray="3 4" strokeLinecap="round" />
                <path d="M66 18l5 4-5 4" strokeLinecap="round" strokeLinejoin="round" />
                {/* marksheet */}
                <rect x="80" y="4" width="38" height="36" rx="4" />
                <path d="M86 13h14M86 21h14M86 29h14" strokeLinecap="round" />
                <path d="M105 12l2 2 4-4M105 20l2 2 4-4" className="text-success-500" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="mt-5 font-display text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{body}</p>
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    } catch {
        return "—";
    }
}

/**
 * Fire-and-forget trigger for the evaluation pipeline. The POST runs the
 * full analysis server-side (1–3 min); callers poll for status instead
 * of awaiting it.
 */
export function triggerProcessing(token: string, submissionId: string): void {
    fetch("/api/project-eval/process", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ submissionId }),
        keepalive: true,
    }).catch(() => {
        // Recovery paths (teacher refresh reap / retry button) cover this.
    });
}
