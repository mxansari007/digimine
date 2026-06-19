"use client";

import { useEffect, useState } from "react";

/**
 * LabAgentDownload — "Get the desktop agent" affordance shown inside the lab.
 *
 * The installable Lab Agent (apps/lab-agent) is what lets a teacher view/control
 * a student's actual machine. Students need a way to GET it from inside the lab,
 * so this renders download buttons for macOS + Windows.
 *
 * The installer URLs are NOT hard-coded — they come from build-time public env so
 * the binaries can live wherever they're hosted (GitHub Releases, Firebase
 * Storage, a CDN, …) without a code change:
 *   • NEXT_PUBLIC_LAB_AGENT_MAC_URL — the macOS .dmg
 *   • NEXT_PUBLIC_LAB_AGENT_WIN_URL — the Windows .exe installer
 * A platform whose URL isn't set renders as a disabled "coming soon" button, so
 * the UI degrades gracefully before the binaries are published.
 */

const MAC_URL = process.env.NEXT_PUBLIC_LAB_AGENT_MAC_URL || "";
const WIN_URL = process.env.NEXT_PUBLIC_LAB_AGENT_WIN_URL || "";

type OS = "mac" | "win" | "other";

function detectOS(): OS {
    if (typeof navigator === "undefined") return "other";
    const ua = `${navigator.userAgent} ${navigator.platform}`;
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "mac";
    if (/Win/i.test(ua)) return "win";
    return "other";
}

export function LabAgentDownload({
    variant = "full",
    className = "",
}: {
    /** "full" = labelled block with both buttons; "inline" = compact one-liner. */
    variant?: "full" | "inline";
    className?: string;
}) {
    // OS is only knowable on the client; default to "other" for SSR so both
    // buttons render equally until hydration highlights the user's platform.
    const [os, setOS] = useState<OS>("other");
    useEffect(() => setOS(detectOS()), []);

    const mac = (
        <DownloadButton
            href={MAC_URL}
            label="macOS"
            sublabel=".dmg"
            primary={os === "mac"}
            icon={<AppleIcon className="h-4 w-4" />}
        />
    );
    const win = (
        <DownloadButton
            href={WIN_URL}
            label="Windows"
            sublabel=".exe"
            primary={os === "win"}
            icon={<WindowsIcon className="h-4 w-4" />}
        />
    );
    // Put the user's platform first.
    const buttons = os === "win" ? [win, mac] : [mac, win];

    if (variant === "inline") {
        return (
            <div className={`flex flex-wrap items-center gap-2 ${className}`}>
                <span className="text-[11px] font-medium text-slate-500">Get the app:</span>
                {buttons.map((b, i) => (
                    <span key={i}>{b}</span>
                ))}
            </div>
        );
    }

    return (
        <div
            className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40 ${className}`}
        >
            <p className="text-[11px] font-semibold text-gray-900">Don&rsquo;t have the app yet?</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
                Download the PlacementRanker Lab Agent for your computer, then pair it with the
                code above.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                {buttons.map((b, i) => (
                    <span key={i}>{b}</span>
                ))}
            </div>
        </div>
    );
}

export default LabAgentDownload;

function DownloadButton({
    href,
    label,
    sublabel,
    primary,
    icon,
}: {
    href: string;
    label: string;
    sublabel: string;
    primary: boolean;
    icon: React.ReactNode;
}) {
    const available = href.length > 0;
    const base =
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors";
    if (!available) {
        return (
            <span
                title="Installer coming soon"
                aria-disabled
                className={`${base} cursor-not-allowed border border-dashed border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500`}
            >
                {icon}
                <span className="flex flex-col items-start leading-tight">
                    <span>{label}</span>
                    <span className="text-[9px] font-normal opacity-70">Coming soon</span>
                </span>
            </span>
        );
    }
    return (
        <a
            href={href}
            // Hint the browser this is a file download (and target the platform
            // even if hosted off-origin). `download` is advisory cross-origin.
            download
            className={
                primary
                    ? `${base} bg-primary-600 text-white shadow-glow-primary hover:bg-primary-700`
                    : `${base} border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60`
            }
        >
            {icon}
            <span className="flex flex-col items-start leading-tight">
                <span>{label}</span>
                <span className="text-[9px] font-normal opacity-70">{sublabel}</span>
            </span>
        </a>
    );
}

function AppleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16.365 1.43c0 1.14-.42 2.2-1.13 3.02-.85.99-2.27 1.76-3.41 1.66a3.6 3.6 0 0 1 1.16-2.94c.79-.86 2.18-1.5 3.18-1.55.02.27.02.55.02.81zM20.5 17.2c-.56 1.27-.83 1.84-1.55 2.96-1.01 1.56-2.43 3.5-4.19 3.51-1.57.02-1.97-1.02-4.1-1.01-2.13.01-2.57 1.03-4.14 1.01-1.76-.02-3.11-1.77-4.12-3.33C-.07 17.6-.39 12.9 1.27 10.4c1.18-1.78 3.04-2.82 4.79-2.82 1.78 0 2.9 1.02 4.37 1.02 1.43 0 2.3-1.02 4.37-1.02 1.55 0 3.2.84 4.37 2.3-3.84 2.1-3.22 7.58 1.06 9.32z" />
        </svg>
    );
}

function WindowsIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M0 3.45 9.75 2.1v9.4H0V3.45zM10.95 1.93 24 0v11.4H10.95V1.93zM0 12.6h9.75V22L0 20.65V12.6zm10.95 0H24V24l-13.05-1.83V12.6z" />
        </svg>
    );
}
