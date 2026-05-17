import * as React from "react";

/**
 * Card component props
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Add a subtle shadow */
    elevated?: boolean;
    /** Add hover effect */
    hoverable?: boolean;
    /** Padding size */
    padding?: "none" | "sm" | "md" | "lg";
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
};

/**
 * Reusable Card component
 */
export function Card({
    elevated = true,
    hoverable = false,
    padding = "md",
    children,
    className = "",
    ...props
}: CardProps): React.JSX.Element {
    const baseClasses = "bg-white/90 rounded-2xl border border-white/70 ring-1 ring-slate-200/70 backdrop-blur-sm transition-all duration-300";
    const elevatedClasses = elevated ? "shadow-[0_18px_50px_rgba(15,23,42,0.08)]" : "";
    const hoverClasses = hoverable
        ? "hover:shadow-[0_22px_60px_rgba(15,23,42,0.12)] hover:border-primary-200/80 hover:-translate-y-0.5 cursor-pointer"
        : "";

    return (
        <div
            className={`${baseClasses} ${elevatedClasses} ${hoverClasses} ${paddingClasses[padding]} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}
