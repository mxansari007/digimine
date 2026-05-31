"use client";

/**
 * Title + subtitle block that sits above each step card. Centralises the
 * onboarding typography so every page renders an identical-looking header.
 *
 *   <StepHeader
 *       title="Verify your phone"
 *       subtitle="We'll text you a 6-digit code to confirm it's really you."
 *   />
 *
 * Optional `eyebrow` renders a small uppercase chip above the title (used
 * by the institute success screen to surface "Institute created"). Optional
 * `icon` swaps in a coloured circle with a custom SVG.
 */
import type { FC, ReactNode } from "react";

export interface StepHeaderProps {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    icon?: ReactNode;
    align?: "center" | "left";
    className?: string;
}

export const StepHeader: FC<StepHeaderProps> = ({
    title,
    subtitle,
    eyebrow,
    icon,
    align = "center",
    className,
}) => {
    const alignment = align === "center" ? "items-center text-center" : "items-start text-left";
    return (
        <div className={`flex flex-col ${alignment} ${className ?? ""}`}>
            {icon && (
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-300 ring-1 ring-primary-100 dark:ring-primary-500/25">
                    {icon}
                </div>
            )}
            {eyebrow && (
                <p className="mb-2 inline-flex rounded-full bg-primary-50 dark:bg-primary-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300 ring-1 ring-primary-100 dark:ring-primary-500/25">
                    {eyebrow}
                </p>
            )}
            <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
            {subtitle && (
                <p className="mt-2 max-w-md text-sm text-slate-500 sm:text-base">{subtitle}</p>
            )}
        </div>
    );
};
