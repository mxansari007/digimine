import type { HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: "default" | "secondary" | "destructive" | "outline";
}

export function Badge({ 
    className = "", 
    variant = "default", 
    children,
    ...props 
}: BadgeProps) {
    const baseClasses = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors";
    
    const variantClasses = {
        default: "bg-blue-100 text-blue-800 hover:bg-blue-200",
        secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
        destructive: "bg-red-100 text-red-800 hover:bg-red-200",
        outline: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    };

    const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

    return (
        <span className={classes} {...props}>
            {children}
        </span>
    );
}
