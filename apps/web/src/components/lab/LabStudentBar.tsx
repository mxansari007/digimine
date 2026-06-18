"use client";

import { useMemo, useState } from "react";
import type { LabRoomState, LabStatus } from "@digimine/types";
import type { LabRoomActions } from "./useLabRoom";

/**
 * LabStudentBar — the learner's own controls under the video stage.
 *
 *   • Raise hand / Lower hand — `actions.raiseHand` / `lowerHand`. The label +
 *     tone follow the student's *own* live `handRaisedAt` (read from the roster)
 *     so it round-trips correctly even if another tab toggles it.
 *   • Status quick-set — a small segmented control over the self-settable
 *     `LabStatus` values (`on_task` / `idle` / `watching`), calling
 *     `actions.setStatus`. `needs_help` is owned by the hand (raising sets it),
 *     and `sharing` is owned by an active share, so we don't offer those as
 *     manual picks — that keeps the avatar colour truthful.
 *
 * All state arrives via props; the hook owns LiveKit. Buttons disable briefly
 * while an action is in flight.
 */

export interface LabStudentBarProps {
    state: LabRoomState;
    actions: LabRoomActions;
}

/** The statuses a student may set on themselves from this bar. */
const SELF_STATUSES: { value: LabStatus; label: string }[] = [
    { value: "on_task", label: "On task" },
    { value: "watching", label: "Watching" },
    { value: "idle", label: "Away" },
];

export function LabStudentBar({ state, actions }: LabStudentBarProps) {
    const [busy, setBusy] = useState(false);

    // Our own roster row is the source of truth for hand + status.
    const me = useMemo(
        () => state.participants.find((p) => p.uid === state.you.uid) ?? null,
        [state.participants, state.you.uid]
    );
    const handUp = typeof me?.handRaisedAt === "number";
    const myStatus = me?.status ?? "on_task";

    const run = async (fn: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-soft-sm dark:border-slate-700 dark:bg-surface">
            <div className="flex flex-wrap items-center gap-2">
                <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
                    You
                </span>

                {/* Raise / lower hand */}
                <button
                    type="button"
                    onClick={() => run(handUp ? actions.lowerHand : actions.raiseHand)}
                    disabled={busy}
                    aria-pressed={handUp}
                    className={[
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        handUp
                            ? "bg-accent-500 text-white shadow-glow-accent hover:bg-accent-600"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700",
                    ].join(" ")}
                >
                    <HandIcon className="h-4 w-4" />
                    {handUp ? "Lower hand" : "Raise hand"}
                </button>

                {/* Status quick-set (segmented). */}
                <div className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
                    {SELF_STATUSES.map((s) => {
                        const active = myStatus === s.value;
                        return (
                            <button
                                key={s.value}
                                type="button"
                                onClick={() => run(() => actions.setStatus(s.value))}
                                disabled={busy || active}
                                aria-pressed={active}
                                className={[
                                    "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default",
                                    active
                                        ? "bg-white text-primary-700 shadow-soft-sm dark:bg-surface dark:text-primary-300"
                                        : "text-slate-500 hover:text-slate-700 disabled:opacity-100 dark:hover:text-slate-200",
                                ].join(" ")}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default LabStudentBar;

function HandIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 11V6a1.5 1.5 0 013 0v4m0 0V4.5a1.5 1.5 0 013 0V10m0 0V6a1.5 1.5 0 013 0v6.5c0 3.5-2.5 6.5-6 6.5-2 0-3.4-.8-4.5-2.2L8 14.5c-.8-1-.3-2.3 1-2.5"
            />
        </svg>
    );
}
