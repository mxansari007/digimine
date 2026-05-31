import * as React from "react";

/**
 * Card component props
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Add a subtle shadow (default true). */
    elevated?: boolean;
    /** Add hover lift + brand tint. */
    hoverable?: boolean;
    /** Padding size */
    padding?: "none" | "sm" | "md" | "lg" | "xl";
    /**
     * Semantic tint, applies a subtle background tint and matching left
     * border. Helpful for callouts (success, warning, info, danger, accent).
     */
    intent?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "accent";
    children: React.ReactNode;
}

/**
 * Padding class mappings
 */
const paddingClasses: Record<NonNullable<CardProps["padding"]>, string> = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
    xl: "p-8",
};

const intentClasses: Record<NonNullable<CardProps["intent"]>, string> = {
    default: "border-slate-200 bg-white",
    primary: "border-primary-200 dark:border-primary-500/30 bg-primary-50/60 dark:bg-primary-500/10",
    success: "border-success-200 dark:border-success-500/30 bg-success-50/60 dark:bg-success-500/10",
    warning: "border-warning-200 dark:border-warning-500/30 bg-warning-50/60 dark:bg-warning-500/10",
    danger: "border-danger-200 dark:border-danger-500/30 bg-danger-50/60 dark:bg-danger-500/10",
    info: "border-info-200 dark:border-info-500/30 bg-info-50/60 dark:bg-info-500/10",
    accent: "border-accent-200 dark:border-accent-500/30 bg-accent-50/60 dark:bg-accent-500/10",
};

/**
 * Reusable Card component
 */
export function Card({
    elevated = true,
    hoverable = false,
    padding = "md",
    intent = "default",
    children,
    className = "",
    ...props
}: CardProps): React.JSX.Element {
    const baseClasses =
        "rounded-2xl border transition-[transform,box-shadow,border-color] duration-200 ease-out";
    const elevatedClasses = elevated ? "shadow-soft-sm" : "";
    const hoverClasses = hoverable
        ? "hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-soft cursor-pointer"
        : "";

    return (
        <div
            className={[
                baseClasses,
                intentClasses[intent],
                elevatedClasses,
                hoverClasses,
                paddingClasses[padding],
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            {...props}
        >
            {children}
        </div>
    );
}
