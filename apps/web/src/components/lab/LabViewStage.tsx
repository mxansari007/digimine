"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LabRoomState } from "@digimine/types";
import { LabVideo } from "./LabVideo";
import { LabControlSurface } from "./LabControlSurface";
import type { LabControlInputEvent } from "./labProtocol";
import type { LabControlState, LabRoomActions } from "./useLabRoom";

/**
 * LabViewStage — the "look at ONE participant's screen" frame.
 *
 * Distinct from `LabVideoStage` (which always shows the TEACHER's room-wide
 * broadcast): this stage shows whichever participant the local user has chosen
 * to *view* — a student the teacher clicked on the map, a classmate sharing to
 * a student, or the spotlit participant. The parent owns the selection
 * (`viewedUid`) and calls `actions.viewScreen(uid)` (which subscribes + sets the
 * viewer's status); this component just resolves that uid's screen track via
 * `actions.getVideoTrack(uid, "screen")` and paints it, re-querying on each
 * render so it appears the instant the track lands.
 *
 * On top of the frame sit several layers of controls:
 *   • a header that names who's being viewed + a Close button (the parent clears
 *     `viewedUid`), and a "Spotlit" badge mirrored from `state.spotlightUid`;
 *   • TEACHER-ONLY moderation, when `isTeacher`: Spotlight to class
 *     (`actions.spotlight(uid)`) / Stop spotlight (`actions.spotlight(null)`)
 *     and "End their share" (POST via the parent's `onEndShare`);
 *   • TEACHER-ONLY REMOTE CONTROL, when the viewed student is sharing a screen
 *     (i.e. running the desktop agent): a "Request remote control" button that
 *     fires `onRequestControl(uid)`, a "Requesting…" pending state with Cancel, a
 *     "Controlling {name}" active state with a prominent Stop + a mounted
 *     {@link LabControlSurface} over the video that captures + streams the
 *     teacher's input, and a dismissible "Request denied" toast. The student
 *     never grants in the browser — consent happens in their desktop agent; this
 *     UI only ever ASKS and then DRIVES once the agent grants
 *     (`control.phase === "active"`).
 *
 * The hook owns LiveKit; every track arrives through a handle and `<LabVideo>`
 * does the attach/detach. Rendered only when the parent has a `viewedUid`.
 */

export interface LabViewStageProps {
    state: LabRoomState;
    actions: LabRoomActions;
    /** The participant whose screen is on this stage (parent-owned selection). */
    viewedUid: string;
    /** True when the local user is the teacher (unlocks moderation + control). */
    isTeacher: boolean;
    /** Close the view stage (parent clears its `viewedUid`). */
    onClose: () => void;
    /**
     * Teacher: force-end the viewed participant's share via the control plane.
     * Owned by the parent so the busy/error state is shared with the rest of the
     * room shell. Omit to hide the "End their share" button (e.g. for students).
     */
    onEndShare?: (uid: string) => void;
    /** True while an `onEndShare` POST is in flight (disables the button). */
    endShareBusy?: boolean;
    /**
     * The TEACHER's live remote-control handshake state (`state.control` from the
     * hook). When `targetUid === viewedUid` the control affordances on this stage
     * reflect `phase`; for any other target this stage shows the idle "Request"
     * button (you can supersede the in-flight session by requesting this screen).
     * Omit for non-teacher mounts — control UI is teacher-only.
     */
    control?: LabControlState;
    /** TEACHER-only: ask `uid`'s agent for remote control (`actions.requestControl`). */
    onRequestControl?: (uid: string) => void;
    /** TEACHER-only: end / cancel the current control session (`actions.endControl`). */
    onEndControl?: () => void;
    /** TEACHER-only: stream one normalized input event (`actions.sendControlInput`). */
    onSendControlInput?: (ev: LabControlInputEvent) => void;
}

export function LabViewStage({
    state,
    actions,
    viewedUid,
    isTeacher,
    onClose,
    onEndShare,
    endShareBusy = false,
    control,
    onRequestControl,
    onEndControl,
    onSendControlInput,
}: LabViewStageProps) {
    // Spotlight is teacher-only and async (metadata + data pulse); a tiny local
    // guard keeps the button from double-firing before the round-trip lands.
    const [spotBusy, setSpotBusy] = useState(false);

    // Window chrome — collapse to the header (minimize) or lift into a
    // full-viewport portal overlay (maximize), like the other lab panels.
    const [minimized, setMinimized] = useState(false);
    const [maximized, setMaximized] = useState(false);
    useEffect(() => {
        if (!maximized) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMaximized(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [maximized]);

    const viewed = useMemo(
        () => state.participants.find((p) => p.uid === viewedUid) ?? null,
        [state.participants, viewedUid]
    );

    // Resolve the viewed participant's screen track. Null until it's subscribed
    // (a beat after viewScreen), so it doubles as the "is it live yet" flag; a
    // fresh handle each render is fine (LabVideo keys attach on uid+source).
    const screen = actions.getVideoTrack(viewedUid, "screen");

    const isSpotlit = state.spotlightUid === viewedUid;
    const name = viewed?.displayName ?? "This participant";

    // ── Remote control gating (teacher-only) ─────────────────────────────────
    // Control is offered ONLY when: we're the teacher, the toolbox is wired, and
    // the viewed student is actually sharing a screen — a present screen track is
    // our proxy for "this student is running the desktop agent", which is the
    // thing that can be controlled. The handshake `phase` is meaningful for THIS
    // stage only when the active control target IS the screen we're viewing.
    const controlWired = isTeacher && !!onRequestControl && !!onEndControl;
    const canOfferControl = controlWired && !!screen && !!viewed;
    const controlsThis = !!control && control.targetUid === viewedUid;
    const phase = controlsThis ? control!.phase : "idle";
    const isControlling = phase === "active";

    // A "Request denied" toast that the teacher can dismiss. We surface it while
    // `phase === "denied"` for this screen and auto-hide after a few seconds; a
    // fresh request (or viewing someone else) resets it.
    const [denyDismissed, setDenyDismissed] = useState(false);
    useEffect(() => {
        // Reset the dismissal whenever the phase/target changes so a *new* denial
        // shows again.
        setDenyDismissed(false);
    }, [phase, viewedUid]);
    useEffect(() => {
        if (phase !== "denied" || denyDismissed) return;
        const t = setTimeout(() => setDenyDismissed(true), 6000);
        return () => clearTimeout(t);
    }, [phase, denyDismissed]);
    const showDenied = phase === "denied" && !denyDismissed;

    const toggleSpotlight = () => {
        if (spotBusy) return;
        setSpotBusy(true);
        // `spotlight` is fire-and-forget (void) in the hook; clear the guard on
        // the next tick so a rapid re-click can't race the metadata write.
        try {
            actions.spotlight(isSpotlit ? null : viewedUid);
        } finally {
            // microtask is enough — the verb returns synchronously.
            setTimeout(() => setSpotBusy(false), 0);
        }
    };

    const ring = isControlling
        ? "border-rose-400 ring-rose-400/50 dark:border-rose-500/50"
        : "border-indigo-300 ring-indigo-400/40 dark:border-indigo-500/40";
    const sectionClass = maximized
        ? `fixed inset-3 z-[200] flex flex-col overflow-hidden rounded-2xl border bg-slate-950 shadow-2xl ring-1 ${ring}`
        : `overflow-hidden rounded-2xl border bg-slate-950 shadow-soft-sm ring-1 ${ring}`;

    const inner = (
        <section
            className={sectionClass}
            role={maximized ? "dialog" : undefined}
            aria-modal={maximized || undefined}
            aria-label={maximized ? `Viewing ${name}` : undefined}
        >
            {/* Header: who you're viewing + spotlight/control badge + window controls. */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-slate-900/80 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    <EyeIcon className="h-4 w-4 shrink-0 text-indigo-300" />
                    <span className="truncate text-xs font-semibold text-white">
                        {isControlling ? "Controlling" : "Viewing"}{" "}
                        <span className={isControlling ? "text-rose-200" : "text-indigo-200"}>
                            {name}
                        </span>
                    </span>
                    {isControlling && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/80" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
                            </span>
                            Live control
                        </span>
                    )}
                    {isSpotlit && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                            <SpotlightIcon className="h-3 w-3" />
                            Spotlit
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {!maximized && (
                        <WinBtn
                            title={minimized ? "Expand" : "Minimize"}
                            onClick={() => setMinimized((m) => !m)}
                        >
                            {minimized ? <ChevronGlyph /> : <MinusGlyph />}
                        </WinBtn>
                    )}
                    <WinBtn
                        title={maximized ? "Restore" : "Maximize"}
                        onClick={() => {
                            setMaximized((m) => !m);
                            if (!maximized) setMinimized(false);
                        }}
                    >
                        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
                    </WinBtn>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close the view"
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                    >
                        <CloseIcon className="h-3.5 w-3.5" />
                        Close
                    </button>
                </div>
            </div>

            {!minimized && (
            <div className={maximized ? "flex min-h-0 flex-1 flex-col overflow-auto" : "contents"}>
            {/* The frame. While controlling, the LabControlSurface overlays the
                video and captures the teacher's pointer/wheel/keyboard. */}
            <div className="relative aspect-video w-full">
                {screen ? (
                    <>
                        <LabVideo
                            track={screen}
                            className="absolute inset-0 h-full w-full bg-black object-contain"
                        />
                        {isControlling && onSendControlInput && onEndControl ? (
                            <LabControlSurface
                                name={name}
                                onInput={onSendControlInput}
                                onStop={onEndControl}
                            />
                        ) : (
                            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-soft">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                                </span>
                                {firstName(name)}&rsquo;s screen
                            </span>
                        )}
                    </>
                ) : (
                    <ViewPlaceholder name={name} present={!!viewed} />
                )}
            </div>

            {/* Remote-control action bar (teacher-only). Sits above moderation so
                the primary "drive this machine" verb is the most prominent. */}
            {canOfferControl && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-900/80 px-3 py-2">
                    <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-white/40 sm:inline">
                        Remote control
                    </span>

                    {phase === "active" ? (
                        <>
                            <button
                                type="button"
                                onClick={onEndControl}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-glow-danger transition-colors hover:bg-rose-600"
                            >
                                <StopControlIcon className="h-4 w-4" />
                                Stop controlling
                            </button>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-300">
                                <span className="relative flex h-2 w-2" aria-hidden>
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                                </span>
                                You are controlling {firstName(name)} — click the screen or press
                                Esc to stop
                            </span>
                        </>
                    ) : phase === "requested" ? (
                        <>
                            <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
                                <SpinnerIcon className="h-4 w-4 animate-spin text-indigo-300" />
                                Requesting control of {firstName(name)}…
                            </span>
                            <button
                                type="button"
                                onClick={onEndControl}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                            >
                                Cancel
                            </button>
                            <span className="hidden text-[11px] text-white/40 md:inline">
                                Waiting for {firstName(name)} to allow it in their lab agent.
                            </span>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => onRequestControl?.(viewedUid)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-indigo-400"
                            >
                                <ControlIcon className="h-4 w-4" />
                                Request remote control
                            </button>
                            <span className="hidden text-[11px] text-white/40 md:inline">
                                {firstName(name)} must allow it in their lab agent first.
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* "Request denied" toast — terminal denial from the student's agent. */}
            {showDenied && (
                <div
                    role="alert"
                    className="flex items-center justify-between gap-2 border-t border-rose-500/30 bg-rose-500/10 px-3 py-2"
                >
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-200">
                        <DenyIcon className="h-4 w-4 shrink-0" />
                        {firstName(name)} declined the remote-control request.
                    </span>
                    <button
                        type="button"
                        onClick={() => setDenyDismissed(true)}
                        aria-label="Dismiss"
                        className="rounded-lg px-1.5 py-0.5 text-rose-200/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Teacher moderation bar — acts on the screen being viewed. */}
            {isTeacher && viewed && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-900/80 px-3 py-2">
                    <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-white/40 sm:inline">
                        Moderate
                    </span>
                    <ModButton
                        tone={isSpotlit ? "amber" : "ghost"}
                        label={isSpotlit ? "Stop spotlight" : "Spotlight to class"}
                        icon={<SpotlightIcon className="h-4 w-4" />}
                        active={isSpotlit}
                        disabled={spotBusy}
                        onClick={toggleSpotlight}
                    />
                    {onEndShare && (
                        <ModButton
                            tone="danger"
                            label="End their share"
                            icon={<StopIcon className="h-4 w-4" />}
                            disabled={endShareBusy}
                            onClick={() => onEndShare(viewedUid)}
                        />
                    )}
                </div>
            )}
            </div>
            )}
        </section>
    );

    // Maximized: portal the whole stage onto document.body (above the app
    // chrome) over a dimmed backdrop; otherwise render it docked in place.
    if (maximized && typeof document !== "undefined") {
        return createPortal(
            <>
                <div
                    className="fixed inset-0 z-[190] bg-slate-900/50 backdrop-blur-[2px]"
                    onClick={() => setMaximized(false)}
                    aria-hidden
                />
                {inner}
            </>,
            document.body
        );
    }

    return inner;
}

export default LabViewStage;

// ── Window chrome (min / max / restore) ──────────────────────────────────

/** A small icon button matching the view stage's dark header. */
function WinBtn({
    title,
    onClick,
    children,
}: {
    title: string;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
            {children}
        </button>
    );
}

function MinusGlyph() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeWidth={2.5} d="M5 12h14" />
        </svg>
    );
}

function ChevronGlyph() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 9l6 6 6-6" />
        </svg>
    );
}

function MaximizeGlyph() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth={2} />
        </svg>
    );
}

function RestoreGlyph() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="8" y="8" width="12" height="12" rx="1.5" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16V5a1 1 0 011-1h11" />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

/** Calm empty state while the viewed screen track hasn't landed yet. */
function ViewPlaceholder({ name, present }: { name: string; present: boolean }) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/40">
                <EyeIcon className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-white/70">
                {present ? `Waiting for ${firstName(name)}'s screen…` : "They've left the lab"}
            </p>
            <p className="text-xs text-white/40">
                {present
                    ? "Their share will appear here the moment it connects."
                    : "Close this view to pick someone else."}
            </p>
        </div>
    );
}

/** A teacher moderation button (sits on the dark moderation bar). */
function ModButton({
    label,
    icon,
    tone,
    active = false,
    disabled,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    tone: "amber" | "danger" | "ghost";
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    const toneClasses =
        tone === "amber"
            ? "bg-amber-400 text-slate-900 hover:bg-amber-300"
            : tone === "danger"
              ? "bg-danger-500 text-white hover:bg-danger-600"
              : "bg-white/10 text-white/90 hover:bg-white/20";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={active}
            className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                toneClasses,
            ].join(" ")}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers + icons
// ─────────────────────────────────────────────────────────────────────

function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
}

function EyeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
            />
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
        </svg>
    );
}

function SpotlightIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3v2m0 14v2m9-9h-2M5 12H3m13.5-6.5l-1.4 1.4M8.9 15.1l-1.4 1.4m9.6 0l-1.4-1.4M8.9 8.9L7.5 7.5"
            />
            <circle cx="12" cy="12" r="3.5" strokeWidth={2} />
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

function CloseIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}

/** A pointer/cursor glyph for the "Request remote control" verb. */
function ControlIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3l14 8-6 1.5L9.5 19 5 3z"
            />
        </svg>
    );
}

/** A cursor-with-slash glyph for "Stop controlling". */
function StopControlIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3l14 8-6 1.5L9.5 19 5 3z"
            />
            <path strokeLinecap="round" strokeWidth={2} d="M3 3l18 18" />
        </svg>
    );
}

function DenyIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M6.5 6.5l11 11" />
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
