"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isLabAgentIdentity, labAgentIdentity, labBaseUid } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { fetchLabSession } from "@/lib/lab/labClient";
import { LabMap, type LabMapActions } from "./LabMap";
import { LabConnectionBanner } from "./LabConnectionBanner";
import { LabVideoStage } from "./LabVideoStage";
import { LabViewStage } from "./LabViewStage";
import { LabShareControls } from "./LabShareControls";
import { LabAgentConnect } from "./LabAgentConnect";
import { LabTeacherBar } from "./LabTeacherBar";
import { LabStudentBar } from "./LabStudentBar";
import { LabChat } from "./LabChat";
import { endParticipantShare } from "./labModerate";
import { useLabRoom } from "./useLabRoom";

/**
 * LabRoom — the client shell both the student and teacher lab pages mount.
 *
 * It owns nothing itself: it calls `useLabRoom(sessionId)` for the live
 * (LiveKit-derived) `LabRoomState` + action bag + chat + connection status, then
 * composes the room out of presentational pieces:
 *
 *   ┌ header (title / back link / room-wide REC consent indicator + teacher Record)
 *   ├ <LabConnectionBanner>      — connecting / reconnecting / error strip
 *   ├ <LabVideoStage>            — the teacher's broadcast (screen + camera PiP)
 *   ├ <LabMap>                   — the live seat map + side rail (off LabRoomState)
 *   ├ role bar                   — <LabTeacherBar> | <LabStudentBar>
 *   └ <LabChat>                  — in-room text chat
 *
 * RECORDING + CONSENT. Recording is consent-relevant, so two affordances live
 * here:
 *   • a teacher-only Record / Stop control (header + the map's "Run the room"
 *     bar + the teacher bar), all driving the SAME async toggle through the
 *     hook's `startRecording`/`stopRecording` (which POST to the recording API
 *     and broadcast a `record` pulse to the room); a shared `busy` flag prevents
 *     a double-tap racing the egress, and a failure surfaces as an inline strip.
 *   • an ALWAYS-VISIBLE "● REC" indicator shown to EVERYONE in the room (teacher
 *     and students alike) whenever `state.recording` is true, announced to
 *     assistive tech ("This session is being recorded") — so no one is ever
 *     recorded without a clear, persistent signal.
 *
 * The map's own teacher control bar (inside <LabMap>) is preserved by mapping
 * the hook's verbs onto `LabMapActions`; the new role bar adds the primary
 * Go-live / raise-hand affordances called for in the room layout. Role gating
 * uses the server-minted `role` from the token (never a client guess).
 *
 * The pages gate the route on the feature flag (server-side `notFound()` when
 * off), so by the time this renders the lab is enabled.
 */

export interface LabRoomProps {
    sessionId: string;
    /** Where the "back" link points (student vs teacher hub). */
    backHref: string;
    backLabel: string;
    /**
     * Whether student ↔ student peer share is enabled for this session
     * (`session.settings.allowPeerShare`). When omitted we fetch it ourselves
     * (the gate already loaded the session, but doesn't thread it down), so the
     * student share picker can show/hide the "classmate" option. The hook is the
     * hard boundary regardless; this only gates the affordance's visibility.
     */
    allowPeerShare?: boolean;
}

export function LabRoom({ sessionId, backHref, backLabel, allowPeerShare }: LabRoomProps) {
    const { state, actions, status, connected, error, messages, role, controlAsk } =
        useLabRoom(sessionId);
    const { firebaseUser } = useAuthContext();
    const router = useRouter();

    // Teacher's transient "asked the student to connect their desktop" note.
    const [askedNote, setAskedNote] = useState<string | null>(null);
    useEffect(() => {
        if (!askedNote) return;
        const t = setTimeout(() => setAskedNote(null), 6000);
        return () => clearTimeout(t);
    }, [askedNote]);

    const isTeacher = role === "teacher";

    // The session's peer-share toggle, used to show/hide the student "share to a
    // classmate" option. Prefer the prop; otherwise fetch it once (best-effort,
    // defaults closed so we never tease a forbidden option). The hook still hard-
    // gates `shareToPeer`, so this is purely the picker's visibility.
    const [peerShareAllowed, setPeerShareAllowed] = useState<boolean>(
        allowPeerShare ?? false
    );
    useEffect(() => {
        if (allowPeerShare !== undefined) {
            setPeerShareAllowed(allowPeerShare);
            return;
        }
        if (!firebaseUser) return;
        let cancelled = false;
        fetchLabSession(firebaseUser, sessionId)
            .then(({ session }) => {
                if (!cancelled) setPeerShareAllowed(session.settings.allowPeerShare !== false);
            })
            .catch(() => {
                /* best-effort; leave the closed default */
            });
        return () => {
            cancelled = true;
        };
    }, [allowPeerShare, firebaseUser, sessionId]);

    // ── View stage (look at ONE participant's screen) ────────────────
    // `viewedUid` is the participant whose screen fills the secondary stage.
    // Clicking a seat on the map (any role) or the map's "View screen" sets it
    // and calls `actions.viewScreen` (which subscribes + flags us "watching").
    // `null` closes the stage. `manualView` tracks whether the local user picked
    // this explicitly, so the teacher's spotlight doesn't yank a teacher who is
    // deliberately viewing someone else (students always follow the spotlight).
    const [viewedUid, setViewedUid] = useState<string | null>(null);
    const manualViewRef = useRef(false);

    const openView = useCallback(
        (uid: string) => {
            if (!uid || uid === state.you.uid) return;
            manualViewRef.current = true;
            // Kick the subscribe/permission side-effect; the stage paints the
            // track once it lands (it re-queries getVideoTrack each render).
            actions.viewScreen(uid);
            setViewedUid(uid);
        },
        [actions, state.you.uid]
    );

    const closeView = useCallback(() => {
        manualViewRef.current = false;
        // Closing the screen we're actively controlling must also end control —
        // otherwise the capture surface unmounts while the agent's grant stays
        // live with no way to stop it. Idempotent in any other phase / target.
        if (state.control.targetUid === viewedUid) {
            actions.endControl();
        }
        setViewedUid(null);
        // Drop back to "on task" when we stop watching (no-op if we weren't).
        void actions.setStatus("on_task");
    }, [actions, state.control.targetUid, viewedUid]);

    // Follow the teacher's spotlight: when one is set and the local user hasn't
    // manually opened a different screen, foreground the spotlit participant.
    // Students always follow; the teacher follows only when not manually viewing
    // (so they can keep watching a chosen student while a spotlight is up). When
    // the spotlight clears, close any spotlight-driven view.
    useEffect(() => {
        const spot = state.spotlightUid ?? null;
        if (spot && spot !== state.you.uid) {
            if (!manualViewRef.current || !isTeacher) {
                manualViewRef.current = false;
                actions.viewScreen(spot);
                setViewedUid(spot);
            }
        } else if (!spot && !manualViewRef.current) {
            setViewedUid((prev) => (prev ? null : prev));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.spotlightUid, state.you.uid, isTeacher]);

    // If the participant we're viewing leaves the roster, close the stage.
    useEffect(() => {
        if (viewedUid && !state.participants.some((p) => p.uid === viewedUid)) {
            manualViewRef.current = false;
            setViewedUid(null);
        }
    }, [viewedUid, state.participants]);

    // Recording is async (POST → egress); a single in-flight guard + error
    // string is shared by every Record/Stop affordance (header, map bar, teacher
    // bar) so they can't race each other and a failure is surfaced once.
    const [recordBusy, setRecordBusy] = useState(false);
    const [recordError, setRecordError] = useState<string | null>(null);

    const toggleRecording = useCallback(() => {
        if (recordBusy) return;
        setRecordBusy(true);
        setRecordError(null);
        const fn = state.recording ? actions.stopRecording : actions.startRecording;
        void fn()
            .catch((e: unknown) => {
                setRecordError(
                    e instanceof Error ? e.message : "Recording action failed. Please try again."
                );
            })
            .finally(() => setRecordBusy(false));
    }, [recordBusy, state.recording, actions]);

    // End the whole session (teacher-only): confirm, end it via the control plane
    // (the hook stops local media + leaves the room), then navigate back to the
    // class. A busy guard prevents double-taps; a failure surfaces inline.
    const [endingSession, setEndingSession] = useState(false);
    const [endSessionError, setEndSessionError] = useState<string | null>(null);
    const onEndSession = useCallback(() => {
        if (endingSession) return;
        if (
            typeof window !== "undefined" &&
            !window.confirm(
                "End this lab session for everyone? Students will be disconnected and you'll return to the class."
            )
        ) {
            return;
        }
        setEndingSession(true);
        setEndSessionError(null);
        void actions
            .endSession()
            .then(() => {
                router.push(backHref);
            })
            .catch((e: unknown) => {
                setEndSessionError(
                    e instanceof Error ? e.message : "Couldn't end the session. Please try again."
                );
                setEndingSession(false);
            });
    }, [endingSession, actions, router, backHref]);

    // Map the hook's verb-y action bag onto LabMap's control-bar callbacks. The
    // map's broadcast button is the same intent as the teacher bar's Go-live, so
    // both drive start/stopBroadcast off the live `broadcasting` flag.
    const onToggleBroadcast = useCallback(() => {
        if (state.broadcasting) void actions.stopBroadcast();
        else void actions.startBroadcast();
    }, [state.broadcasting, actions]);

    // Force-end the viewed student's share via the control plane (teacher-only).
    // Shares one busy/error pair across the view-stage button; on success the
    // student's `lab-share` track drops and the map redraws off the metadata.
    const [endShareBusy, setEndShareBusy] = useState(false);
    const [endShareError, setEndShareError] = useState<string | null>(null);
    const onEndShare = useCallback(
        (uid: string) => {
            if (endShareBusy || !uid) return;
            // The visible share is usually published by the student's desktop AGENT
            // (now folded into their single avatar), not their browser — end
            // whichever presence actually has a live screen track. Handles being
            // called with the student uid (avatar menu) OR the agent uid (view stage).
            const agentId = labAgentIdentity(uid);
            const target = actions.getVideoTrack(agentId, "screen")
                ? agentId
                : actions.getVideoTrack(uid, "screen")
                  ? uid
                  : state.participants.some((p) => p.uid === agentId)
                    ? agentId
                    : uid;
            setEndShareBusy(true);
            setEndShareError(null);
            void endParticipantShare(sessionId, target)
                .then(() => setAskedNote("Ended their share."))
                .catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : "Couldn't end that share.";
                    setEndShareError(msg);
                    // Also surface near the teacher bar — the inline error sits by
                    // the view stage, which may be closed when ending from the menu.
                    setAskedNote(msg);
                })
                .finally(() => setEndShareBusy(false));
        },
        [endShareBusy, sessionId, actions, state.participants]
    );

    // Clicking an avatar opens a per-participant ACTION MENU (in LabMap). These
    // callbacks back each menu item; the hook enforces permissions (a teacher may
    // view/spotlight/control/end-share any student; a student may view a peer
    // sharing to them and — when allowed — share their own screen to a peer).
    const mapActions: LabMapActions = {
        onToggleBroadcast,
        onToggleRecording: toggleRecording,
        // Clicking a student views their DESKTOP (agent) screen when connected,
        // else their browser share — the agent isn't a separate avatar anymore.
        onSelectParticipant: (uid) => {
            const agentId = labAgentIdentity(uid);
            openView(state.participants.some((p) => p.uid === agentId) ? agentId : uid);
        },
        onSpotlight: (uid) => actions.spotlight(uid),
        onRemoteControl: (uid) => {
            const agentId = isLabAgentIdentity(uid) ? uid : labAgentIdentity(uid);
            const studentUid = isLabAgentIdentity(uid) ? labBaseUid(uid) : uid;
            const agentPresent = state.participants.some((p) => p.uid === agentId);
            // ALWAYS nudge the student's BROWSER so they get visible feedback — the
            // agent's own Allow/Deny dialog is easily hidden behind the browser.
            actions.askControl(studentUid);
            if (agentPresent) {
                // Agent connected → send the real control request to it + open its screen.
                openView(agentId);
                actions.requestControl(agentId);
            }
            const name =
                state.participants.find((p) => p.uid === studentUid)?.displayName ||
                "the student";
            setAskedNote(
                agentPresent
                    ? `Requested control of ${name} — waiting for them to tap Allow in the Lab Agent.`
                    : `Asked ${name} to connect their desktop for remote control.`
            );
        },
        onEndShare: (uid) => onEndShare(uid),
        onShareToPeer: (uid) => {
            void actions.shareToPeer(uid).catch(() => {
                /* peer share off / cancelled — best-effort from the map menu */
            });
        },
    };

    // The active remote-control link to light up on the map (controller → student
    // being controlled). Held only by the controller (the teacher).
    const controlEdge =
        state.control.phase === "active" && state.control.targetUid
            ? { fromUid: state.you.uid, toUid: state.control.targetUid }
            : null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        href={backHref}
                        className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
                    >
                        ← {backLabel}
                    </Link>
                    <h1 className="mt-1 font-display text-2xl font-bold text-gray-900">Virtual lab</h1>
                    <p className="mt-0.5 text-sm text-slate-500">
                        A live map of who&apos;s on task, who needs help, and who&apos;s sharing —
                        in real time.
                    </p>
                </div>

                {/* Recording cluster: the room-wide consent indicator (everyone)
                    + the teacher-only Record / Stop control. */}
                <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                        <RecordingIndicator recording={state.recording} />
                        {isTeacher && (
                            <RecordButton
                                recording={state.recording}
                                busy={recordBusy}
                                disabled={!connected}
                                onToggle={toggleRecording}
                            />
                        )}
                    </div>
                    {isTeacher && recordError && (
                        <p
                            role="alert"
                            className="max-w-[16rem] text-right text-[11px] font-medium text-danger-600 dark:text-danger-400"
                        >
                            {recordError}
                        </p>
                    )}
                </div>
            </div>

            {/* Connection / error banner */}
            <LabConnectionBanner status={status} error={error} />

            {/* Main two-column layout: stage + map on the left, chat on the right. */}
            <div className="flex flex-col gap-4 xl:flex-row">
                <div className="min-w-0 flex-1 space-y-4">
                    {/* Primary video stage — the teacher's broadcast. */}
                    <LabVideoStage state={state} actions={actions} />

                    {/* Secondary view stage — the ONE participant the local user
                        (or the spotlight) is looking at. Mounts only when a
                        `viewedUid` is set; carries the teacher's spotlight + end-
                        share moderation for the screen on it. */}
                    {viewedUid && (
                        <div className="space-y-1.5">
                            <LabViewStage
                                state={state}
                                actions={actions}
                                viewedUid={viewedUid}
                                isTeacher={isTeacher}
                                onClose={closeView}
                                onEndShare={isTeacher ? onEndShare : undefined}
                                endShareBusy={endShareBusy}
                                // Remote control is teacher-only — wire the
                                // handshake state + verbs through only for the
                                // teacher so a student never gets control-of-
                                // others UI (the hook also hard-gates these).
                                control={isTeacher ? state.control : undefined}
                                onRequestControl={
                                    isTeacher ? actions.requestControl : undefined
                                }
                                onEndControl={isTeacher ? actions.endControl : undefined}
                                onSendControlInput={
                                    isTeacher ? actions.sendControlInput : undefined
                                }
                            />
                            {isTeacher && endShareError && (
                                <p
                                    role="alert"
                                    className="px-1 text-[11px] font-medium text-danger-600 dark:text-danger-400"
                                >
                                    {endShareError}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Role bar — primary self-actions. */}
                    {role &&
                        (isTeacher ? (
                            <>
                                <LabTeacherBar
                                    state={state}
                                    actions={actions}
                                    recordBusy={recordBusy}
                                    recordDisabled={!connected}
                                    onToggleRecording={toggleRecording}
                                    onEndSession={onEndSession}
                                />
                                {endSessionError && (
                                    <p
                                        role="alert"
                                        className="px-1 text-[11px] font-medium text-danger-600 dark:text-danger-400"
                                    >
                                        {endSessionError}
                                    </p>
                                )}
                                {askedNote && (
                                    <p className="px-1 text-[11px] font-medium text-primary-700 dark:text-primary-300">
                                        {askedNote}
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <LabStudentBar state={state} actions={actions} />
                                {/* Teacher asked to remote-control this student → prompt to connect. */}
                                {controlAsk && (
                                    <div className="rounded-2xl border border-primary-300 bg-primary-50 p-3 shadow-soft-sm dark:border-primary-500/40 dark:bg-primary-500/10">
                                        <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">
                                            {controlAsk.fromName} wants to control your computer
                                        </p>
                                        <p className="mt-0.5 text-xs text-primary-800/80 dark:text-primary-200/80">
                                            Open the <span className="font-medium">Lab Agent</span> app and tap
                                            <span className="font-medium"> Allow</span> when it asks. If you
                                            haven&apos;t connected your desktop yet, use the panel below.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => actions.dismissControlAsk()}
                                            className="mt-2 rounded-lg border border-primary-200 px-2.5 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-100 dark:border-primary-500/30 dark:text-primary-300 dark:hover:bg-primary-500/15"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                )}
                                {/* Student "show your work" — share to teacher or,
                                    when the session allows it, a classmate. */}
                                <LabShareControls
                                    state={state}
                                    actions={actions}
                                    allowPeerShare={peerShareAllowed}
                                />
                                {/* Connect the desktop agent for full-machine
                                    remote help (screen + consent-gated control).
                                    Auto-opens when the teacher asks for control. */}
                                <LabAgentConnect sessionId={sessionId} forceOpen={!!controlAsk} />
                            </>
                        ))}

                    {/* The live seat map + side rail (renders its own teacher
                        control bar when `state.you.role === "teacher"`). */}
                    <LabMap
                        state={state}
                        actions={mapActions}
                        allowPeerShare={peerShareAllowed}
                        controlEdge={controlEdge}
                    />
                </div>

                {/* Chat rail. */}
                <aside className="w-full shrink-0 xl:w-80">
                    <LabChat
                        messages={messages}
                        onSend={actions.sendChat}
                        disabled={!connected}
                        className="xl:sticky xl:top-4"
                    />
                </aside>
            </div>
        </div>
    );
}

export default LabRoom;

// ─────────────────────────────────────────────────────────────────────
// Recording UI — consent indicator (everyone) + teacher Record/Stop button
// ─────────────────────────────────────────────────────────────────────

/**
 * The always-visible "● REC" consent indicator. Rendered for EVERY participant
 * (teacher + students) whenever a recording is in progress, so the room always
 * carries a clear, persistent "you are being recorded" signal. Announced to
 * assistive tech via `role="status"` + an explicit label; returns null (renders
 * nothing) when not recording so it never implies a recording that isn't real.
 */
function RecordingIndicator({ recording }: { recording: boolean }) {
    if (!recording) return null;
    return (
        <span
            role="status"
            aria-live="polite"
            aria-label="This session is being recorded"
            title="This session is being recorded"
            className="inline-flex items-center gap-1.5 rounded-full border border-danger-200 bg-danger-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-danger-700 shadow-soft-sm dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
        >
            <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger-500" />
            </span>
            REC
            {/* A visually-hidden long form for screen readers that don't read the
                aria-label (the short "REC" alone is ambiguous out of context). */}
            <span className="sr-only">— this session is being recorded</span>
        </span>
    );
}

/**
 * The teacher-only Record / Stop control. A single button whose label, icon, and
 * tone follow the live `recording` flag; disabled while a toggle is in flight
 * (`busy`) or before the room is connected. Drives the shared async toggle.
 */
function RecordButton({
    recording,
    busy,
    disabled,
    onToggle,
}: {
    recording: boolean;
    busy: boolean;
    disabled: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={busy || disabled}
            aria-pressed={recording}
            aria-label={recording ? "Stop recording the session" : "Record the session"}
            title={
                disabled
                    ? "Connect to the room to record"
                    : recording
                      ? "Stop recording"
                      : "Record this session"
            }
            className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                recording
                    ? "bg-danger-500 text-white shadow-glow-danger hover:bg-danger-600"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700",
            ].join(" ")}
        >
            {busy ? (
                <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : recording ? (
                <StopIcon className="h-4 w-4" />
            ) : (
                <RecordIcon className="h-4 w-4" />
            )}
            <span>{recording ? "Stop recording" : "Record"}</span>
        </button>
    );
}

// ── Icons (stroke-based, currentColor) ───────────────────────────────────

function RecordIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="8" strokeWidth={2} />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
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
