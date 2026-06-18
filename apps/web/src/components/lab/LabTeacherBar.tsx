"use client";

import { useState } from "react";
import type { LabRoomState } from "@digimine/types";
import type { LabRoomActions } from "./useLabRoom";

/**
 * LabTeacherBar — the teacher's primary controls under the video stage.
 *
 *   • Go live / Stop — the room-wide broadcast (camera + screen). Drives
 *     `actions.startBroadcast` / `stopBroadcast`; the label + tone follow the
 *     live `state.broadcasting` flag so the one button is always correct.
 *   • Camera — a live indicator of whether the teacher's camera track is up. The
 *     hook bundles camera into the broadcast (Go live publishes both), so this
 *     reflects published state rather than toggling independently. Reading the
 *     real track keeps it honest.
 *   • Record / Stop — the real session recording toggle. Egress is server-side;
 *     the actual start/stop + room-wide "● REC" broadcast is owned by `LabRoom`
 *     (via the hook), so this button just calls the `onToggleRecording` callback
 *     it's handed and reflects the live `state.recording` flag + the shared
 *     `recordBusy`/`recordDisabled` in-flight guards. When no handler is wired it
 *     gracefully hides (the indicator/control then lives only in the header).
 *
 * Buttons disable while a start/stop is in flight to prevent double-taps racing
 * the SFU. All room state arrives via props; no LiveKit here.
 */

export interface LabTeacherBarProps {
    state: LabRoomState;
    actions: LabRoomActions;
    /**
     * Toggle the session recording. Owned by `LabRoom` so the header button, the
     * map's "Run the room" bar, and this bar all share one async handler + busy
     * guard. Omit to hide the recording control here.
     */
    onToggleRecording?: () => void;
    /** True while a record start/stop is in flight (disables the button). */
    recordBusy?: boolean;
    /** True before the room is connected (disables the button). */
    recordDisabled?: boolean;
}

export function LabTeacherBar({
    state,
    actions,
    onToggleRecording,
    recordBusy = false,
    recordDisabled = false,
}: LabTeacherBarProps) {
    const [busy, setBusy] = useState(false);

    // Is the teacher's own camera track currently published? Resolve from the
    // hook so the indicator can't drift from what the room actually sees.
    const cameraLive = !!actions.getVideoTrack(state.you.uid, "camera");

    const toggleBroadcast = async () => {
        if (busy) return;
        setBusy(true);
        try {
            if (state.broadcasting) await actions.stopBroadcast();
            else await actions.startBroadcast();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-soft-sm dark:border-slate-700 dark:bg-surface">
            <div className="flex flex-wrap items-center gap-2">
                <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
                    Run the room
                </span>

                {/* Go live / Stop broadcast */}
                <button
                    type="button"
                    onClick={toggleBroadcast}
                    disabled={busy}
                    aria-pressed={state.broadcasting}
                    className={[
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        state.broadcasting
                            ? "bg-danger-500 text-white shadow-glow-danger hover:bg-danger-600"
                            : "bg-primary-600 text-white shadow-glow-primary hover:bg-primary-700",
                    ].join(" ")}
                >
                    {state.broadcasting ? <StopIcon className="h-4 w-4" /> : <BroadcastIcon className="h-4 w-4" />}
                    {state.broadcasting ? "Stop broadcast" : "Go live"}
                </button>

                {/* Camera state indicator (reflects the published track). */}
                <span
                    className={[
                        "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold",
                        cameraLive
                            ? "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300",
                    ].join(" ")}
                    title={cameraLive ? "Your camera is on (part of the broadcast)" : "Your camera is off — Go live to turn it on"}
                >
                    {cameraLive ? <CameraIcon className="h-4 w-4" /> : <CameraOffIcon className="h-4 w-4" />}
                    <span className="hidden sm:inline">{cameraLive ? "Camera on" : "Camera off"}</span>
                </span>

                <div className="ml-auto" />

                {/* Record / Stop — the real session recording toggle (egress is
                    server-side; the start/stop + room-wide indicator is owned by
                    LabRoom via the hook). Hidden when no handler is wired. */}
                {onToggleRecording && (
                    <button
                        type="button"
                        onClick={onToggleRecording}
                        disabled={recordBusy || recordDisabled}
                        aria-pressed={state.recording}
                        aria-label={
                            state.recording
                                ? "Stop recording the session"
                                : "Record the session"
                        }
                        title={
                            recordDisabled
                                ? "Connect to the room to record"
                                : state.recording
                                  ? "Stop recording"
                                  : "Record this session"
                        }
                        className={[
                            "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            state.recording
                                ? "bg-danger-500 text-white shadow-glow-danger hover:bg-danger-600"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700",
                        ].join(" ")}
                    >
                        {recordBusy ? (
                            <SpinnerIcon className="h-4 w-4 animate-spin" />
                        ) : state.recording ? (
                            <StopIcon className="h-4 w-4" />
                        ) : (
                            <RecordIcon className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">
                            {state.recording ? "Stop recording" : "Record"}
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
}

export default LabTeacherBar;

// ── Icons (stroke-based, currentColor) ───────────────────────────────────

function BroadcastIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="2" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M6 6a8 8 0 000 12M18 6a8 8 0 010 12" />
        </svg>
    );
}

function StopIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
        </svg>
    );
}

function CameraIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
        </svg>
    );
}

function CameraOffIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h6m4 4v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8M3 3l18 18" />
        </svg>
    );
}

function RecordIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="8" strokeWidth={2} />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
        </svg>
    );
}

function SpinnerIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
            <path
                d="M21 12a9 9 0 00-9-9"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
            />
        </svg>
    );
}
