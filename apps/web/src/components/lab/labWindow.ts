"use client";

import { useId, useSyncExternalStore } from "react";

/**
 * labWindow — a tiny global "which lab panel is maximized" store.
 *
 * The lab frames several widgets (Broadcast / Live map / Chat / the view stage)
 * in window chrome that can each MAXIMIZE into a full-viewport portal overlay.
 * If two panels could be maximized at once we'd get stacked backdrops, z-index
 * ties, and an Escape press that restores the wrong (or every) overlay. So
 * maximize is modeled as a SINGLETON: at most one panel id is maximized at any
 * time, app-wide. Maximizing B automatically restores A.
 *
 * Backed by `useSyncExternalStore` (not context) so any panel — including the
 * conditionally-mounted view stage — participates without a provider, and so a
 * panel that unmounts while maximized can cleanly release the slot.
 */

let maximizedId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

/** Maximize `id`, restoring whatever (if anything) was maximized before. */
export function maximizeWindow(id: string) {
    if (maximizedId !== id) {
        maximizedId = id;
        emit();
    }
}

/** Restore `id` (no-op if it isn't the one currently maximized). */
export function restoreWindow(id: string) {
    if (maximizedId === id) {
        maximizedId = null;
        emit();
    }
}

/**
 * A stable per-panel id plus its live maximized flag and toggles. SSR snapshot
 * is always `false` (nothing is maximized on the server).
 */
export function useLabWindow() {
    const id = useId();
    const maximized = useSyncExternalStore(
        subscribe,
        () => maximizedId === id,
        () => false
    );
    return {
        id,
        maximized,
        maximize: () => maximizeWindow(id),
        restore: () => restoreWindow(id),
        toggle: () => (maximizedId === id ? restoreWindow(id) : maximizeWindow(id)),
    };
}
