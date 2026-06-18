"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell, ContentItemRow } from "@/components/classroom/ui";
import {
    fetchClassRecordings,
    type LabRecordingSummary,
} from "@/lib/lab/labClient";
import type { LabRole } from "@digimine/types";
import {
    RecordingStatusBadge,
    formatDuration,
    formatRecordingDate,
} from "./labRecordingUi";

/**
 * LabLibrary — the in-class list of session recordings (the "lab recordings"
 * surface). Lives INSIDE a classroom, so it loads the class's recordings via
 * `GET /api/lab/recordings?classId=` (which re-verifies the caller is a member
 * of the class server-side) and lists them newest-first: session title, when it
 * was recorded, how long it ran, and a processing/ready/failed status badge.
 *
 * A `ready` row links to the replay page; a `processing`/`failed` row is shown
 * but not yet playable (still navigable so the viewer can open it and refresh).
 * The pages gate the route on the Virtual Lab flag (server-side `notFound()`),
 * so by the time this mounts the feature is on; the membership/labEnabled gate
 * is enforced by the API.
 *
 * `viewer` only picks the back-link target + the replay-page base path — the
 * real access decision is the server's.
 */

export interface LabLibraryProps {
    classId: string;
    /** Which side mounted us — picks the class back-link + replay route base. */
    viewer: LabRole;
}

/** The class page a viewer returns to from the library. */
function backLinkFor(viewer: LabRole, classId: string): { href: string; label: string } {
    return viewer === "teacher"
        ? { href: `/teacher/classes/${classId}`, label: "Back to class" }
        : { href: `/classroom/${classId}`, label: "Back to class" };
}

/** Replay route base for a viewer (the recordingId is appended per row). */
function replayBase(viewer: LabRole): string {
    return viewer === "teacher" ? "/teacher/lab/replay" : "/student/lab/replay";
}

export function LabLibrary({ classId, viewer }: LabLibraryProps) {
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();

    const [recordings, setRecordings] = useState<LabRecordingSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const back = backLinkFor(viewer, classId);
    const base = replayBase(viewer);

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(
                `/login?redirect=${encodeURIComponent(`${back.href}/lab-library`)}`
            );
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError("");
        fetchClassRecordings(firebaseUser, classId)
            .then((data) => {
                if (!cancelled) setRecordings(data.recordings);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setRecordings([]);
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Could not load recordings."
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // back.href is derived purely from viewer+classId; depend on those.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, firebaseUser, classId, viewer]);

    return (
        <ClassroomShell
            backHref={back.href}
            backLabel={back.label}
            eyebrow="Virtual lab"
            title="Lab recordings"
            subtitle="Replays of this class's live lab sessions. Open a recording to watch it back, chapter by chapter."
        >
            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-16 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800"
                        />
                    ))}
                </div>
            ) : error ? (
                <Card intent="danger" className="p-5 text-sm text-danger-700">
                    {error}
                </Card>
            ) : recordings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-12 text-center">
                    <h2 className="font-display text-base font-semibold text-gray-900">
                        No recordings yet
                    </h2>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                        {viewer === "teacher"
                            ? "Recordings you capture during a live lab session show up here once they finish processing."
                            : "When your teacher records a live lab session, the replay appears here."}
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                    {recordings.map((rec, i) => {
                        const duration = formatDuration(rec.durationSec);
                        const meta = [
                            formatRecordingDate(rec.createdAt),
                            duration !== "—" ? duration : null,
                            rec.chapters.length > 0
                                ? `${rec.chapters.length} chapter${rec.chapters.length === 1 ? "" : "s"}`
                                : null,
                        ]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                            <ContentItemRow
                                key={rec.id}
                                first={i === 0}
                                href={`${base}/${rec.id}?classId=${encodeURIComponent(classId)}`}
                                title={rec.sessionTitle || "Lab session"}
                                meta={meta}
                                right={<RecordingStatusBadge status={rec.status} />}
                            />
                        );
                    })}
                </div>
            )}
        </ClassroomShell>
    );
}

export default LabLibrary;
