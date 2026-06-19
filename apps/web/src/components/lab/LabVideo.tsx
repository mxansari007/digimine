"use client";

import { useEffect, useRef } from "react";
import type { LabVideoHandle } from "./useLabRoom";

/**
 * LabVideo — renders a single LiveKit track into a `<video>` element using the
 * `LabVideoHandle` the hook hands us.
 *
 * The hook owns LiveKit entirely; this component never imports `livekit-client`.
 * It only calls `track.attach(el)` / `track.detach(el)` against our own
 * `<video>` ref, so the MediaStream is bound on mount (and whenever the handle's
 * identity changes) and cleanly unbound on unmount. Re-attaching when the
 * `uid`/`source` changes covers the case where the same slot flips from one
 * participant's screen to another's, or screen → camera.
 *
 * Presentational only: sizing/rounding/object-fit come from `className` so the
 * caller (the stage / PiP) decides the frame.
 */

export interface LabVideoProps {
    /** The track handle from `useLabRoom().actions.getVideoTrack(...)`. */
    track: LabVideoHandle;
    /** Mirror the video horizontally (natural for a self-camera PiP). */
    mirror?: boolean;
    /** Classes on the `<video>` element. */
    className?: string;
}

export function LabVideo({ track, mirror = false, className = "" }: LabVideoProps) {
    const ref = useRef<HTMLVideoElement | null>(null);

    // Bind the track to our element on mount, and re-bind whenever the UNDERLYING
    // media changes — even when uid+source stay equal (teacher Stop broadcast → Go
    // live again; a muted track replaced by a fresh publish; an agent re-publish).
    // Keying only on uid+source (or on the handle's object reference, which the
    // hook regenerates every render) would leave the <video> on the old/ended
    // stream — a frozen/black frame.
    //
    // Re-bind every render. `attach()` is idempotent and flicker-safe in
    // livekit-client: it reuses the element's existing srcObject MediaStream and
    // only swaps the track (and only reassigns srcObject) when the underlying
    // MediaStreamTrack actually differs. So re-attaching the same live track is a
    // no-op, while a NEW underlying track — which carries a different
    // MediaStreamTrack id — gets re-bound here and the old/ended one is dropped.
    // That is the STABLE per-track identity we ultimately key on, and it's what
    // fixes the frozen/black frame after a track swap (teacher Stop → Go live, a
    // muted track replaced by a fresh publish, an agent re-publish).
    useEffect(() => {
        const el = ref.current;
        if (el) track.attach(el);
    });

    // Detach exactly this element (not all) on unmount, so the hook can hand the
    // same track to another mounted <video> without us tearing it off there.
    useEffect(() => {
        const el = ref.current;
        return () => {
            if (el) track.detach(el);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            // Screen shares carry no audio we want doubled here; the teacher's
            // mic/cam audio is handled by LiveKit's own audio rendering. Muting
            // the element also lets autoplay start without a user gesture.
            muted
            className={`${mirror ? "scale-x-[-1] " : ""}${className}`}
        />
    );
}

export default LabVideo;
