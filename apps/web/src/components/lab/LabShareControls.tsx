"use client";

import { useMemo, useRef, useState } from "react";
import type { LabParticipant, LabRoomState } from "@digimine/types";
import type { LabRoomActions } from "./useLabRoom";

/**
 * LabShareControls — the STUDENT's "show my work" control under the stage.
 *
 * A student can put their own screen on the wire two ways, both handled by the
 * hook's already-implemented verbs:
 *   • Share to teacher  → `actions.shareToTeacher()` — a `view` link the teacher
 *     (and only the teacher) sees, the default "I need eyes on this" move.
 *   • Share to a classmate → `actions.shareToPeer(uid)` — a `peer` link to one
 *     other student, offered ONLY when `allowPeerShare` is on for the session
 *     (the hook hard-gates this too, so it's a UX affordance, not the boundary).
 *
 * The control is a single source of truth driven off the student's OWN roster
 * row: while `sharingTo` is non-empty it flips to a "Sharing…" state with a
 * Stop button and a live "who you're showing" line; otherwise it shows the
 * picker. Re-aiming an active share (teacher → classmate or vice-versa) reuses
 * the live capture (no second OS prompt) because the hook keeps the track.
 *
 * Errors surface inline: the OS share-picker being dismissed, or peer sharing
 * being turned off, both come back as a thrown Error from the verb, which we
 * catch and show as a small rose strip rather than letting it escape.
 *
 * Presentational + self-contained: all room data arrives via props; the hook
 * owns LiveKit. Teachers never see this bar — they broadcast via the teacher
 * bar instead — so the caller only mounts it for students.
 */

export interface LabShareControlsProps {
    state: LabRoomState;
    actions: LabRoomActions;
    /**
     * Whether student ↔ student peer share is enabled for this session
     * (`session.settings.allowPeerShare`). Gates the "Share to a classmate"
     * option's visibility. Defaults to false (teacher-routed only) so we never
     * tease an option the session forbids; the hook is the hard boundary.
     */
    allowPeerShare?: boolean;
    className?: string;
}

export function LabShareControls({
    state,
    actions,
    allowPeerShare = false,
    className = "",
}: LabShareControlsProps) {
    // Busy guard shared by every share/stop affordance so a double-tap can't
    // race a getDisplayMedia prompt or a metadata round-trip.
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Whether the "pick a classmate" menu is open (peer share only).
    const [pickingPeer, setPickingPeer] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Our own roster row is the source of truth for whether/whom we're sharing.
    const me = useMemo(
        () => state.participants.find((p) => p.uid === state.you.uid) ?? null,
        [state.participants, state.you.uid]
    );
    // Memoize the targets array so it keeps a stable identity across renders
    // where our row is unchanged (it feeds the `sharingLabel` useMemo deps).
    const sharingTo = useMemo(() => me?.sharingTo ?? [], [me]);
    const isSharing = sharingTo.length > 0;

    // The teacher (target of a "share to teacher"). At most one per lab.
    const teacher = useMemo(
        () => state.participants.find((p) => p.role === "teacher") ?? null,
        [state.participants]
    );

    // Classmates we could peer-share to: every other student in the room.
    const classmates = useMemo(
        () =>
            state.participants
                .filter((p) => p.role !== "teacher" && p.uid !== state.you.uid)
                .sort((a, b) => a.seat - b.seat),
        [state.participants, state.you.uid]
    );

    // A friendly description of who we're currently showing, for the live state.
    const sharingLabel = useMemo(() => {
        if (!isSharing) return "";
        const names = sharingTo.map((uid) => {
            const p = state.participants.find((x) => x.uid === uid);
            if (!p) return "someone who left";
            return p.role === "teacher" ? "your teacher" : firstName(p.displayName);
        });
        return joinNames(names);
    }, [isSharing, sharingTo, state.participants]);

    /** Run a share/stop verb behind the busy guard, surfacing any thrown error. */
    const run = async (fn: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (e: unknown) {
            // A user dismissing the OS picker throws a DOMException ("Permission
            // denied" / "NotAllowedError"); treat that as a quiet cancel, not an
            // error worth shouting about. Everything else (peer share off, etc.)
            // shows its message.
            if (isUserCancel(e)) {
                /* silently no-op — they backed out of the OS share dialog */
            } else {
                setError(
                    e instanceof Error ? e.message : "Couldn't start sharing. Please try again."
                );
            }
        } finally {
            setBusy(false);
            setPickingPeer(false);
        }
    };

    return (
        <div
            ref={rootRef}
            className={`rounded-2xl border border-slate-200 bg-white p-2 shadow-soft-sm dark:border-slate-700 dark:bg-surface ${className}`}
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
                    Show your work
                </span>

                {isSharing ? (
                    // ── Active-share state: who you're showing + Stop ─────────
                    <>
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                            <ShareLiveDot />
                            Sharing to {sharingLabel}
                        </span>

                        {/* Re-aim while live (no second OS prompt). Teacher always
                            available; classmates only when peer share is on. */}
                        {teacher && !sharingTo.includes(teacher.uid) && (
                            <ShareButton
                                tone="ghost"
                                label="Switch to teacher"
                                icon={<TeacherIcon className="h-4 w-4" />}
                                disabled={busy}
                                onClick={() => void run(() => actions.shareToTeacher())}
                            />
                        )}
                        {allowPeerShare && classmates.length > 0 && (
                            <ShareButton
                                tone="ghost"
                                label="Switch classmate"
                                icon={<PeerIcon className="h-4 w-4" />}
                                disabled={busy}
                                onClick={() => setPickingPeer((v) => !v)}
                            />
                        )}

                        <div className="ml-auto" />
                        <ShareButton
                            tone="stop"
                            label="Stop sharing"
                            icon={<StopIcon className="h-4 w-4" />}
                            disabled={busy}
                            onClick={() => void run(() => actions.stopSharing())}
                        />
                    </>
                ) : (
                    // ── Idle state: the target picker ─────────────────────────
                    <>
                        <ShareButton
                            tone="primary"
                            label="Share to teacher"
                            icon={<TeacherIcon className="h-4 w-4" />}
                            disabled={busy || !teacher}
                            title={
                                teacher
                                    ? "Show your screen to your teacher"
                                    : "Your teacher isn't in the lab yet"
                            }
                            onClick={() => void run(() => actions.shareToTeacher())}
                        />
                        {allowPeerShare && (
                            <ShareButton
                                tone="secondary"
                                label="Share to a classmate"
                                icon={<PeerIcon className="h-4 w-4" />}
                                disabled={busy || classmates.length === 0}
                                title={
                                    classmates.length === 0
                                        ? "No classmates in the lab yet"
                                        : "Show your screen to one classmate"
                                }
                                onClick={() => setPickingPeer((v) => !v)}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Classmate picker (a simple inline list, peer share only). */}
            {pickingPeer && allowPeerShare && (
                <PeerPicker
                    classmates={classmates}
                    activeUid={sharingTo.find((uid) => uid !== teacher?.uid) ?? null}
                    busy={busy}
                    onPick={(uid) => void run(() => actions.shareToPeer(uid))}
                    onClose={() => setPickingPeer(false)}
                />
            )}

            {/* Inline error (peer share off, etc.) — quiet cancels are swallowed. */}
            {error && (
                <p
                    role="alert"
                    className="mt-1.5 px-2 text-[11px] font-medium text-danger-600 dark:text-danger-400"
                >
                    {error}
                </p>
            )}
        </div>
    );
}

export default LabShareControls;

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

/** The inline "pick a classmate to share with" list. */
function PeerPicker({
    classmates,
    activeUid,
    busy,
    onPick,
    onClose,
}: {
    classmates: LabParticipant[];
    activeUid: string | null;
    busy: boolean;
    onPick: (uid: string) => void;
    onClose: () => void;
}) {
    return (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Share with…
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md px-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                    Cancel
                </button>
            </div>
            <ul className="flex flex-wrap gap-1.5">
                {classmates.map((p) => {
                    const active = p.uid === activeUid;
                    return (
                        <li key={p.uid}>
                            <button
                                type="button"
                                disabled={busy}
                                aria-pressed={active}
                                onClick={() => onPick(p.uid)}
                                className={[
                                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                                    active
                                        ? "bg-violet-500 text-white shadow-soft-sm"
                                        : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-700/60 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700",
                                ].join(" ")}
                            >
                                <span
                                    className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold uppercase text-slate-600 dark:bg-slate-600 dark:text-slate-200"
                                    aria-hidden
                                >
                                    {initials(p.displayName)}
                                </span>
                                {firstName(p.displayName)}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** A share-control button with a small tone palette matching the app buttons. */
function ShareButton({
    label,
    icon,
    tone,
    disabled,
    title,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    tone: "primary" | "secondary" | "ghost" | "stop";
    disabled?: boolean;
    title?: string;
    onClick: () => void;
}) {
    const toneClasses =
        tone === "primary"
            ? "bg-primary-600 text-white shadow-glow-primary hover:bg-primary-700"
            : tone === "secondary"
              ? "bg-violet-500 text-white shadow-soft-sm hover:bg-violet-600"
              : tone === "stop"
                ? "bg-danger-500 text-white shadow-glow-danger hover:bg-danger-600"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                toneClasses,
            ].join(" ")}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * True when an error is the user backing out of the OS screen-share picker.
 * getDisplayMedia rejects with a DOMException whose name is "NotAllowedError"
 * (and some browsers use "AbortError"); we treat those as a quiet cancel.
 */
function isUserCancel(e: unknown): boolean {
    if (typeof DOMException !== "undefined" && e instanceof DOMException) {
        return e.name === "NotAllowedError" || e.name === "AbortError";
    }
    if (e instanceof Error) {
        return /permission denied|not allowed|aborted|cancell?ed/i.test(e.message);
    }
    return false;
}

/** Up to two initials from a display name. */
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Just the first word of a name (keeps chips short). */
function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
}

/** Join a list of names into "a", "a & b", or "a, b & c". */
function joinNames(names: string[]): string {
    if (names.length === 0) return "no one";
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// ── Icons (stroke-based, currentColor) ───────────────────────────────────

function TeacherIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3l9 5-9 5-9-5 9-5zM7 10.5V15c0 1.1 2.2 2.5 5 2.5s5-1.4 5-2.5v-4.5M21 8v5"
            />
        </svg>
    );
}

function PeerIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 14a4 4 0 10-8 0M12 7a3 3 0 100-.01M3 20a5 5 0 015-5h8a5 5 0 015 5"
            />
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

/** A small pulsing "live" dot used inside the active-share chip. */
function ShareLiveDot() {
    return (
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
        </span>
    );
}
