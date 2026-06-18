"use client";

import { useMemo } from "react";
import type { LabRoomState } from "@digimine/types";
import { LabVideo } from "./LabVideo";
import type { LabRoomActions } from "./useLabRoom";

/**
 * LabVideoStage — the primary "what the teacher is showing" frame.
 *
 * It resolves the teacher from the live roster, then asks the hook for that
 * teacher's screen-share and camera tracks via `actions.getVideoTrack`. When a
 * screen share is live it fills the stage and the camera (if any) rides along
 * as a picture-in-picture in the corner; with only a camera, the camera fills
 * the stage. When nothing is being broadcast we show a calm placeholder so the
 * room never looks broken.
 *
 * Stateless w.r.t. LiveKit — every track comes through the hook's handles, and
 * `<LabVideo>` does the attach/detach. We re-derive on each `state` change
 * (cheap) so the stage appears/disappears the instant `broadcasting` flips.
 */

export interface LabVideoStageProps {
    state: LabRoomState;
    /** The hook's action bag (we use `getVideoTrack`). */
    actions: LabRoomActions;
}

export function LabVideoStage({ state, actions }: LabVideoStageProps) {
    // The teacher avatar drives the stage. There is exactly one teacher per lab,
    // but be defensive: just take the first one we find.
    const teacher = useMemo(
        () => state.participants.find((p) => p.role === "teacher") ?? null,
        [state.participants]
    );

    // Resolve the two possible tracks. `getVideoTrack` returns null when that
    // source isn't being published, so these double as "is it on" flags.
    // Recompute whenever the roster/broadcast flag moves (a fresh handle each
    // render is fine — LabVideo keys its attach on uid+source, not identity).
    const screen = teacher ? actions.getVideoTrack(teacher.uid, "screen") : null;
    const camera = teacher ? actions.getVideoTrack(teacher.uid, "camera") : null;

    const main = screen ?? camera;
    // Show the camera as a PiP only when the screen is the main frame (else the
    // camera already *is* the main frame).
    const pip = screen ? camera : null;

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-soft-sm dark:border-slate-700">
            <div className="relative aspect-video w-full">
                {main ? (
                    <>
                        <LabVideo
                            track={main}
                            className="absolute inset-0 h-full w-full bg-black object-contain"
                        />
                        {/* Camera picture-in-picture, bottom-right. */}
                        {pip && (
                            <div className="absolute bottom-3 right-3 h-1/4 max-h-32 min-h-[64px] w-1/4 max-w-[180px] min-w-[96px] overflow-hidden rounded-xl border-2 border-white/80 shadow-soft">
                                <LabVideo
                                    track={pip}
                                    className="h-full w-full bg-black object-cover"
                                />
                            </div>
                        )}
                        {/* "LIVE" marker so it's unmistakable the stage is hot. */}
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-soft">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                            {screen ? "Sharing screen" : "On camera"}
                        </span>
                    </>
                ) : (
                    <StagePlaceholder hasTeacher={!!teacher} />
                )}
            </div>
        </section>
    );
}

export default LabVideoStage;

/** Calm empty state for the stage when nothing is being broadcast. */
function StagePlaceholder({ hasTeacher }: { hasTeacher: boolean }) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/40">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <rect x="2" y="4" width="20" height="14" rx="2" strokeWidth={1.8} />
                    <path strokeLinecap="round" strokeWidth={1.8} d="M8 21h8M12 18v3" />
                </svg>
            </span>
            <p className="text-sm font-medium text-white/70">
                {hasTeacher ? "Nothing on the big screen yet" : "Waiting for the teacher to join"}
            </p>
            <p className="text-xs text-white/40">
                The teacher&apos;s broadcast will appear here.
            </p>
        </div>
    );
}
