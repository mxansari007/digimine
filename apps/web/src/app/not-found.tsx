/**
 * Site-wide 404 — caught automatically by Next when no route matches and any
 * `notFound()` call from a server component falls through to here.
 *
 * Goals:
 *  - Stay on-brand (logo, gradient, primary palette) so 404s feel like part
 *    of the product, not a Vercel default.
 *  - Always give the user a way out: search bar that drops them into the
 *    articles index pre-filled, plus quick links to the busy sections.
 *  - Don't hard-code the dashboard link — signed-out users hitting a dead URL
 *    should land somewhere useful (the public homepage), not a login wall.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@digimine/ui";
import NotFoundSearch from "@/app/_components/NotFoundSearch";

export const metadata: Metadata = {
    title: "Page not found · PlacementRanker",
    robots: { index: false, follow: false },
};

const QUICK_LINKS: { href: string; label: string; hint: string }[] = [
    { href: "/articles", label: "Articles", hint: "Tutorials, deep-dives, placement news" },
    { href: "/courses", label: "Courses", hint: "Structured learning tracks" },
    { href: "/practice", label: "Practice", hint: "DSA + SQL problem sets" },
    { href: "/tests", label: "Test series", hint: "Aptitude, coding, mock placement tests" },
    { href: "/contests", label: "Contests", hint: "Live competitive events" },
    { href: "/quizzes", label: "Quizzes", hint: "Quick topic checks" },
];

export default function NotFound() {
    return (
        <main className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden bg-slate-50">
            {/* Soft background flourish — same teal palette as the logo. */}
            <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-100/60 dark:from-teal-500/15 via-white dark:via-surface to-white dark:to-surface"
            />
            <div
                aria-hidden
                className="absolute -top-32 right-[-10%] -z-10 h-[420px] w-[420px] rounded-full bg-teal-200/30 blur-3xl"
            />
            <div
                aria-hidden
                className="absolute bottom-[-15%] left-[-10%] -z-10 h-[420px] w-[420px] rounded-full bg-emerald-200/30 blur-3xl"
            />

            <div className="container-page py-16 sm:py-24">
                <div className="mx-auto max-w-3xl text-center">
                    <Logo iconSize={44} className="justify-center" />

                    <p className="mt-10 text-xs font-bold uppercase tracking-[0.25em] text-primary-600">
                        404 · page not found
                    </p>
                    <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                        This page didn&apos;t make the cut.
                    </h1>
                    <p className="mt-4 text-base text-slate-600 sm:text-lg">
                        The link might be old, mistyped, or the page was retired. Try a
                        search or jump into one of the sections below.
                    </p>

                    <NotFoundSearch className="mt-8" />

                    <div className="mt-12 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
                        {QUICK_LINKS.map((q) => (
                            <Link
                                key={q.href}
                                href={q.href}
                                className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-sm"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-900">
                                        {q.label}
                                    </span>
                                    <span className="text-primary-600 transition-transform group-hover:translate-x-0.5">
                                        →
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{q.hint}</p>
                            </Link>
                        ))}
                    </div>

                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
                        <Link
                            href="/"
                            className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-primary-700"
                        >
                            ← Back to homepage
                        </Link>
                        <Link
                            href="/articles"
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                            Browse articles
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
