"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useLabWindow } from "./labWindow";

/**
 * LabPanel — a lightweight "window" chrome wrapper for the lab's main widgets.
 *
 * It frames any child in a titled panel with three window-manager affordances:
 *
 *   • MINIMIZE — collapse the body so only the header bar shows (animated via a
 *     max-height transition); click again to restore.
 *   • MAXIMIZE — lift the panel into a fixed full-viewport overlay (`fixed
 *     inset-3 z-50`) over a dimmed backdrop, with its own scroll, a Restore
 *     button, and Escape-to-restore. Maximize is a singleton across all lab
 *     panels (see {@link useLabWindow}) — opening one restores any other, so
 *     there's never more than one overlay, backdrop, or Escape target.
 *   • RESIZE — when neither minimized nor maximized, the body is user-resizable
 *     via the browser's native handle (`resize: vertical` + `overflow: auto`),
 *     so a teacher can grow the map or shrink the chat to taste. Resize is
 *     disabled while maximized (it fills the overlay).
 *
 * Purely presentational + local UI state; it never touches room state, LiveKit,
 * or any prop of the widget it wraps. Themed with the same semantic tokens as
 * the rest of the lab (surface / border / muted title), dark-mode aware.
 */

export interface LabPanelProps {
    /** Title shown in the header bar. */
    title: string;
    /** Optional leading icon next to the title. */
    icon?: React.ReactNode;
    /** The framed content. */
    children: React.ReactNode;
    /** Start collapsed (header only). Defaults to expanded. */
    defaultMinimized?: boolean;
    /** Extra classes on the outer panel (non-maximized). */
    className?: string;
    /** Extra header controls, rendered left of the window buttons. */
    actions?: React.ReactNode;
}

export function LabPanel({
    title,
    icon,
    children,
    defaultMinimized = false,
    className = "",
    actions,
}: LabPanelProps) {
    const [minimized, setMinimized] = useState(defaultMinimized);
    const bodyId = useId();
    // Maximize is a SINGLETON across all lab panels (see labWindow): opening one
    // restores any other, so we never get stacked overlays / ambiguous Escape.
    const { maximized, maximize, restore } = useLabWindow();
    const setMaximized = (next: boolean) => (next ? maximize() : restore());

    // Escape restores a maximized panel (and only then — we don't want it
    // stealing Escape from menus/inputs while docked). Only one panel is ever
    // maximized at a time, so at most one of these listeners is active.
    useEffect(() => {
        if (!maximized) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") restore();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [maximized, restore]);

    // Release the maximize slot if this panel unmounts while maximized, so a
    // stranded full-screen overlay can never outlive its panel.
    useEffect(() => () => restore(), [restore]);

    // The header bar — identical chrome whether docked or maximized.
    const header = (
        <div className="flex items-center gap-2 border-b border-slate-200/70 bg-slate-50/60 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-800/40">
            {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
            <h3 className="min-w-0 flex-1 truncate font-display text-sm font-bold text-gray-900">
                {title}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
                {actions}
                {/* Minimize is meaningless while maximized; offer Restore instead. */}
                {!maximized && (
                    <PanelButton
                        title={minimized ? "Expand" : "Minimize"}
                        onClick={() => setMinimized((m) => !m)}
                    >
                        {minimized ? <ChevronDownIcon /> : <MinusIcon />}
                    </PanelButton>
                )}
                <PanelButton
                    title={maximized ? "Restore" : "Maximize"}
                    onClick={() => {
                        setMaximized(!maximized);
                        // Coming out of minimized straight into maximized would
                        // show an empty overlay; expand on maximize.
                        if (!maximized) setMinimized(false);
                    }}
                >
                    {maximized ? <RestoreIcon /> : <MaximizeIcon />}
                </PanelButton>
            </div>
        </div>
    );

    // ── Maximized: a fixed full-viewport overlay over a dimmed backdrop. ──
    // Rendered through a portal on document.body so it escapes the page's
    // stacking/transform context and sits ABOVE the app chrome (header z-50,
    // the left nav rail, etc.) instead of being clipped behind the sidebar.
    if (maximized && typeof document !== "undefined") {
        return createPortal(
            <>
                {/* Backdrop dims the rest of the page; a click restores. */}
                <div
                    className="fixed inset-0 z-[190] bg-slate-900/50 backdrop-blur-[2px]"
                    onClick={() => setMaximized(false)}
                    aria-hidden
                />
                <section
                    className="fixed inset-3 z-[200] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-surface"
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                >
                    {header}
                    <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
                </section>
            </>,
            document.body
        );
    }

    // ── Docked: header + a resizable, collapsible body. ──────────────────
    return (
        <section
            className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft-sm dark:border-slate-700 dark:bg-surface ${className}`}
        >
            {header}
            <div
                id={bodyId}
                hidden={minimized}
                className={[
                    "transition-[max-height] duration-300 ease-in-out",
                    minimized
                        ? "max-h-0 overflow-hidden"
                        : // Native vertical resize handle + scroll once grown.
                          "max-h-[5000px] resize-y overflow-auto",
                ].join(" ")}
                style={minimized ? undefined : { minHeight: "8rem" }}
            >
                {children}
            </div>
        </section>
    );
}

export default LabPanel;

// ─────────────────────────────────────────────────────────────────────
// Chrome bits
// ─────────────────────────────────────────────────────────────────────

/** A small square icon button for the window controls. */
function PanelButton({
    title,
    onClick,
    children,
}: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
        >
            {children}
        </button>
    );
}

// ── Icons (stroke-based, currentColor) ───────────────────────────────────

function MinusIcon() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeWidth={2.5} d="M5 12h14" />
        </svg>
    );
}

function ChevronDownIcon() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 9l6 6 6-6" />
        </svg>
    );
}

function MaximizeIcon() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth={2} />
        </svg>
    );
}

function RestoreIcon() {
    return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="8" y="8" width="12" height="12" rx="1.5" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16V5a1 1 0 011-1h11" />
        </svg>
    );
}
