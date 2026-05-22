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
        "bg-primary-50 text-primary-700 ring-1 ring-primary-200 hover:bg-primary-100",
    secondary:
        "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200/70",
    destructive:
        "bg-danger-50 text-danger-700 ring-1 ring-danger-200 hover:bg-danger-100",
    outline:
        "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    success:
        "bg-success-50 text-success-700 ring-1 ring-success-200 hover:bg-success-100",
    warning:
        "bg-warning-50 text-warning-700 ring-1 ring-warning-200 hover:bg-warning-100",
    info: "bg-info-50 text-info-700 ring-1 ring-info-200 hover:bg-info-100",
    accent:
        "bg-accent-50 text-accent-700 ring-1 ring-accent-200 hover:bg-accent-100",
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
