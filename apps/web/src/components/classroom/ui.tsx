"use client";

/**
 * Student classroom design kit. Thesis: a classroom is a timetable, not a
 * menu — the hub leads with what the teacher wants done next (the Up Next
 * rail, a schedule spine with mono time-labels) and lays the rest out as
 * notice-board lanes of real items instead of count-only navigation tiles.
 * Shares the platform language: Outfit display, mono data, teal actions,
 * amber for time pressure, quiet slate everything else.
 */
import type { ReactNode } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────
// Row + lane data shapes (mirrors /api/classes/[classId]/page-data)
// ─────────────────────────────────────────────────────────────────────

export type ClassContentRow = {
    id: string;
    slug: string;
    title: string;
    description: string;
    totalQuestions: number;
    totalTests: number;
    totalMarks: number;
    duration: number;
    timeLimitMinutes: number;
    estimatedHours: number;
    totalModules: number;
    totalLessons: number;
    difficulty: string | null;
    category: string | null;
    startTime: string | null;
    endTime: string | null;
    createdAt: string | null;
};

export type ContestPhase = "live" | "upcoming" | "ended";

export function contestPhase(row: ClassContentRow, nowMs = Date.now()): ContestPhase {
    const start = row.startTime ? new Date(row.startTime).getTime() : null;
    const end = row.endTime ? new Date(row.endTime).getTime() : null;
    if (start && nowMs < start) return "upcoming";
    if (end && nowMs > end) return "ended";
    if (start && (!end || nowMs <= end)) return "live";
    return "upcoming";
}

export function shortDate(iso: string | null): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch {
        return "—";
    }
}

export function shortDateTime(iso: string | null): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return "—";
    }
}

// ─────────────────────────────────────────────────────────────────────
// Shell — header band shared by the hub and every child page
// ─────────────────────────────────────────────────────────────────────

export function ClassroomShell({
    backHref,
    backLabel,
    eyebrow = "Classroom",
    title,
    subtitle,
    aside,
    children,
}: {
    backHref: string;
    backLabel: string;
    eyebrow?: string;
    title: ReactNode;
    subtitle?: ReactNode;
    aside?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background py-10 px-4">
            <div className="mx-auto max-w-4xl">
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-primary-700 focus-visible:underline"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {backLabel}
                </Link>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            {eyebrow}
                        </p>
                        <h1 className="mt-1 font-display text-2xl font-bold text-gray-900 sm:text-3xl">
                            {title}
                        </h1>
                        {subtitle && <div className="mt-1.5 text-sm text-slate-500">{subtitle}</div>}
                    </div>
                    {aside && <div className="shrink-0">{aside}</div>}
                </div>
                <div className="mt-8 space-y-8">{children}</div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Up Next rail — the signature element. A schedule spine: each entry
// carries a mono time-label on a vertical rule; LIVE entries pulse.
// ─────────────────────────────────────────────────────────────────────

export type UpNextEntry = {
    key: string;
    /** Mono spine label — "LIVE", "DUE 20 JUN", "STARTS 5:00 PM", "NEW". */
    label: string;
    tone: "live" | "due" | "new";
    title: string;
    meta: string;
    href: string;
    action: string;
};

const SPINE_TONE: Record<UpNextEntry["tone"], { label: string; dot?: string }> = {
    live: { label: "text-danger-600 dark:text-danger-400", dot: "bg-danger-500" },
    due: { label: "text-accent-700 dark:text-accent-300", dot: "bg-accent-500" },
    new: { label: "text-primary-700 dark:text-primary-300" },
};

export function UpNextRail({ entries }: { entries: UpNextEntry[] }) {
    if (entries.length === 0) return null;
    return (
        <section aria-label="Up next">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Up next
            </h2>
            <ol className="mt-3 border-l-2 border-slate-200 dark:border-slate-700">
                {entries.map((e, i) => (
                    <li
                        key={e.key}
                        className="animate-slide-up motion-reduce:animate-none"
                        style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
                    >
                        <Link
                            href={e.href}
                            className="group -ml-0.5 flex items-center gap-4 border-l-2 border-transparent py-3 pl-4 pr-3 transition-colors hover:border-primary-500 hover:bg-surface focus-visible:border-primary-500 focus-visible:bg-surface focus:outline-none"
                        >
                            <span
                                className={`flex w-24 shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide ${SPINE_TONE[e.tone].label}`}
                            >
                                {SPINE_TONE[e.tone].dot && (
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span
                                            className={`absolute inline-flex h-full w-full rounded-full ${SPINE_TONE[e.tone].dot} opacity-60 ${e.tone === "live" ? "animate-ping motion-reduce:animate-none" : ""}`}
                                        />
                                        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${SPINE_TONE[e.tone].dot}`} />
                                    </span>
                                )}
                                {e.label}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-gray-900">
                                    {e.title}
                                </span>
                                <span className="block truncate text-xs text-slate-500">{e.meta}</span>
                            </span>
                            <span className="shrink-0 text-xs font-medium text-primary-700 dark:text-primary-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                {e.action} →
                            </span>
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Board lanes — one quiet section per content type, real items inside
// ─────────────────────────────────────────────────────────────────────

export function LaneSection({
    title,
    count,
    viewAllHref,
    children,
}: {
    title: string;
    count: number;
    viewAllHref?: string;
    children: ReactNode;
}) {
    return (
        <section>
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-gray-900">
                    {title} <span className="font-mono text-xs font-normal text-slate-400">{count}</span>
                </h2>
                {viewAllHref && count > 0 && (
                    <Link
                        href={viewAllHref}
                        className="text-xs text-slate-500 hover:text-primary-700 focus-visible:underline"
                    >
                        View all →
                    </Link>
                )}
            </div>
            <div className="mt-2.5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                {children}
            </div>
        </section>
    );
}

/** One clickable item row inside a lane. */
export function ContentItemRow({
    href,
    title,
    meta,
    right,
    first,
    onClick,
}: {
    href?: string;
    title: string;
    meta: string;
    right?: ReactNode;
    first?: boolean;
    onClick?: () => void;
}) {
    const inner = (
        <>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{title}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                    {meta}
                </span>
            </span>
            {right}
            <svg
                className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
        </>
    );
    const cls = `group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/40 focus:outline-none ${
        first ? "" : "border-t border-slate-100 dark:border-slate-800"
    }`;
    if (href) {
        return (
            <Link href={href} className={cls}>
                {inner}
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} className={cls}>
            {inner}
        </button>
    );
}

export function LaneEmpty({ children }: { children: ReactNode }) {
    return <p className="px-4 py-6 text-center text-sm text-slate-400">{children}</p>;
}

/** Meta string builders — keep wording identical across hub + child pages. */
export const metaFor = {
    test: (r: ClassContentRow) =>
        [
            r.totalTests ? `${r.totalTests} test${r.totalTests === 1 ? "" : "s"}` : null,
            r.totalQuestions ? `${r.totalQuestions} questions` : null,
            r.totalMarks ? `${r.totalMarks} marks` : null,
            r.duration ? `${r.duration} min` : null,
        ]
            .filter(Boolean)
            .join(" · ") || "Mock test series",
    quiz: (r: ClassContentRow) =>
        [
            r.totalQuestions ? `${r.totalQuestions} questions` : null,
            r.totalMarks ? `${r.totalMarks} marks` : null,
            r.timeLimitMinutes ? `${r.timeLimitMinutes} min` : null,
        ]
            .filter(Boolean)
            .join(" · ") || "Quiz",
    contest: (r: ClassContentRow) => {
        const phase = contestPhase(r);
        if (phase === "live") return `Live now · ends ${shortDateTime(r.endTime)}`;
        if (phase === "upcoming") return `Starts ${shortDateTime(r.startTime)}`;
        return `Ended ${shortDate(r.endTime)}`;
    },
    course: (r: ClassContentRow) =>
        [
            r.totalModules ? `${r.totalModules} chapters` : null,
            r.totalLessons ? `${r.totalLessons} lessons` : null,
            r.estimatedHours ? `~${r.estimatedHours} hrs` : null,
            r.difficulty,
        ]
            .filter(Boolean)
            .join(" · ") || "Course",
};
