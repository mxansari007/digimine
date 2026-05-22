interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg";
    className?: string;
}

const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
};

export function LoadingSpinner({
    size = "md",
    className = "",
}: LoadingSpinnerProps) {
    return (
        <div className={`flex items-center justify-center ${className}`}>
            <svg
                className={`animate-spin text-primary-600 ${sizeClasses[size]}`}
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
        </div>
    );
}

interface PageLoadingProps {
    variant?: "fullscreen" | "inline";
}

/**
 * Full page loading state
 */
export function PageLoading({ variant = "fullscreen" }: PageLoadingProps = {}) {
    if (variant === "inline") {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-gray-600">Loading...</p>
            </div>
        </div>
    );
}
