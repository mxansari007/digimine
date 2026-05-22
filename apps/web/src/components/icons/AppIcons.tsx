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

export function CalendarIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
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

export function ClockIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function DownloadIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
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

export function FlaskIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M10 2v7.5L4.5 19a2 2 0 0 0 1.73 3h11.54a2 2 0 0 0 1.73-3L14 9.5V2" />
      <path d="M8 2h8" />
      <path d="M7 16h10" />
    </svg>
  );
}

export function HandIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M18 11V7a2 2 0 0 0-4 0v3" />
      <path d="M14 10V6a2 2 0 0 0-4 0v6" />
      <path d="M10 12V8a2 2 0 0 0-4 0v7" />
      <path d="M18 11a2 2 0 1 1 4 0v4a7 7 0 0 1-7 7h-3a8 8 0 0 1-7.7-5.8L3 12a2 2 0 1 1 3.8-1.2L8 14" />
    </svg>
  );
}

export function LockIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function MinusIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function RefreshIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M21 12a9 9 0 0 1-15.2 6.5L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12A9 9 0 0 1 18.2 5.5L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

export function TrophyIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a2 2 0 0 0 2 2h1" />
      <path d="M17 6h3a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}

export function EditIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
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

export function XIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function SearchIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function TargetIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} {...baseProps}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
