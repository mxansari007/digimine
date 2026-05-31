import type { HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?:
        | "default"
        | "secondary"
        | "destructive"
        | "outline"
        | "success"
        | "warning"
        | "info"
        | "accent";
    size?: "sm" | "md";
}

const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-0.5 text-xs",
} as const;

const variantClasses = {
    default:
        "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 ring-1 ring-primary-200 dark:ring-primary-500/30 hover:bg-primary-100 dark:hover:bg-primary-500/25",
    secondary:
        "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200/70",
    destructive:
        "bg-danger-50 dark:bg-danger-500/15 text-danger-700 dark:text-danger-300 ring-1 ring-danger-200 dark:ring-danger-500/30 hover:bg-danger-100 dark:hover:bg-danger-500/25",
    outline:
        "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    success:
        "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-300 ring-1 ring-success-200 dark:ring-success-500/30 hover:bg-success-100 dark:hover:bg-success-500/25",
    warning:
        "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-300 ring-1 ring-warning-200 dark:ring-warning-500/30 hover:bg-warning-100 dark:hover:bg-warning-500/25",
    info: "bg-info-50 dark:bg-info-500/15 text-info-700 dark:text-info-300 ring-1 ring-info-200 dark:ring-info-500/30 hover:bg-info-100 dark:hover:bg-info-500/25",
    accent:
        "bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-1 ring-accent-200 dark:ring-accent-500/30 hover:bg-accent-100 dark:hover:bg-accent-500/25",
} as const;

export function Badge({
    className = "",
    variant = "default",
    size = "md",
    children,
    ...props
}: BadgeProps) {
    const baseClasses =
        "inline-flex items-center gap-1 rounded-full font-semibold transition-colors";

    return (
        <span
            className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
}
