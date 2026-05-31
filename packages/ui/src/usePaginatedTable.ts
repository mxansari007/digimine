"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PaginatedLoadParams {
    page: number;
    pageSize: number;
    signal: AbortSignal;
}

export interface PaginatedResult<T> {
    items: T[];
    total: number;
}

export interface UsePaginatedTableOptions<T> {
    /** Fetch one page. Must honour `signal` (the hook aborts stale requests). */
    load: (params: PaginatedLoadParams) => Promise<PaginatedResult<T>>;
    initialPage?: number;
    initialPageSize?: number;
    /**
     * Values that, when changed, reset to page 1 and refetch — your filters /
     * search term / sort. Compared by JSON value, so pass plain serialisable data.
     */
    deps?: unknown[];
}

export interface UsePaginatedTableState<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    loading: boolean;
    error: string | null;
    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;
    reload: () => void;
}

/**
 * Drives a server-paginated table: owns page/pageSize, fetches exactly one page
 * at a time via the injected `load`, aborts the previous request when inputs
 * change, and snaps back to page 1 whenever a filter (`deps`) or the page size
 * changes. Pair with `<PaginationControls />`.
 */
export function usePaginatedTable<T>({
    load,
    initialPage = 1,
    initialPageSize = 20,
    deps = [],
}: UsePaginatedTableOptions<T>): UsePaginatedTableState<T> {
    const [page, setPage] = useState(initialPage);
    const [pageSize, setPageSizeState] = useState(initialPageSize);
    const [items, setItems] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    // Keep the latest `load` without making it a fetch dependency (so callers
    // don't have to memoise it to avoid an infinite loop).
    const loadRef = useRef(load);
    loadRef.current = load;

    const depsKey = useMemo(() => JSON.stringify(deps), [deps]);

    // Reset to page 1 when filters change — but not on the very first render.
    const firstRun = useRef(true);
    useEffect(() => {
        if (firstRun.current) {
            firstRun.current = false;
            return;
        }
        setPage(1);
    }, [depsKey]);

    useEffect(() => {
        const ac = new AbortController();
        let active = true;
        setLoading(true);
        setError(null);
        loadRef
            .current({ page, pageSize, signal: ac.signal })
            .then((res) => {
                if (!active) return;
                setItems(res.items);
                setTotal(res.total);
            })
            .catch((e: unknown) => {
                if (!active || ac.signal.aborted) return;
                setError(e instanceof Error ? e.message : "Failed to load");
                setItems([]);
                setTotal(0);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
            ac.abort();
        };
    }, [page, pageSize, depsKey, reloadKey]);

    const setPageSize = useCallback((size: number) => {
        setPageSizeState(size);
        setPage(1);
    }, []);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
        items,
        total,
        page,
        pageSize,
        totalPages,
        loading,
        error,
        setPage,
        setPageSize,
        reload,
    };
}
