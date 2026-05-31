"use client";

/**
 * Toast system for digimine.
 *
 * Usage:
 *   1. Wrap your root layout once:
 *        import { ToastProvider } from "@digimine/ui";
 *        <ToastProvider>...</ToastProvider>
 *
 *   2. From any client component:
 *        import { useToast } from "@digimine/ui";
 *        const toast = useToast();
 *        toast.success("Saved!");
 *        toast.error("Couldn't save", { description: "Try again in a minute." });
 *        toast.warning("Trial ends in 2 days");
 *        toast.info("Welcome back");
 *
 *   Advanced:
 *        const id = toast.show({ variant: "error", title: "Saving…", duration: 0 });
 *        toast.dismiss(id);   // dismiss manually (e.g., once the async finishes)
 *        toast.update(id, { variant: "success", title: "Saved" });
 *
 *   Action button:
 *        toast.error("Submission failed", {
 *            action: { label: "Retry", onClick: () => retry() },
 *        });
 *
 * Design notes:
 *   - Toasts stack at top-right (top-center on small screens).
 *   - Auto-dismiss defaults: info/success 4s, warning/error 7s. Set
 *     `duration: 0` for sticky toasts (manual dismiss only).
 *   - Hover pauses the auto-dismiss timer for the focused toast.
 *   - `role="status"` for info/success, `role="alert"` for warning/error.
 *   - `aria-live="polite"` / `"assertive"` matches the role so screen
 *     readers announce the toast properly.
 *   - No external dependencies — uses only react + a small portal.
 */
import * as React from "react";
import { createPortal } from "react-dom";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastOptions {
    /** Short headline. Required when calling `show()` directly. */
    title?: string;
    /** Optional sub-text. */
    description?: string;
    /** Auto-dismiss in ms. 0 = sticky. Defaults: success/info 4000, warning/error 7000. */
    duration?: number;
    /** Optional action button (e.g. Retry / Undo). */
    action?: ToastAction;
}

export interface ToastItem extends Required<Pick<ToastOptions, "title">> {
    id: string;
    variant: ToastVariant;
    description?: string;
    duration: number;
    action?: ToastAction;
}

interface ToastContextValue {
    show: (
        opts: ToastOptions & { variant: ToastVariant; title: string }
    ) => string;
    update: (id: string, patch: Partial<Omit<ToastItem, "id">>) => void;
    dismiss: (id: string) => void;
    dismissAll: () => void;
    success: (title: string, opts?: Omit<ToastOptions, "title">) => string;
    error: (title: string, opts?: Omit<ToastOptions, "title">) => string;
    warning: (title: string, opts?: Omit<ToastOptions, "title">) => string;
    info: (title: string, opts?: Omit<ToastOptions, "title">) => string;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastVariant, number> = {
    success: 4000,
    info: 4000,
    warning: 7000,
    error: 7000,
};

function uid(): string {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ToastProvider({
    children,
    /** Max simultaneous toasts. Older ones fall off the top. */
    limit = 5,
}: {
    children: React.ReactNode;
    limit?: number;
}) {
    const [toasts, setToasts] = React.useState<ToastItem[]>([]);
    // Mounted check so we only create the portal client-side.
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const dismiss = React.useCallback((id: string) => {
        setToasts((cur) => cur.filter((t) => t.id !== id));
    }, []);

    const update = React.useCallback(
        (id: string, patch: Partial<Omit<ToastItem, "id">>) => {
            setToasts((cur) =>
                cur.map((t) => (t.id === id ? { ...t, ...patch } : t))
            );
        },
        []
    );

    const show = React.useCallback<ToastContextValue["show"]>(
        (opts) => {
            const id = uid();
            const item: ToastItem = {
                id,
                variant: opts.variant,
                title: opts.title,
                description: opts.description,
                duration:
                    opts.duration === undefined
                        ? DEFAULT_DURATION[opts.variant]
                        : opts.duration,
                action: opts.action,
            };
            setToasts((cur) => {
                const next = [...cur, item];
                // Honour the limit by dropping the oldest.
                return next.length > limit ? next.slice(next.length - limit) : next;
            });
            return id;
        },
        [limit]
    );

    const value = React.useMemo<ToastContextValue>(
        () => ({
            show,
            update,
            dismiss,
            dismissAll: () => setToasts([]),
            success: (title, opts) => show({ ...opts, variant: "success", title }),
            error: (title, opts) => show({ ...opts, variant: "error", title }),
            warning: (title, opts) => show({ ...opts, variant: "warning", title }),
            info: (title, opts) => show({ ...opts, variant: "info", title }),
        }),
        [show, update, dismiss]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            {mounted &&
                createPortal(
                    <ToastViewport
                        toasts={toasts}
                        onDismiss={dismiss}
                    />,
                    document.body
                )}
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = React.useContext(ToastContext);
    if (!ctx) {
        throw new Error(
            "useToast must be used inside <ToastProvider>. Wrap your root layout."
        );
    }
    return ctx;
}

// ── Viewport + Toast UI ─────────────────────────────────────────────────

const VARIANT_STYLES: Record<
    ToastVariant,
    { ring: string; bg: string; iconColor: string; titleColor: string; role: "status" | "alert"; live: "polite" | "assertive" }
> = {
    success: {
        ring: "ring-emerald-200 dark:ring-emerald-500/30",
        bg: "bg-white",
        iconColor: "text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15",
        titleColor: "text-slate-900",
        role: "status",
        live: "polite",
    },
    info: {
        ring: "ring-sky-200 dark:ring-sky-500/30",
        bg: "bg-white",
        iconColor: "text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/15",
        titleColor: "text-slate-900",
        role: "status",
        live: "polite",
    },
    warning: {
        ring: "ring-amber-200 dark:ring-amber-500/30",
        bg: "bg-white",
        iconColor: "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15",
        titleColor: "text-slate-900",
        role: "alert",
        live: "assertive",
    },
    error: {
        ring: "ring-rose-200 dark:ring-rose-500/30",
        bg: "bg-white",
        iconColor: "text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15",
        titleColor: "text-slate-900",
        role: "alert",
        live: "assertive",
    },
};

function VariantIcon({ variant, className }: { variant: ToastVariant; className?: string }) {
    const stroke = "currentColor";
    const common = {
        fill: "none",
        viewBox: "0 0 24 24",
        stroke,
        strokeWidth: 2,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        className,
        "aria-hidden": true,
    };
    if (variant === "success") {
        return (
            <svg {...common}>
                <path d="M20 6L9 17l-5-5" />
            </svg>
        );
    }
    if (variant === "error") {
        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="9" />
                <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
        );
    }
    if (variant === "warning") {
        return (
            <svg {...common}>
                <path d="M12 9v4" />
                <path d="M10.3 3.86l-8.92 15.47A1 1 0 0 0 2.25 21h19.5a1 1 0 0 0 .87-1.67L13.7 3.86a1 1 0 0 0-1.73 0z" />
                <path d="M12 17h.01" />
            </svg>
        );
    }
    // info
    return (
        <svg {...common}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 7h.01" />
        </svg>
    );
}

function CloseIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={className}
        >
            <path d="M18 6L6 18M6 6l12 12" />
        </svg>
    );
}

function ToastViewport({
    toasts,
    onDismiss,
}: {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}) {
    return (
        <div
            aria-label="Notifications"
            className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end sm:px-0"
        >
            {toasts.map((t) => (
                <ToastBubble key={t.id} item={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function ToastBubble({
    item,
    onDismiss,
}: {
    item: ToastItem;
    onDismiss: (id: string) => void;
}) {
    const style = VARIANT_STYLES[item.variant];
    const [phase, setPhase] = React.useState<"enter" | "in" | "out">("enter");
    const pausedRef = React.useRef(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const remainingRef = React.useRef<number>(item.duration);
    const startRef = React.useRef<number>(Date.now());

    // Trigger the enter→in transition on next tick so the initial render
    // shows the "off-screen" state and Tailwind can animate to the
    // "in-place" state.
    React.useEffect(() => {
        const handle = requestAnimationFrame(() => setPhase("in"));
        return () => cancelAnimationFrame(handle);
    }, []);

    const close = React.useCallback(() => {
        setPhase((p) => (p === "out" ? p : "out"));
        // Match the Tailwind exit duration before unmounting.
        window.setTimeout(() => onDismiss(item.id), 180);
    }, [item.id, onDismiss]);

    // Auto-dismiss timer with pause-on-hover.
    React.useEffect(() => {
        if (item.duration <= 0) return;
        startRef.current = Date.now();
        timerRef.current = setTimeout(close, remainingRef.current);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [item.duration, close]);

    const onMouseEnter = () => {
        if (item.duration <= 0 || pausedRef.current) return;
        pausedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        remainingRef.current = Math.max(
            500,
            remainingRef.current - (Date.now() - startRef.current)
        );
    };

    const onMouseLeave = () => {
        if (item.duration <= 0 || !pausedRef.current) return;
        pausedRef.current = false;
        startRef.current = Date.now();
        timerRef.current = setTimeout(close, remainingRef.current);
    };

    const phaseClasses =
        phase === "enter"
            ? "opacity-0 -translate-y-2 scale-[0.98]"
            : phase === "out"
              ? "opacity-0 -translate-y-1 scale-[0.98]"
              : "opacity-100 translate-y-0 scale-100";

    return (
        <div
            role={style.role}
            aria-live={style.live}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={[
                "pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-200 shadow-lg ring-1",
                "transition-all duration-150 ease-out",
                style.bg,
                style.ring,
                phaseClasses,
            ].join(" ")}
        >
            <div className="flex gap-3 p-3.5 sm:p-4">
                <div
                    className={[
                        "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full",
                        style.iconColor,
                    ].join(" ")}
                >
                    <VariantIcon variant={item.variant} className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${style.titleColor}`}>
                        {item.title}
                    </p>
                    {item.description && (
                        <p className="mt-0.5 text-sm text-slate-600">
                            {item.description}
                        </p>
                    )}
                    {item.action && (
                        <button
                            type="button"
                            onClick={() => {
                                item.action?.onClick();
                                close();
                            }}
                            className="mt-2 inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
                        >
                            {item.action.label}
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={close}
                    aria-label="Dismiss notification"
                    className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                    <CloseIcon className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
