/**
 * Compact two-card band that surfaces the teacher + institute offerings
 * without dominating the page (those audiences are smaller — students are the
 * primary visitor). Each card stays self-contained: headline, three bullets,
 * a primary and a secondary CTA, plus a soft accent ring at the top.
 *
 * Server component. Uses the same `landing-motion` reveal as the rest of the
 * page so it animates in smoothly on scroll.
 */
import Link from "next/link";
import { Button } from "@digimine/ui";
import { audiencePanels } from "./data";

export default function TeachersInstitutesBand() {
    const t = audiencePanels.teacher;
    const i = audiencePanels.institute;

    return (
        <section className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white dark:via-surface to-slate-50">
            <div className="container-page py-16 sm:py-20">
                <div className="landing-motion mx-auto max-w-2xl text-center" data-motion>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        Educators &amp; institutes
                    </p>
                    <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                        Teach, run a batch, or scale your institute.
                    </h2>
                    <p className="mt-3 text-sm text-slate-600 sm:text-base">
                        PlacementRanker is also a full LMS for solo teachers and coaching
                        institutes — without the LMS price tag.
                    </p>
                </div>

                <div className="mt-12 grid gap-6 lg:grid-cols-2">
                    {/* Teachers card */}
                    <div
                        className="landing-motion landing-lift-card home-shine relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"
                        data-motion
                    >
                        <div
                            aria-hidden
                            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500"
                        />
                        <div className="flex items-center justify-between">
                            <span className="rounded-full bg-amber-50 dark:bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                                For teachers
                            </span>
                            <span className="text-xs font-bold text-amber-700">
                                {t.stat.value}
                            </span>
                        </div>
                        <h3 className="mt-5 font-display text-2xl font-bold text-slate-900">
                            Run your coaching online.
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            Create classes, publish quizzes and mocks, see every attempt in one
                            dashboard. Free to start, no card needed.
                        </p>
                        <ul className="mt-5 space-y-2.5 text-sm">
                            {t.bullets.slice(0, 3).map((b) => (
                                <li key={b.title} className="flex items-start gap-2.5">
                                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                            className="h-3 w-3"
                                            aria-hidden
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="font-semibold text-slate-900">
                                            {b.title}.{" "}
                                        </span>
                                        <span className="text-slate-600">{b.text}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-7 flex flex-wrap gap-2">
                            <Link href={t.ctaPrimary.href}>
                                <Button size="sm">{t.ctaPrimary.label}</Button>
                            </Link>
                            <Link href={t.ctaSecondary.href}>
                                <Button variant="outline" size="sm">
                                    {t.ctaSecondary.label}
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Institutes card */}
                    <div
                        className="landing-motion landing-lift-card home-shine relative overflow-hidden rounded-3xl border border-emerald-200 dark:border-emerald-500/25 bg-white p-7 shadow-sm"
                        data-motion
                    >
                        <div
                            aria-hidden
                            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
                        />
                        <div className="flex items-center justify-between">
                            <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                                For institutes
                            </span>
                            <span className="text-xs font-bold text-emerald-700">
                                From {i.stat.value}/mo
                            </span>
                        </div>
                        <h3 className="mt-5 font-display text-2xl font-bold text-slate-900">
                            A full LMS for your campus.
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            Onboard teachers, manage batches, run institute-wide tests, watch
                            performance across cohorts. Priced for institutes, not enterprises.
                        </p>
                        <ul className="mt-5 space-y-2.5 text-sm">
                            {i.bullets.slice(0, 3).map((b) => (
                                <li key={b.title} className="flex items-start gap-2.5">
                                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                            className="h-3 w-3"
                                            aria-hidden
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="font-semibold text-slate-900">
                                            {b.title}.{" "}
                                        </span>
                                        <span className="text-slate-600">{b.text}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-7 flex flex-wrap gap-2">
                            <Link href={i.ctaPrimary.href}>
                                <Button size="sm">{i.ctaPrimary.label}</Button>
                            </Link>
                            <Link href={i.ctaSecondary.href}>
                                <Button variant="outline" size="sm">
                                    {i.ctaSecondary.label}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
