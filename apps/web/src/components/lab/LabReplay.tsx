"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { fetchLabRecording, type LabRecordingSummary } from "@/lib/lab/labClient";
import type { LabRole } from "@digimine/types";
import {
    RecordingStatusBadge,
    formatDuration,
    formatRecordingDate,
} from "./labRecordingUi";

/**
 * LabReplay — watch one lab session recording back.
 *
 * Loads the recording via `GET /api/lab/recordings/[recordingId]` (membership-
 * gated; the route also reconciles a still-`processing` recording against
 * LiveKit and, once `ready`, attaches a freshly-signed playback URL). Renders:
 *
 *   - ready      → an HTML5 <video controls src={signedUrl}> + a chapters rail
 *                  (seek on click; the rail shows a placeholder while empty).
 *   - processing → a "still processing — refresh" state with a manual refresh
 *                  button (re-fetch re-runs the server reconcile).
 *   - failed     → a clear failure card.
 *
 * The signed URL is short-lived, so we always (re)fetch on mount + on refresh
 * rather than caching it. `viewer` only picks the back-links; access is the
 * server's call. The page gates the route on the Virtual Lab flag.
 */

export interface LabReplayProps {
    recordingId: string;
    /** The class this recording belongs to, when the entry point knows it. */
    classId?: string;
    /** Which side mounted us — picks the back-links (class + library). */
    viewer: LabRole;
}

/** Back-links for a viewer: the class hub + the recordings library. */
function linksFor(
    viewer: LabRole,
    classId: string | null
): { classHref: string; classLabel: string; libraryHref: string | null } {
    if (viewer === "teacher") {
        return {
            classHref: classId ? `/teacher/classes/${classId}` : "/teacher/classes",
            classLabel: classId ? "Back to class" : "Back to my classes",
            libraryHref: classId
                ? `/teacher/classes/${classId}/lab-library`
                : null,
        };
    }
    return {
        classHref: classId ? `/classroom/${classId}` : "/student/classrooms",
        classLabel: classId ? "Back to class" : "Back to my subjects",
        libraryHref: classId ? `/classroom/${classId}/lab-library` : null,
    };
}

export function LabReplay({ recordingId, classId, viewer }: LabReplayProps) {
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const [recording, setRecording] = useState<LabRecordingSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(
        async (mode: "initial" | "refresh") => {
            if (!firebaseUser) return;
            if (mode === "refresh") setRefreshing(true);
            else setLoading(true);
            setError("");
            try {
                const rec = await fetchLabRecording(firebaseUser, recordingId);
                setRecording(rec);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Could not load this recording."
                );
            } finally {
                if (mode === "refresh") setRefreshing(false);
                else setLoading(false);
            }
        },
        [firebaseUser, recordingId]
    );

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            const here = `${linksFor(viewer, classId || null).classHref}`;
            router.push(`/login?redirect=${encodeURIComponent(here)}`);
            return;
        }
        void load("initial");
        // load is stable for a given user+recordingId.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, firebaseUser, recordingId]);

    // Seek the video to a chapter's start (only meaningful once it's playable).
    const seekTo = useCallback((tsSec: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, tsSec);
        void v.play().catch(() => {
            /* autoplay may be blocked; the user can press play */
        });
    }, []);

    const links = linksFor(viewer, classId || recording?.classId || null);

    if (loading) {
        return (
            <div className="min-h-screen bg-background px-4 py-10">
                <div className="mx-auto max-w-5xl space-y-4">
                    <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="aspect-video w-full animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" />
                </div>
            </div>
        );
    }

    if (error || !recording) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background px-4">
                <Card className="mx-auto max-w-md p-8 text-center">
                    <h1 className="font-display text-lg font-semibold text-gray-900">
                        Recording unavailable
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {error || "This recording could not be found."}
                    </p>
                    <Link href={links.classHref} className="mt-4 inline-block">
                        <Button variant="outline" size="sm">
                            {links.classLabel}
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    // `ready` is only truly playable once a signed URL has been minted; a
    // `ready`-but-URL-not-yet-available recording falls through to the
    // "processing" branch (the else) so the viewer can refresh for the URL.
    const isReady = recording.status === "ready" && Boolean(recording.url);
    const isFailed = recording.status === "failed";

    return (
        <div className="min-h-screen bg-background px-4 py-10">
            <div className="mx-auto max-w-5xl">
                {/* Back links */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                    <Link
                        href={links.classHref}
                        className="inline-flex items-center gap-1.5 text-slate-500 transition-colors hover:text-primary-700 focus-visible:underline"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        {links.classLabel}
                    </Link>
                    {links.libraryHref && (
                        <Link
                            href={links.libraryHref}
                            className="text-slate-400 transition-colors hover:text-primary-700 focus-visible:underline"
                        >
                            All recordings →
                        </Link>
                    )}
                </div>

                {/* Header */}
                <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Lab replay
                        </p>
                        <h1 className="mt-1 font-display text-2xl font-bold text-gray-900 sm:text-3xl">
                            {recording.sessionTitle || "Lab session"}
                        </h1>
                        <p className="mt-1.5 font-mono text-xs text-slate-500">
                            {[
                                formatRecordingDate(recording.createdAt),
                                formatDuration(recording.durationSec) !== "—"
                                    ? formatDuration(recording.durationSec)
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                    <RecordingStatusBadge status={recording.status} className="mt-1" />
                </div>

                {/* Body: player + chapters */}
                <div className="mt-6 flex flex-col gap-4 lg:flex-row">
                    <div className="min-w-0 flex-1">
                        {isReady ? (
                            <video
                                ref={videoRef}
                                src={recording.url}
                                controls
                                playsInline
                                preload="metadata"
                                className="aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-soft-sm dark:border-slate-700"
                            />
                        ) : isFailed ? (
                            <Card intent="danger" className="p-8 text-center">
                                <h2 className="font-display text-base font-semibold text-danger-700 dark:text-danger-300">
                                    Recording failed
                                </h2>
                                <p className="mx-auto mt-1.5 max-w-md text-sm text-danger-700/80 dark:text-danger-300/80">
                                    Something went wrong while capturing or processing this
                                    session, so there&apos;s nothing to play back. If it was a long
                                    session, the teacher may need to record it again.
                                </p>
                            </Card>
                        ) : (
                            // Processing (or ready-but-URL-not-yet-available).
                            <Card className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                                    <svg className="h-6 w-6 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden>
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                                    </svg>
                                </span>
                                <div>
                                    <h2 className="font-display text-base font-semibold text-gray-900">
                                        Still processing
                                    </h2>
                                    <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
                                        This recording is being finalised. It usually takes a few
                                        minutes after the session ends — refresh to check again.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void load("refresh")}
                                    isLoading={refreshing}
                                    disabled={refreshing}
                                >
                                    Refresh
                                </Button>
                            </Card>
                        )}
                    </div>

                    {/* Chapters rail. */}
                    <aside className="w-full shrink-0 lg:w-72">
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-soft-sm dark:border-slate-700">
                            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                                <h2 className="font-display text-sm font-semibold text-gray-900">
                                    Chapters
                                    {recording.chapters.length > 0 && (
                                        <span className="ml-1.5 font-mono text-xs font-normal text-slate-400">
                                            {recording.chapters.length}
                                        </span>
                                    )}
                                </h2>
                            </div>
                            {recording.chapters.length === 0 ? (
                                <p className="px-4 py-8 text-center text-sm text-slate-400">
                                    No chapters for this recording yet. Key moments (shares,
                                    spotlights) will appear here as the timeline is built.
                                </p>
                            ) : (
                                <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                                    {recording.chapters.map((ch, i) => (
                                        <li key={`${ch.tsSec}-${i}`}>
                                            <button
                                                type="button"
                                                onClick={() => seekTo(ch.tsSec)}
                                                disabled={!isReady}
                                                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800/40"
                                                title={isReady ? "Jump to this moment" : "Available once the recording is ready"}
                                            >
                                                <span className="shrink-0 font-mono text-[11px] font-semibold text-primary-700 dark:text-primary-300">
                                                    {formatDuration(ch.tsSec)}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                                                    {ch.title || "Chapter"}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

export default LabReplay;
