"use client";

/**
 * Student-first hero. Replaces the previous audience-tab hero so the visitor
 * isn't forced into a "I am a student / teacher / institute" decision before
 * they've understood the product. Teachers + institutes get their own
 * dedicated band lower on the page.
 *
 * The hero is decorated by two motion treatments:
 *
 *  1. An aurora layer (`.home-aurora`) — a conic gradient with the brand teal
 *     + amber palette, lazily rotating behind the copy. Heavy blur keeps it
 *     subtle (it reads as ambient warmth, not as a graphic).
 *  2. A "console" preview on the right that floats up-and-down on a 7–9s
 *     loop (`.home-float-slow` / `.home-float-slower`) so the page feels alive
 *     without being busy.
 *
 * Both effects honor `prefers-reduced-motion` via the CSS in `globals.css`.
 */

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@digimine/ui";
import { platformStats } from "./data";

export default function HeroStudent() {
    return (
        <section className="relative isolate overflow-hidden border-b border-slate-200 bg-slate-50">
            {/* Aurora layer — slow conic sweep, heavy blur, subtle. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <div className="home-aurora absolute -top-1/4 left-1/2 h-[120%] w-[140%] -translate-x-1/2 opacity-60" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.6)_0%,rgba(255,255,255,0.85)_60%,white_100%)]" />
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(15,23,42,1) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,1) 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />
            </div>

            <div className="container-page relative pt-16 sm:pt-24 lg:pt-28">
                <div className="mx-auto max-w-3xl text-center">
                    <span
                        className="home-hero-fade inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-700 backdrop-blur"
                        style={{ animationDelay: "60ms" }}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                        Free for students
                    </span>

                    <h1
                        className="home-hero-fade font-display mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]"
                        style={{ lineHeight: 1.05, animationDelay: "180ms" }}
                    >
                        Crack your placement.{" "}
                        <span className="bg-gradient-to-r from-primary-700 via-primary-500 to-amber-500 bg-clip-text text-transparent">
                            Practice, learn, repeat.
                        </span>
                    </h1>

                    <p
                        className="home-hero-fade mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg"
                        style={{ animationDelay: "320ms" }}
                    >
                        Free DSA &amp; SQL practice, mock tests with real exam timing, live contests
                        with leaderboards, and articles for every topic — built for Indian
                        placement season and beyond.
                    </p>

                    <div
                        className="home-hero-fade mt-8 flex flex-wrap items-center justify-center gap-3"
                        style={{ animationDelay: "460ms" }}
                    >
                        <Link href="/practice">
                            <Button size="lg">Start practicing free →</Button>
                        </Link>
                        <Link href="/articles">
                            <Button variant="outline" size="lg">
                                Browse articles
                            </Button>
                        </Link>
                    </div>

                    <p
                        className="home-hero-fade mt-4 text-xs text-slate-500"
                        style={{ animationDelay: "560ms" }}
                    >
                        No credit card. No signup needed to start.{" "}
                        <Link
                            href="/login"
                            className="font-semibold text-primary-700 hover:underline"
                        >
                            Already a member?
                        </Link>
                    </p>

                    {/* Stats strip — kept tight, factual */}
                    <div
                        className="home-hero-fade mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
                        style={{ animationDelay: "700ms" }}
                    >
                        {platformStats.slice(0, 4).map((s) => (
                            <div
                                key={s.label}
                                className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-center backdrop-blur"
                            >
                                <p className="text-2xl font-black text-slate-900">{s.value}</p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {s.label}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Full-width drift rail — cards emerge from a cloudy fade on the
                left, drift slowly across, and dissipate into a matching fade on
                the right. Sits at the bottom of the hero so it doesn't compete
                with the headline; viewers see it as ambient demonstration of
                what the platform contains. */}
            <div
                className="home-hero-fade mt-12 pb-16 sm:pb-20"
                style={{ animationDelay: "900ms" }}
            >
                <HeroIllustration />
            </div>
        </section>
    );
}

/**
 * Hero illustration — a slow horizontal rail of preview cards. Cards emerge
 * from a cloudy fade on the left, drift across at ~42s/cycle, and dissolve
 * into a matching fade on the right. Single linear translateX animation
 * (see `.cloud-track`); the cloudy entry/exit is produced by a multi-stop
 * mask gradient + soft radial puffs at each edge (see `.cloud-rail`).
 *
 * Cards are duplicated 2× inside the track so the `-50%` rewind is seamless
 * (the second set lands exactly where the first set started).
 */
function HeroIllustration() {
    return (
        <div className="cloud-rail mx-auto w-full">
            <div className="cloud-track py-4">
                <CardSet />
                <CardSet />
            </div>
        </div>
    );
}

function CardSet() {
    return (
        <>
            <ArticleCard />
            <ProblemCard />
            <LeaderboardCard />
            <QuizCard />
        </>
    );
}

function ArticleCard() {
    return (
        <div className="cloud-card flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="cloud-card-shimmer aspect-[16/9] shrink-0 rounded-lg bg-gradient-to-br from-primary-100 to-amber-100" />
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-primary-700">
                Article · 6 min read
            </p>
            <p className="mt-1 text-sm font-bold leading-snug text-slate-900">
                Top 10 DSA patterns asked in TCS &amp; Wipro
            </p>
            <div className="mt-auto flex items-center gap-2 pt-3">
                <div className="h-6 w-6 rounded-full bg-primary-200" />
                <p className="text-xs text-slate-500">Editorial · 2 days ago</p>
            </div>
        </div>
    );
}

function ProblemCard() {
    return (
        <div className="cloud-card flex flex-col rounded-2xl border border-slate-700 bg-slate-950 p-5 text-white shadow-xl">
            <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    DSA
                </span>
                <span className="text-[10px] text-slate-400">easy</span>
            </div>
            <p className="mt-3 text-sm font-bold">Two-sum, return indices</p>
            <pre className="mt-3 overflow-hidden rounded-lg bg-black/40 p-3 font-mono text-[10px] leading-5 text-emerald-200">{`def two_sum(nums, t):
  seen = {}
  for i,n in enumerate(nums):
    if t-n in seen:
      return [seen[t-n], i]
    seen[n] = i`}</pre>
            <div className="mt-auto flex items-center justify-between pt-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="h-3 w-3" aria-hidden /> accepted</span>
                <span className="text-slate-400">Runtime 24ms</span>
            </div>
        </div>
    );
}

function LeaderboardCard() {
    return (
        <div className="cloud-card flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">
                    Live contest
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                    LIVE
                </span>
            </div>
            <p className="mt-2 text-sm font-bold text-slate-900">Aptitude sprint #14</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Ends in 04:12</p>
            <div className="mt-3 space-y-2">
                {[
                    { rank: 1, name: "Aarav S.", score: "98%" },
                    { rank: 2, name: "Priya K.", score: "94%" },
                    { rank: 3, name: "Rahul M.", score: "92%" },
                    { rank: 4, name: "You", score: "91%", highlight: true },
                ].map((r) => (
                    <div
                        key={r.rank}
                        className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs ${
                            r.highlight
                                ? "bg-primary-50 font-bold text-primary-700"
                                : "text-slate-600"
                        }`}
                    >
                        <span>
                            #{r.rank}&nbsp;&nbsp;{r.name}
                        </span>
                        <span>{r.score}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QuizCard() {
    return (
        <div className="cloud-card flex flex-col rounded-2xl border border-violet-200 bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700">
                    Quiz
                </span>
                <span className="text-[10px] text-slate-400">10 questions</span>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">Time-complexity drill</p>
            <p className="mt-1 text-[11px] text-slate-500">Big-O reasoning, 5 min sprint</p>
            <div className="mt-4 space-y-2 text-xs">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
                    Q3 · for-loop in for-loop is…
                </div>
                {["O(n)", "O(n²)", "O(log n)", "O(1)"].map((opt, i) => (
                    <div
                        key={opt}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                            i === 1
                                ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-700"
                                : "border-slate-200 text-slate-600"
                        }`}
                    >
                        <span className="text-[10px] font-bold text-slate-400">
                            {String.fromCharCode(65 + i)}.
                        </span>
                        <span>{opt}</span>
                        {i === 1 && (
                            <Check className="ml-auto h-3.5 w-3.5 text-emerald-700" aria-hidden />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
