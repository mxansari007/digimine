"use client";

/**
 * Reusable paywall card shown when a user hits a premium-only feature.
 *
 * Two modes:
 *   - Default: a full-bleed card with the upgrade CTA, optional preview
 *     content (e.g. the first paragraph of an article) shown above it.
 *   - `compact`: a thin banner suitable for inline placement (e.g. above
 *     a locked Editorial tab) when we don't want to take over the page.
 *
 * Always links to `/membership` and preserves the user's current path
 * in `?redirect=` so we can bounce them back after subscribing.
 */
import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Card } from "@digimine/ui";

interface Props {
    /** Headline e.g. "This problem is part of Premium". */
    title?: string;
    /** Body copy explaining WHY this is gated. */
    reason?: string;
    /** Bulleted list of what they unlock. */
    perks?: string[];
    /** Optional content shown above the paywall (article excerpt, etc). */
    preview?: React.ReactNode;
    /** Compact inline banner instead of a full card. */
    compact?: boolean;
    /** Override the destination if you want a custom CTA URL. */
    href?: string;
    /** Override the CTA label. */
    ctaLabel?: string;
}

const DEFAULT_PERKS = [
    "Unlock every premium DSA / SQL problem & full editorial walkthroughs",
    "Access all premium mock tests, quizzes, courses and articles",
    "Priority code execution — your submissions skip the queue",
    "Revision Radar spaced-repetition + Mentor Rescue hints",
];

export function Paywall({
    title = "Unlock with Premium",
    reason = "This is a Premium-only feature on PlacementRanker.",
    perks = DEFAULT_PERKS,
    preview,
    compact = false,
    href,
    ctaLabel = "View plans",
}: Props) {
    const pathname = usePathname();
    const ctaHref = useMemo(() => {
        if (href) return href;
        const next = pathname || "/membership";
        return `/membership?redirect=${encodeURIComponent(next)}`;
    }, [href, pathname]);

    if (compact) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-base">🔒</span>
                    <span className="font-semibold text-amber-900">{title}</span>
                    <span className="text-amber-800/80">{reason}</span>
                </div>
                <Link href={ctaHref}>
                    <Button variant="primary" size="sm">{ctaLabel}</Button>
                </Link>
            </div>
        );
    }

    return (
        <>
            {preview && <div className="mb-6">{preview}</div>}
            <Card className="overflow-hidden p-0">
                <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 px-6 py-8 text-center text-white sm:px-10 sm:py-12">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                        <span>★</span> Premium
                    </span>
                    <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{title}</h2>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-white/85 sm:text-base">{reason}</p>
                </div>
                <div className="px-6 py-6 sm:px-10 sm:py-8">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        What you unlock
                    </p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {perks.map((p) => (
                            <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="mt-0.5 text-primary-600">✓</span>
                                <span>{p}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Link href={ctaHref}>
                            <Button variant="primary" size="lg">{ctaLabel}</Button>
                        </Link>
                        <Link
                            href="/membership"
                            className="text-sm font-medium text-primary-700 hover:underline"
                        >
                            Compare plans →
                        </Link>
                    </div>
                </div>
            </Card>
        </>
    );
}

export default Paywall;
