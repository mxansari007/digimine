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
        "bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 disabled:bg-primary-300",
    secondary:
        "bg-accent-600 text-white hover:bg-accent-700 focus:ring-accent-500 disabled:bg-accent-300",
    outline:
        "border-2 border-primary-600 text-primary-600 hover:bg-primary-50 focus:ring-primary-500 disabled:border-gray-300 disabled:text-gray-300",
    ghost:
        "text-gray-700 hover:bg-gray-100 focus:ring-gray-500 disabled:text-gray-300",
    danger:
        "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-300",
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
        "inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed";

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
