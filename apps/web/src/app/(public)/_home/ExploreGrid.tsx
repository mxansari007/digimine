/**
 * "Explore the platform" grid. Six clear cards point a casual visitor at the
 * thing they'd actually want to do — no role pickers, no marketing speak. We
 * use this in place of the previous audience-card section so students see
 * concrete actions first.
 *
 * Server component — pure SSR. Hover lift + soft shine animations come from
 * `.landing-lift-card` and `.home-shine` in globals.css. Counts are passed in
 * from the page so we can show "200+ problems / 40+ articles" badges next to
 * each card and demonstrate the platform is alive.
 */
import Link from "next/link";

type Counts = Partial<{
    practice: number;
    tests: number;
    quizzes: number;
    contests: number;
    articles: number;
    courses: number;
}>;

type Card = {
    title: string;
    blurb: string;
    href: string;
    accent: string; // gradient
    chipClass: string;
    iconBg: string;
    countLabel?: string;
    icon: JSX.Element;
};

function num(n?: number): string | undefined {
    if (typeof n !== "number" || n <= 0) return undefined;
    if (n >= 1000) return `${Math.floor(n / 100) / 10}K+`;
    return `${n}+`;
}

export default function ExploreGrid({ counts }: { counts: Counts }) {
    const cards: Card[] = [
        {
            title: "Practice problems",
            blurb: "DSA + SQL. Solve in 4 languages, instant judging, daily streak.",
            href: "/practice",
            accent: "from-primary-500 to-teal-500",
            chipClass: "bg-primary-50 text-primary-700",
            iconBg: "bg-primary-100 text-primary-700",
            countLabel: num(counts.practice) && `${num(counts.practice)} problems`,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                </svg>
            ),
        },
        {
            title: "Mock tests",
            blurb: "Full-length, timed, sectional cutoffs — like the real placement paper.",
            href: "/tests",
            accent: "from-indigo-500 to-blue-500",
            chipClass: "bg-indigo-50 text-indigo-700",
            iconBg: "bg-indigo-100 text-indigo-700",
            countLabel: num(counts.tests) && `${num(counts.tests)} series`,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M9 11l3 3 8-8" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
            ),
        },
        {
            title: "Quizzes",
            blurb: "Quick 5–10 minute topic checks. Concept recall, code output, aptitude.",
            href: "/quizzes",
            accent: "from-amber-500 to-orange-500",
            chipClass: "bg-amber-50 text-amber-700",
            iconBg: "bg-amber-100 text-amber-700",
            countLabel: num(counts.quizzes) && `${num(counts.quizzes)} quizzes`,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 1.7-2.5 3.5" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            ),
        },
        {
            title: "Live contests",
            blurb: "Scheduled sprints, shared clock, ranks lock when the contest ends.",
            href: "/contests",
            accent: "from-rose-500 to-pink-500",
            chipClass: "bg-rose-50 text-rose-700",
            iconBg: "bg-rose-100 text-rose-700",
            countLabel: num(counts.contests) && `${num(counts.contests)} contests`,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
                    <path d="M7 6H4a2 2 0 00-2 2v.5A4.5 4.5 0 006.5 13H8M17 6h3a2 2 0 012 2v.5a4.5 4.5 0 01-4.5 4.5H16" />
                </svg>
            ),
        },
        {
            title: "Articles",
            blurb: "Tutorials, deep-dives, placement news — read what you actually need.",
            href: "/articles",
            accent: "from-emerald-500 to-teal-500",
            chipClass: "bg-emerald-50 text-emerald-700",
            iconBg: "bg-emerald-100 text-emerald-700",
            countLabel: num(counts.articles) && `${num(counts.articles)} articles`,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="7" y1="9" x2="17" y2="9" />
                    <line x1="7" y1="13" x2="17" y2="13" />
                    <line x1="7" y1="17" x2="13" y2="17" />
                </svg>
            ),
        },
        {
            title: "Courses",
            blurb: "Structured learning paths — chapter notes, embedded quizzes, certificates.",
            href: "/courses",
            accent: "from-violet-500 to-purple-500",
            chipClass: "bg-violet-50 text-violet-700",
            iconBg: "bg-violet-100 text-violet-700",
            countLabel: num(counts.courses) && `${num(counts.courses)} courses`,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13c-1.168-.776-2.754-1.253-4.5-1.253s-3.332.477-4.5 1.253" />
                </svg>
            ),
        },
    ];

    return (
        <section className="border-b border-slate-200 bg-white">
            <div className="container-page py-16 sm:py-20">
                <div className="landing-motion max-w-3xl" data-motion>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                        Explore the platform
                    </p>
                    <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                        What can you do here?
                    </h2>
                    <p className="mt-3 text-sm text-slate-600 sm:text-base">
                        Six places to start. Free unless marked otherwise. Pick whichever feels
                        right today — you can always come back for the rest.
                    </p>
                </div>

                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map((c) => (
                        <Link
                            key={c.title}
                            href={c.href}
                            className="landing-motion landing-lift-card home-shine group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-primary-300"
                            data-motion
                        >
                            <div className="flex items-center justify-between">
                                <div
                                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.iconBg}`}
                                >
                                    {c.icon}
                                </div>
                                {c.countLabel && (
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${c.chipClass}`}
                                    >
                                        {c.countLabel}
                                    </span>
                                )}
                            </div>
                            <h3 className="mt-5 font-display text-lg font-bold text-slate-900">
                                {c.title}
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{c.blurb}</p>
                            <div className="mt-6 flex items-center justify-between text-sm font-semibold text-primary-700">
                                <span>Open</span>
                                <span
                                    aria-hidden
                                    className="transition-transform group-hover:translate-x-1"
                                >
                                    →
                                </span>
                            </div>
                            <div
                                aria-hidden
                                className={`absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r ${c.accent} transition-transform duration-300 ease-out group-hover:scale-x-100`}
                            />
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
