import * as React from "react";

/**
 * Button variants
 */
export type ButtonVariant =
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger"
    | "success"
    | "gradient";

/**
 * Button sizes
 */
export type ButtonSize = "sm" | "md" | "lg" | "xl";

/**
 * Button component props
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
    children: React.ReactNode;
}

/**
 * Variant class mappings — tuned for the teal primary / amber accent palette.
 * Each variant defines a base appearance, hover, focus ring, and disabled
 * state in one string so the component itself stays simple.
 */
const variantClasses: Record<ButtonVariant, string> = {
    primary:
        "border border-primary-600 bg-primary-600 text-white shadow-soft-sm hover:bg-primary-700 hover:border-primary-700 hover:shadow-soft focus-visible:ring-primary-300 disabled:border-primary-200 disabled:bg-primary-200 disabled:shadow-none",
    secondary:
        "border border-slate-200 bg-white text-slate-800 shadow-soft-sm hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-200 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none",
    outline:
        "border border-slate-200 bg-white text-slate-700 shadow-soft-sm hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-primary-200 disabled:border-slate-100 disabled:text-slate-300 disabled:shadow-none",
    ghost:
        "border border-transparent text-slate-600 hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-primary-200 disabled:text-slate-300",
    danger:
        "border border-danger-600 bg-danger-600 text-white shadow-soft-sm hover:bg-danger-700 hover:border-danger-700 focus-visible:ring-danger-200 disabled:border-danger-200 disabled:bg-danger-200 disabled:shadow-none",
    success:
        "border border-success-600 bg-success-600 text-white shadow-soft-sm hover:bg-success-700 hover:border-success-700 focus-visible:ring-success-200 disabled:border-success-200 disabled:bg-success-200 disabled:shadow-none",
    gradient:
        "border border-transparent bg-gradient-to-r from-primary-600 via-primary-500 to-accent-500 text-white shadow-soft hover:shadow-glow-primary hover:brightness-110 focus-visible:ring-primary-300 disabled:from-primary-200 disabled:via-primary-200 disabled:to-accent-200 disabled:shadow-none",
};

/**
 * Size class mappings
 */
const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-sm gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2",
    xl: "px-6 py-3 text-base gap-2.5",
};

/**
 * Reusable Button component
 */
export function Button({
    variant = "primary",
    size = "md",
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    children,
    className = "",
    disabled,
    ...props
}: ButtonProps): React.JSX.Element {
    const baseClasses =
        "relative inline-flex items-center justify-center font-semibold rounded-xl transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 select-none";

    return (
        <button
            className={[
                baseClasses,
                variantClasses[variant],
                sizeClasses[size],
                fullWidth ? "w-full" : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <svg
                    className="-ml-0.5 mr-1 h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            ) : leftIcon ? (
                <span className="inline-flex shrink-0 items-center">{leftIcon}</span>
            ) : null}
            <span className="inline-flex items-center">{children}</span>
            {rightIcon && !isLoading && <span className="inline-flex shrink-0 items-center">{rightIcon}</span>}
        </button>
    );
}
