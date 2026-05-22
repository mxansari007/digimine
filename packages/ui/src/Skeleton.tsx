import * as React from "react";

/**
 * Skeleton — a pulsing placeholder for content that loads after mount.
 *
 * SEO note: skeletons are for CLIENT-rendered, dynamic/auth-gated surfaces
 * (dashboards, profiles, lists fetched in the browser). Do NOT use a skeleton
 * to replace server-rendered HTML on SEO-critical public pages — crawlers
 * should receive the real content, not an empty shell.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    /** Render as a circle (avatars, icons). */
    circle?: boolean;
}

export function Skeleton({ className = "", circle = false, ...props }: SkeletonProps): React.JSX.Element {
    return (
        <div
            aria-hidden="true"
            className={[
                "animate-pulse bg-slate-200/70",
                circle ? "rounded-full" : "rounded-md",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            {...props}
        />
    );
}

/** A block of text lines; the last line is shorter for realism. */
export interface SkeletonTextProps {
    lines?: number;
    className?: string;
}

export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps): React.JSX.Element {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
            ))}
        </div>
    );
}

/** A list of row placeholders (icon · label · trailing chip). */
export interface SkeletonListProps {
    rows?: number;
    className?: string;
}

export function SkeletonList({ rows = 6, className = "" }: SkeletonListProps): React.JSX.Element {
    return (
        <div className={`space-y-2.5 ${className}`}>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-4 w-12 rounded-full" />
                </div>
            ))}
        </div>
    );
}
