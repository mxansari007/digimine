"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Bulk-selection hook for admin list pages. Tracks a Set of selected IDs plus
 * a "last clicked" anchor so Shift+click can range-select between the anchor
 * and the new click.
 *
 * Three selection gestures (all callable from a row click handler):
 *
 *   - `toggle(id)`                — plain click on the checkbox; flip one row
 *   - `selectExclusive(id)`       — Cmd/Ctrl+click on a row; behaves the same
 *                                   as toggle but also moves the anchor
 *   - `selectRange(id, allIds)`   — Shift+click; selects every row between
 *                                   the anchor and `id`, inclusive
 *
 * `allIds` is the *current* visible ordering — pass it from the component
 * so range-select honors filters/sorts as the user sees them. Without an
 * anchor (first click), Shift+click degrades to single-select.
 */
export function useBulkSelection<TId extends string | number = string>() {
    const [selected, setSelected] = useState<Set<TId>>(new Set());
    const anchorRef = useRef<TId | null>(null);

    const isSelected = useCallback((id: TId) => selected.has(id), [selected]);

    const toggle = useCallback((id: TId) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        anchorRef.current = id;
    }, []);

    const selectExclusive = useCallback((id: TId) => {
        // Same effect as toggle for now — kept as a separate API so the call
        // site can express intent ("user Cmd-clicked" vs "checkbox click").
        toggle(id);
    }, [toggle]);

    const selectRange = useCallback((id: TId, allIds: TId[]) => {
        const anchor = anchorRef.current;
        if (anchor == null) {
            // No anchor yet — degrade to a plain toggle and seed the anchor.
            setSelected((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            anchorRef.current = id;
            return;
        }
        const startIdx = allIds.indexOf(anchor);
        const endIdx = allIds.indexOf(id);
        if (startIdx === -1 || endIdx === -1) {
            toggle(id);
            return;
        }
        const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        setSelected((prev) => {
            const next = new Set(prev);
            for (let i = lo; i <= hi; i++) next.add(allIds[i]);
            return next;
        });
        // Don't move the anchor — the anchor stays put so the next Shift+click
        // adjusts the same range. Matches macOS Finder + Gmail behaviour.
    }, [toggle]);

    const selectAll = useCallback((allIds: TId[]) => {
        setSelected(new Set(allIds));
        anchorRef.current = allIds[0] ?? null;
    }, []);

    const clear = useCallback(() => {
        setSelected(new Set());
        anchorRef.current = null;
    }, []);

    const count = selected.size;
    const ids = useMemo(() => Array.from(selected), [selected]);

    return {
        selected,
        ids,
        count,
        isSelected,
        toggle,
        selectExclusive,
        selectRange,
        selectAll,
        clear,
    };
}

/**
 * Helper for click handlers — converts a React mouse event + plain toggle/
 * range/exclusive callbacks into the right gesture based on Cmd/Ctrl/Shift.
 *
 *   onClick={(e) => handleSelectClick(e, p.id, allIds, sel)}
 *
 * Plain click without modifiers does nothing — call sites that want a plain
 * click to navigate (e.g. to the edit page) handle that with a separate
 * <Link>. This keeps row click behavior unambiguous.
 */
export function handleSelectClick<TId extends string | number>(
    e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; preventDefault?: () => void },
    id: TId,
    allIds: TId[],
    sel: ReturnType<typeof useBulkSelection<TId>>
): boolean {
    if (e.shiftKey) {
        e.preventDefault?.();
        sel.selectRange(id, allIds);
        return true;
    }
    if (e.metaKey || e.ctrlKey) {
        e.preventDefault?.();
        sel.selectExclusive(id);
        return true;
    }
    return false;
}
