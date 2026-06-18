"use client";

/**
 * LabInsights — the teacher's engagement read-out for a class's virtual labs.
 *
 * Lives INSIDE the class command-center (reached from the Virtual Lab card,
 * next to "Lab recordings"). It loads the class roll-up via
 * `GET /api/lab/analytics?classId=` (one `LabSessionAnalytics` per session,
 * newest first, plus a class-summed per-student roster) and, when the teacher
 * drills into a single session, the fresher full breakdown via
 * `GET /api/lab/sessions/{id}/analytics`. Both are COMPUTED ON READ from the
 * `labSessions/{id}/events` audit log + participant roster — no new writes.
 *
 * Layout: a roll-up header (sessions held · total attendance · avg engagement),
 * a session selector (All sessions + one pill per session), and a per-student
 * table (time in lab · hands · shares · on-task %) with lightweight CSS bars —
 * no charting dependency. Matches the platform language: Outfit display, mono
 * data, teal primary, quiet slate everything else.
 *
 * Access is the server's call: every fetch is membership-gated and the route's
 * `resolveClassLabRole` enforces teacher-only data; this component only renders
 * what comes back.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell } from "@/components/classroom/ui";
import {
    fetchClassAnalytics,
    fetchSessionAnalytics,
    downloadClassAnalyticsCsv,
} from "@/lib/lab/labAnalyticsClient";
import type { LabSessionAnalytics, LabStudentStats } from "@digimine/types";
import { formatRecordingDate } from "./labRecordingUi";

// ─────────────────────────────────────────────────────────────────────
// Small presentational helpers (local — analytics is in millis, not secs)
// ─────────────────────────────────────────────────────────────────────

/** Epoch-millis duration → a compact "1h 5m" / "42m" / "<1m"; "—" when zero. */
function formatMs(ms: number): string {
    const total = Math.max(0, Math.round(ms || 0));
    if (total <= 0) return "—";
    const mins = Math.floor(total / 60000);
    if (mins <= 0) return "<1m";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** On-task share of in-lab time as a clamped 0–100 integer (0 when no time). */
function onTaskPct(s: LabStudentStats): number {
    if (s.timeInLabMs <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((s.onTaskMs / s.timeInLabMs) * 100)));
}

/** "ALL" is the class-summed view; any other value is a session id. */
const ALL = "ALL" as const;

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export function LabInsights({ classId }: { classId: string }) {
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();

    const [sessions, setSessions] = useState<LabSessionAnalytics[]>([]);
    const [classStudents, setClassStudents] = useState<LabStudentStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Which session is selected: "ALL" (class roll-up) or a session id.
    const [selected, setSelected] = useState<string>(ALL);
    // Freshly-fetched full breakdown for the selected single session (the
    // roll-up's matching entry is the instant fallback while this loads).
    const [sessionDetail, setSessionDetail] = useState<LabSessionAnalytics | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // CSV evidence export (teacher-only on the server) state.
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");

    const backHref = `/teacher/classes/${classId}`;

    // ── Download the NAAC/NBA participation CSV (server folds + streams it). ──
    async function handleExport() {
        if (!firebaseUser || exporting) return;
        setExporting(true);
        setExportError("");
        try {
            await downloadClassAnalyticsCsv(firebaseUser, classId);
        } catch (err) {
            setExportError(
                err instanceof Error ? err.message : "Could not export the report."
            );
        } finally {
            setExporting(false);
        }
    }

    // ── Class roll-up (sessions newest-first + class-summed students). ──
    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(
                `/login?redirect=${encodeURIComponent(`${backHref}/lab-insights`)}`
            );
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError("");
        fetchClassAnalytics(firebaseUser, classId)
            .then((data) => {
                if (cancelled) return;
                setSessions(data.sessions);
                setClassStudents(data.students);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setSessions([]);
                setClassStudents([]);
                setError(
                    err instanceof Error ? err.message : "Could not load lab insights."
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // backHref is derived purely from classId.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, firebaseUser, classId]);

    // ── Drill-down: fetch the selected session's full breakdown. ──
    useEffect(() => {
        if (selected === ALL || !firebaseUser) {
            setSessionDetail(null);
            setDetailLoading(false);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        fetchSessionAnalytics(firebaseUser, selected)
            .then((res) => {
                if (!cancelled) setSessionDetail(res?.analytics ?? null);
            })
            .catch(() => {
                // Non-fatal: fall back to the roll-up's copy of this session.
                if (!cancelled) setSessionDetail(null);
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [selected, firebaseUser]);

    // The session entry from the roll-up that matches the current selection
    // (instant render while the fresher per-session fetch is in flight).
    const selectedRollup = useMemo(
        () => sessions.find((s) => s.sessionId === selected) ?? null,
        [sessions, selected]
    );

    // ── Roll-up KPIs across every analysed session. ──
    const rollup = useMemo(() => {
        const sessionsHeld = sessions.length;
        // Total attendance = distinct student-attendances summed per session.
        const totalAttendance = sessions.reduce(
            (sum, s) => sum + s.participantCount,
            0
        );
        // Average engagement = mean on-task % across the class-summed roster
        // (each student counted once, weighted equally) — the headline number.
        const ranked = classStudents.filter((s) => s.timeInLabMs > 0);
        const avgEngagement =
            ranked.length > 0
                ? Math.round(
                      ranked.reduce((sum, s) => sum + onTaskPct(s), 0) / ranked.length
                  )
                : null;
        const totalHands = sessions.reduce((sum, s) => sum + s.totalHands, 0);
        return { sessionsHeld, totalAttendance, avgEngagement, totalHands };
    }, [sessions, classStudents]);

    // ── The student rows for the active view (a session, or the class). ──
    const activeStudents = useMemo<LabStudentStats[]>(() => {
        if (selected === ALL) {
            // Class-summed roster, busiest first.
            return [...classStudents].sort((a, b) => b.timeInLabMs - a.timeInLabMs);
        }
        // Prefer the fresh per-session detail; fall back to the roll-up entry.
        const detail = sessionDetail ?? selectedRollup;
        // Session analytics already arrive highest-engagement first; keep as-is.
        return detail?.students ?? [];
    }, [selected, classStudents, sessionDetail, selectedRollup]);

    // Title/subtitle for the table block under the selector.
    const tableContext = useMemo(() => {
        if (selected === ALL) {
            return {
                heading: "All sessions",
                sub: `Every student, summed across ${rollup.sessionsHeld} session${
                    rollup.sessionsHeld === 1 ? "" : "s"
                }`,
            };
        }
        const s = sessionDetail ?? selectedRollup;
        return {
            heading: s?.title || "Lab session",
            sub: s?.startedAt ? formatRecordingDate(s.startedAt) : "Session",
        };
    }, [selected, rollup.sessionsHeld, sessionDetail, selectedRollup]);

    // ─── Render ──────────────────────────────────────────────────────

    return (
        <ClassroomShell
            backHref={backHref}
            backLabel="Back to class"
            eyebrow="Virtual lab"
            title="Lab insights"
            subtitle="How your class engaged in each live lab — time on task, hands raised, and screen shares, computed from the session log."
        >
            {loading ? (
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800"
                            />
                        ))}
                    </div>
                    <div className="h-72 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                </div>
            ) : error ? (
                <Card intent="danger" className="p-5 text-sm text-danger-700">
                    {error}
                </Card>
            ) : sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-12 text-center">
                    <h2 className="font-display text-base font-semibold text-gray-900">
                        No lab sessions yet
                    </h2>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                        Once you run a live lab for this class, the engagement
                        breakdown — who was on task, who raised a hand, who shared
                        their screen — shows up here, session by session.
                    </p>
                </div>
            ) : (
                <>
                    {/* ── Export evidence (NAAC/NBA) ───────────────────── */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                            Participation evidence for accreditation — sessions,
                            attendance, time on task, and engagement per student.
                        </p>
                        <div className="flex flex-col items-end gap-1">
                            <button
                                type="button"
                                onClick={handleExport}
                                disabled={exporting}
                                className="inline-flex items-center gap-2 rounded-xl border border-primary-300 bg-primary-50/70 px-3.5 py-2 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-200 dark:hover:bg-primary-500/20"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    className="h-4 w-4"
                                >
                                    <path
                                        d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                                {exporting ? "Preparing…" : "Export report (CSV)"}
                            </button>
                            {exportError && (
                                <span className="text-[11px] text-danger-600" role="alert">
                                    {exportError}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Roll-up KPIs ─────────────────────────────────── */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            label="Sessions held"
                            value={String(rollup.sessionsHeld)}
                            sub={
                                rollup.sessionsHeld === 1
                                    ? "live lab so far"
                                    : "live labs so far"
                            }
                        />
                        <StatCard
                            label="Total attendance"
                            value={String(rollup.totalAttendance)}
                            sub="student joins across sessions"
                        />
                        <StatCard
                            label="Avg engagement"
                            value={
                                rollup.avgEngagement != null
                                    ? `${rollup.avgEngagement}%`
                                    : "—"
                            }
                            sub="mean time on task"
                            accent
                        />
                        <StatCard
                            label="Hands raised"
                            value={String(rollup.totalHands)}
                            sub="help requests, all sessions"
                        />
                    </div>

                    {/* ── Session selector ─────────────────────────────── */}
                    <section aria-label="Choose a session">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Session
                        </h2>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            <SessionPill
                                active={selected === ALL}
                                onClick={() => setSelected(ALL)}
                                title="All sessions"
                                meta={`${rollup.sessionsHeld} total`}
                            />
                            {sessions.map((s) => (
                                <SessionPill
                                    key={s.sessionId}
                                    active={selected === s.sessionId}
                                    onClick={() => setSelected(s.sessionId)}
                                    title={s.title || "Lab session"}
                                    meta={
                                        s.startedAt
                                            ? formatRecordingDate(s.startedAt)
                                            : `${s.participantCount} joined`
                                    }
                                    live={s.startedAt != null && s.endedAt == null}
                                />
                            ))}
                        </div>
                    </section>

                    {/* ── Per-session summary strip (single session view) ─ */}
                    {selected !== ALL && (selectedRollup || sessionDetail) && (
                        <SessionSummaryStrip
                            session={sessionDetail ?? selectedRollup!}
                        />
                    )}

                    {/* ── Student engagement table ─────────────────────── */}
                    <section aria-label="Student engagement">
                        <div className="flex items-baseline justify-between gap-3">
                            <h2 className="font-display text-base font-semibold text-gray-900">
                                {tableContext.heading}
                                <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                                    {activeStudents.length} student
                                    {activeStudents.length === 1 ? "" : "s"}
                                </span>
                            </h2>
                            {detailLoading && (
                                <span className="text-xs text-slate-400">Updating…</span>
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{tableContext.sub}</p>

                        {activeStudents.length === 0 ? (
                            <div className="mt-2.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-10 text-center text-sm text-slate-500">
                                No students joined this session.
                            </div>
                        ) : (
                            <EngagementTable students={activeStudents} />
                        )}
                    </section>
                </>
            )}
        </ClassroomShell>
    );
}

export default LabInsights;

// ─────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────

/** A single roll-up KPI tile (mirrors the class command-center insight cards). */
function StatCard({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: string;
    sub: string;
    accent?: boolean;
}) {
    return (
        <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </p>
            <p
                className={`mt-2 text-3xl font-bold ${
                    accent
                        ? "text-primary-700 dark:text-primary-300"
                        : "text-slate-900"
                }`}
            >
                {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{sub}</p>
        </Card>
    );
}

/** One selectable session chip in the selector row. */
function SessionPill({
    active,
    onClick,
    title,
    meta,
    live,
}: {
    active: boolean;
    onClick: () => void;
    title: string;
    meta: string;
    live?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`group flex max-w-[220px] flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                active
                    ? "border-primary-300 bg-primary-50/70 dark:border-primary-500/40 dark:bg-primary-500/10"
                    : "border-slate-200 bg-surface hover:border-primary-300 dark:border-slate-700"
            }`}
        >
            <span className="flex items-center gap-1.5">
                {live && (
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-60 motion-reduce:animate-none" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger-500" />
                    </span>
                )}
                <span
                    className={`max-w-[190px] truncate text-sm font-medium ${
                        active
                            ? "text-primary-800 dark:text-primary-200"
                            : "text-gray-900"
                    }`}
                >
                    {title}
                </span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">{meta}</span>
        </button>
    );
}

/** A compact metric strip for a single session (sits above its student table). */
function SessionSummaryStrip({ session }: { session: LabSessionAnalytics }) {
    const items: { label: string; value: string }[] = [
        { label: "Students", value: String(session.participantCount) },
        { label: "Peak concurrent", value: String(session.peakParticipants) },
        { label: "Avg time in lab", value: formatMs(session.avgTimeInLabMs) },
        { label: "Hands raised", value: String(session.totalHands) },
        { label: "Screen shares", value: String(session.totalShares) },
    ];
    return (
        <Card className="p-0">
            <dl className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
                {items.map((it) => (
                    <div key={it.label} className="px-4 py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {it.label}
                        </dt>
                        <dd className="mt-0.5 text-lg font-bold text-slate-900">
                            {it.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

/** The engagement table: a desktop table + a mobile card list, sharing the same
 *  rows. Columns: student, time in lab, hands, shares, on-task % (with a bar). */
function EngagementTable({ students }: { students: LabStudentStats[] }) {
    return (
        <div className="mt-2.5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
            {/* Desktop table. */}
            <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                            <th className="px-4 py-2.5">Student</th>
                            <th className="px-4 py-2.5">Time in lab</th>
                            <th className="px-4 py-2.5 text-center">Hands</th>
                            <th className="px-4 py-2.5 text-center">Shares</th>
                            <th className="px-4 py-2.5">On task</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, i) => {
                            const pct = onTaskPct(s);
                            const shares = s.sharesToTeacher + s.peerSharesGiven;
                            return (
                                <tr
                                    key={s.uid}
                                    className={`hover:bg-slate-50/40 dark:hover:bg-slate-800/30 ${
                                        i === 0
                                            ? ""
                                            : "border-t border-slate-100 dark:border-slate-800"
                                    }`}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                                                {initialsOf(s.name)}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-slate-900">
                                                    {s.name}
                                                </span>
                                                {s.spotlights > 0 && (
                                                    <span className="text-[10px] font-medium text-accent-600 dark:text-accent-300">
                                                        ★ spotlighted{" "}
                                                        {s.spotlights}×
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                                        {formatMs(s.timeInLabMs)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <CountCell
                                            n={s.handsRaised}
                                            title={`${s.handsRaised} hand-raise${
                                                s.handsRaised === 1 ? "" : "s"
                                            }`}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <CountCell
                                            n={shares}
                                            title={`${s.sharesToTeacher} to teacher · ${s.peerSharesGiven} to peers`}
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <OnTaskBar pct={pct} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards. */}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                {students.map((s) => {
                    const pct = onTaskPct(s);
                    const shares = s.sharesToTeacher + s.peerSharesGiven;
                    return (
                        <li key={s.uid} className="p-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/25">
                                    {initialsOf(s.name)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-slate-900">
                                        {s.name}
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-500">
                                        {formatMs(s.timeInLabMs)} in lab
                                    </span>
                                </span>
                                <span className="shrink-0 text-right">
                                    <span className="block text-sm font-bold text-slate-900">
                                        {pct}%
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                        on task
                                    </span>
                                </span>
                            </div>
                            <div className="mt-2.5">
                                <OnTaskBar pct={pct} hideLabel />
                            </div>
                            <div className="mt-2.5 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                                <span>
                                    <span className="font-semibold text-slate-900">
                                        {s.handsRaised}
                                    </span>{" "}
                                    hands
                                </span>
                                <span>
                                    <span className="font-semibold text-slate-900">
                                        {shares}
                                    </span>{" "}
                                    shares
                                </span>
                                {s.spotlights > 0 && (
                                    <span className="text-accent-600 dark:text-accent-300">
                                        ★ {s.spotlights}
                                    </span>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** A count, dimmed to a dash when zero so the eye lands on real activity. */
function CountCell({ n, title }: { n: number; title?: string }) {
    if (n <= 0) {
        return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
    }
    return (
        <span
            className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            title={title}
        >
            {n}
        </span>
    );
}

/** A lightweight CSS engagement bar (no chart dep) — green-leaning for high
 *  on-task time, amber in the middle, rose when very low. */
function OnTaskBar({ pct, hideLabel }: { pct: number; hideLabel?: boolean }) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const tone =
        clamped >= 70
            ? "bg-emerald-500"
            : clamped >= 40
                ? "bg-amber-500"
                : "bg-rose-500";
    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                    className={`h-full rounded-full ${tone}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            {!hideLabel && (
                <span className="w-9 shrink-0 text-right font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                    {clamped}%
                </span>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** First two initials of a display name, for the avatar chip. */
function initialsOf(name: string): string {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() || "")
            .join("") || "?"
    );
}
