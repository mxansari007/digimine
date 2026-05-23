import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { Card, FormattedContent } from "@digimine/ui";
import {
    ARTICLE_CATEGORIES,
    DEFAULT_ARTICLE_SEO,
    type Article,
    type ArticleSeo,
    type ArticleStructuredDataType,
} from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import { getCachedArticleBySlug, type CachedArticle } from "@/lib/server/articleCache";
import ArticleToc from "./_components/ArticleToc";
import ArticleDiscussion from "./_components/ArticleDiscussion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: { slug: string } };

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

function buildJsonLd(article: Article & { id: string }, url: string) {
    const type: ArticleStructuredDataType = article.seo.structuredDataType || "Article";
    const image = article.seo.ogImageUrl || article.coverImageUrl;
    const base: any = {
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
                      sameAs: [article.author.linkedin, article.author.twitter && `https://twitter.com/${article.author.twitter.replace(/^@/, "")}`]
                          .filter(Boolean),
                  }
                : {}),
        },
        publisher: {
            "@type": "Organization",
            name: "PlacementRanker",
            logo: { "@type": "ImageObject", url: `${siteOrigin()}/logo.png` },
        },
        keywords: article.seo.keywords?.join(", "),
        articleSection: ARTICLE_CATEGORIES.find((c) => c.id === article.category)?.label || article.category,
        wordCount: article.reading.wordCount,
        timeRequired: `PT${Math.max(1, article.reading.readingMinutes)}M`,
        ...(image ? { image } : {}),
    };
    return base;
}

export default async function ArticleDetailPage({ params }: Props) {
    const slug = decodeURIComponent(params.slug || "");
    const article = await loadArticle(slug);
    if (!article) return notFound();

    const origin = siteOrigin();
    const url = article.seo.canonicalUrl || `${origin}/articles/${article.slug}`;
    const jsonLd = buildJsonLd(article, url);

    // Fire-and-forget view counter increment (won't block render).
    adminDb
        .collection("articles")
        .doc(article.id)
        .update({ viewCount: FieldValue.increment(1) })
        .catch(() => {});

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
                    {article.subject && <span className="text-slate-500">{article.subject}</span>}
                </div>

                <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">{article.title}</h1>
                {article.subtitle && (
                    <p className="mt-3 text-lg text-slate-600">{article.subtitle}</p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    {article.author.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={article.author.avatarUrl}
                            alt={article.author.name}
                            className="h-9 w-9 rounded-full object-cover"
                        />
                    ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                            {article.author.name[0]?.toUpperCase() || "D"}
                        </div>
                    )}
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={article.coverImageUrl}
                            alt={article.title}
                            className="w-full rounded-2xl object-cover"
                        />
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">About the author</p>
                        <p className="mt-2 font-semibold text-slate-900">{article.author.name}</p>
                        {article.author.bio && (
                            <p className="mt-1 text-sm text-slate-600">{article.author.bio}</p>
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
