"use client";

import { useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    fetchLabGamification,
    type LabGamificationResponse,
} from "@/lib/lab/labAnalyticsClient";
import {
    LAB_BADGES,
    labXpForLevel,
    type LabBadge,
    type LabBadgeKey,
    type LabGamification,
    type LabLeaderboardRow,
} from "@digimine/types";

/**
 * LabStats — the student's own gamified lab card on the classroom hub.
 *
 * Reads the caller's class-scoped gamification profile + the class leaderboard
 * from `GET /api/lab/gamification?classId=` (everything is COMPUTED ON READ from
 * the lab audit log — no Firestore writes) and renders:
 *   - level + an XP progress bar to the next level,
 *   - the current attendance streak,
 *   - the badge wall (earned + locked, so there's always something to chase),
 *   - a compact class leaderboard (top N with the student's own row highlighted).
 *
 * It self-fetches (mirroring the hub's other non-blocking lookups) and only
 * mounts where the class has the lab enabled. Before the student has attended a
 * single lab the profile is empty — we show a friendly "earn your first XP"
 * empty state instead of a wall of zeros.
 *
 * The parent decides whether to render this at all (labEnabled + enrolled); we
 * own only the fetch + presentation. `role` from the response is informational —
 * a teacher landing here gets `me === null`, which falls through to the empty
 * state, but in practice only students mount this tile.
 */

export interface LabStatsProps {
    classId: string;
}

/** How many leaderboard rows to show before collapsing to "…and your row". */
const LEADERBOARD_TOP_N = 5;

/** Pretty `12,340 XP` style formatting (thin thousands separators). */
function formatXp(xp: number): string {
    return `${Math.max(0, Math.round(xp)).toLocaleString()} XP`;
}

/** A short, friendly day-streak label. */
function streakLabel(days: number): string {
    if (days <= 0) return "No streak yet";
    return `${days}-day streak`;
}

export function LabStats({ classId }: LabStatsProps) {
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const [data, setData] = useState<LabGamificationResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            setData(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError("");
        fetchLabGamification(firebaseUser, classId)
            .then((res) => {
                if (!cancelled) setData(res);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setData(null);
                    setError(
                        err instanceof Error ? err.message : "Could not load lab stats."
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [authLoading, firebaseUser, classId]);

    // Loading — a skeleton in the same footprint as the populated card.
    if (loading) {
        return (
            <section aria-label="Your lab stats">
                <SectionHeading />
                <div className="mt-2.5 h-40 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
            </section>
        );
    }

    // A swallowed fetch error shouldn't blow up the hub — stay quiet.
    if (error) return null;

    const me = data?.me ?? null;
    const leaderboard = data?.leaderboard ?? [];

    // Empty state: no profile, or a profile with no XP yet (never attended).
    const hasActivity = !!me && me.totalXp > 0;

    return (
        <section aria-label="Your lab stats">
            <div className="flex items-baseline justify-between">
                <SectionHeading />
                {hasActivity && me && (
                    <span className="font-mono text-xs text-slate-500">
                        Level {me.level}
                    </span>
                )}
            </div>

            {!hasActivity ? (
                <LabStatsEmpty />
            ) : (
                <div className="mt-2.5 overflow-hidden rounded-2xl border border-accent-200 dark:border-accent-500/30 bg-gradient-to-br from-accent-50/50 to-surface dark:from-accent-500/5 dark:to-surface shadow-soft-sm">
                    <LevelBar me={me!} />
                    <BadgeWall badges={me!.badges} />
                    {leaderboard.length > 0 && (
                        <Leaderboard rows={leaderboard} meUid={me!.uid} />
                    )}
                </div>
            )}
        </section>
    );
}

export default LabStats;

// ─────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────

/** The "Your lab stats" eyebrow, matching the hub's other section headings. */
function SectionHeading() {
    return (
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your lab stats
        </h2>
    );
}

/** Friendly pre-activity card — explains how to earn the first XP. */
function LabStatsEmpty() {
    return (
        <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-dashed border-accent-300/70 dark:border-accent-500/30 bg-accent-50/30 dark:bg-accent-500/5 px-4 py-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
            </span>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Earn your first XP</p>
                <p className="mt-0.5 text-xs text-slate-500">
                    Join a live lab, raise your hand, and share your work to start
                    levelling up and unlocking badges.
                </p>
            </div>
        </div>
    );
}

/** Level chip + XP progress bar toward the next level. */
function LevelBar({ me }: { me: LabGamification }) {
    // Current level's floor and the next level's floor frame the bar; clamp so a
    // capped/over-band total still reads as a full bar rather than overflowing.
    const floor = labXpForLevel(me.level);
    const next = labXpForLevel(me.level + 1);
    const span = Math.max(1, next - floor);
    const into = Math.max(0, me.totalXp - floor);
    const pct = Math.max(0, Math.min(100, (into / span) * 100));
    const toNext = Math.max(0, next - me.totalXp);

    return (
        <div className="px-4 pt-4 pb-3.5">
            <div className="flex items-end justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-sm font-bold text-white shadow-soft-sm">
                        L{me.level}
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">
                            {formatXp(me.totalXp)}
                        </p>
                        <p className="text-xs text-slate-500">
                            {toNext > 0
                                ? `${toNext.toLocaleString()} XP to level ${me.level + 1}`
                                : "Top level reached"}
                        </p>
                    </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-50 dark:bg-warning-500/15 px-2.5 py-1 text-[11px] font-semibold text-warning-700 dark:text-warning-300 ring-1 ring-warning-200 dark:ring-warning-500/30">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2c1 3.5-1.5 5-1.5 7A3.5 3.5 0 0014 11c.5 1.5-.5 3-.5 4a2.5 2.5 0 11-5 0c0-2 1-2.5 1-4-2 0-3.5-1.5-3.5-3.5C6 4 10 4 12 2z" />
                    </svg>
                    {streakLabel(me.streakDays)}
                </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
                <div
                    className="h-full rounded-full bg-accent-500 transition-[width] duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

/** The badge wall — every defined badge, earned ones lit, locked ones dimmed. */
function BadgeWall({ badges }: { badges: LabBadge[] }) {
    // Server returns every badge with `earnedAt` set iff earned; if a future
    // badge is added server-side ahead of the catalogue we still render it.
    const byKey = new Map<LabBadgeKey, LabBadge>(badges.map((b) => [b.key, b]));
    const ordered: { key: LabBadgeKey; label: string; description: string; earned: boolean }[] =
        LAB_BADGES.map((def) => {
            const got = byKey.get(def.key);
            return {
                key: def.key,
                label: got?.label || def.label,
                description: def.description,
                earned: !!got?.earnedAt,
            };
        });
    const earnedCount = ordered.filter((b) => b.earned).length;

    return (
        <div className="border-t border-accent-200/70 dark:border-accent-500/20 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Badges
                </p>
                <span className="font-mono text-[11px] text-slate-400">
                    {earnedCount}/{ordered.length}
                </span>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {ordered.map((b) => (
                    <div
                        key={b.key}
                        title={`${b.label} — ${b.description}`}
                        className="group flex flex-col items-center gap-1 text-center"
                    >
                        <span
                            className={
                                "flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-colors " +
                                (b.earned
                                    ? "bg-accent-100 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-300 dark:ring-accent-500/30"
                                    : "bg-slate-100 text-slate-300 ring-slate-200 dark:bg-slate-800 dark:text-slate-600 dark:ring-slate-700")
                            }
                            aria-hidden
                        >
                            <BadgeIcon badgeKey={b.key} />
                        </span>
                        <span
                            className={
                                "block w-full truncate text-[10px] leading-tight " +
                                (b.earned ? "font-medium text-gray-900" : "text-slate-400")
                            }
                        >
                            {b.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Compact class leaderboard: top N + the student's own (highlighted) row. */
function Leaderboard({ rows, meUid }: { rows: LabLeaderboardRow[]; meUid: string }) {
    const top = rows.slice(0, LEADERBOARD_TOP_N);
    const inTop = top.some((r) => r.uid === meUid);
    const mine = rows.find((r) => r.uid === meUid) ?? null;
    const showMine = !inTop && mine;

    return (
        <div className="border-t border-accent-200/70 dark:border-accent-500/20 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Class leaderboard
            </p>
            <ul className="mt-2 space-y-0.5">
                {top.map((r, i) => (
                    // Key off rank+index, not uid: the gamification route scrubs
                    // classmates' uids to "" for a student caller (privacy), so
                    // uid is not unique on a student's board. The caller's OWN row
                    // still carries its real uid, so the `isMe` highlight holds.
                    <LeaderboardRow
                        key={`${r.rank}-${i}`}
                        row={r}
                        isMe={!!meUid && r.uid === meUid}
                    />
                ))}
                {showMine && (
                    <>
                        <li className="py-0.5 text-center text-[10px] text-slate-300" aria-hidden>
                            ···
                        </li>
                        <LeaderboardRow row={mine!} isMe />
                    </>
                )}
            </ul>
        </div>
    );
}

function LeaderboardRow({ row, isMe }: { row: LabLeaderboardRow; isMe: boolean }) {
    return (
        <li
            className={
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 " +
                (isMe
                    ? "bg-accent-100/70 dark:bg-accent-500/15 ring-1 ring-accent-200 dark:ring-accent-500/30"
                    : "")
            }
        >
            <span
                className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums " +
                    rankToneClass(row.rank)
                }
            >
                {row.rank}
            </span>
            <span
                className={
                    "min-w-0 flex-1 truncate text-sm " +
                    (isMe ? "font-semibold text-gray-900" : "text-slate-700 dark:text-slate-300")
                }
            >
                {row.name}
                {isMe && <span className="ml-1.5 text-[10px] font-medium text-accent-700 dark:text-accent-300">You</span>}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-slate-400">L{row.level}</span>
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-gray-900 tabular-nums">
                {row.totalXp.toLocaleString()}
            </span>
        </li>
    );
}

/** Podium colours for the top three; muted slate beyond. */
function rankToneClass(rank: number): string {
    if (rank === 1) return "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300";
    if (rank === 2) return "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    if (rank === 3) return "bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300";
    return "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500";
}

// ─────────────────────────────────────────────────────────────────────
// Badge glyphs — one small line icon per badge key (decorative).
// ─────────────────────────────────────────────────────────────────────

function BadgeIcon({ badgeKey }: { badgeKey: LabBadgeKey }) {
    const cls = "h-5 w-5";
    switch (badgeKey) {
        case "first_lab": // beaker
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 3h6m-5 0v5.5L5 18a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9.5V3" />
                </svg>
            );
        case "regular": // calendar
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
                </svg>
            );
        case "curious": // raised hand
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 11V6a1.5 1.5 0 113 0v4m0 0V4.5a1.5 1.5 0 113 0V10m0 0V6a1.5 1.5 0 113 0v6a6 6 0 01-6 6h-1a5 5 0 01-4.3-2.5L5 13a1.5 1.5 0 012.5-1.6L9 13" />
                </svg>
            );
        case "presenter": // screen / present
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM9 20h6m-3-4v4" />
                </svg>
            );
        case "helper": // hands / heart
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 8.5a3.2 3.2 0 014.6-.3 3 3 0 010 4.3L12 17l-4.6-4.5a3 3 0 010-4.3 3.2 3.2 0 014.6.3z" />
                </svg>
            );
        case "spotlighted": // star
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9 6.8 19l1-5.8-4.2-4.1 5.8-.8L12 3z" />
                </svg>
            );
        case "marathoner": // clock
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case "perfect_week": // flame
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 2c1 3.5-1.5 5-1.5 7A3.5 3.5 0 0014 11c.5 1.5-.5 3-.5 4a2.5 2.5 0 11-5 0c0-2 1-2.5 1-4-2 0-3.5-1.5-3.5-3.5C6 4 10 4 12 2z" />
                </svg>
            );
        default:
            return (
                <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="8" strokeWidth={1.7} />
                </svg>
            );
    }
}
