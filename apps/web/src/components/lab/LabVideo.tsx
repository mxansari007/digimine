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

    // Bind the track to our element on mount + whenever the underlying source
    // changes. We key the effect on the handle's identity (uid+source) rather
    // than the object reference, since the hook may hand back a fresh handle on
    // every render while pointing at the same media.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        track.attach(el);
        return () => {
            // Detach exactly this element (not all), so swapping handles doesn't
            // tear the same track off some other mounted <video>.
            track.detach(el);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [track.uid, track.source]);

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
