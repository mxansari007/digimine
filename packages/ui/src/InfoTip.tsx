import * as React from "react";

export interface InfoTipProps {
    /** Tooltip body — what this control / term means. */
    children: React.ReactNode;
    /** Accessible label for the trigger (defaults to "More info"). */
    label?: string;
    /** Which side the bubble opens toward. Default "top". */
    side?: "top" | "bottom" | "left" | "right";
    /** Extra classes on the trigger wrapper. */
    className?: string;
}

const SIDE_POSITION: Record<NonNullable<InfoTipProps["side"]>, string> = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left: "right-full top-1/2 mr-2 -translate-y-1/2",
    right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/**
 * A small "ⓘ" info trigger with an explanatory tooltip.
 *
 * Shows on hover (desktop) and on tap/focus (mobile + keyboard) via
 * `group-focus-within`, so it's usable everywhere without JS state. Purely
 * presentational — pass the explanation as children.
 */
export function InfoTip({
    children,
    label = "More info",
    side = "top",
    className = "",
}: InfoTipProps): React.JSX.Element {
    return (
        <span className={`group relative inline-flex align-middle ${className}`}>
            <button
                type="button"
                aria-label={label}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold leading-none text-slate-400 transition-colors hover:border-primary-400 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                // Prevent the trigger from submitting forms / toggling parent
                // labels when it lives inside a <label>.
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5" aria-hidden>
                    <path
                        d="M8 7.25v3.25M8 5.4h.01"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                    />
                </svg>
            </button>
            <span
                role="tooltip"
                className={`pointer-events-none absolute z-50 w-56 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-100 opacity-0 shadow-lg ring-1 ring-black/5 transition-opacity duration-150 invisible group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${SIDE_POSITION[side]}`}
            >
                {children}
            </span>
        </span>
    );
}
