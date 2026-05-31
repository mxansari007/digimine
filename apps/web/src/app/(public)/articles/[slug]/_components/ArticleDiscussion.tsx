"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card, Button } from "@digimine/ui";
import {
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    limit as fbLimit,
    deleteDoc,
    doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";

/**
 * Article discussion — subcollection `articles/{articleId}/comments`.
 *
 *  - Anyone can read existing comments (subscribed via Firestore listener so
 *    new comments appear without a refresh).
 *  - Only signed-in users can post (the UI shows a sign-in CTA otherwise).
 *  - Body is plain text, capped at 2000 chars, rendered with whitespace
 *    preserved.
 *
 * Firestore rules required (see deploy notes):
 *
 *   match /articles/{articleId}/comments/{commentId} {
 *     allow read: if true;
 *     allow create: if request.auth != null
 *                   && request.resource.data.userId == request.auth.uid
 *                   && request.resource.data.body is string
 *                   && request.resource.data.body.size() <= 2000;
 *   }
 */

type Comment = {
    id: string;
    userId: string;
    displayName: string;
    photoURL: string | null;
    body: string;
    createdAt: Date | null;
};

function timeAgo(d: Date | null): string {
    if (!d) return "just now";
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ArticleDiscussion({ articleId }: { articleId: string }) {
    const { user, firebaseUser, isAdmin } = useAuthContext();
    const pathname = usePathname() || "/";
    const loginHref = `/login?redirect=${encodeURIComponent(`${pathname}#article-discussion`)}`;
    const [comments, setComments] = useState<Comment[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [body, setBody] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (!articleId) return;
        const q = query(
            collection(db, "articles", articleId, "comments"),
            orderBy("createdAt", "desc"),
            fbLimit(100)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                setComments(
                    snap.docs.map((d) => {
                        const data = d.data();
                        const ts = data.createdAt as { toDate?: () => Date } | null;
                        return {
                            id: d.id,
                            userId: String(data.userId || ""),
                            displayName: String(data.displayName || "Anonymous"),
                            photoURL: (data.photoURL as string | null) ?? null,
                            body: String(data.body || ""),
                            createdAt: ts && typeof ts.toDate === "function" ? ts.toDate() : null,
                        };
                    })
                );
                setLoaded(true);
            },
            (err) => {
                console.error("[discussion] listen failed:", err);
                setLoaded(true);
            }
        );
        return () => unsub();
    }, [articleId]);

    const post = useCallback(async () => {
        const trimmed = body.trim();
        if (!trimmed) return;
        if (!firebaseUser) {
            setError("Please sign in to post.");
            return;
        }
        if (trimmed.length > 2000) {
            setError("Keep comments under 2000 characters.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await addDoc(collection(db, "articles", articleId, "comments"), {
                userId: firebaseUser.uid,
                displayName: user?.displayName || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Anonymous",
                photoURL: user?.photoURL || firebaseUser.photoURL || null,
                body: trimmed,
                createdAt: serverTimestamp(),
            });
            setBody("");
        } catch (e: unknown) {
            console.error("[discussion] post failed:", e);
            setError("Could not post — please try again.");
        } finally {
            setSubmitting(false);
        }
    }, [body, firebaseUser, user, articleId]);

    const removeComment = useCallback(
        async (c: Comment) => {
            if (!firebaseUser) return;
            const canDelete = isAdmin || c.userId === firebaseUser.uid;
            if (!canDelete) return;
            if (!confirm("Delete this comment? This cannot be undone.")) return;
            setDeletingId(c.id);
            try {
                if (isAdmin && c.userId !== firebaseUser.uid) {
                    // Admin moderating someone else's comment — route through
                    // server so we don't need to grant client-side delete on
                    // arbitrary user docs in Firestore rules.
                    const token = await firebaseUser.getIdToken();
                    const res = await fetch(
                        `/api/admin/comments/${articleId}/${c.id}`,
                        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                } else {
                    await deleteDoc(doc(db, "articles", articleId, "comments", c.id));
                }
            } catch (e) {
                console.error("[discussion] delete failed:", e);
                alert("Could not delete comment.");
            } finally {
                setDeletingId(null);
            }
        },
        [articleId, firebaseUser, isAdmin]
    );

    return (
        <section
            id="article-discussion"
            className="mt-16 border-t border-slate-200 pt-10"
            aria-label="Discussion"
        >
            <div className="mb-6 flex items-baseline justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Discussion</h2>
                <span className="text-sm text-slate-500">{comments.length} comment{comments.length === 1 ? "" : "s"}</span>
            </div>

            {/* Composer */}
            {firebaseUser ? (
                <Card className="p-4">
                    <div className="flex items-start gap-3">
                        {user?.photoURL || firebaseUser.photoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={(user?.photoURL || firebaseUser.photoURL) as string}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/15 font-bold text-primary-700 dark:text-primary-300">
                                {(user?.displayName || firebaseUser.email || "U")[0]?.toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1">
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={3}
                                placeholder="Share your take, ask a question, or correct something…"
                                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                maxLength={2000}
                            />
                            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
                            <div className="mt-2 flex items-center justify-between">
                                <p className="text-[11px] text-slate-400">
                                    {body.length}/2000 · be kind, no spam.
                                </p>
                                <Button onClick={post} disabled={submitting || !body.trim()} size="sm">
                                    {submitting ? "Posting…" : "Post comment"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            ) : (
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-sm text-slate-600">Sign in to join the discussion.</p>
                    <Link href={loginHref}>
                        <Button size="sm">Sign in</Button>
                    </Link>
                </Card>
            )}

            {/* Existing comments */}
            <div className="mt-8 space-y-5">
                {!loaded ? (
                    <p className="text-sm text-slate-400">Loading comments…</p>
                ) : comments.length === 0 ? (
                    <p className="text-sm text-slate-400">No comments yet — be the first.</p>
                ) : (
                    comments.map((c) => {
                        const canDelete =
                            !!firebaseUser && (isAdmin || c.userId === firebaseUser.uid);
                        return (
                            <div key={c.id} className="group flex items-start gap-3">
                                {c.photoURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={c.photoURL}
                                        alt=""
                                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                        {c.displayName[0]?.toUpperCase() || "U"}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-semibold text-slate-900">
                                            {c.displayName}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            {timeAgo(c.createdAt)}
                                        </span>
                                        {canDelete && (
                                            <button
                                                onClick={() => removeComment(c)}
                                                disabled={deletingId === c.id}
                                                className="ml-auto text-[11px] font-medium text-rose-600 opacity-0 transition-opacity hover:underline group-hover:opacity-100 disabled:opacity-40"
                                                title={
                                                    isAdmin && c.userId !== firebaseUser?.uid
                                                        ? "Delete as admin"
                                                        : "Delete your comment"
                                                }
                                            >
                                                {deletingId === c.id ? "Deleting…" : "Delete"}
                                            </button>
                                        )}
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                                        {c.body}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
