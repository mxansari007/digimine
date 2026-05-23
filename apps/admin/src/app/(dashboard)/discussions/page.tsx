"use client";

/**
 * Admin → Discussions
 *
 * Site-wide feed of article comments for moderation. Sourced via the web app's
 * `GET /api/admin/comments` route, which uses `collectionGroup("comments")` so
 * we see every comment regardless of which article it sits under.
 *
 *  - Filter by article slug or free-text body content.
 *  - "Load more" paginates via the oldest createdAt cursor.
 *  - "Delete" hits `DELETE /api/admin/comments/[articleId]/[commentId]` which
 *    is admin-only via `requireAdmin` on the server.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import { authedFetch } from "@/lib/api";

type AdminComment = {
    id: string;
    articleId: string;
    articleTitle: string | null;
    articleSlug: string | null;
    userId: string;
    displayName: string;
    photoURL: string | null;
    body: string;
    createdAt: string | null;
};

const PAGE_SIZE = 50;

function formatWhen(iso: string | null): string {
    if (!iso) return "just now";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function AdminDiscussionsPage() {
    const [comments, setComments] = useState<AdminComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);

    const load = useCallback(async (cursor: string | null) => {
        const setBusy = cursor ? setLoadingMore : setLoading;
        setBusy(true);
        setError(null);
        try {
            const url = new URL("/api/admin/comments", window.location.origin);
            url.searchParams.set("limit", String(PAGE_SIZE));
            if (cursor) url.searchParams.set("before", cursor);
            const res = await authedFetch(url.pathname + url.search);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { comments: AdminComment[] };
            const batch = data.comments || [];
            setComments((prev) => (cursor ? [...prev, ...batch] : batch));
            setHasMore(batch.length === PAGE_SIZE);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load discussions");
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        load(null);
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return comments;
        return comments.filter((c) =>
            [c.body, c.displayName, c.articleTitle, c.articleSlug]
                .filter(Boolean)
                .some((v) => (v as string).toLowerCase().includes(q))
        );
    }, [comments, search]);

    const handleDelete = async (c: AdminComment) => {
        if (
            !confirm(
                `Delete this comment by ${c.displayName}?\n\n"${c.body.slice(0, 200)}${
                    c.body.length > 200 ? "…" : ""
                }"\n\nThis cannot be undone.`
            )
        )
            return;
        setDeletingId(c.id);
        try {
            const res = await authedFetch(
                `/api/admin/comments/${c.articleId}/${c.id}`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            setComments((prev) => prev.filter((x) => x.id !== c.id));
        } catch (e) {
            alert(e instanceof Error ? e.message : "Failed to delete");
        } finally {
            setDeletingId(null);
        }
    };

    const oldestCursor = comments.length ? comments[comments.length - 1].createdAt : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Discussions</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Moderate article comments. Delete spam, abuse, or off-topic posts.
                    </p>
                </div>
                <Button variant="outline" onClick={() => load(null)} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
            </div>

            <Card className="p-4">
                <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="Search comment text, author, or article…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <p className="mt-2 text-xs text-slate-400">
                    Showing {filtered.length} of {comments.length} loaded comment
                    {comments.length === 1 ? "" : "s"}.
                </p>
            </Card>

            {error && (
                <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error}
                </Card>
            )}

            {loading ? (
                <Card className="p-12 text-center text-sm text-slate-500">Loading comments…</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center text-sm text-slate-500">
                    {comments.length === 0
                        ? "No comments yet."
                        : "No comments match this search."}
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map((c) => (
                        <Card key={`${c.articleId}/${c.id}`} className="p-4">
                            <div className="flex items-start gap-3">
                                {c.photoURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={c.photoURL}
                                        alt=""
                                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                                        {c.displayName[0]?.toUpperCase() || "U"}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-2">
                                        <span className="text-sm font-semibold text-slate-900">
                                            {c.displayName}
                                        </span>
                                        <span className="text-[11px] text-slate-400 font-mono">
                                            uid: {c.userId.slice(0, 10)}…
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            · {formatWhen(c.createdAt)}
                                        </span>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                                        {c.body}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <span>
                                            On article:{" "}
                                            {c.articleSlug ? (
                                                <a
                                                    href={`/articles/${c.articleSlug}#article-discussion`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="font-medium text-primary-700 hover:underline"
                                                >
                                                    {c.articleTitle || c.articleSlug}
                                                </a>
                                            ) : (
                                                <span className="text-slate-400 italic">
                                                    {c.articleTitle || c.articleId || "unknown"}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(c)}
                                    isLoading={deletingId === c.id}
                                    className="!text-rose-600"
                                >
                                    Delete
                                </Button>
                            </div>
                        </Card>
                    ))}

                    {hasMore && (
                        <div className="pt-4 text-center">
                            <Button
                                variant="outline"
                                onClick={() => load(oldestCursor)}
                                disabled={loadingMore || !oldestCursor}
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
