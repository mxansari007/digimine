"use client";

/**
 * Lab Library / Replay — small shared presentational helpers.
 *
 * The recordings list and the replay page both need to render a recording's
 * processing state and format its duration/date the same way, so the badge +
 * formatters live here once. Pure presentation; no data fetching. Matches the
 * platform language (teal primary, amber for in-flight, rose for failure, quiet
 * slate everything else) and the classroom kit's mono data labels.
 */

import type { LabRecordingStatus } from "@digimine/types";

/** A small status pill mirroring the recording lifecycle (egress states). */
export function RecordingStatusBadge({
    status,
    className = "",
}: {
    status: LabRecordingStatus;
    className?: string;
}) {
    const tone: Record<LabRecordingStatus, string> = {
        processing:
            "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
        ready:
            "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
        failed:
            "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
    };
    const label: Record<LabRecordingStatus, string> = {
        processing: "Processing",
        ready: "Ready",
        failed: "Failed",
    };
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${tone[status]} ${className}`}
        >
            {status === "processing" && (
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
            )}
            {label[status]}
        </span>
    );
}

/** Whole-second duration → "h:mm:ss" / "m:ss"; "—" when unknown (0/processing). */
export function formatDuration(durationSec: number): string {
    const total = Math.max(0, Math.round(durationSec || 0));
    if (total <= 0) return "—";
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** ISO date → "12 Jun 2026, 3:04 PM" (IN locale); "—" when missing/unparseable. */
export function formatRecordingDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return "—";
    }
}
