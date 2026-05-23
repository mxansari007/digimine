"use client";

import { Button } from "@digimine/ui";

/**
 * "Load more" CTA used at the bottom of list pages that paginate client-side
 * via `useVisibleSlice`. Renders nothing when there's nothing left to reveal,
 * so callers can drop it unconditionally below their grid.
 */
export default function LoadMoreButton({
    hasMore,
    remaining,
    onLoadMore,
    label = "Show more",
    className = "",
}: {
    hasMore: boolean;
    remaining: number;
    onLoadMore: () => void;
    label?: string;
    className?: string;
}) {
    if (!hasMore) return null;
    return (
        <div className={`mt-8 flex flex-col items-center gap-2 ${className}`}>
            <Button variant="outline" onClick={onLoadMore}>
                {label} ({remaining} more)
            </Button>
        </div>
    );
}
