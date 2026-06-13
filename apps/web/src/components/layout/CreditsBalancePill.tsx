"use client";

/**
 * Header affordance for AI credits — a compact pill showing the live
 * balance that links to the buy/manage page. Renders nothing when credit
 * metering is disabled (launch mode) so the platform looks unchanged.
 */
import Link from "next/link";
import { useCredits } from "@/contexts/CreditsContext";

export default function CreditsBalancePill({ className = "" }: { className?: string }) {
    const { enabled, balance } = useCredits();
    if (!enabled) return null;

    return (
        <Link
            href="/credits"
            aria-label="AI credits"
            title="AI credits — buy or manage"
            className={`inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50/60 px-2.5 py-1 text-sm font-semibold text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20 ${className}`}
        >
            <BoltIcon className="h-4 w-4" />
            <span className="tabular-nums">{balance ?? "—"}</span>
        </Link>
    );
}

/**
 * Full-width row variant for the mobile drawer. Same gating; shows the
 * balance and a "Buy AI credits" label.
 */
export function CreditsMobileRow({ onNavigate }: { onNavigate?: () => void }) {
    const { enabled, balance } = useCredits();
    if (!enabled) return null;

    return (
        <Link
            href="/credits"
            onClick={onNavigate}
            className="flex w-full items-center justify-between rounded-lg border border-primary-200 bg-primary-50/60 px-4 py-2.5 font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300"
        >
            <span className="inline-flex items-center gap-2">
                <BoltIcon className="h-4 w-4" />
                AI Credits
            </span>
            <span className="tabular-nums font-bold">{balance ?? "—"}</span>
        </Link>
    );
}

const BoltIcon = ({ className = "" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
);
