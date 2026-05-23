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

    return (
        <section className="border-b border-slate-200 bg-slate-50">
            <div className="container-page py-16 sm:py-20">
                <div className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
                            What&apos;s new
                        </p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                            Fresh reads &amp; live events.
                        </h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            Pulled live from the platform. Click anything to dive in.
                        </p>
                    </div>
                </div>

                <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
                    {/* Articles */}
                    {articles.length > 0 && (
                        <div className="landing-motion" data-motion>
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
                            <div className="grid gap-4 sm:grid-cols-2">
                                {articles.slice(0, 4).map((a) => (
                                    <Link
                                        key={a.id}
                                        href={`/articles/${a.slug}`}
                                        className="group block"
                                    >
                                        <Card className="landing-lift-card home-shine h-full overflow-hidden">
                                            {a.coverImageUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={a.coverImageUrl}
                                                    alt={a.title}
                                                    className="aspect-[16/9] w-full object-cover"
                                                />
                                            ) : (
                                                <div className="aspect-[16/9] w-full bg-gradient-to-br from-primary-100 to-amber-100" />
                                            )}
                                            <div className="p-4">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-700">
                                                    {a.category} · {a.readingMinutes} min
                                                </p>
                                                <h4 className="mt-1 font-semibold leading-snug text-slate-900 group-hover:text-primary-700">
                                                    {a.title}
                                                </h4>
                                                <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                                                    {a.excerpt}
                                                </p>
                                                <p className="mt-3 text-xs text-slate-400">
                                                    {timeAgo(a.publishedAtMs)}
                                                </p>
                                            </div>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contests */}
                    {liveOrUpcoming.length > 0 && (
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
                            <div className="space-y-3">
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
                                                            ? "bg-rose-50 text-rose-700"
                                                            : "bg-primary-50 text-primary-700"
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
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                                                                LIVE
                                                            </span>
                                                        ) : (
                                                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
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
