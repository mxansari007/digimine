"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import type { Article } from "@digimine/types";
import { ArticleForm } from "@/components/articles/ArticleForm";
import { deleteArticle, getArticle, updateArticle } from "@/lib/firestore/articles";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function EditArticlePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { firebaseUser, user } = useAdminAuth();

    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const a = await getArticle(id);
                if (cancelled) return;
                if (!a) {
                    router.push("/articles");
                    return;
                }
                setArticle(a);
            } catch (err) {
                console.error("Load article failed", err);
                if (!cancelled) router.push("/articles");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }
    if (!article) return null;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/articles" className="text-xs text-slate-500 hover:text-slate-900">
                        ← All articles
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">Edit article</h1>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">/articles/{article.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                    {article.status === "published" && (
                        <a
                            href={`/articles/${article.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-primary-700 hover:underline"
                        >
                            View live →
                        </a>
                    )}
                    <Link href="/articles">
                        <Button variant="ghost">Done</Button>
                    </Link>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
            )}
            {message && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {message}
                </div>
            )}

            <ArticleForm
                article={article}
                submitting={saving}
                onSubmit={async (payload) => {
                    setSaving(true);
                    setError(null);
                    setMessage(null);
                    try {
                        await updateArticle(id, payload, {
                            authorMeta: firebaseUser
                                ? {
                                      userId: firebaseUser.uid,
                                      name: user?.displayName || firebaseUser.email || "Admin",
                                      avatarUrl: user?.photoURL || firebaseUser.photoURL || null,
                                  }
                                : undefined,
                        });
                        const fresh = await getArticle(id);
                        if (fresh) setArticle(fresh);
                        setMessage(
                            payload.status === "published"
                                ? "Published. Live on /articles."
                                : payload.status === "scheduled"
                                ? "Scheduled."
                                : payload.status === "archived"
                                ? "Archived."
                                : "Draft saved."
                        );
                    } catch (err: any) {
                        console.error("Update article failed", err);
                        setError(err.message || "Failed to save");
                    } finally {
                        setSaving(false);
                    }
                }}
                onDelete={async () => {
                    if (!confirm(`Delete "${article.title}"? This cannot be undone.`)) return;
                    try {
                        await deleteArticle(id);
                        router.push("/articles");
                    } catch (err: any) {
                        setError(err.message || "Failed to delete");
                    }
                }}
            />
        </div>
    );
}
