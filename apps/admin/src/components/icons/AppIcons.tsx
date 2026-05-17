type IconProps = {
    className?: string;
};

const baseProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
};

export function BookOpenIcon({ className = "h-5 w-5" }: IconProps) {
    return (
        <svg className={className} {...baseProps}>
            <path d="M12 6.25v13" />
            <path d="M12 6.25C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25" />
            <path d="M12 6.25C13.17 5.48 14.75 5 16.5 5s3.33.48 4.5 1.25v13C19.83 18.48 18.25 18 16.5 18s-3.33.48-4.5 1.25" />
        </svg>
    );
}

export function CheckIcon({ className = "h-5 w-5" }: IconProps) {
    return (
        <svg className={className} {...baseProps}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

export function EditIcon({ className = "h-5 w-5" }: IconProps) {
    return (
        <svg className={className} {...baseProps}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

export function FileTextIcon({ className = "h-5 w-5" }: IconProps) {
    return (
        <svg className={className} {...baseProps}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
        </svg>
    );
}

export function HelpCircleIcon({ className = "h-5 w-5" }: IconProps) {
    return (
        <svg className={className} {...baseProps}>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 1 1 5.8 1c-.6 1.1-1.7 1.6-2.4 2.4-.4.4-.5.8-.5 1.6" />
            <path d="M12 18h.01" />
        </svg>
    );
}

export function TrashIcon({ className = "h-5 w-5" }: IconProps) {
    return (
        <svg className={className} {...baseProps}>
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </svg>
    );
}
