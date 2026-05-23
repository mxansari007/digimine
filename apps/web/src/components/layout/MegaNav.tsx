"use client";

/**
 * Mega-dropdown header nav. Each top-level item exposes a wide panel with a
 * hero block (image + intro + CTA), sub-link columns, and a featured row
 * of thumbnail cards. The visual pattern is what you see on Stripe, Linear,
 * Vercel — the goal is to give visitors a guided "what can I do here?" peek
 * rather than just six bare links.
 *
 *  - Hover an item to open after a small intent delay (120ms). Leaving the
 *    item AND the panel for 150ms closes it. Closes also on Escape and on
 *    click-outside.
 *  - Clicking a trigger label navigates to that item's main `href`. The
 *    chevron next to the label is a hover affordance, not a separate
 *    target — same behavior pattern as Stripe.
 *  - Single panel is rendered at the parent's level so the horizontal
 *    position is consistent regardless of which trigger is hovered. The
 *    panel slides between accent palettes with a smooth color transition.
 *  - Reduced-motion: animations collapse to instant; the panel still works.
 *
 * Mobile users never see this — the parent renders a separate drawer-style
 * link list when `md:hidden`.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { megaNav, type MegaItem } from "./megaNavData";

const ACCENT: Record<
    MegaItem["accent"],
    { ring: string; chip: string; text: string; underline: string }
> = {
    primary: {
        ring: "ring-primary-200",
        chip: "bg-primary-50 text-primary-700",
        text: "text-primary-700",
        underline: "bg-primary-500",
    },
    amber: {
        ring: "ring-amber-200",
        chip: "bg-amber-50 text-amber-700",
        text: "text-amber-700",
        underline: "bg-amber-500",
    },
    emerald: {
        ring: "ring-emerald-200",
        chip: "bg-emerald-50 text-emerald-700",
        text: "text-emerald-700",
        underline: "bg-emerald-500",
    },
    indigo: {
        ring: "ring-indigo-200",
        chip: "bg-indigo-50 text-indigo-700",
        text: "text-indigo-700",
        underline: "bg-indigo-500",
    },
    rose: {
        ring: "ring-rose-200",
        chip: "bg-rose-50 text-rose-700",
        text: "text-rose-700",
        underline: "bg-rose-500",
    },
    violet: {
        ring: "ring-violet-200",
        chip: "bg-violet-50 text-violet-700",
        text: "text-violet-700",
        underline: "bg-violet-500",
    },
};

export default function MegaNav() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const openTimer = useRef<number | null>(null);
    const closeTimer = useRef<number | null>(null);

    const scheduleOpen = (i: number) => {
        if (closeTimer.current) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        if (openIndex === i) return;
        openTimer.current = window.setTimeout(() => setOpenIndex(i), 120);
    };

    const scheduleClose = () => {
        if (openTimer.current) {
            window.clearTimeout(openTimer.current);
            openTimer.current = null;
        }
        closeTimer.current = window.setTimeout(() => setOpenIndex(null), 150);
    };

    const cancelClose = () => {
        if (closeTimer.current) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };

    // Escape + click-outside.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenIndex(null);
        };
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpenIndex(null);
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onDown);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDown);
        };
    }, []);

    const active = openIndex !== null ? megaNav[openIndex] : null;

    return (
        <div ref={rootRef} className="relative">
            {/* Triggers row */}
            <nav className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
                {megaNav.map((item, i) => {
                    const isOpen = openIndex === i;
                    const accent = ACCENT[item.accent];
                    return (
                        <div
                            key={item.label}
                            onMouseEnter={() => scheduleOpen(i)}
                            onMouseLeave={scheduleClose}
                            className="relative"
                        >
                            <Link
                                href={item.href}
                                onClick={() => setOpenIndex(null)}
                                className={`relative flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold tracking-wide transition-colors ${
                                    isOpen
                                        ? `${accent.text} bg-white shadow-sm`
                                        : "text-slate-600 hover:bg-white hover:text-primary-700"
                                }`}
                                aria-expanded={isOpen}
                                aria-haspopup="true"
                            >
                                {item.label}
                                <svg
                                    aria-hidden
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    className={`h-3 w-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </Link>
                        </div>
                    );
                })}
            </nav>

            {/* Panel — single instance, swaps content based on active index.
                Landscape 3-column layout: hero (left) · sections (middle) ·
                featured cards stacked (right). Wider, shorter, less portrait. */}
            {active && (
                <div
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    role="region"
                    aria-label={`${active.label} menu`}
                    /* Full-bleed panel — spans edge to edge across the viewport
                       so it reads as the header "unfolding". The inner content
                       is constrained by `container-page` so it stays readable
                       on wide monitors. Border radius only at the bottom (the
                       top blends with the sticky header). */
                    className="mega-panel-enter fixed inset-x-0 top-[4rem] z-50 overflow-hidden rounded-b-3xl border-b border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5"
                >
                    <div className="container-page py-2">
                        <div className="grid gap-0 md:grid-cols-[1.05fr_1.1fr_1.05fr]">
                            {/* LEFT — Hero block */}
                            <HeroBlock item={active} />

                            {/* MIDDLE — Sub-link sections, stacked vertically */}
                            <div className="space-y-6 p-6">
                                {active.sections.map((section) => (
                                    <div key={section.heading}>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                            {section.heading}
                                        </p>
                                        <ul className="mt-2 space-y-0.5">
                                            {section.items.map((link) => (
                                                <li key={link.href + link.label}>
                                                    <Link
                                                        href={link.href}
                                                        onClick={() => setOpenIndex(null)}
                                                        className="group block rounded-lg px-2.5 py-1.5 transition-colors hover:bg-slate-50"
                                                    >
                                                        <p className="text-sm font-semibold text-slate-900 group-hover:text-primary-700">
                                                            {link.label}
                                                        </p>
                                                        {link.description && (
                                                            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                                                {link.description}
                                                            </p>
                                                        )}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            {/* RIGHT — Featured cards stacked vertically */}
                            {active.featured.length > 0 && (
                                <div className="border-l border-slate-100 bg-slate-50/40 p-6">
                                    <div className="mb-3 flex items-baseline justify-between">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                            Featured
                                        </p>
                                        <Link
                                            href={active.href}
                                            onClick={() => setOpenIndex(null)}
                                            className={`text-xs font-semibold ${ACCENT[active.accent].text} hover:underline`}
                                        >
                                            See all →
                                        </Link>
                                    </div>
                                    <div className="space-y-2.5">
                                        {active.featured.slice(0, 3).map((f) => (
                                            <Link
                                                key={f.href + f.title}
                                                href={f.href}
                                                onClick={() => setOpenIndex(null)}
                                                className="group flex items-center gap-3 rounded-xl border border-transparent bg-white p-2 transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-sm"
                                            >
                                                <div
                                                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${f.gradient}`}
                                                >
                                                    {/* Real cover image sits over the gradient when
                                                        provided; gradient remains visible while the
                                                        image loads or if it 404s. */}
                                                    {f.imageUrl && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={f.imageUrl}
                                                            alt=""
                                                            loading="lazy"
                                                            className="absolute inset-0 h-full w-full object-cover"
                                                        />
                                                    )}
                                                    {f.badge && (
                                                        <span className="absolute left-1 top-1 z-10 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700 shadow-sm">
                                                            {f.badge}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900 group-hover:text-primary-700">
                                                        {f.title}
                                                    </p>
                                                    <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                                        {f.description}
                                                    </p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function HeroBlock({ item }: { item: MegaItem }) {
    const accent = ACCENT[item.accent];
    return (
        <div className="relative flex flex-col overflow-hidden bg-slate-50 p-6">
            <div
                aria-hidden
                className={`absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br ${item.hero.gradient} opacity-20 blur-3xl`}
            />
            {/* Compact thumbnail strip — wider than tall so the panel stays
                landscape. Gradient is the fallback; a real `imageUrl` paints
                over it (and remains visible while the image loads / on 404). */}
            <div
                className={`relative aspect-[3/1] w-full overflow-hidden rounded-xl bg-gradient-to-br ${item.hero.gradient} shadow-md`}
            >
                {item.hero.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.hero.imageUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                )}
            </div>
            <h3 className="relative mt-4 font-display text-lg font-bold text-slate-900">
                {item.hero.heading}
            </h3>
            <p className="relative mt-1.5 text-[13px] leading-5 text-slate-600">
                {item.hero.description}
            </p>
            <Link
                href={item.hero.cta.href}
                className={`relative mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-br ${item.hero.gradient} px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5`}
            >
                {item.hero.cta.label}
                <span aria-hidden>→</span>
            </Link>
            {item.hero.stats && item.hero.stats.length > 0 && (
                <div className="relative mt-auto flex gap-5 pt-5">
                    {item.hero.stats.map((s) => (
                        <div key={s.label}>
                            <p className={`text-base font-black ${accent.text}`}>
                                {s.value}
                            </p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                {s.label}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
