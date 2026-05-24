import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, FormattedContent } from "@digimine/ui";
import {
    ARTICLE_CATEGORIES,
    DEFAULT_ARTICLE_SEO,
    type Article,
    type ArticleSeo,
    type ArticleStructuredDataType,
} from "@digimine/types";
import { getCachedArticleBySlug, type CachedArticle } from "@/lib/server/articleCache";
import Avatar from "@/components/common/Avatar";
import ArticleToc from "./_components/ArticleToc";

/**
 * ISR — re-generates the HTML at most once every 5 minutes per slug. Vercel
 * serves cached HTML from the edge in the meantime, so TTFB on cached hits
 * is double-digit ms instead of the half-second a force-dynamic page took.
 *
 * Was: `dynamic = "force-dynamic"` + a Firestore write on every render to
 * increment `viewCount`. That write made the page un-cacheable AND added
 * Firestore latency to every paint, both of which torpedo the Lighthouse
 * Performance score. View tracking should live in a separate beacon (e.g.
 * Vercel Analytics already counts page views; or wire a fire-and-forget
 * client `fetch` to `/api/articles/[slug]/view` if you want first-party
 * counts) so the public page can stay static.
 */
export const revalidate = 300;

type Props = { params: { slug: string } };

/**
 * ArticleDiscussion pulls in Firebase Auth + Firestore client SDK + the
 * realtime onSnapshot listener — easily 80–100KB of JS. Deferring it via
 * `next/dynamic({ ssr: false })` keeps it out of the initial bundle and
 * the discussion section hydrates lazily after first paint. The Loading
 * fallback is sized so layout doesn't shift when it lands.
 */
const ArticleDiscussion = dynamic(() => import("./_components/ArticleDiscussion"), {
    ssr: false,
    loading: () => (
        <section className="mt-16 border-t border-slate-200 pt-10" aria-label="Discussion">
            <div className="mb-6 h-6 w-32 rounded bg-slate-100" />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="h-20" />
            </div>
        </section>
    ),
});

function siteOrigin(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://placementranker.com"
    ).replace(/\/$/, "");
}

/**
 * Hydrate the cached (JSON-safe) article shape back into the rich
 * `Article` type the rest of this file expects — primarily reviving the
 * ISO-string dates into `Date` instances.
 */
function hydrate(cached: CachedArticle): Article & { id: string } {
    return {
        id: cached.id,
        slug: cached.slug,
        title: cached.title,
        subtitle: cached.subtitle,
        excerpt: cached.excerpt,
        body: cached.body,
        coverImageUrl: cached.coverImageUrl,
        coverCaption: cached.coverCaption,
        category: cached.category as Article["category"],
        subject: cached.subject,
        tags: cached.tags,
        status: "published",
        publishedAt: cached.publishedAt ? new Date(cached.publishedAt) : null,
        scheduledFor: null,
        author: cached.author,
        reading: cached.reading,
        seo: { ...DEFAULT_ARTICLE_SEO, ...(cached.seo || {}) } as ArticleSeo,
        isFeatured: cached.isFeatured,
        viewCount: cached.viewCount,
        createdAt: cached.createdAt ? new Date(cached.createdAt) : new Date(),
        updatedAt: cached.updatedAt ? new Date(cached.updatedAt) : new Date(),
    };
}

async function loadArticle(slug: string): Promise<(Article & { id: string }) | null> {
    const cached = await getCachedArticleBySlug(slug);
    return cached ? hydrate(cached) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const article = await loadArticle(decodeURIComponent(params.slug || ""));
    if (!article) {
        return { title: "Article not found · PlacementRanker", robots: { index: false, follow: false } };
    }
    const origin = siteOrigin();
    const url = article.seo.canonicalUrl || `${origin}/articles/${article.slug}`;
    const title = article.seo.metaTitle || article.title;
    const description = article.seo.metaDescription || article.excerpt;
    const image = article.seo.ogImageUrl || article.coverImageUrl || undefined;
    const socialTitle = article.seo.socialTitle || title;
    const socialDescription = article.seo.socialDescription || description;

    return {
        title,
        description,
        keywords: article.seo.keywords?.length ? article.seo.keywords : undefined,
        alternates: { canonical: url },
        robots: article.seo.noIndex
            ? { index: false, follow: false }
            : { index: true, follow: true },
        openGraph: {
            type: "article",
            url,
            title: socialTitle,
            description: socialDescription,
            siteName: "PlacementRanker",
            images: image ? [{ url: image, alt: article.title }] : undefined,
            publishedTime: article.publishedAt?.toISOString(),
            modifiedTime: article.updatedAt.toISOString(),
            authors: article.author.name ? [article.author.name] : undefined,
            tags: article.tags,
        },
        twitter: {
            card: article.seo.twitterCard || "summary_large_image",
            title: socialTitle,
            description: socialDescription,
            images: image ? [image] : undefined,
            creator: article.author.twitter || undefined,
        },
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildJsonLd(article: Article & { id: string }, url: string): Record<string, any> {
    const type: ArticleStructuredDataType = article.seo.structuredDataType || "Article";
    const image = article.seo.ogImageUrl || article.coverImageUrl;
    return {
        "@context": "https://schema.org",
        "@type": type,
        headline: article.title,
        description: article.seo.metaDescription || article.excerpt,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        url,
        datePublished: article.publishedAt?.toISOString(),
        dateModified: article.updatedAt.toISOString(),
        author: {
            "@type": "Person",
            name: article.author.name,
            ...(article.author.linkedin || article.author.twitter
                ? {
                      sameAs: [
                          article.author.linkedin,
                          article.author.twitter &&
                              `https://twitter.com/${article.author.twitter.replace(/^@/, "")}`,
                      ].filter(Boolean),
                  }
                : {}),
        },
        publisher: {
            "@type": "Organization",
            name: "PlacementRanker",
            logo: { "@type": "ImageObject", url: `${siteOrigin()}/logo.png` },
        },
        keywords: article.seo.keywords?.join(", "),
        articleSection:
            ARTICLE_CATEGORIES.find((c) => c.id === article.category)?.label || article.category,
        wordCount: article.reading.wordCount,
        timeRequired: `PT${Math.max(1, article.reading.readingMinutes)}M`,
        ...(image ? { image } : {}),
    };
}

export default async function ArticleDetailPage({ params }: Props) {
    const slug = decodeURIComponent(params.slug || "");
    const article = await loadArticle(slug);
    if (!article) return notFound();

    const origin = siteOrigin();
    const url = article.seo.canonicalUrl || `${origin}/articles/${article.slug}`;
    const jsonLd = buildJsonLd(article, url);

    const categoryLabel =
        ARTICLE_CATEGORIES.find((c) => c.id === article.category)?.label || article.category;

    return (
        <main className="bg-white">
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <div className="container-page py-10 sm:py-14">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                    <article className="min-w-0 max-w-3xl">
                        <div className="mb-6 text-xs text-slate-500">
                            <Link href="/articles" className="hover:underline">
                                ← All articles
                            </Link>
                        </div>

                        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
                            <span className="rounded-full bg-primary-100 px-2.5 py-1 font-semibold text-primary-700">
                                {categoryLabel}
                            </span>
                            {article.subject && (
                                <span className="text-slate-500">{article.subject}</span>
                            )}
                        </div>

                        <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
                            {article.title}
                        </h1>
                        {article.subtitle && (
                            <p className="mt-3 text-lg text-slate-600">{article.subtitle}</p>
                        )}

                        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                            {/* Avatar handles arbitrary external URLs (Google,
                                GitHub, Twitter) with an initials fallback on
                                error — safer than Next/Image here because
                                author photos come from many hosts that aren't
                                in next.config's remotePatterns. */}
                            <Avatar
                                src={article.author.avatarUrl}
                                name={article.author.name}
                                size={36}
                            />
                            <div>
                                <p className="font-medium text-slate-700">{article.author.name}</p>
                                <p className="text-xs">
                                    {article.publishedAt
                                        ? new Date(article.publishedAt).toLocaleDateString("en-IN", {
                                              day: "numeric",
                                              month: "short",
                                              year: "numeric",
                                          })
                                        : ""}{" "}
                                    · {article.reading.readingMinutes} min read
                                </p>
                            </div>
                        </div>

                        {article.coverImageUrl && (
                            <figure className="mt-8">
                                {/* Aspect-locked container prevents CLS. `priority` preloads
                                    the LCP image and `sizes` lets the browser pick the right
                                    srcset candidate at first paint.

                                    SVG covers fall back to a plain <img> because Next/Image's
                                    raster optimization (AVIF/WebP/srcset) doesn't help vector
                                    formats AND Next refuses to serve SVG by default
                                    (`dangerouslyAllowSVG: false`) for security. Same width,
                                    same priority hint via fetchpriority. */}
                                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-100">
                                    {/\.svg(\?|$)/i.test(article.coverImageUrl) ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={article.coverImageUrl}
                                            alt={article.title}
                                            fetchPriority="high"
                                            className="absolute inset-0 h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Image
                                            src={article.coverImageUrl}
                                            alt={article.title}
                                            fill
                                            priority
                                            sizes="(max-width: 768px) 100vw, 768px"
                                            className="object-cover"
                                        />
                                    )}
                                </div>
                                {article.coverCaption && (
                                    <figcaption className="mt-2 text-center text-xs text-slate-500">
                                        {article.coverCaption}
                                    </figcaption>
                                )}
                            </figure>
                        )}

                        <div id="article-body" className="prose prose-slate mt-10 max-w-none">
                            <FormattedContent html={article.body} />
                        </div>

                        {article.tags.length > 0 && (
                            <div className="mt-12 flex flex-wrap gap-2 border-t border-slate-200 pt-6">
                                {article.tags.map((t) => (
                                    <Link
                                        key={t}
                                        href={`/articles?tag=${encodeURIComponent(t)}`}
                                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                                    >
                                        #{t}
                                    </Link>
                                ))}
                            </div>
                        )}

                        {(article.author.bio || article.author.twitter || article.author.linkedin) && (
                            <Card className="mt-10 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    About the author
                                </p>
                                <p className="mt-2 font-semibold text-slate-900">
                                    {article.author.name}
                                </p>
                                {article.author.bio && (
                                    <p className="mt-1 text-sm text-slate-600">
                                        {article.author.bio}
                                    </p>
                                )}
                                <div className="mt-3 flex gap-3 text-xs">
                                    {article.author.twitter && (
                                        <a
                                            className="text-primary-700 hover:underline"
                                            target="_blank"
                                            rel="noreferrer"
                                            href={`https://twitter.com/${article.author.twitter.replace(/^@/, "")}`}
                                        >
                                            Twitter
                                        </a>
                                    )}
                                    {article.author.linkedin && (
                                        <a
                                            className="text-primary-700 hover:underline"
                                            target="_blank"
                                            rel="noreferrer"
                                            href={article.author.linkedin}
                                        >
                                            LinkedIn
                                        </a>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* Lazy-loaded — hydrates after first paint, doesn't bloat the initial bundle. */}
                        <ArticleDiscussion articleId={article.id} />
                    </article>

                    {/* Right-rail TOC — sticky on desktop, hidden on mobile.
                        Renders client-side (extracts headings from #article-body
                        after mount, so existing articles work without re-import). */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-24">
                            <ArticleToc bodyId="article-body" />
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
