"use client";

import { useMemo } from "react";
import type {
    LabConnection,
    LabParticipant,
    LabRoomState,
    LabStatus,
} from "@digimine/types";

/**
 * LabMap — the gamified "live map" of a virtual lab session.
 *
 * Pure presentational: everything it draws comes from the `state`
 * (`LabRoomState`) prop, so it renders identically off the `labMock` fixture
 * or off live LiveKit-derived state from `useLabRoom`. It never fetches, never
 * holds room state, and never talks to LiveKit — the "Run the room" buttons
 * are optional callback props the caller wires to the control plane.
 *
 * Three layers, composed:
 *   1. a seat-gridded *map* of teacher + student avatars, coloured by
 *      `LabStatus`, with SVG connection lines drawn underneath for each
 *      `LabConnection` (peer / view / broadcast, broadcast highlighted);
 *   2. a "Live in this lab" side rail — the active shares + the raised-hand
 *      queue (oldest first), i.e. what the teacher acts on;
 *   3. a "Run the room" control bar (Broadcast / View screen / Remote assist /
 *      Recording) rendered ONLY when `state.you.role === "teacher"`.
 *
 * Styling follows the app conventions: teal primary, amber accent for "live",
 * semantic `surface`/`border`/`foreground` tokens so it themes (light ↔ Tokyo
 * Night) for free, soft shadows, `font-display` headings.
 */

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export interface LabMapActions {
    /** Toggle the teacher's room-wide live broadcast (cam/screen → everyone). */
    onToggleBroadcast?: () => void;
    /** Open the "view a student's screen" picker (student → teacher share). */
    onViewScreen?: () => void;
    /** Begin the remote-assist (desktop-agent) consent + control flow. */
    onRemoteAssist?: () => void;
    /** Start/stop the session recording (consent-gated server-side). */
    onToggleRecording?: () => void;
    /**
     * Click an avatar on the map to VIEW that participant's screen. Wired for
     * everyone (the room shell's `viewScreen` enforces who may actually see whom:
     * a teacher → any student; a student → a peer sharing to them or the spotlit
     * one). Spotlight/end-share moderation then live on the view stage itself.
     */
    onSelectParticipant?: (uid: string) => void;
}

export interface LabMapProps {
    /** The denormalized room snapshot to render. The single source of truth. */
    state: LabRoomState;
    /** Optional control-bar / avatar callbacks (no-ops if omitted). */
    actions?: LabMapActions;
    /** Extra classes on the outer wrapper. */
    className?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Status → visual mapping
// ─────────────────────────────────────────────────────────────────────

interface StatusStyle {
    label: string;
    /** Avatar ring + accent colour (Tailwind classes). */
    ring: string;
    /** Solid swatch for legend dots / badges. */
    dot: string;
    /** Soft chip background + text for the side rail. */
    chip: string;
    /** Raw colour for SVG strokes that originate from this status. */
    stroke: string;
}

/**
 * The status palette, per the contract:
 *   on_task=teal · sharing=violet/indigo · watching=indigo ·
 *   needs_help=amber · idle=grey.
 */
const STATUS_STYLES: Record<LabStatus, StatusStyle> = {
    on_task: {
        label: "On task",
        ring: "ring-primary-400 dark:ring-primary-500",
        dot: "bg-primary-500",
        chip: "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300",
        stroke: "#14b8a6",
    },
    sharing: {
        label: "Sharing",
        ring: "ring-violet-400 dark:ring-violet-500",
        dot: "bg-violet-500",
        chip: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
        stroke: "#8b5cf6",
    },
    watching: {
        label: "Watching",
        ring: "ring-indigo-400 dark:ring-indigo-500",
        dot: "bg-indigo-500",
        chip: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
        stroke: "#6366f1",
    },
    needs_help: {
        label: "Needs help",
        ring: "ring-accent-400 dark:ring-accent-500",
        dot: "bg-accent-500",
        chip: "bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300",
        stroke: "#f59e0b",
    },
    idle: {
        label: "Idle",
        ring: "ring-slate-300 dark:ring-slate-600",
        dot: "bg-slate-400",
        chip: "bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400",
        stroke: "#94a3b8",
    },
};

/** Stroke colour + dash for each connection kind drawn between avatars. */
const CONNECTION_STYLES: Record<
    LabConnection["kind"],
    { stroke: string; dash?: string; width: number; label: string }
> = {
    broadcast: { stroke: "#0d9488", width: 2.5, dash: "1 7", label: "Broadcast" }, // teal, animated dotted
    view: { stroke: "#6366f1", width: 2, label: "Teacher view" }, // indigo, solid
    peer: { stroke: "#8b5cf6", width: 2, dash: "6 5", label: "Peer share" }, // violet, dashed
};

/**
 * The amber accent a connection takes when it touches the spotlit participant —
 * the room-wide pin recolours whatever line type it sits on so the whole path to
 * the spotlit screen reads as one highlighted thread.
 */
const CONNECTION_STYLES_SPOTLIGHT = { stroke: "#f59e0b" }; // amber-500

// ─────────────────────────────────────────────────────────────────────
// Seat geometry
// ─────────────────────────────────────────────────────────────────────

/**
 * The map is laid out in a single normalized 0..100 coordinate space (a
 * viewBox-free percentage grid) so the SVG connection layer and the absolutely
 * positioned avatars share one coordinate system and stay aligned at any
 * width. The teacher always anchors the top-centre "front of the room"; the
 * students flow into a responsive grid below.
 */
const COLUMNS = 5; // students per row on the map grid

interface Seat {
    /** % from left (centre of the avatar). */
    x: number;
    /** % from top (centre of the avatar). */
    y: number;
}

/** Deterministic seat → {x,y}% so an avatar never jumps between renders. */
function seatPosition(participant: LabParticipant, studentIndex: number): Seat {
    if (participant.role === "teacher") {
        // Front of the room, centred.
        return { x: 50, y: 12 };
    }
    const col = studentIndex % COLUMNS;
    const row = Math.floor(studentIndex / COLUMNS);
    // Inset margins so avatars + their lines never clip the panel edges.
    const x = 12 + (col / (COLUMNS - 1)) * 76; // 12%..88%
    const y = 34 + row * 22; // first student row sits below the teacher
    return { x, y };
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export function LabMap({ state, actions, className = "" }: LabMapProps) {
    const isTeacher = state.you.role === "teacher";
    // The teacher's room-wide pin (if any), honoured only while present. Drives
    // the amber glow on the spotlit avatar + its connection lines, and a rail row.
    const spotlightUid = state.spotlightUid ?? null;

    // Index participants by uid and pre-compute every avatar's seat position
    // once per render; the SVG layer and the rail both read from this.
    const { positions, byUid, ordered } = useMemo(() => {
        const byUid = new Map<string, LabParticipant>();
        for (const p of state.participants) byUid.set(p.uid, p);

        // Teacher first, then students ordered by their stable seat index so
        // the grid is reproducible regardless of array order.
        const teacher = state.participants.find((p) => p.role === "teacher");
        const students = state.participants
            .filter((p) => p.role !== "teacher")
            .sort((a, b) => a.seat - b.seat);
        const ordered = teacher ? [teacher, ...students] : students;

        const positions = new Map<string, Seat>();
        let studentIndex = 0;
        for (const p of ordered) {
            positions.set(p.uid, seatPosition(p, p.role === "teacher" ? 0 : studentIndex));
            if (p.role !== "teacher") studentIndex += 1;
        }
        return { positions, byUid, ordered };
    }, [state.participants]);

    // Only draw connections whose endpoints we can place (defensive against a
    // line referencing someone who already left the roster).
    const drawableConnections = useMemo(
        () =>
            state.connections.filter(
                (c) => positions.has(c.fromUid) && positions.has(c.toUid)
            ),
        [state.connections, positions]
    );

    // The raised-hand queue — oldest hand first (what the teacher answers).
    const handQueue = useMemo(
        () =>
            state.participants
                .filter((p) => typeof p.handRaisedAt === "number")
                .sort((a, b) => (a.handRaisedAt as number) - (b.handRaisedAt as number)),
        [state.participants]
    );

    // The active shares, summarised for the rail (one row per connection, with
    // the broadcast collapsed into a single "to the room" line, and the
    // spotlight floated to the top when one is active).
    const liveShares = useMemo(
        () => summariseShares(drawableConnections, byUid, spotlightUid),
        [drawableConnections, byUid, spotlightUid]
    );

    return (
        <div className={`flex flex-col gap-4 lg:flex-row ${className}`}>
            {/* ── The map ─────────────────────────────────────────────── */}
            <section className="min-w-0 flex-1">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-soft-sm dark:border-slate-700 dark:from-slate-900 dark:to-surface">
                    {/* Header strip: live/recording state + legend. */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-700/70">
                        <div className="flex items-center gap-2">
                            {state.broadcasting ? (
                                <LivePill label="Broadcasting" tone="accent" pulse />
                            ) : (
                                <span className="text-xs font-medium text-slate-400">Not broadcasting</span>
                            )}
                            {spotlightUid && (
                                <LivePill
                                    label={`Spotlight: ${firstName(byUid.get(spotlightUid)?.displayName ?? "Someone")}`}
                                    tone="spotlight"
                                />
                            )}
                            {state.recording && <LivePill label="REC" tone="danger" pulse />}
                        </div>
                        <Legend />
                    </div>

                    {/* The seat field. A fixed aspect keeps the % geometry sane;
                        it scrolls on very short viewports rather than squashing. */}
                    <div className="relative aspect-[16/10] w-full">
                        {/* Faint "floor" grid for a roomy, gamified feel. */}
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 opacity-[0.45] dark:opacity-30"
                            style={{
                                backgroundImage:
                                    "linear-gradient(to right, rgb(148 163 184 / 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.12) 1px, transparent 1px)",
                                backgroundSize: "40px 40px",
                            }}
                        />

                        {/* Connection lines, beneath the avatars. Spotlight-
                            touching lines glow amber. */}
                        <ConnectionLayer
                            connections={drawableConnections}
                            positions={positions}
                            spotlightUid={spotlightUid}
                        />

                        {/* Avatars. Clicking one views that participant's screen
                            (the shell gates who may actually see whom), so every
                            avatar but your own is selectable — not just for the
                            teacher. The spotlit avatar gets an amber glow. */}
                        {ordered.map((p) => {
                            const pos = positions.get(p.uid)!;
                            const selectable = p.uid !== state.you.uid;
                            return (
                                <AvatarNode
                                    key={p.uid}
                                    participant={p}
                                    pos={pos}
                                    isYou={p.uid === state.you.uid}
                                    spotlit={p.uid === spotlightUid}
                                    onSelect={
                                        selectable ? actions?.onSelectParticipant : undefined
                                    }
                                />
                            );
                        })}
                    </div>
                </div>

                {/* ── "Run the room" — teacher only ───────────────────── */}
                {isTeacher && (
                    <ControlBar state={state} actions={actions} />
                )}
            </section>

            {/* ── "Live in this lab" side rail ───────────────────────── */}
            <aside className="w-full shrink-0 lg:w-72">
                <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-soft-sm dark:border-slate-700 dark:bg-surface">
                    <div className="border-b border-slate-200/70 px-4 py-3 dark:border-slate-700/70">
                        <h3 className="font-display text-sm font-bold text-gray-900">Live in this lab</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                            {state.participants.length} in the room
                        </p>
                    </div>

                    <div className="flex-1 space-y-5 overflow-y-auto p-4">
                        {/* Raised hands queue. */}
                        <div>
                            <RailHeading
                                icon={<HandIcon className="h-3.5 w-3.5" />}
                                title="Hands up"
                                count={handQueue.length}
                                tone="accent"
                            />
                            {handQueue.length === 0 ? (
                                <p className="text-xs text-slate-400">No one needs help right now.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {handQueue.map((p, i) => (
                                        <li
                                            key={p.uid}
                                            className="flex items-center gap-2 rounded-lg bg-accent-50 px-2 py-1.5 dark:bg-accent-500/10"
                                        >
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-white">
                                                {i + 1}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">
                                                {p.displayName}
                                            </span>
                                            <span className="shrink-0 text-[10px] tabular-nums text-accent-700 dark:text-accent-300">
                                                {handAge(p.handRaisedAt)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Active shares / connections. */}
                        <div>
                            <RailHeading
                                icon={<ShareIcon className="h-3.5 w-3.5" />}
                                title="Sharing now"
                                count={liveShares.length}
                                tone="primary"
                            />
                            {liveShares.length === 0 ? (
                                <p className="text-xs text-slate-400">No active screen shares.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {liveShares.map((s) => (
                                        <li
                                            key={s.key}
                                            className={[
                                                "flex items-start gap-2 rounded-lg border px-2 py-1.5",
                                                s.pinned
                                                    ? "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                                                    : "border-slate-200 dark:border-slate-700",
                                            ].join(" ")}
                                        >
                                            <span
                                                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                                style={{ backgroundColor: s.color }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-medium text-gray-900">
                                                    {s.title}
                                                </p>
                                                <p className="truncate text-[10px] text-slate-500">
                                                    {s.subtitle}
                                                </p>
                                            </div>
                                            {s.pinned && (
                                                <SpotlightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );
}

export default LabMap;

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

/**
 * The SVG layer of connection lines drawn between avatar seats. A line that
 * TOUCHES the spotlit participant (either end) is thickened, fully opaque, and
 * given an amber glow so the room-wide pin reads at a glance over the ordinary
 * peer/view/broadcast traffic.
 */
function ConnectionLayer({
    connections,
    positions,
    spotlightUid,
}: {
    connections: LabConnection[];
    positions: Map<string, Seat>;
    spotlightUid: string | null;
}) {
    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
        >
            {/* Soft amber glow used by spotlight-touching lines. */}
            <defs>
                <filter id="lab-spotlight-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.4" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            {connections.map((c, i) => {
                const a = positions.get(c.fromUid)!;
                const b = positions.get(c.toUid)!;
                const style = CONNECTION_STYLES[c.kind];
                const touchesSpotlight =
                    !!spotlightUid && (c.fromUid === spotlightUid || c.toUid === spotlightUid);
                return (
                    <line
                        key={`${c.fromUid}-${c.toUid}-${c.kind}-${i}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={touchesSpotlight ? CONNECTION_STYLES_SPOTLIGHT.stroke : style.stroke}
                        strokeWidth={touchesSpotlight ? style.width + 1 : style.width}
                        strokeLinecap="round"
                        strokeDasharray={style.dash}
                        // Non-uniform scaling (preserveAspectRatio="none") would
                        // distort stroke widths; vectorEffect keeps them crisp.
                        vectorEffect="non-scaling-stroke"
                        filter={touchesSpotlight ? "url(#lab-spotlight-glow)" : undefined}
                        opacity={touchesSpotlight ? 1 : c.kind === "broadcast" ? 0.5 : 0.75}
                    >
                        {c.kind === "broadcast" && (
                            // Gently animate the broadcast dots outward so the
                            // teacher's one-to-many link reads as "flowing".
                            <animate
                                attributeName="stroke-dashoffset"
                                from="16"
                                to="0"
                                dur="0.9s"
                                repeatCount="indefinite"
                            />
                        )}
                    </line>
                );
            })}
        </svg>
    );
}

/** A single avatar pinned at its seat, coloured by status, with badges. */
function AvatarNode({
    participant,
    pos,
    isYou,
    spotlit = false,
    onSelect,
}: {
    participant: LabParticipant;
    pos: Seat;
    isYou: boolean;
    /** True when this is the teacher's room-wide spotlit participant (amber glow). */
    spotlit?: boolean;
    onSelect?: (uid: string) => void;
}) {
    const style = STATUS_STYLES[participant.status];
    const isTeacher = participant.role === "teacher";
    const handUp = typeof participant.handRaisedAt === "number";
    const clickable = !!onSelect;

    const size = isTeacher ? "h-14 w-14 text-base" : "h-12 w-12 text-sm";

    return (
        <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        >
            <div className="flex flex-col items-center gap-1">
                <div className="relative">
                    {/* Hand-raise flag floats above. */}
                    {handUp && (
                        <span className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-white shadow-soft-sm">
                            <HandIcon className="h-3 w-3" />
                        </span>
                    )}
                    {/* Spotlight badge floats top-left so it never collides with
                        the hand-raise flag (top-right). */}
                    {spotlit && (
                        <span
                            className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-900 shadow-soft-sm"
                            title="Spotlit for the class"
                            aria-hidden
                        >
                            <SpotlightIcon className="h-3 w-3" />
                        </span>
                    )}
                    {/* The avatar chip (initials). Real avatars can swap in here
                        later; initials keep the map self-contained + fast. A
                        spotlit avatar gets an amber ring + glow on top of its
                        status ring so the pin is unmistakable. */}
                    <button
                        type="button"
                        disabled={!clickable}
                        onClick={clickable ? () => onSelect!(participant.uid) : undefined}
                        aria-label={
                            clickable
                                ? `View ${participant.displayName}'s screen — ${style.label}`
                                : `${participant.displayName} — ${style.label}`
                        }
                        title={clickable ? `View ${firstName(participant.displayName)}'s screen` : undefined}
                        className={[
                            "flex items-center justify-center rounded-full font-semibold uppercase tracking-tight text-white shadow-soft",
                            "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-surface",
                            size,
                            spotlit ? "ring-amber-400 shadow-glow-accent" : style.ring,
                            isTeacher
                                ? "bg-gradient-to-br from-primary-600 to-primary-800"
                                : "bg-gradient-to-br from-slate-500 to-slate-700",
                            clickable ? "cursor-pointer transition-transform hover:scale-105" : "cursor-default",
                        ].join(" ")}
                    >
                        {initials(participant.displayName)}
                    </button>
                    {/* Status dot. */}
                    <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-surface ${style.dot}`}
                        aria-hidden
                    />
                </div>

                {/* Name + "you" / teacher tag. */}
                <div className="max-w-[5.5rem] text-center">
                    <p className="truncate text-[11px] font-medium leading-tight text-gray-900">
                        {firstName(participant.displayName)}
                    </p>
                    {(isTeacher || isYou) && (
                        <span
                            className={`mt-0.5 inline-block rounded-full px-1.5 py-px text-[9px] font-semibold ${
                                isTeacher
                                    ? "bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
                                    : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            }`}
                        >
                            {isTeacher ? "Teacher" : "You"}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

/** The teacher-only control bar. Buttons reflect live state and call actions. */
function ControlBar({ state, actions }: { state: LabRoomState; actions?: LabMapActions }) {
    return (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft-sm dark:border-slate-700 dark:bg-surface">
            <div className="flex flex-wrap items-center gap-2">
                <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
                    Run the room
                </span>
                <ControlButton
                    label={state.broadcasting ? "Stop broadcast" : "Broadcast"}
                    icon={<BroadcastIcon className="h-4 w-4" />}
                    active={state.broadcasting}
                    activeTone="accent"
                    onClick={actions?.onToggleBroadcast}
                />
                <ControlButton
                    label="View screen"
                    icon={<EyeIcon className="h-4 w-4" />}
                    onClick={actions?.onViewScreen}
                />
                <ControlButton
                    label="Remote assist"
                    icon={<CursorIcon className="h-4 w-4" />}
                    onClick={actions?.onRemoteAssist}
                />
                <div className="ml-auto" />
                <ControlButton
                    label={state.recording ? "Stop recording" : "Record"}
                    icon={<RecordIcon className="h-4 w-4" />}
                    active={state.recording}
                    activeTone="danger"
                    onClick={actions?.onToggleRecording}
                />
            </div>
        </div>
    );
}

/** A control-bar button. `active` flips it to a filled, tinted state. */
function ControlButton({
    label,
    icon,
    active = false,
    activeTone = "primary",
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    active?: boolean;
    activeTone?: "primary" | "accent" | "danger";
    onClick?: () => void;
}) {
    const activeClasses =
        activeTone === "danger"
            ? "bg-danger-500 text-white shadow-glow-danger hover:bg-danger-600"
            : activeTone === "accent"
            ? "bg-accent-500 text-white shadow-glow-accent hover:bg-accent-600"
            : "bg-primary-600 text-white shadow-glow-primary hover:bg-primary-700";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            aria-pressed={active}
            className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active
                    ? activeClasses
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700",
            ].join(" ")}
        >
            {icon}
            {/* Labels collapse to icon-only on the narrowest screens. */}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

/** A small "LIVE"/"REC"/spotlight pill with an optional pulsing dot. */
function LivePill({
    label,
    tone,
    pulse = false,
}: {
    label: string;
    tone: "accent" | "danger" | "spotlight";
    pulse?: boolean;
}) {
    const toneClasses =
        tone === "danger"
            ? "bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-300"
            : tone === "spotlight"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              : "bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300";
    const dotClasses =
        tone === "danger" ? "bg-danger-500" : tone === "spotlight" ? "bg-amber-500" : "bg-accent-500";
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneClasses}`}
        >
            <span className="relative flex h-1.5 w-1.5">
                {pulse && (
                    <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotClasses}`}
                    />
                )}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotClasses}`} />
            </span>
            {label}
        </span>
    );
}

/** The status colour legend in the map header. */
function Legend() {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(Object.keys(STATUS_STYLES) as LabStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[s].dot}`} />
                    {STATUS_STYLES[s].label}
                </span>
            ))}
        </div>
    );
}

/** A section heading inside the side rail with a count chip. */
function RailHeading({
    icon,
    title,
    count,
    tone,
}: {
    icon: React.ReactNode;
    title: string;
    count: number;
    tone: "primary" | "accent";
}) {
    const chip =
        tone === "accent"
            ? "bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
            : "bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300";
    return (
        <div className="mb-2 flex items-center gap-1.5">
            <span className="text-slate-400">{icon}</span>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h4>
            <span className={`ml-auto rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${chip}`}>
                {count}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

/** A summarised "share" row for the rail, derived from connections. */
interface ShareRow {
    key: string;
    title: string;
    subtitle: string;
    color: string;
    /** Spotlight row — gets an amber tint + a small pin so it stands out. */
    pinned?: boolean;
}

/**
 * Collapse the connection list into human "who → whom" rows for the rail:
 *   - the active SPOTLIGHT (if any) floats to the top as a pinned amber row,
 *   - all `broadcast` lines → a single "Teacher → the room" row,
 *   - each `view` → "Name → Teacher" (a student showing the teacher, OR the
 *     teacher watching a student — the state de-dupes the pair to one line),
 *   - peer shares de-duped (a ↔ b appears once).
 *
 * `spotlightUid` is the teacher's room-wide pin; we surface it explicitly even
 * if its media line is collapsed elsewhere, so the rail always names who the
 * room is being asked to look at.
 */
function summariseShares(
    connections: LabConnection[],
    byUid: Map<string, LabParticipant>,
    spotlightUid: string | null
): ShareRow[] {
    const rows: ShareRow[] = [];
    const name = (uid: string) => byUid.get(uid)?.displayName ?? "Someone";

    if (spotlightUid && byUid.has(spotlightUid)) {
        rows.push({
            key: `spotlight-${spotlightUid}`,
            title: `${name(spotlightUid)} → the class`,
            subtitle: "Spotlit by the teacher",
            color: CONNECTION_STYLES_SPOTLIGHT.stroke,
            pinned: true,
        });
    }

    const hasBroadcast = connections.some((c) => c.kind === "broadcast");
    if (hasBroadcast) {
        const teacher = connections.find((c) => c.kind === "broadcast");
        rows.push({
            key: "broadcast",
            title: `${teacher ? name(teacher.fromUid) : "Teacher"} → the room`,
            subtitle: "Live broadcast",
            color: CONNECTION_STYLES.broadcast.stroke,
        });
    }

    for (const c of connections) {
        if (c.kind === "view") {
            rows.push({
                key: `view-${c.fromUid}`,
                title: `${name(c.fromUid)} → Teacher`,
                subtitle: "Sharing to teacher",
                color: CONNECTION_STYLES.view.stroke,
            });
        }
    }

    const seenPeer = new Set<string>();
    for (const c of connections) {
        if (c.kind !== "peer") continue;
        const pairKey = [c.fromUid, c.toUid].sort().join("|");
        if (seenPeer.has(pairKey)) continue;
        seenPeer.add(pairKey);
        rows.push({
            key: `peer-${pairKey}`,
            title: `${name(c.fromUid)} → ${name(c.toUid)}`,
            subtitle: "Peer share",
            color: CONNECTION_STYLES.peer.stroke,
        });
    }

    return rows;
}

/** Up to two initials from a display name. */
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Just the first word of a name (the map labels stay short). */
function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
}

/** A compact "Xm" / "Xs" age for a hand-raise epoch. */
function handAge(handRaisedAt?: number | null): string {
    if (typeof handRaisedAt !== "number") return "";
    const secs = Math.max(0, Math.round((Date.now() - handRaisedAt) / 1000));
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m`;
}

// ─────────────────────────────────────────────────────────────────────
// Inline icons (stroke-based, currentColor) — no icon-lib dependency.
// ─────────────────────────────────────────────────────────────────────

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

function ShareIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18v11H3z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 20h8M12 16v4" />
        </svg>
    );
}

function BroadcastIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="2" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M6 6a8 8 0 000 12M18 6a8 8 0 010 12" />
        </svg>
    );
}

function EyeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
        </svg>
    );
}

function CursorIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 7-6 2-2 6-6-15z" />
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
