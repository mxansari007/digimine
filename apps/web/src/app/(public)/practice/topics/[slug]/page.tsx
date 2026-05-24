import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, FormattedContent } from "@digimine/ui";
import { patternMeta, type PracticePattern } from "@digimine/types";
import {
    getCachedTopicBySlug,
    getCachedTopicProblems,
    type CachedTopic,
} from "@/lib/server/practiceTopics";

type Props = { params: { slug: string } };

function siteOrigin(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://placementranker.com"
    ).replace(/\/$/, "");
}

function diffChipClass(d: string): string {
    if (d === "easy") return "bg-emerald-50 text-emerald-700";
    if (d === "medium") return "bg-amber-50 text-amber-700";
    return "bg-rose-50 text-rose-700";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const slug = decodeURIComponent(params.slug || "");
    const topic = await getCachedTopicBySlug(slug);
    if (!topic) {
        return { title: "Topic not found · PlacementRanker", robots: { index: false, follow: false } };
    }
    const origin = siteOrigin();
    const url = `${origin}/practice/topics/${topic.slug}`;
    const title = topic.seo.metaTitle || `${topic.title} — Practice Problems`;
    const description = topic.seo.metaDescription || topic.summary;
    const image = topic.seo.ogImageUrl || topic.coverImageUrl || undefined;

    return {
        title,
        description,
        alternates: { canonical: url },
        robots: topic.seo.noIndex ? { index: false, follow: false } : { index: true, follow: true },
        openGraph: {
            type: "article",
            url,
            title,
            description,
            siteName: "PlacementRanker",
            images: image ? [{ url: image, alt: topic.title }] : undefined,
        },
        twitter: {
            card: image ? "summary_large_image" : "summary",
            title,
            description,
            images: image ? [image] : undefined,
        },
    };
}

export default async function PracticeTopicPage({ params }: Props) {
    const slug = decodeURIComponent(params.slug || "");
    const topic = await getCachedTopicBySlug(slug);
    if (!topic) return notFound();

    const problems = await getCachedTopicProblems(topic);
    const patternLabel = patternMeta(topic.pattern as PracticePattern)?.label || topic.pattern;

    // Resolve prerequisites + related (in parallel). Drop any that 404 silently
    // so the page never shows broken links.
    const [prereqs, related] = await Promise.all([
        Promise.all(topic.prerequisiteTopicSlugs.map((s) => getCachedTopicBySlug(s))).then(
            (rs) => rs.filter((r): r is CachedTopic => !!r)
        ),
        Promise.all(topic.relatedTopicSlugs.map((s) => getCachedTopicBySlug(s))).then(
            (rs) => rs.filter((r): r is CachedTopic => !!r)
        ),
    ]);

    return (
        <main className="min-h-screen bg-slate-50">
            {/* HERO */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-10">
                    <Link
                        href="/practice"
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        ← Practice hub
                    </Link>
                    <div className="mt-3 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
                        <div>
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                                <span className="rounded-full bg-primary-100 px-2.5 py-1 text-primary-700">
                                    {topic.kind}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                                    {patternLabel}
                                </span>
                                {topic.isFeatured && (
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                        Featured
                                    </span>
                                )}
                            </div>
                            <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                                {topic.title}
                            </h1>
                            {topic.subtitle && (
                                <p className="mt-3 text-lg text-slate-600">{topic.subtitle}</p>
                            )}
                            {topic.summary && (
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                                    {topic.summary}
                                </p>
                            )}
                            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                                <a
                                    href="#problems"
                                    className="rounded-full bg-primary-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-primary-700"
                                >
                                    Jump to {problems.length} problem{problems.length === 1 ? "" : "s"} →
                                </a>
                                {topic.warmupQuizSlug && (
                                    <Link
                                        href={`/quizzes/${topic.warmupQuizSlug}`}
                                        className="rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:border-primary-300 hover:text-primary-700"
                                    >
                                        Take warm-up quiz
                                    </Link>
                                )}
                            </div>
                        </div>
                        {topic.coverImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={topic.coverImageUrl}
                                alt={topic.title}
                                className="aspect-[16/9] w-full rounded-2xl object-cover shadow-md"
                            />
                        ) : (
                            <div className="aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-primary-100 via-teal-100 to-amber-100 shadow-md" />
                        )}
                    </div>
                </div>
            </section>

            <div className="container-page grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* LEFT — Content + problem list */}
                <article className="min-w-0 space-y-10">
                    {/* Prerequisites */}
                    {prereqs.length > 0 && (
                        <section>
                            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                                Know this first
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {prereqs.map((p) => (
                                    <Link
                                        key={p.slug}
                                        href={`/practice/topics/${p.slug}`}
                                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-primary-300 hover:text-primary-700"
                                    >
                                        {p.title} →
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Intro */}
                    {topic.introHtml && (
                        <section>
                            <h2 className="font-display text-2xl font-bold text-slate-900">
                                What is {topic.title.toLowerCase()}?
                            </h2>
                            <div className="prose prose-slate mt-4 max-w-none">
                                <FormattedContent html={topic.introHtml} />
                            </div>
                        </section>
                    )}

                    {/* Mental model */}
                    {topic.mentalModelHtml && (
                        <section>
                            <h2 className="font-display text-2xl font-bold text-slate-900">
                                Mental model &amp; traps
                            </h2>
                            <div className="prose prose-slate mt-4 max-w-none">
                                <FormattedContent html={topic.mentalModelHtml} />
                            </div>
                        </section>
                    )}

                    {/* Problems */}
                    <section id="problems">
                        <div className="flex items-baseline justify-between">
                            <h2 className="font-display text-2xl font-bold text-slate-900">
                                Practice problems
                            </h2>
                            <span className="text-xs text-slate-500">
                                {problems.length} problem{problems.length === 1 ? "" : "s"}
                            </span>
                        </div>
                        {problems.length === 0 ? (
                            <Card className="mt-4 p-8 text-center text-sm text-slate-500">
                                No published problems yet for this pattern. Come back soon.
                            </Card>
                        ) : (
                            <Card className="mt-4 overflow-hidden p-0">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Title</th>
                                            <th className="px-4 py-3 text-left">Difficulty</th>
                                            <th className="px-4 py-3 text-right">Solved by</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {problems.map((p) => (
                                            <tr key={p.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3">
                                                    {p.isPinned && (
                                                        <span
                                                            title="Editor's pick"
                                                            className="mr-2 inline-block rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                                                        >
                                                            ★
                                                        </span>
                                                    )}
                                                    <Link
                                                        href={`/practice/problems/${p.slug}`}
                                                        className="font-medium text-slate-900 hover:text-primary-700"
                                                    >
                                                        {p.title}
                                                    </Link>
                                                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                                                        {p.kind}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffChipClass(p.difficulty)}`}
                                                    >
                                                        {p.difficulty}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-500">
                                                    {p.totalSolved.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        )}
                    </section>

                    {/* Related */}
                    {related.length > 0 && (
                        <section>
                            <h2 className="font-display text-xl font-bold text-slate-900">
                                What to learn next
                            </h2>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {related.map((r) => (
                                    <Link
                                        key={r.slug}
                                        href={`/practice/topics/${r.slug}`}
                                        className="group block"
                                    >
                                        <Card className="h-full p-4 transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-sm">
                                            <p className="font-semibold text-slate-900 group-hover:text-primary-700">
                                                {r.title} →
                                            </p>
                                            {r.summary && (
                                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                                    {r.summary}
                                                </p>
                                            )}
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                </article>

                {/* RIGHT — Sticky info panel */}
                <aside className="hidden lg:block">
                    <div className="sticky top-20 space-y-4">
                        <Card className="p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Topic info
                            </p>
                            <dl className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Pattern</dt>
                                    <dd className="font-medium text-slate-900">{patternLabel}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Type</dt>
                                    <dd className="font-medium text-slate-900 uppercase">
                                        {topic.kind}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Problems</dt>
                                    <dd className="font-medium text-slate-900">{problems.length}</dd>
                                </div>
                            </dl>
                            {topic.tags.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-1.5">
                                    {topic.tags.map((t) => (
                                        <span
                                            key={t}
                                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                                        >
                                            #{t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Card>
                        {topic.warmupQuizSlug && (
                            <Card className="bg-amber-50 p-5 ring-1 ring-amber-200">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                    Warm up first
                                </p>
                                <p className="mt-2 text-sm text-slate-700">
                                    5-question concept check before you start solving.
                                </p>
                                <Link
                                    href={`/quizzes/${topic.warmupQuizSlug}`}
                                    className="mt-3 inline-block text-sm font-semibold text-amber-700 hover:underline"
                                >
                                    Take the quiz →
                                </Link>
                            </Card>
                        )}
                    </div>
                </aside>
            </div>
        </main>
    );
}
