"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LabControlInputEvent } from "./labProtocol";

/**
 * LabControlSurface — the TEACHER's input-capture overlay for ACTIVE remote
 * control of a student's desktop agent.
 *
 * It sits on top of the viewed `<video>` (the student's shared screen) and turns
 * the teacher's raw DOM input into the normalized {@link LabControlInputEvent}s
 * the hook streams to the agent via `sendControlInput`. It owns NO transport and
 * NO LiveKit — it's a pure capture layer; the parent decides when it's mounted
 * (only while `state.control.phase === "active"` for the screen being viewed).
 *
 * ── Coordinate mapping (the load-bearing part) ───────────────────────────────
 * The shared screen is painted with `object-contain`, so the video frame is
 * letterboxed/pillarboxed inside the element box — the element's bounding rect is
 * NOT the painted frame. We therefore reconstruct the *painted content rect* from
 * the video's intrinsic `videoWidth`/`videoHeight` vs the element box, then
 * normalize the pointer to 0..1 WITHIN that content rect (top-left origin) and
 * clamp to [0,1] (a pointer over a letterbox bar pins to the nearest screen
 * edge). That fraction is resolution-independent: the agent multiplies it by its
 * real captured screen size. Before the first frame arrives (`videoWidth === 0`)
 * we fall back to the element box so a click still lands roughly right.
 *
 * ── Event mapping ────────────────────────────────────────────────────────────
 *   • pointermove → `{kind:"pointer", action:"move", x, y}` — rAF-throttled (at
 *     most one sample per frame) so a fast drag can't flood the lossy channel;
 *     the latest position always wins.
 *   • pointerdown/up → `{action:"down"|"up", button}` (DOM `MouseEvent.button`).
 *     We `setPointerCapture` on down so a drag that leaves the frame still
 *     delivers its `up` (no stuck mouse button on the remote machine).
 *   • wheel → `{kind:"scroll", dx, dy}` (raw DOM deltas; non-passive so we can
 *     `preventDefault` the local page scroll while controlling).
 *   • keydown/keyup → `{kind:"key", action, key, code, mods}` — only while the
 *     surface is FOCUSED (it's `tabIndex=0` and auto-focuses on mount). We
 *     `preventDefault` so keys drive the remote machine instead of the local
 *     browser (Tab won't blur, Space/arrows won't scroll, etc.).
 *
 * The "you are controlling" affordance is deliberately NON-INTERACTIVE
 * (`pointer-events-none`) so it never eats an input meant for the remote screen;
 * the surface itself is the only interactive layer. A `cursor-none` +
 * crosshair-dot reinforces "your pointer is driving the remote machine, not this
 * page". The student's own always-on banner lives in the desktop agent (the
 * security model puts the durable "being controlled" signal on the controlled
 * machine); this is the teacher-side mirror.
 */

export interface LabControlSurfaceProps {
    /** Display name of the student being controlled (for the indicator). */
    name: string;
    /** Stream one normalized input event to the controlled agent. */
    onInput: (ev: LabControlInputEvent) => void;
    /** Stop controlling (wired to the hook's `endControl`). */
    onStop: () => void;
}

/** Read the live modifier state off a keyboard event for the `mods` field. */
function modsFrom(e: KeyboardEvent): {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
} {
    return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
}

/** Clamp to the unit interval (a letterbox-bar pointer pins to the nearest edge). */
function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function LabControlSurface({ name, onInput, onStop }: LabControlSurfaceProps) {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    // rAF handle + the latest pending pointer fraction, so move events coalesce
    // to one send per frame (the most recent position wins).
    const rafRef = useRef<number | null>(null);
    const pendingMove = useRef<{ x: number; y: number } | null>(null);
    // Latest onInput, mirrored so the imperatively-attached wheel listener (and
    // the rAF flush) always call the current closure without re-subscribing.
    const onInputRef = useRef(onInput);
    useEffect(() => {
        onInputRef.current = onInput;
    }, [onInput]);

    /**
     * Map a client (x,y) to a 0..1 fraction of the SHARED SCREEN, accounting for
     * the `object-contain` letterbox. Resolves the painted content rect from the
     * underlying <video>'s intrinsic size; falls back to the element box before
     * the first frame. The surface overlays the video exactly (same parent box),
     * so the surface's own rect is the element box.
     */
    const toScreenFraction = useCallback(
        (clientX: number, clientY: number): { x: number; y: number } | null => {
            const surface = surfaceRef.current;
            if (!surface) return null;
            const box = surface.getBoundingClientRect();
            if (box.width <= 0 || box.height <= 0) return null;

            // The <video> we're overlaying is the previous sibling in the frame
            // (the parent renders <LabVideo> then this surface). Read its
            // intrinsic size to reconstruct the contained content rect.
            const video = surface.parentElement?.querySelector("video") as
                | HTMLVideoElement
                | null;
            const vw = video?.videoWidth ?? 0;
            const vh = video?.videoHeight ?? 0;

            let contentX = box.left;
            let contentY = box.top;
            let contentW = box.width;
            let contentH = box.height;

            if (vw > 0 && vh > 0) {
                // `object-contain`: scale the frame to fit, preserving aspect →
                // bars on the axis with the smaller scale factor.
                const scale = Math.min(box.width / vw, box.height / vh);
                contentW = vw * scale;
                contentH = vh * scale;
                contentX = box.left + (box.width - contentW) / 2;
                contentY = box.top + (box.height - contentH) / 2;
            }

            const x = clamp01((clientX - contentX) / contentW);
            const y = clamp01((clientY - contentY) / contentH);
            return { x, y };
        },
        []
    );

    /** Flush the most recent pending pointer move (one send per frame). */
    const flushMove = useCallback(() => {
        rafRef.current = null;
        const p = pendingMove.current;
        pendingMove.current = null;
        if (!p) return;
        onInputRef.current({ kind: "pointer", action: "move", x: p.x, y: p.y });
    }, []);

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const f = toScreenFraction(e.clientX, e.clientY);
            if (!f) return;
            pendingMove.current = f;
            if (rafRef.current == null) {
                rafRef.current = requestAnimationFrame(flushMove);
            }
        },
        [toScreenFraction, flushMove]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            // Keep keyboard capture + focus ring on the surface for key events.
            surfaceRef.current?.focus();
            // Capture the pointer so a drag that leaves the frame still delivers
            // its `up` here (no stuck button on the remote machine).
            try {
                surfaceRef.current?.setPointerCapture(e.pointerId);
            } catch {
                /* setPointerCapture can throw if the pointer is already gone */
            }
            const f = toScreenFraction(e.clientX, e.clientY);
            if (!f) return;
            // Land the cursor at the press point first (covers a down with no
            // preceding move, e.g. a fresh click), then the button-down.
            onInputRef.current({ kind: "pointer", action: "move", x: f.x, y: f.y });
            onInputRef.current({
                kind: "pointer",
                action: "down",
                x: f.x,
                y: f.y,
                button: e.button,
            });
        },
        [toScreenFraction]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            try {
                surfaceRef.current?.releasePointerCapture(e.pointerId);
            } catch {
                /* already released */
            }
            const f = toScreenFraction(e.clientX, e.clientY);
            if (!f) return;
            onInputRef.current({
                kind: "pointer",
                action: "up",
                x: f.x,
                y: f.y,
                button: e.button,
            });
        },
        [toScreenFraction]
    );

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // A right-click should drive the REMOTE machine's context menu (via the
        // pointer down/up button=2), not pop the browser's own menu over the stage.
        e.preventDefault();
    }, []);

    // `onStop` mirrored so the (stable) keydown handler can reach the current
    // closure for the Escape panic-stop without re-subscribing.
    const onStopRef = useRef(onStop);
    useEffect(() => {
        onStopRef.current = onStop;
    }, [onStop]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        // Escape is the local "stop controlling" panic key — it never goes to the
        // remote machine.
        if (e.key === "Escape") {
            e.preventDefault();
            onStopRef.current();
            return;
        }
        // Drive the remote machine, not the local browser (no Tab-blur, no
        // Space/arrow page scroll, no browser find on Ctrl+F, etc.).
        e.preventDefault();
        onInputRef.current({
            kind: "key",
            action: "down",
            key: e.key,
            code: e.code,
            mods: modsFrom(e.nativeEvent),
        });
    }, []);

    const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") return; // handled on keydown; no remote key-up
        e.preventDefault();
        onInputRef.current({
            kind: "key",
            action: "up",
            key: e.key,
            code: e.code,
            mods: modsFrom(e.nativeEvent),
        });
    }, []);

    // Wheel must be a NON-PASSIVE native listener so we can preventDefault the
    // local page scroll while forwarding the delta to the remote machine. React's
    // onWheel is passive by default, so we attach imperatively.
    useEffect(() => {
        const el = surfaceRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            onInputRef.current({ kind: "scroll", dx: e.deltaX, dy: e.deltaY });
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    // Auto-focus on mount so keystrokes flow to the remote machine immediately
    // (the teacher just hit "Controlling"); cancel any pending rAF on unmount.
    useEffect(() => {
        surfaceRef.current?.focus({ preventScroll: true });
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return (
        <div
            ref={surfaceRef}
            // The interactive capture layer. Covers the whole frame; `cursor-none`
            // hides the OS cursor so the crosshair affordance reads as "you're
            // driving the remote screen". `touch-none` keeps touch/trackpad
            // gestures from scrolling the page instead of streaming.
            role="application"
            aria-label={`Remote control surface — controlling ${name}. Press Escape to stop.`}
            tabIndex={0}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            className="absolute inset-0 z-10 cursor-none touch-none select-none outline-none ring-inset focus-visible:ring-2 focus-visible:ring-rose-400/70"
        >
            {/* The "controlling" cursor affordance — a subtle crosshair dot that
                tracks the pointer. Non-interactive so it never eats input. */}
            <ControllingCursor />

            {/* A persistent, non-interactive red frame + label so it's never
                ambiguous that this surface is hot and driving someone's machine. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-rose-500/70"
            />
            <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-rose-600/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-soft"
            >
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                You are controlling
            </span>
        </div>
    );
}

export default LabControlSurface;

/**
 * A pointer-following crosshair dot drawn directly on the DOM (no React state per
 * move, so it never re-renders the tree). Mounted inside the surface; tracks the
 * surface's own pointer moves via a local listener and positions an absolutely-
 * placed marker. Purely an affordance — `pointer-events-none` throughout.
 */
function ControllingCursor() {
    const dotRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const dot = dotRef.current;
        const surface = dot?.parentElement;
        if (!dot || !surface) return;
        const onMove = (e: PointerEvent) => {
            const box = surface.getBoundingClientRect();
            dot.style.transform = `translate(${e.clientX - box.left}px, ${
                e.clientY - box.top
            }px)`;
            dot.style.opacity = "1";
        };
        const onLeave = () => {
            dot.style.opacity = "0";
        };
        surface.addEventListener("pointermove", onMove);
        surface.addEventListener("pointerleave", onLeave);
        return () => {
            surface.removeEventListener("pointermove", onMove);
            surface.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    return (
        <div
            ref={dotRef}
            aria-hidden
            style={{ opacity: 0 }}
            className="pointer-events-none absolute left-0 top-0 -ml-2.5 -mt-2.5 h-5 w-5 transition-opacity duration-150"
        >
            <span className="absolute inset-0 rounded-full border-2 border-rose-400 bg-rose-500/20 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
            <span className="absolute left-1/2 top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-200" />
        </div>
    );
}
