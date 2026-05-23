import Link from "next/link";
import { Button } from "@digimine/ui";
import {
    getCachedStoreItems,
    getCachedHomeArticles,
    getCachedContests,
    getCachedTests,
    getCachedQuizzes,
    getCachedCourses,
} from "@/lib/server/catalog";
import { workflowSteps, testimonials } from "./_home/data";
import HomeMotion from "./_home/HomeMotion";
import HeroStudent from "./_home/HeroStudent";
import ExploreGrid from "./_home/ExploreGrid";
import LatestContent from "./_home/LatestContent";
import TeachersInstitutesBand from "./_home/TeachersInstitutesBand";
import HomeFeaturedProducts from "./_home/FeaturedProducts";

/**
 * Homepage (server component) — student-first rethink.
 *
 *  - Hero leads with student value (free practice + articles), no role-picker.
 *  - Explore grid shows concrete actions (Practice / Tests / Quizzes /
 *    Contests / Articles / Courses) with live item counts.
 *  - "What's new" block surfaces real, recent content from the catalog so the
 *    page feels alive instead of marketing-only.
 *  - Teacher + institute offerings live in one compact band lower down — they
 *    matter, but they don't dominate.
 *
 * Catalog data is pulled from the same `getCached*` readers the listing pages
 * use, so per-request load is flat (10-minute revalidation window).
 *
 * Three small client islands handle the only interactive / motion pieces:
 *   - <HomeMotion>           IntersectionObserver reveal + cursor parallax.
 *   - <HeroStudent>          slow-floating illustration deck + animated CTAs.
 *   - <HomeFeaturedProducts> seeded grid from server-fetched catalog.
 */
export default async function HomePage() {
    const [storeItems, articles, contests, tests, quizzes, courses] = await Promise.all([
        getCachedStoreItems().catch(() => []),
        getCachedHomeArticles().catch(() => []),
        getCachedContests().catch(() => []),
        getCachedTests().catch(() => []),
        getCachedQuizzes().catch(() => []),
        getCachedCourses().catch(() => []),
    ]);

    const featured = storeItems.slice(0, 4);
    const counts = {
        practice: 200, // sourced statically — practice catalog isn't in catalog.ts
        tests: tests.length,
        quizzes: quizzes.length,
        contests: contests.length,
        articles: articles.length,
        courses: courses.length,
    };

    return (
        <div className="bg-slate-50">
            <HomeMotion />

            {/* Tiny announcement strip — kept tight so it doesn't crowd the hero. */}
            <div className="border-b border-slate-200 bg-slate-950 text-slate-100">
                <div className="container-page flex flex-wrap items-center justify-center gap-3 py-2 text-center text-xs">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                        New
                    </span>
                    <span className="font-medium text-slate-200">
                        Free DSA &amp; SQL practice — solve in Python, Java, C++, or JS with instant judging.
                    </span>
                    <Link
                        href="/practice"
                        className="font-semibold text-emerald-300 hover:text-emerald-200"
                    >
                        Try it →
                    </Link>
                </div>
            </div>

            {/* Student-first animated hero */}
            <HeroStudent />

            {/* What can you do here? — six action cards */}
            <ExploreGrid counts={counts} />

            {/* What's new — real articles + live/upcoming contests */}
            <LatestContent articles={articles} contests={contests} />

            {/* The placement-prep loop */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            How prep works here
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            A four-step rhythm. Learn, drill, mock, review.
                        </h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            Same loop our top students follow. Pick any step — you can always come back
                            for the others.
                        </p>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {workflowSteps.map((step) => (
                            <div
                                key={step.step}
                                className="landing-motion landing-lift-card relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6"
                                data-motion
                            >
                                <p className="font-display text-5xl font-black text-primary-100">
                                    {step.step}
                                </p>
                                <h3 className="mt-3 text-lg font-bold text-slate-900">{step.title}</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">{step.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Featured tests & courses */}
            <section className="border-b border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div
                        className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
                        data-motion
                    >
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                                Browse the catalogue
                            </p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                                Featured tests &amp; courses
                            </h2>
                            <p className="mt-2 text-sm text-slate-600 sm:text-base">
                                Hand-picked for placement prep. Free and paid options.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Link
                                href="/tests"
                                className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                            >
                                Tests →
                            </Link>
                            <Link
                                href="/courses"
                                className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                            >
                                Courses →
                            </Link>
                            <Link
                                href="/products"
                                className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                            >
                                Resources →
                            </Link>
                        </div>
                    </div>
                    <HomeFeaturedProducts items={featured} />
                </div>
            </section>

            {/* Compact educators band (teachers + institutes) */}
            <TeachersInstitutesBand />

            {/* Testimonials */}
            <section className="border-b border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
                <div className="container-page">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-200">
                            Voices from the floor
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl">
                            Students, teachers, and institutes — all in one place.
                        </h2>
                    </div>
                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {testimonials.map((t) => (
                            <div
                                key={t.author}
                                className="landing-motion landing-lift-card rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
                                data-motion
                            >
                                <svg
                                    className="h-6 w-6 text-primary-300"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                >
                                    <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z" />
                                </svg>
                                <p className="mt-4 text-sm leading-7 text-slate-200">“{t.quote}”</p>
                                <p className="mt-5 text-sm font-bold text-white">{t.author}</p>
                                <p className="text-xs text-slate-400">{t.role}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Final CTA — student-first, with a quiet teacher / institute fallback */}
            <section className="bg-gradient-to-br from-slate-50 via-white to-slate-50">
                <div className="container-page py-16 sm:py-24">
                    <div
                        className="landing-motion mx-auto max-w-3xl text-center"
                        data-motion
                    >
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            Get started
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-5xl">
                            Free to start. Always free to practice.
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
                            Sign up to track your streak, save progress, and join classrooms. Or
                            jump straight into practice — no account needed.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                            <Link href="/register">
                                <Button size="lg">Create free account</Button>
                            </Link>
                            <Link href="/practice">
                                <Button variant="outline" size="lg">
                                    Practice without account
                                </Button>
                            </Link>
                        </div>
                        <p className="mt-8 text-xs text-slate-500">
                            Are you a teacher or institute?{" "}
                            <Link
                                href="/register?role=teacher"
                                className="font-semibold text-primary-700 hover:underline"
                            >
                                Teacher
                            </Link>{" "}
                            ·{" "}
                            <Link
                                href="/register?intent=institute"
                                className="font-semibold text-primary-700 hover:underline"
                            >
                                Institute
                            </Link>
                            {" · "}
                            <Link
                                href="/login"
                                className="font-semibold text-primary-700 hover:underline"
                            >
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
