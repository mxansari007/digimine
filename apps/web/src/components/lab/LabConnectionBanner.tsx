"use client";

import type { LabConnectionStatus } from "./useLabRoom";

/**
 * LabConnectionBanner — the thin status line above the room.
 *
 * It reflects the hook's coarse `status` (+ any `error`) into a single banner:
 * an error takes precedence (rose), then the transient/!connected states get a
 * neutral or amber strip, and once `connected` it renders nothing so the room
 * fills the space. Kept tiny and presentational; all state comes from props.
 */

export interface LabConnectionBannerProps {
    status: LabConnectionStatus;
    error: string | null;
}

export function LabConnectionBanner({ status, error }: LabConnectionBannerProps) {
    // Error wins regardless of status.
    if (error) {
        return (
            <Banner tone="danger">
                <DotIcon />
                {error}
            </Banner>
        );
    }

    switch (status) {
        case "connected":
            return null;
        case "connecting":
        case "idle":
            return (
                <Banner tone="neutral">
                    <Spinner />
                    Connecting to the lab…
                </Banner>
            );
        case "reconnecting":
            return (
                <Banner tone="warning">
                    <Spinner />
                    Connection dropped — reconnecting…
                </Banner>
            );
        case "disconnected":
            return (
                <Banner tone="warning">
                    <DotIcon />
                    You&apos;ve left the lab. Refresh to rejoin.
                </Banner>
            );
        case "error":
            return (
                <Banner tone="danger">
                    <DotIcon />
                    Couldn&apos;t connect to the lab.
                </Banner>
            );
        default:
            return null;
    }
}

export default LabConnectionBanner;

function Banner({
    tone,
    children,
}: {
    tone: "neutral" | "warning" | "danger";
    children: React.ReactNode;
}) {
    const toneClasses =
        tone === "danger"
            ? "border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
            : tone === "warning"
              ? "border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-300"
              : "border-slate-200 bg-white text-slate-500 shadow-soft-sm dark:border-slate-700 dark:bg-surface";
    return (
        <div
            role="status"
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${toneClasses}`}
        >
            {children}
        </div>
    );
}

function Spinner() {
    return (
        <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
            <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
        </svg>
    );
}

function DotIcon() {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden />;
}
