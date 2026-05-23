"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@digimine/ui";
import { audiencePanels, platformStats, type AudienceKey } from "./data";

/**
 * Client island for the homepage hero — owns the `audience` tab state and
 * renders the headline / CTAs / bullets / right-hand stat card that swap as
 * the visitor flips between Student / Teacher / Institute.
 *
 * Everything OUTSIDE this block (the hero <Image>, the gradient overlay, the
 * announcement strip, the audience-cards section below) stays in the server
 * page — so initial HTML is fully rendered and the LCP image isn't blocked.
 */
export default function HeroAudienceBlock() {
    const [audience, setAudience] = useState<AudienceKey>("student");
    const activePanel = audiencePanels[audience];

    return (
        <div className="container-page relative z-10 py-14 sm:py-20">
            <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                {/* Left: copy */}
                <div>
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary-100 backdrop-blur-md">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {activePanel.subline}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                            {activePanel.label}
                        </span>
                    </div>
                    <h1
                        className="font-display max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
                        style={{ lineHeight: 1.05 }}
                    >
                        {activePanel.headline}
                    </h1>
                    <p className="mt-6 max-w-2xl text-base text-slate-200 sm:text-lg" style={{ lineHeight: 1.7 }}>
                        {activePanel.description}
                    </p>

                    {/* Role pills */}
                    <div className="mt-8 inline-flex rounded-2xl border border-white/15 bg-white/[0.06] p-1 backdrop-blur" role="tablist" aria-label="Choose your audience">
                        {(Object.keys(audiencePanels) as AudienceKey[]).map((key) => {
                            const panel = audiencePanels[key];
                            const active = key === audience;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setAudience(key)}
                                    className={`relative rounded-xl px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:text-sm ${
                                        active ? "bg-white text-slate-950 shadow" : "text-slate-200 hover:bg-white/10"
                                    }`}
                                >
                                    {panel.label.replace("For ", "")}
                                    {panel.comingSoon && (
                                        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${active ? "bg-amber-100 text-amber-700" : "bg-amber-500/20 text-amber-300"}`}>
                                            Soon
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                        <Link href={activePanel.ctaPrimary.href}>
                            <Button size="lg">{activePanel.ctaPrimary.label}</Button>
                        </Link>
                        <Link href={activePanel.ctaSecondary.href}>
                            <Button
                                variant="outline"
                                size="lg"
                                className="!border-white/20 !bg-white/10 !text-white hover:!bg-white hover:!text-slate-950"
                            >
                                {activePanel.ctaSecondary.label}
                            </Button>
                        </Link>
                    </div>

                    {/* Audience-specific bullets */}
                    <div className="mt-10 grid gap-3 sm:grid-cols-2">
                        {activePanel.bullets.slice(0, 4).map((b) => (
                            <div key={b.title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
                                <p className="text-sm font-bold text-white">{b.title}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-300">{b.text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: stat card / preview */}
                <div className="relative">
                    <div className="hero-console relative overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-1 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                        <div className="hero-scanline absolute inset-1 rounded-[1.4rem]" />
                        <div className="relative rounded-[1.4rem] bg-slate-950/[0.9] p-6 ring-1 ring-white/10">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`rounded-full bg-gradient-to-r ${activePanel.accent} px-3 py-1 text-xs font-bold text-white shadow`}>
                                    {activePanel.label.replace("For ", "")}
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Live preview</span>
                            </div>
                            <p className="mt-6 text-5xl font-black text-white sm:text-6xl">{activePanel.stat.value}</p>
                            <p className="text-sm font-semibold text-slate-300">{activePanel.stat.label}</p>

                            <div className="mt-6 space-y-2">
                                {activePanel.bullets.slice(0, 3).map((b, i) => (
                                    <div
                                        key={b.title}
                                        className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"
                                        style={{ animation: `landing-chip-float 4.8s ease-in-out ${i * 0.4}s infinite` }}
                                    >
                                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${activePanel.accent}`} />
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-bold text-white">{b.title}</p>
                                            <p className="line-clamp-1 text-[11px] text-slate-400">{b.text}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-none absolute -right-4 -top-4 hidden sm:block">
                        <span className="inline-flex rounded-full bg-amber-400/90 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-950 shadow-lg">
                            placement-ready
                        </span>
                    </div>
                    <div className="pointer-events-none absolute -left-3 bottom-2 hidden sm:block">
                        <span className="inline-flex rounded-full bg-emerald-400/90 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-950 shadow-lg">
                            live leaderboard
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats strip */}
            <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {platformStats.map((s) => (
                    <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-center backdrop-blur">
                        <p className="text-3xl font-black text-white">{s.value}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300">{s.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
