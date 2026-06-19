"use client";

import { useMemo, useRef, useState } from "react";
import { isLabAgentIdentity, labAgentIdentity, labBaseUid } from "@digimine/types";
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
    /** Start/stop the session recording (consent-gated server-side). */
    onToggleRecording?: () => void;
    /**
     * VIEW a participant's screen (opens the view stage). The room shell's
     * `viewScreen` enforces who may actually see whom (a teacher → any student; a
     * student → a peer sharing to them or the spotlit one).
     */
    onSelectParticipant?: (uid: string) => void;
    /** TEACHER: spotlight a participant for the whole room (or pass null to clear). */
    onSpotlight?: (uid: string | null) => void;
    /** TEACHER: request remote control of a participant's desktop agent. */
    onRemoteControl?: (uid: string) => void;
    /** TEACHER: force-end a participant's screen share. */
    onEndShare?: (uid: string) => void;
    /** STUDENT: share MY screen to a specific peer (peer share). */
    onShareToPeer?: (uid: string) => void;
}

export interface LabMapProps {
    /** The denormalized room snapshot to render. The single source of truth. */
    state: LabRoomState;
    /** Optional control-bar / avatar callbacks (no-ops if omitted). */
    actions?: LabMapActions;
    /** Extra classes on the outer wrapper. */
    className?: string;
    /** Whether student↔student peer share is on (gates the avatar "share to them" action). */
    allowPeerShare?: boolean;
    /**
     * The ACTIVE remote-control link (controller → controllee), if any. The
     * caller passes it from the control plane; the map draws it as a prominent
     * indigo "string" with a light pulse travelling controller → controllee so
     * the direction of control is unmistakable. Endpoints are base-uid-remapped
     * (an agent identity collapses onto its human avatar) and only drawn when
     * both ends are placed on the map.
     */
    controlEdge?: { fromUid: string; toUid: string } | null;
    /**
     * Optional CONTROLLED store for the dragged-avatar layout (uid → % seat).
     * Lift it to the parent so a custom arrangement survives the map panel
     * remounting (e.g. when it's maximized). Omit for self-contained local state.
     */
    dragPositions?: Record<string, { x: number; y: number }>;
    onDragPositionsChange?: React.Dispatch<
        React.SetStateAction<Record<string, { x: number; y: number }>>
    >;
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

/** Indigo glow for the active remote-control "string" + its travelling light. */
const CONTROL_EDGE_STYLE = { stroke: "#6366f1", light: "#a5b4fc" }; // indigo-500 / indigo-300

/**
 * Component-scoped CSS injected once via a <style> element. Two effects:
 *   • `lab-float` — a slow ~4s vertical bob applied to each avatar's INNER
 *     content (never the absolutely-positioned seat wrapper, so it never fights
 *     the seat coordinates); avatars stagger via an inline `animationDelay`.
 *   • `lab-control-dash` — a subtle travelling dash on the active control string.
 * Both honour `prefers-reduced-motion`.
 */
const LAB_MAP_CSS = `
@keyframes lab-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.lab-float { animation: lab-float 4s ease-in-out infinite; will-change: transform; }
/* While an avatar is being dragged, freeze its bob so it doesn't fight the
   pointer; the seat wrapper carries this class during a drag. */
.lab-dragging .lab-float { animation: none; }
@keyframes lab-control-dash {
  to { stroke-dashoffset: -24; }
}
.lab-control-dash { animation: lab-control-dash 1.4s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .lab-float { animation: none; }
  .lab-control-dash { animation: none; }
}
`;

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

export function LabMap({
    state,
    actions,
    className = "",
    allowPeerShare = false,
    controlEdge = null,
    dragPositions,
    onDragPositionsChange,
}: LabMapProps) {
    const isTeacher = state.you.role === "teacher";
    // The avatar action menu: which participant + where to anchor the popover.
    // Clicking an avatar opens it; the menu lists the actions available to YOU
    // for THAT participant (view / spotlight / remote control / end share, or —
    // for a student — share your screen to them).
    const [menu, setMenu] = useState<{ uid: string; x: number; y: number } | null>(null);
    // Draggable canvas. `dragPos` holds per-uid CUSTOM positions (% of the seat
    // field) a user has dragged an avatar to; when present for a uid it overrides
    // the deterministic seat grid, and because the SVG strings + control light
    // both derive from the merged `positions`, they follow a dragged avatar LIVE.
    // It's local-only view state, so it never moves anyone else's map. The field
    // ref converts pointer px → %.
    const fieldRef = useRef<HTMLDivElement | null>(null);
    // `dragPos` is controlled by the parent when wired (so it survives a panel
    // remount), else falls back to self-contained local state.
    const [internalDragPos, setInternalDragPos] = useState<
        Record<string, { x: number; y: number }>
    >({});
    const dragPos = dragPositions ?? internalDragPos;
    const setDragPos = onDragPositionsChange ?? setInternalDragPos;
    // The uid currently being dragged (null = none), so we can pause its float
    // and suppress the click→menu when the pointer actually moved.
    const [draggingUid, setDraggingUid] = useState<string | null>(null);
    // The teacher's room-wide pin (if any), honoured only while present. Drives
    // the amber glow on the spotlit avatar + its connection lines, and a rail row.
    const spotlightUid = state.spotlightUid ?? null;

    // ONE AVATAR PER STUDENT. A student's desktop AGENT joins as a SEPARATE
    // participant (uid + agent suffix); we never draw it as its own avatar.
    // Instead we index only the HUMAN participants for the map/rail, and remember
    // which humans have an agent present so their single avatar can show a
    // "Desktop connected" badge.
    const humans = useMemo(
        () => state.participants.filter((p) => !isLabAgentIdentity(p.uid)),
        [state.participants]
    );

    // Base uids of every student whose desktop agent is in the room. Built off
    // the agent identities so the single human avatar can carry the indicator.
    // We confirm via `labAgentIdentity` that the present identity is exactly the
    // base uid's agent (not a coincidental suffix), then store the base uid.
    const desktopUids = useMemo(() => {
        const present = new Set(state.participants.map((p) => p.uid));
        const set = new Set<string>();
        for (const p of state.participants) {
            if (!isLabAgentIdentity(p.uid)) continue;
            const base = labBaseUid(p.uid);
            if (present.has(labAgentIdentity(base))) set.add(base);
        }
        return set;
    }, [state.participants]);

    // Index human participants by uid and pre-compute every avatar's seat
    // position once per render; the SVG layer and the rail both read from this.
    const { seatPositions, byUid, ordered } = useMemo(() => {
        const byUid = new Map<string, LabParticipant>();
        for (const p of humans) byUid.set(p.uid, p);

        // Teacher first, then students ordered by their stable seat index so
        // the grid is reproducible regardless of array order.
        const teacher = humans.find((p) => p.role === "teacher");
        const students = humans
            .filter((p) => p.role !== "teacher")
            .sort((a, b) => a.seat - b.seat);
        const ordered = teacher ? [teacher, ...students] : students;

        const seatPositions = new Map<string, Seat>();
        let studentIndex = 0;
        for (const p of ordered) {
            seatPositions.set(p.uid, seatPosition(p, p.role === "teacher" ? 0 : studentIndex));
            if (p.role !== "teacher") studentIndex += 1;
        }
        return { seatPositions, byUid, ordered };
    }, [humans]);

    // The AUTHORITATIVE positions the whole map reads from: a dragged avatar's
    // custom `dragPos[uid]` overrides its grid seat, everything else falls back
    // to `seatPosition(...)`. The SVG strings + control light derive from this,
    // so they track a dragged avatar live as it moves.
    const positions = useMemo(() => {
        const merged = new Map<string, Seat>(seatPositions);
        for (const [uid, p] of Object.entries(dragPos)) {
            if (merged.has(uid)) merged.set(uid, p);
        }
        return merged;
    }, [seatPositions, dragPos]);

    // REMAP connections onto the human avatars: an agent endpoint collapses onto
    // its student (so "agent → teacher" reads as "student → teacher"). Drop
    // self-loops + endpoints we can't place, then de-dupe by from>to:kind.
    const drawableConnections = useMemo(() => {
        const out: LabConnection[] = [];
        const seen = new Set<string>();
        for (const c of state.connections) {
            const fromUid = isLabAgentIdentity(c.fromUid) ? labBaseUid(c.fromUid) : c.fromUid;
            const toUid = isLabAgentIdentity(c.toUid) ? labBaseUid(c.toUid) : c.toUid;
            if (fromUid === toUid) continue; // self-loop after remap
            if (!positions.has(fromUid) || !positions.has(toUid)) continue;
            const key = `${fromUid}>${toUid}:${c.kind}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ ...c, fromUid, toUid });
        }
        return out;
    }, [state.connections, positions]);

    // The active remote-control edge, base-uid-remapped and only kept when both
    // ends are placed on the map (controller → controllee).
    const drawableControlEdge = useMemo(() => {
        if (!controlEdge) return null;
        const fromUid = isLabAgentIdentity(controlEdge.fromUid)
            ? labBaseUid(controlEdge.fromUid)
            : controlEdge.fromUid;
        const toUid = isLabAgentIdentity(controlEdge.toUid)
            ? labBaseUid(controlEdge.toUid)
            : controlEdge.toUid;
        if (fromUid === toUid) return null;
        if (!positions.has(fromUid) || !positions.has(toUid)) return null;
        return { fromUid, toUid };
    }, [controlEdge, positions]);

    // The raised-hand queue — oldest hand first (what the teacher answers).
    // Humans only, so an agent presence never sneaks into the queue.
    const handQueue = useMemo(
        () =>
            humans
                .filter((p) => typeof p.handRaisedAt === "number")
                .sort((a, b) => (a.handRaisedAt as number) - (b.handRaisedAt as number)),
        [humans]
    );

    // The active shares, summarised for the rail (one row per connection, with
    // the broadcast collapsed into a single "to the room" line, and the
    // spotlight floated to the top when one is active). Reads `drawableConnections`,
    // which is already base-uid-remapped, so the rail names students not agents.
    const liveShares = useMemo(
        () => summariseShares(drawableConnections, byUid, spotlightUid),
        [drawableConnections, byUid, spotlightUid]
    );

    // ── Draggable canvas (teacher only) ──────────────────────────────
    // One pointer-drag-in-progress record. We track total travel so a
    // (nearly) stationary pointer reads as a CLICK (opens the action menu)
    // while real movement is a DRAG (repositions, no menu).
    const dragRef = useRef<{
        uid: string;
        pointerId: number;
        startX: number;
        startY: number;
        moved: boolean;
    } | null>(null);
    // Set true by pointerup when the gesture was a real drag, so the click that
    // browsers synthesize right after is swallowed (no menu pops on drop).
    const suppressClickRef = useRef(false);

    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    // Translate a viewport pointer to a % position inside the seat field.
    const pointerToPercent = (clientX: number, clientY: number): { x: number; y: number } | null => {
        const rect = fieldRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        // Clamp with a margin so the avatar chip + its name label / badges
        // (which extend past the centre point) stay inside the field instead of
        // being cut off by its `overflow-hidden`. Extra room at the bottom for
        // the name + role/hand badges that hang below the chip.
        return {
            x: clamp(((clientX - rect.left) / rect.width) * 100, 6, 94),
            y: clamp(((clientY - rect.top) / rect.height) * 100, 9, 88),
        };
    };

    const onAvatarPointerDown = (uid: string, e: React.PointerEvent) => {
        // Don't hijack non-primary buttons (e.g. right-click context menus).
        if (e.button !== 0) return;
        // Fresh gesture: clear any stale click-suppression from a prior drag
        // whose synthetic click never arrived (e.g. dragging a non-clickable
        // avatar like the teacher's own).
        suppressClickRef.current = false;
        dragRef.current = {
            uid,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
        };
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* setPointerCapture can throw if the pointer is already gone */
        }
    };

    const onAvatarPointerMove = (uid: string, e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d || d.uid !== uid || d.pointerId !== e.pointerId) return;
        const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
        if (!d.moved && dist < 4) return; // below the click/drag threshold
        if (!d.moved) {
            d.moved = true;
            setDraggingUid(uid);
        }
        const pct = pointerToPercent(e.clientX, e.clientY);
        if (pct) {
            // Update only this uid's entry so we don't thrash the whole map.
            setDragPos((prev) => ({ ...prev, [uid]: pct }));
        }
    };

    const onAvatarPointerUp = (uid: string, e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d || d.uid !== uid || d.pointerId !== e.pointerId) return;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            /* releasePointerCapture can throw if capture was already lost */
        }
        const wasDrag = d.moved;
        dragRef.current = null;
        if (wasDrag) setDraggingUid(null);
        // Swallow the synthetic click that follows a drop so it doesn't open the
        // action menu — but ONLY for avatars that actually open a menu. A
        // non-selectable avatar (your own) fires no click to clear the flag, so
        // setting it here would eat the NEXT genuine click on another avatar.
        const selectable = uid !== state.you.uid;
        suppressClickRef.current = wasDrag && selectable;
    };

    // Touch/system interruptions fire pointercancel, not pointerup — mirror the
    // teardown so a drag can't get stuck (frozen float, raised z, stale refs).
    const onAvatarPointerCancel = (uid: string, e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d || d.uid !== uid || d.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setDraggingUid(null);
        suppressClickRef.current = false;
    };

    // Gate the avatar click: if the just-finished gesture was a drag, eat the
    // click; otherwise open the menu as before.
    const onAvatarClick = (uid: string, anchor: { x: number; y: number }) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        setMenu({ uid, ...anchor });
    };

    const hasCustomLayout = Object.keys(dragPos).length > 0;
    const resetLayout = () => {
        setDragPos({});
        setDraggingUid(null);
    };

    return (
        <div className={`flex flex-col gap-4 lg:flex-row ${className}`}>
            {/* Local keyframes for the gentle avatar "float" (a slow vertical
                bob), the travelling control-light dash, and a reduced-motion
                escape hatch. Scoped by the `lab-float` / `lab-control` class
                names so they don't leak into the rest of the app. */}
            <style>{LAB_MAP_CSS}</style>
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
                        <div className="flex items-center gap-3">
                            {/* Clear any dragged layout back to the seat grid.
                                Only shown once something was moved. */}
                            {hasCustomLayout && (
                                <button
                                    type="button"
                                    onClick={resetLayout}
                                    className="text-[11px] font-semibold text-primary-700 hover:underline dark:text-primary-300"
                                    title="Snap every avatar back to its seat"
                                >
                                    Reset layout
                                </button>
                            )}
                            <Legend />
                        </div>
                    </div>

                    {/* The seat field. A fixed aspect keeps the % geometry sane;
                        it scrolls on very short viewports rather than squashing.
                        The ref is the coordinate frame the teacher's drag maps
                        pointer px → % against. */}
                    <div ref={fieldRef} className="relative aspect-[16/10] w-full">
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
                            controlEdge={drawableControlEdge}
                        />

                        {/* Avatars. Clicking one views that participant's screen
                            (the shell gates who may actually see whom), so every
                            avatar but your own is selectable — not just for the
                            teacher. The spotlit avatar gets an amber glow. */}
                        {ordered.map((p, i) => {
                            const pos = positions.get(p.uid)!;
                            // The menu (View/Spotlight/Control/…) opens for any
                            // avatar but your own — unchanged.
                            const selectable = p.uid !== state.you.uid;
                            // Anyone may drag EVERY avatar (incl. their own) to
                            // rearrange their own view — `dragPos` is local-only
                            // state, so it never moves anyone else's map.
                            const draggable = true;
                            return (
                                <AvatarNode
                                    key={p.uid}
                                    participant={p}
                                    pos={pos}
                                    index={i}
                                    isYou={p.uid === state.you.uid}
                                    spotlit={p.uid === spotlightUid}
                                    hasDesktop={desktopUids.has(p.uid)}
                                    menuOpen={menu?.uid === p.uid}
                                    dragging={draggingUid === p.uid}
                                    draggable={draggable}
                                    onOpenMenu={selectable ? onAvatarClick : undefined}
                                    onPointerDown={
                                        draggable
                                            ? (e) => onAvatarPointerDown(p.uid, e)
                                            : undefined
                                    }
                                    onPointerMove={
                                        draggable
                                            ? (e) => onAvatarPointerMove(p.uid, e)
                                            : undefined
                                    }
                                    onPointerUp={
                                        draggable
                                            ? (e) => onAvatarPointerUp(p.uid, e)
                                            : undefined
                                    }
                                    onPointerCancel={
                                        draggable
                                            ? (e) => onAvatarPointerCancel(p.uid, e)
                                            : undefined
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
                            {humans.length} in the room
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

            {/* Per-avatar action menu (click an avatar). Rendered position:fixed
                so it never clips the map's rounded/overflow-hidden frame. */}
            {menu && (
                <AvatarActionMenu
                    participant={byUid.get(menu.uid)}
                    anchor={{ x: menu.x, y: menu.y }}
                    isTeacher={isTeacher}
                    isSharing={state.connections.some(
                        (c) =>
                            (isLabAgentIdentity(c.fromUid) ? labBaseUid(c.fromUid) : c.fromUid) ===
                            menu.uid
                    )}
                    isSpotlit={spotlightUid === menu.uid}
                    allowPeerShare={allowPeerShare}
                    actions={actions}
                    onClose={() => setMenu(null)}
                />
            )}
        </div>
    );
}

export default LabMap;

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

/**
 * The quadratic-bézier path between two seats that reads as a soft hanging
 * string: the control point is the segment midpoint pushed PERPENDICULAR to the
 * segment so the curve sags/droops gently (a catenary, not a hard line). The
 * sag is a fixed amount of the normalized 0..100 space, scaled down a touch for
 * very short segments so neighbours don't billow.
 */
/**
 * viewBox width for the 16:10 stage (height = 100). Rendering the SVG at this
 * width (x mapped 0..100 → 0..160) makes its units ISOTROPIC — 1 unit is the same
 * number of pixels in x and y — so `preserveAspectRatio="none"` no longer stretches
 * the curve. That non-uniform stretch was exactly what made the strings look
 * jagged + slanted.
 */
const LAB_SVG_W = 160;
/** Seat x (0..100, the same % the avatar is positioned at) → isotropic SVG x. */
function seatX(x: number): number {
    return (x / 100) * LAB_SVG_W;
}

/**
 * A hanging-rope path between two avatar seats. The endpoints sit at the avatar
 * CENTRES (hidden beneath the avatars, which are drawn on top), so the visible
 * string emerges from each avatar's rim — it reads as a cord ATTACHED to both,
 * not a line on the canvas. The midpoint is pushed straight DOWN (gravity)
 * proportional to the span, so it sags like a real cord. Computed in the isotropic
 * 160×100 space so the curve is smooth + symmetric.
 */
function stringPath(a: Seat, b: Seat): string {
    const ax = seatX(a.x);
    const bx = seatX(b.x);
    const span = Math.hypot(bx - ax, b.y - a.y);
    // Longer spans droop more (a real cord), clamped so it never gets silly.
    const sag = Math.min(20, Math.max(5, span * 0.18));
    const mx = (ax + bx) / 2;
    const my = (a.y + b.y) / 2 + sag;
    return `M ${ax} ${a.y} Q ${mx} ${my} ${bx} ${b.y}`;
}

/**
 * The SVG layer of connection "strings" drawn between avatar seats. A string
 * that TOUCHES the spotlit participant (either end) is thickened, fully opaque,
 * and given an amber glow so the room-wide pin reads at a glance over the
 * ordinary peer/view/broadcast traffic. When a remote-control edge is active it
 * is drawn most prominently of all (indigo glow) with a light pulse travelling
 * controller → controllee so the direction of control is unmistakable.
 */
function ConnectionLayer({
    connections,
    positions,
    spotlightUid,
    controlEdge,
}: {
    connections: LabConnection[];
    positions: Map<string, Seat>;
    spotlightUid: string | null;
    controlEdge: { fromUid: string; toUid: string } | null;
}) {
    const controlPath = controlEdge
        ? stringPath(positions.get(controlEdge.fromUid)!, positions.get(controlEdge.toUid)!)
        : null;

    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 160 100"
        >
            {/* Soft amber glow (spotlight) + indigo glow (control). */}
            <defs>
                <filter id="lab-spotlight-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.4" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id="lab-control-glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="1.8" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            {connections.map((c) => {
                const a = positions.get(c.fromUid)!;
                const b = positions.get(c.toUid)!;
                const style = CONNECTION_STYLES[c.kind];
                const d = stringPath(a, b);
                const touchesSpotlight =
                    !!spotlightUid && (c.fromUid === spotlightUid || c.toUid === spotlightUid);
                return (
                    <path
                        key={`${c.fromUid}-${c.toUid}-${c.kind}`}
                        d={d}
                        fill="none"
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
                            // Gently animate the broadcast dots along the string so
                            // the teacher's one-to-many link reads as "flowing".
                            <animate
                                attributeName="stroke-dashoffset"
                                from="16"
                                to="0"
                                dur="0.9s"
                                repeatCount="indefinite"
                            />
                        )}
                    </path>
                );
            })}

            {/* The ACTIVE remote-control string — drawn last so it sits on top.
                Brighter + thicker indigo with a glow, a slow travelling dash, and
                a glowing dot that repeatedly runs controller → controllee. */}
            {controlEdge && controlPath && (
                <g filter="url(#lab-control-glow)">
                    {/* The prominent string itself. */}
                    <path
                        d={controlPath}
                        fill="none"
                        stroke={CONTROL_EDGE_STYLE.stroke}
                        strokeWidth={3}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.9}
                    />
                    {/* A subtle dash crawling controller → controllee. */}
                    <path
                        className="lab-control-dash"
                        d={controlPath}
                        fill="none"
                        stroke={CONTROL_EDGE_STYLE.light}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeDasharray="2 6"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.95}
                    />
                    {/* The travelling light: a glowing dot that runs FROM the
                        controller end TO the controllee along the exact same
                        curve, so the direction reads unmistakably. */}
                    <circle r={1.7} fill="#ffffff" opacity={0.95}>
                        <animateMotion dur="1.4s" repeatCount="indefinite" path={controlPath} />
                    </circle>
                    <circle r={3} fill={CONTROL_EDGE_STYLE.light} opacity={0.4}>
                        <animateMotion dur="1.4s" repeatCount="indefinite" path={controlPath} />
                    </circle>
                </g>
            )}
        </svg>
    );
}

/** A single avatar pinned at its seat, coloured by status, with badges. */
function AvatarNode({
    participant,
    pos,
    index,
    isYou,
    spotlit = false,
    hasDesktop = false,
    menuOpen = false,
    dragging = false,
    draggable = false,
    onOpenMenu,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
}: {
    participant: LabParticipant;
    pos: Seat;
    /** Seat index in render order — staggers the float so avatars bob out of sync. */
    index: number;
    isYou: boolean;
    /** True when this is the teacher's room-wide spotlit participant (amber glow). */
    spotlit?: boolean;
    /** True when this student's desktop AGENT is in the room (shows a monitor badge). */
    hasDesktop?: boolean;
    /** True while this avatar's action menu is open (keeps it visually active). */
    menuOpen?: boolean;
    /** True while THIS avatar is actively being dragged (pauses the float). */
    dragging?: boolean;
    /** True when the local user (the teacher) may drag this avatar. */
    draggable?: boolean;
    /** Open the action menu for this avatar, anchored at the given viewport point. */
    onOpenMenu?: (uid: string, anchor: { x: number; y: number }) => void;
    /** Teacher drag: pointer handlers wired only when `draggable`. */
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerMove?: (e: React.PointerEvent) => void;
    onPointerUp?: (e: React.PointerEvent) => void;
    onPointerCancel?: (e: React.PointerEvent) => void;
}) {
    const style = STATUS_STYLES[participant.status];
    const isTeacher = participant.role === "teacher";
    const handUp = typeof participant.handRaisedAt === "number";
    const clickable = !!onOpenMenu;
    // The button is interactive (not `disabled`) whenever it can be clicked OR
    // dragged — a disabled button swallows the pointer events the drag needs.
    const interactive = clickable || draggable;

    const size = isTeacher ? "h-14 w-14 text-base" : "h-12 w-12 text-sm";

    return (
        <div
            // The absolutely-positioned SEAT wrapper. It only owns the seat
            // coordinates — never animated — so the float never fights geometry.
            // `lab-dragging` freezes the inner float while this avatar is dragged.
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${dragging ? "lab-dragging z-20" : ""}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        >
            {/* INNER float wrapper: a gentle, staggered vertical bob. */}
            <div
                className="lab-float flex flex-col items-center gap-1"
                style={{ animationDelay: `${(index % 6) * 0.5}s` }}
            >
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
                        disabled={!interactive}
                        onClick={
                            clickable
                                ? (e) => {
                                      const r = e.currentTarget.getBoundingClientRect();
                                      onOpenMenu!(participant.uid, {
                                          x: r.left + r.width / 2,
                                          y: r.bottom,
                                      });
                                  }
                                : undefined
                        }
                        // Teacher drag (pointer-capture based). Wired only when
                        // `draggable`; `touch-none` lets a touch drag the avatar
                        // instead of scrolling the page.
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={
                            clickable
                                ? `Actions for ${participant.displayName} — ${style.label}`
                                : `${participant.displayName} — ${style.label}`
                        }
                        title={clickable ? `Actions for ${firstName(participant.displayName)}` : undefined}
                        className={[
                            "flex items-center justify-center rounded-full font-semibold uppercase tracking-tight text-white shadow-soft",
                            "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-surface",
                            size,
                            draggable ? "touch-none" : "",
                            spotlit
                                ? "ring-amber-400 shadow-glow-accent"
                                : menuOpen
                                  ? "ring-primary-500"
                                  : style.ring,
                            isTeacher
                                ? "bg-gradient-to-br from-primary-600 to-primary-800"
                                : "bg-gradient-to-br from-slate-500 to-slate-700",
                            // Cursor: grabbing while dragged, grab when draggable,
                            // pointer when only clickable, default otherwise.
                            dragging
                                ? "cursor-grabbing"
                                : draggable
                                  ? "cursor-grab transition-transform hover:scale-105"
                                  : clickable
                                    ? "cursor-pointer transition-transform hover:scale-105"
                                    : "cursor-default",
                        ].join(" ")}
                    >
                        {initials(participant.displayName)}
                    </button>
                    {/* Status dot (bottom-right). */}
                    <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-surface ${style.dot}`}
                        aria-hidden
                    />
                    {/* Desktop-connected indicator (bottom-LEFT, indigo): the
                        student's desktop agent is in the room, so they can be
                        remote-controlled. This is a BADGE on the single avatar,
                        not a second "Desktop" avatar. */}
                    {hasDesktop && (
                        <span
                            className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-indigo-500 text-white shadow-soft-sm dark:border-surface"
                            title="Desktop connected"
                            aria-hidden
                        >
                            <MonitorIcon className="h-2.5 w-2.5" />
                        </span>
                    )}
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

/**
 * The per-avatar action menu. Opened by clicking an avatar; lists exactly the
 * actions the local user can take on THAT participant right now. Rendered
 * position:fixed at the click anchor so it escapes the map's overflow-hidden
 * frame, with a full-screen backdrop that closes it on an outside click.
 *
 *   TEACHER → student : View screen · Spotlight · Remote control · End share
 *   STUDENT → peer    : View screen · Share my screen to them (when peer-share on)
 */
function AvatarActionMenu({
    participant,
    anchor,
    isTeacher,
    isSharing,
    isSpotlit,
    allowPeerShare,
    actions,
    onClose,
}: {
    participant: LabParticipant | undefined;
    anchor: { x: number; y: number };
    isTeacher: boolean;
    isSharing: boolean;
    isSpotlit: boolean;
    allowPeerShare: boolean;
    actions?: LabMapActions;
    onClose: () => void;
}) {
    if (!participant) return null;
    const uid = participant.uid;
    const targetIsTeacher = participant.role === "teacher";
    // The menu now always acts on the (human) student — agent identities never
    // render their own avatar, so there is no separate "Desktop agent" target.
    const sharing = isSharing;

    type Item = {
        key: string;
        label: string;
        icon: React.ReactNode;
        tone?: "danger";
        run: () => void;
    };
    // Run an action then close. Optional-chained so a missing callback is a safe
    // no-op (the push conditions already gate availability).
    const run = (fn: () => void) => () => {
        fn();
        onClose();
    };
    const items: Item[] = [];

    // VIEW — available when the target is sharing something (the shell re-checks
    // who may actually see whom).
    if (sharing && actions?.onSelectParticipant) {
        items.push({
            key: "view",
            label: "View screen",
            icon: <EyeIcon className="h-4 w-4" />,
            run: run(() => actions?.onSelectParticipant?.(uid)),
        });
    }

    if (isTeacher) {
        if (actions?.onSpotlight) {
            items.push({
                key: "spotlight",
                label: isSpotlit ? "Remove spotlight" : "Spotlight to class",
                icon: <SpotlightIcon className="h-4 w-4" />,
                run: run(() => actions?.onSpotlight?.(isSpotlit ? null : uid)),
            });
        }
        // Remote control needs the student's DESKTOP AGENT (a browser tab can't
        // be OS-controlled). We always show "Request remote control" on the
        // student; the control plane prompts them to connect their desktop if it
        // isn't already, or arms control directly if it is.
        if (!targetIsTeacher && actions?.onRemoteControl) {
            items.push({
                key: "control",
                label: "Request remote control",
                icon: <CursorIcon className="h-4 w-4" />,
                run: run(() => actions?.onRemoteControl?.(uid)),
            });
        }
        if (sharing && actions?.onEndShare) {
            items.push({
                key: "endshare",
                label: "End their share",
                icon: <StopSquareIcon className="h-4 w-4" />,
                tone: "danger",
                run: run(() => actions?.onEndShare?.(uid)),
            });
        }
    } else if (allowPeerShare && !targetIsTeacher && actions?.onShareToPeer) {
        items.push({
            key: "sharepeer",
            label: "Share my screen to them",
            icon: <ShareIcon className="h-4 w-4" />,
            run: run(() => actions?.onShareToPeer?.(uid)),
        });
    }

    // Clamp the popover into the viewport.
    const W = 224;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const left = Math.max(8, Math.min(anchor.x - W / 2, vw - W - 8));
    const top = anchor.y + 8;

    return (
        <>
            {/* Backdrop: a click anywhere dismisses the menu. */}
            <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
            <div
                role="menu"
                aria-label={`Actions for ${participant.displayName}`}
                className="fixed z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-surface"
                style={{ left, top, width: W }}
            >
                <div className="px-2.5 py-1.5">
                    <p className="truncate text-xs font-bold text-gray-900">
                        {participant.displayName}
                    </p>
                    <p className="text-[10px] text-slate-500">
                        {STATUS_STYLES[participant.status].label}
                        {targetIsTeacher ? " · Teacher" : ""}
                    </p>
                </div>
                <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
                {items.length === 0 ? (
                    <p className="px-2.5 py-2 text-[11px] text-slate-400">
                        {targetIsTeacher
                            ? "The teacher's broadcast shows on the main stage."
                            : isTeacher
                              ? "Ask them to share, or to connect their desktop agent for remote control."
                              : "Nothing to do until they share or raise a hand."}
                    </p>
                ) : (
                    items.map((it) => (
                        <button
                            key={it.key}
                            type="button"
                            role="menuitem"
                            onClick={it.run}
                            className={[
                                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
                                it.tone === "danger"
                                    ? "text-danger-600 hover:bg-danger-50 dark:text-danger-300 dark:hover:bg-danger-500/10"
                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60",
                            ].join(" ")}
                        >
                            <span className={it.tone === "danger" ? "text-danger-500" : "text-slate-400"}>
                                {it.icon}
                            </span>
                            {it.label}
                        </button>
                    ))
                )}
            </div>
        </>
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
                <span className="hidden px-1 text-[11px] text-slate-400 md:inline">
                    Tip: click a student to view, spotlight, remote-control or end their share.
                </span>
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

function StopSquareIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" strokeWidth={2} />
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

function MonitorIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="3" y="4" width="18" height="12" rx="1.5" strokeWidth={2.5} />
            <path strokeLinecap="round" strokeWidth={2.5} d="M9 20h6M12 16v4" />
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
