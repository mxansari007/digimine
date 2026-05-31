"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@digimine/ui";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "@digimine/types";
import { LoadMoreButton } from "@/components/common";
import { useVisibleSlice } from "@/hooks/useVisibleSlice";

type ArticleSummary = {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    excerpt: string;
    coverImageUrl: string | null;
    category: ArticleCategory;
    subject: string | null;
    tags: string[];
    author: { name: string; avatarUrl: string | null };
    reading: { wordCount: number; readingMinutes: number };
    publishedAt: string | null;
    isFeatured: boolean;
};

const ALL_CATEGORY = "all";

export default function ArticlesIndexPage() {
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get("q") || "";
    const [items, setItems] = useState<ArticleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<ArticleCategory | typeof ALL_CATEGORY>(ALL_CATEGORY);
    const [search, setSearch] = useState(initialQuery);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (category !== ALL_CATEGORY) params.set("category", category);
            params.set("limit", "40");
            const res = await fetch(`/api/articles?${params.toString()}`);
            const data = await res.json();
            setItems(Array.isArray(data.items) ? data.items : []);
        } catch (err) {
            console.error("Failed to load articles", err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [category]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((a) =>
            [a.title, a.subtitle || "", a.excerpt, ...a.tags].some((v) => v.toLowerCase().includes(q))
        );
    }, [items, search]);

    const featured = filtered.find((a) => a.isFeatured);
    const rest = useMemo(
        () => filtered.filter((a) => a !== featured),
        [filtered, featured]
    );
    const { visible, hasMore, remaining, loadMore } = useVisibleSlice(rest, 9);

    return (
        <main className="bg-white">
            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:to-surface">
                <div className="container-page py-12 sm:py-16">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Articles</p>
                    <h1 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
                        Tutorials, tech news, subject deep-dives.
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                        Curated long-form content from our editorial team. Bookmark a piece, share a link, build a
                        reading list.
                    </p>
                </div>
            </section>

            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-4 flex flex-wrap items-center gap-3">
                    <input
                        className="flex-1 min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        placeholder="Search articles…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setCategory(ALL_CATEGORY)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                category === ALL_CATEGORY
                                    ? "bg-primary-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                            All
                        </button>
                        {ARTICLE_CATEGORIES.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => setCategory(c.id)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                    category === c.id
                                        ? "bg-primary-600 text-white"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="container-page py-10 space-y-10">
                {loading ? (
                    <ArticlesSkeleton />
                ) : filtered.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-slate-500">No articles match. Try a different category or search.</p>
                    </Card>
                ) : (
                    <>
                        {featured && (
                            <Link href={`/articles/${featured.slug}`} className="block group">
                                <Card className="overflow-hidden grid gap-6 lg:grid-cols-2">
                                    {featured.coverImageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={featured.coverImageUrl}
                                            alt={featured.title}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="bg-gradient-to-br from-primary-100 dark:from-primary-500/15 to-amber-100 dark:to-amber-500/15" />
                                    )}
                                    <div className="p-6 lg:p-8">
                                        <span className="chip-info">
                                            {ARTICLE_CATEGORIES.find((c) => c.id === featured.category)?.label ||
                                                featured.category}
                                        </span>
                                        <h2 className="mt-3 font-display text-2xl font-bold text-slate-900 group-hover:text-primary-700 sm:text-3xl">
                                            {featured.title}
                                        </h2>
                                        {featured.subtitle && (
                                            <p className="mt-2 text-slate-600">{featured.subtitle}</p>
                                        )}
                                        <p className="mt-4 text-sm text-slate-500 line-clamp-3">{featured.excerpt}</p>
                                        <p className="mt-4 text-xs text-slate-500">
                                            {featured.author.name} ·{" "}
                                            {featured.reading.readingMinutes} min read ·{" "}
                                            {featured.publishedAt
                                                ? new Date(featured.publishedAt).toLocaleDateString("en-IN", {
                                                      day: "numeric",
                                                      month: "short",
                                                      year: "numeric",
                                                  })
                                                : ""}
                                        </p>
                                    </div>
                                </Card>
                            </Link>
                        )}

                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {visible.map((a) => (
                                <Link key={a.id} href={`/articles/${a.slug}`} className="block group">
                                    <Card className="h-full overflow-hidden flex flex-col">
                                        {a.coverImageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={a.coverImageUrl}
                                                alt={a.title}
                                                className="aspect-[16/9] w-full object-cover"
                                            />
                                        ) : (
                                            <div className="aspect-[16/9] w-full bg-gradient-to-br from-primary-100 dark:from-primary-500/15 to-amber-100 dark:to-amber-500/15" />
                                        )}
                                        <div className="p-5 flex flex-col flex-1">
                                            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
                                                <span className="text-primary-700 font-semibold">
                                                    {ARTICLE_CATEGORIES.find((c) => c.id === a.category)?.label || a.category}
                                                </span>
                                                {a.subject && <span className="text-slate-400">· {a.subject}</span>}
                                            </div>
                                            <h3 className="mt-2 font-semibold text-slate-900 group-hover:text-primary-700">
                                                {a.title}
                                            </h3>
                                            <p className="mt-2 text-sm text-slate-500 line-clamp-3 flex-1">{a.excerpt}</p>
                                            <p className="mt-3 text-xs text-slate-400">
                                                {a.author.name} · {a.reading.readingMinutes} min read
                                            </p>
                                        </div>
                                    </Card>
                                </Link>
                            ))}
                        </div>

                        <LoadMoreButton
                            hasMore={hasMore}
                            remaining={remaining}
                            onLoadMore={loadMore}
                            label="Load more articles"
                        />
                    </>
                )}
            </section>
        </main>
    );
}

function ArticlesSkeleton() {
    return (
        <div className="space-y-10">
            {/* Featured card placeholder */}
            <Card className="overflow-hidden grid gap-6 lg:grid-cols-2">
                <div className="aspect-[16/9] lg:aspect-auto lg:h-full animate-pulse bg-slate-200/70" />
                <div className="p-6 lg:p-8 space-y-3">
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200/70" />
                    <div className="h-8 w-3/4 animate-pulse rounded bg-slate-200/70" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200/70" />
                    <div className="space-y-2 pt-2">
                        <div className="h-3 w-full animate-pulse rounded bg-slate-200/70" />
                        <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200/70" />
                        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200/70" />
                    </div>
                </div>
            </Card>

            {/* Grid placeholder */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="h-full overflow-hidden flex flex-col">
                        <div className="aspect-[16/9] w-full animate-pulse bg-slate-200/70" />
                        <div className="p-5 space-y-3">
                            <div className="h-3 w-24 animate-pulse rounded bg-slate-200/70" />
                            <div className="h-5 w-5/6 animate-pulse rounded bg-slate-200/70" />
                            <div className="h-3 w-full animate-pulse rounded bg-slate-200/70" />
                            <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200/70" />
                            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200/70" />
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
