"use client";

/**
 * Theme switcher — an icon trigger that opens a small popover with
 * Light / Dark / System options. Designed to sit in the marketing header and
 * the dashboard sidebar footer alike; placement of the popover is controlled
 * via `align` + `side` so it never clips off-screen in a narrow rail.
 *
 * Styling leans entirely on the design tokens (surface / popover / border /
 * slate), so the control itself looks correct in both light and Tokyo Night.
 */

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme, type Theme } from "./ThemeProvider";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
];

export interface ThemeToggleProps {
    /** Horizontal alignment of the popover relative to the trigger. */
    align?: "start" | "end";
    /** Which side the popover opens toward. */
    side?: "top" | "bottom";
    /** Extra classes for the trigger button. */
    className?: string;
}

export function ThemeToggle({
    align = "end",
    side = "bottom",
    className = "",
}: ThemeToggleProps) {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Only resolve the trigger icon after mount — `resolvedTheme` isn't known
    // during SSR, and gating avoids a wrong-icon flash on first paint.
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const TriggerIcon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Change theme"
                title="Change theme"
                className={
                    "flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-primary-200 dark:hover:border-primary-500/25 hover:bg-primary-50/50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 " +
                    className
                }
            >
                <TriggerIcon className="h-[18px] w-[18px]" />
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Theme"
                    className={
                        "absolute z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-popover p-1.5 shadow-soft-xl " +
                        (side === "top" ? "bottom-full mb-2 " : "top-full mt-2 ") +
                        (align === "start" ? "left-0 origin-top-left" : "right-0 origin-top-right")
                    }
                >
                    {OPTIONS.map(({ value, label, Icon }) => {
                        const active = theme === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                onClick={() => {
                                    setTheme(value);
                                    setOpen(false);
                                }}
                                className={
                                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors " +
                                    (active
                                        ? "bg-slate-100 text-primary-700"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
                                }
                            >
                                <Icon className={"h-4 w-4 " + (active ? "text-primary-600" : "text-slate-400")} />
                                <span className="flex-1 text-left">{label}</span>
                                {active && <Check className="h-4 w-4 text-primary-600" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
