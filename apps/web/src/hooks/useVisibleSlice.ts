"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * "Load more"–style client pagination. Returns the prefix of `items` that
 * is currently visible plus the controls needed to reveal more. Server-rendered
 * lists pass the full catalog and use this to render only the first `pageSize`
 * items, so the DOM stays light on huge lists (200+ practice problems) while
 * the crawler still sees every link in the SSR payload.
 *
 * Resets to page 1 automatically when the input changes — we fingerprint by
 * `items.length` plus the first item's identity so a filter swap (which
 * typically produces a different list) re-anchors the cursor to the top.
 * Callers can also call `reset()` explicitly.
 */
export function useVisibleSlice<T extends { id?: string | number }>(
    items: T[],
    pageSize = 12
): {
    visible: T[];
    hasMore: boolean;
    remaining: number;
    loadMore: () => void;
    reset: () => void;
    visibleCount: number;
    totalCount: number;
} {
    const [page, setPage] = useState(1);

    const fingerprint = useMemo(() => {
        if (items.length === 0) return "0|";
        const first = items[0];
        const last = items[items.length - 1];
        return `${items.length}|${first?.id ?? ""}|${last?.id ?? ""}`;
    }, [items]);

    useEffect(() => {
        setPage(1);
    }, [fingerprint]);

    const visibleCount = Math.min(page * pageSize, items.length);
    const visible = items.slice(0, visibleCount);

    return {
        visible,
        hasMore: visibleCount < items.length,
        remaining: items.length - visibleCount,
        loadMore: () => setPage((p) => p + 1),
        reset: () => setPage(1),
        visibleCount,
        totalCount: items.length,
    };
}
