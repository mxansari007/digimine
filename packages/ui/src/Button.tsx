import * as React from "react";

/**
 * Button variants
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

/**
 * Button sizes
 */
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Button component props
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Variant class mappings
 */
const variantClasses: Record<ButtonVariant, string> = {
    primary:
        "bg-gradient-to-b from-primary-400 via-primary-500 to-primary-700 text-white shadow-[0_10px_24px_rgba(14,165,233,0.22)] hover:from-primary-500 hover:via-primary-600 hover:to-primary-800 hover:shadow-[0_14px_30px_rgba(14,165,233,0.28)] focus:ring-primary-500 disabled:from-primary-300 disabled:via-primary-300 disabled:to-primary-400",
    secondary:
        "bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] hover:from-slate-900 hover:via-slate-950 hover:to-black hover:shadow-[0_14px_30px_rgba(15,23,42,0.22)] focus:ring-slate-500 disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-400",
    outline:
        "border border-slate-200/90 bg-white/90 text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:bg-white hover:border-primary-200 hover:text-primary-700 hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)] focus:ring-primary-100 disabled:border-slate-100 disabled:text-slate-300",
    ghost:
        "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 focus:ring-slate-200 disabled:text-slate-300",
    danger:
        "bg-gradient-to-b from-red-500 via-red-600 to-red-700 text-white shadow-[0_10px_24px_rgba(239,68,68,0.18)] hover:from-red-600 hover:via-red-700 hover:to-red-800 hover:shadow-[0_14px_30px_rgba(239,68,68,0.24)] focus:ring-red-500 disabled:from-red-300 disabled:via-red-300 disabled:to-red-400",
};

/**
 * Size class mappings
 */
const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
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
    children,
    className = "",
    disabled,
    ...props
}: ButtonProps): React.JSX.Element {
    const baseClasses =
        "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none";

    return (
        <button
            className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
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
                <span className="mr-2">{leftIcon}</span>
            ) : null}
            {children}
            {rightIcon && !isLoading && <span className="ml-2">{rightIcon}</span>}
        </button>
    );
}
