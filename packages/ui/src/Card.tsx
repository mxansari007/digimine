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
    primary: "border-primary-200 bg-primary-50/60",
    success: "border-success-200 bg-success-50/60",
    warning: "border-warning-200 bg-warning-50/60",
    danger: "border-danger-200 bg-danger-50/60",
    info: "border-info-200 bg-info-50/60",
    accent: "border-accent-200 bg-accent-50/60",
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
