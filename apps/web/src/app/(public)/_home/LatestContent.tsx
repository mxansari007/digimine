/**
 * "What's new" — a two-column block showing real content pulled from the
 * cached catalog: the 4 most recent articles and the soonest live / upcoming
 * contests. Replaces marketing copy with proof the platform is alive.
 *
 * Server component. Both halves degrade gracefully when there's no content
 * (e.g. brand-new install): the side just hides if its list is empty.
 */
import Link from "next/link";
import { Card } from "@digimine/ui";
import type { HomeArticleCard } from "@/lib/server/catalog";
import type { ContestCard } from "@/lib/server/catalog";

function timeAgo(ms: number): string {
    if (!ms) return "";
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ms).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatStart(ms: number) {
    return new Date(ms).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
    });
}

export default function LatestContent({
    articles,
    contests,
}: {
    articles: HomeArticleCard[];
    contests: ContestCard[];
}) {
    const now = Date.now();
    const liveOrUpcoming = contests
        .filter((c) => c.endTimeMs >= now)
        .sort((a, b) => a.startTimeMs - b.startTimeMs)
        .slice(0, 3);

    if (articles.length === 0 && liveOrUpcoming.length === 0) return null;

    // Layout adapts to what's actually populated:
    //  - Both rails present → split 1.4fr / 1fr (articles wider).
    //  - Articles only      → full-width 4-column grid, no awkward dead space.
    //  - Contests only      → full-width 3-column grid.
    const hasContests = liveOrUpcoming.length > 0;
    const hasArticles = articles.length > 0;
    const articleCount = Math.min(articles.length, hasContests ? 4 : 4);

    return (
        <section className="border-b border-slate-200 bg-slate-50">
            <div className="container-page py-16 sm:py-20">
                <div className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            What&apos;s new
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            {hasContests
                                ? "Fresh reads & live events."
                                : "Fresh reads from the team."}
                        </h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            Pulled live from the platform. Click anything to dive in.
                        </p>
                    </div>
                    {hasArticles && !hasContests && (
                        <Link
                            href="/articles"
                            className="inline-flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50"
                        >
                            Browse all articles
                            <span aria-hidden>→</span>
                        </Link>
                    )}
                </div>

                <div
                    className={
                        "mt-10 grid gap-8 " +
                        (hasArticles && hasContests
                            ? "lg:grid-cols-[1.4fr_1fr]"
                            : "")
                    }
                >
                    {/* Articles */}
                    {hasArticles && (
                        <div className="landing-motion" data-motion>
                            {hasContests && (
                                <div className="mb-4 flex items-baseline justify-between">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                                        Latest articles
                                    </h3>
                                    <Link
                                        href="/articles"
                                        className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                                    >
                                        Browse all →
                                    </Link>
                                </div>
                            )}
                            <div
                                className={
                                    "grid gap-5 " +
                                    (hasContests
                                        ? "sm:grid-cols-2"
                                        : // Full-width: scale up to 4 columns on
                                          // large screens so the section fills
                                          // the page instead of leaving dead air.
                                          "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")
                                }
                            >
                                {articles.slice(0, articleCount).map((a) => (
                                    <Link
                                        key={a.id}
                                        href={`/articles/${a.slug}`}
                                        className="group block h-full"
                                    >
                                        <Card className="landing-lift-card home-shine flex h-full flex-col overflow-hidden">
                                            {a.coverImageUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={a.coverImageUrl}
                                                    alt={a.title}
                                                    className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                                />
                                            ) : (
                                                <div className="aspect-[16/9] w-full bg-gradient-to-br from-primary-100 dark:from-primary-500/10 to-amber-100 dark:to-amber-500/10" />
                                            )}
                                            <div className="flex flex-1 flex-col p-4">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-700">
                                                    {a.category} · {a.readingMinutes} min
                                                </p>
                                                <h4 className="mt-1.5 line-clamp-2 font-semibold leading-snug text-slate-900 group-hover:text-primary-700">
                                                    {a.title}
                                                </h4>
                                                <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                                                    {a.excerpt}
                                                </p>
                                                {/* Pin footer to bottom so all cards
                                                    in a row are the same height
                                                    regardless of excerpt length. */}
                                                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-400">
                                                    <span>{timeAgo(a.publishedAtMs)}</span>
                                                    <span
                                                        aria-hidden
                                                        className="font-semibold text-primary-600 transition-transform group-hover:translate-x-0.5"
                                                    >
                                                        Read →
                                                    </span>
                                                </div>
                                            </div>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contests */}
                    {hasContests && (
                        <div className="landing-motion" data-motion>
                            <div className="mb-4 flex items-baseline justify-between">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                                    Live &amp; upcoming
                                </h3>
                                <Link
                                    href="/contests"
                                    className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                                >
                                    All contests →
                                </Link>
                            </div>
                            <div
                                className={
                                    hasArticles
                                        ? "space-y-3"
                                        : // No articles → contests get the full
                                          // width as a 3-up grid so we don't end
                                          // up with a narrow column on a wide page.
                                          "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                                }
                            >
                                {liveOrUpcoming.map((c) => {
                                    const isLive = c.startTimeMs <= now && c.endTimeMs >= now;
                                    return (
                                        <Link
                                            key={c.id}
                                            href={`/contests/${c.slug}`}
                                            className="group block"
                                        >
                                            <Card className="landing-lift-card flex items-center gap-4 p-4">
                                                <div
                                                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                                                        isLive
                                                            ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                                            : "bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300"
                                                    }`}
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.7"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        className="h-5 w-5"
                                                    >
                                                        <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        {isLive ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                                                                LIVE
                                                            </span>
                                                        ) : (
                                                            <span className="rounded-full bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                                                                Upcoming
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] uppercase tracking-widest text-slate-400">
                                                            {c.category || "Contest"}
                                                        </span>
                                                    </div>
                                                    <h4 className="mt-1 truncate font-semibold text-slate-900 group-hover:text-primary-700">
                                                        {c.title}
                                                    </h4>
                                                    <p className="mt-0.5 text-xs text-slate-500">
                                                        {isLive ? "Ends" : "Starts"}{" "}
                                                        {formatStart(
                                                            isLive ? c.endTimeMs : c.startTimeMs
                                                        )}
                                                    </p>
                                                </div>
                                                <span
                                                    aria-hidden
                                                    className="text-slate-400 transition-transform group-hover:translate-x-1"
                                                >
                                                    →
                                                </span>
                                            </Card>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
