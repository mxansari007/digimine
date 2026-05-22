"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { ARTICLE_CATEGORIES, type Article, type ArticleCategory, type ArticleStatus } from "@digimine/types";
import { listArticles, deleteArticle } from "@/lib/firestore/articles";

const STATUS_FILTERS: { id: ArticleStatus | "all"; label: string }[] = [
    { id: "all", label: "All" },
    { id: "published", label: "Published" },
    { id: "draft", label: "Drafts" },
    { id: "scheduled", label: "Scheduled" },
    { id: "archived", label: "Archived" },
];

function statusChip(status: ArticleStatus) {
    switch (status) {
        case "published":
            return "chip-success";
        case "scheduled":
            return "chip-info";
        case "archived":
            return "chip-neutral";
        case "draft":
        default:
            return "chip-warning";
    }
}

export default function AdminArticlesPage() {
    const [items, setItems] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<ArticleStatus | "all">("all");
    const [categoryFilter, setCategoryFilter] = useState<ArticleCategory | "all">("all");
    const [search, setSearch] = useState("");
    const [deleting, setDeleting] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listArticles({ status: statusFilter, category: categoryFilter, limit: 100 });
            setItems(data);
        } catch (err) {
            console.error("Failed to load articles", err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, categoryFilter]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((a) =>
            [a.title, a.subtitle, a.excerpt, ...a.tags].some((v) => (v || "").toLowerCase().includes(q))
        );
    }, [items, search]);

    const counts = useMemo(() => {
        const map = new Map<ArticleStatus | "all", number>();
        map.set("all", items.length);
        items.forEach((a) => map.set(a.status, (map.get(a.status) || 0) + 1));
        return map;
    }, [items]);

    const handleDelete = async (a: Article) => {
        if (!confirm(`Delete article "${a.title}"? This cannot be undone.`)) return;
        setDeleting(a.id);
        try {
            await deleteArticle(a.id);
            await load();
        } catch (err: any) {
            alert(err.message || "Failed to delete");
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Articles</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Long-form content: tech news, tutorials, subject deep-dives, announcements.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/articles/import">
                        <Button variant="outline">Import .md</Button>
                    </Link>
                    <Link href="/articles/create">
                        <Button variant="primary">+ New article</Button>
                    </Link>
                </div>
            </div>

            <Card className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        className="flex-1 min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                        placeholder="Search title, excerpt, tags…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as any)}
                    >
                        <option value="all">All categories</option>
                        {ARTICLE_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setStatusFilter(f.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                statusFilter === f.id
                                    ? "bg-primary-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                            {f.label}
                            <span className="ml-1.5 text-[10px] opacity-70">{counts.get(f.id) || 0}</span>
                        </button>
                    ))}
                </div>
            </Card>

            {loading ? (
                <Card className="p-12 text-center text-sm text-slate-500">Loading articles…</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-slate-500 mb-3">No articles match. Try a different filter or create one.</p>
                    <Link href="/articles/create">
                        <Button variant="primary">Create your first article</Button>
                    </Link>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map((a) => (
                        <Card key={a.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={statusChip(a.status)}>{a.status}</span>
                                    <span className="chip-neutral">{ARTICLE_CATEGORIES.find((c) => c.id === a.category)?.label || a.category}</span>
                                    {a.isFeatured && <span className="chip-info">Featured</span>}
                                    {a.seo?.noIndex && <span className="chip-warning">noindex</span>}
                                    <span className="text-xs text-slate-400">
                                        {a.reading.readingMinutes} min · {a.reading.wordCount.toLocaleString("en-IN")} words
                                    </span>
                                </div>
                                <h3 className="mt-1 font-semibold text-slate-900 truncate">{a.title || "Untitled"}</h3>
                                {a.subtitle && (
                                    <p className="text-xs text-slate-500 truncate">{a.subtitle}</p>
                                )}
                                <p className="mt-1 text-[11px] text-slate-400 font-mono">/articles/{a.slug}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link href={`/articles/${a.id}/edit`}>
                                    <Button variant="outline" size="sm">
                                        Edit
                                    </Button>
                                </Link>
                                {a.status === "published" && (
                                    <a
                                        href={`/articles/${a.slug}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary-700 hover:underline"
                                    >
                                        View ↗
                                    </a>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(a)}
                                    isLoading={deleting === a.id}
                                    className="!text-rose-600"
                                >
                                    Delete
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
