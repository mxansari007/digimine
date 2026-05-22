"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { Button, FormattedContent } from "@digimine/ui";
import { RichTextEditor } from "@digimine/shared";
import { communityExcerpt, type CommunitySort } from "@digimine/types";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Author = { userId: string; name: string; avatarUrl: string | null };
type Discussion = {
    id: string; title: string; bodyHtml: string; author: Author; tags: string[];
    upvotes: number; replyCount: number; createdAt: string; hasVoted?: boolean;
};
type Reply = { id: string; bodyHtml: string; author: Author; upvotes: number; createdAt: string; hasVoted?: boolean };
type Solution = {
    id: string; title: string; bodyHtml: string; author: Author; language: string;
    timeComplexity: string | null; spaceComplexity: string | null; tags: string[];
    upvotes: number; createdAt: string; hasVoted?: boolean;
};

function timeAgo(iso: string) {
    const diff = Date.now() - Date.parse(iso || "");
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ a }: { a: Author }) {
    return (
        <Link href={`/practice/u/${a.userId}`} className="group flex items-center gap-2">
            {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">
                    {(a.name || "?").slice(0, 1).toUpperCase()}
                </span>
            )}
            <span className="text-xs font-medium text-slate-600 group-hover:text-primary-700 group-hover:underline">{a.name}</span>
        </Link>
    );
}

function VoteButton({
    voted, count, onClick, disabled,
}: { voted?: boolean; count: number; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                voted ? "border-primary-300 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-700"
            }`}
            title="Upvote"
        >
            ▲ {count}
        </button>
    );
}

export default function PracticeCommunity({
    mode, problemId, slug, firebaseUser, isAuthenticated,
}: {
    mode: "discussion" | "solutions";
    problemId: string;
    slug: string;
    firebaseUser: User | null | undefined;
    isAuthenticated: boolean;
}) {
    const isSolutions = mode === "solutions";
    const base = isSolutions ? "/api/practice/solutions" : "/api/practice/discussions";

    const [sort, setSort] = useState<CommunitySort>(isSolutions ? "top" : "newest");
    const [items, setItems] = useState<(Discussion | Solution)[]>([]);
    const [loading, setLoading] = useState(true);
    const [canPost, setCanPost] = useState(!isSolutions); // discussions: anyone signed in
    const [composing, setComposing] = useState(false);
    const [posting, setPosting] = useState(false);
    const [error, setError] = useState("");

    // composer fields
    const [title, setTitle] = useState("");
    const [bodyHtml, setBodyHtml] = useState("");
    const [language, setLanguage] = useState("python");
    const [timeC, setTimeC] = useState("");
    const [spaceC, setSpaceC] = useState("");

    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const url = `${base}?problemId=${encodeURIComponent(problemId)}&sort=${sort}`;
            const res = firebaseUser ? await teacherFetch(firebaseUser, url) : await fetch(url);
            const data = await res.json();
            setItems(Array.isArray(data.items) ? data.items : []);
            if (isSolutions) setCanPost(Boolean(data.canPost));
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [base, problemId, sort, firebaseUser, isSolutions]);

    useEffect(() => { load(); }, [load]);

    const submitPost = async () => {
        if (!firebaseUser) return;
        if (!title.trim() || !bodyHtml.trim()) { setError("Title and body are required."); return; }
        setPosting(true);
        setError("");
        try {
            const payload: any = { problemId, title, bodyHtml };
            if (isSolutions) { payload.language = language; payload.timeComplexity = timeC; payload.spaceComplexity = spaceC; }
            const res = await teacherFetch(firebaseUser, base, { method: "POST", body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setComposing(false);
            setTitle(""); setBodyHtml(""); setTimeC(""); setSpaceC("");
            load();
        } catch (e: any) {
            setError(e.message || "Failed to post");
        } finally {
            setPosting(false);
        }
    };

    const vote = async (targetType: "discussion" | "solution", id: string) => {
        if (!firebaseUser) return;
        // optimistic
        setItems((prev) => prev.map((it) => it.id === id
            ? { ...it, hasVoted: !it.hasVoted, upvotes: it.upvotes + (it.hasVoted ? -1 : 1) } : it));
        try {
            await teacherFetch(firebaseUser, "/api/practice/vote", { method: "POST", body: JSON.stringify({ targetType, targetId: id }) });
        } catch {
            load();
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                    {(["top", "newest"] as CommunitySort[]).map((s) => (
                        <button
                            key={s}
                            onClick={() => setSort(s)}
                            className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                                sort === s ? "bg-primary-600 text-white" : "text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                {isAuthenticated ? (
                    canPost ? (
                        <Button size="sm" variant="primary" onClick={() => setComposing((c) => !c)}>
                            {composing ? "Cancel" : isSolutions ? "Post a solution" : "Start a discussion"}
                        </Button>
                    ) : (
                        <span className="text-xs text-slate-400">Solve this problem to post a solution</span>
                    )
                ) : (
                    <Link href={`/login?redirect=/practice/problems/${slug}`} className="text-xs font-medium text-primary-700 hover:underline">
                        Sign in to contribute
                    </Link>
                )}
            </div>

            {/* Composer */}
            {composing && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={isSolutions ? "Solution title — e.g. O(n) hashmap approach" : "Question or topic title"}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    {isSolutions && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                                {["python", "javascript", "cpp", "java", "sql"].map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <input value={timeC} onChange={(e) => setTimeC(e.target.value)} placeholder="Time e.g. O(n)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                            <input value={spaceC} onChange={(e) => setSpaceC(e.target.value)} placeholder="Space e.g. O(1)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        </div>
                    )}
                    <div className="mt-2 rounded-lg bg-white">
                        <RichTextEditor
                            value={bodyHtml}
                            onChange={setBodyHtml}
                            compact
                            minHeight={isSolutions ? 220 : 140}
                            placeholder={isSolutions ? "Walk through your approach, intuition, and code…" : "Share your question, hint, or insight…"}
                        />
                    </div>
                    {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
                    <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
                        <Button size="sm" variant="primary" onClick={submitPost} isLoading={posting}>Publish</Button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                    {isSolutions ? "No solutions yet — be the first to publish yours." : "No discussions yet — start the conversation."}
                </p>
            ) : isSolutions ? (
                <div className="space-y-3">
                    {(items as Solution[]).map((s) => (
                        <SolutionCard key={s.id} s={s} expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} onVote={() => vote("solution", s.id)} canVote={isAuthenticated} />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {(items as Discussion[]).map((d) => (
                        <DiscussionCard key={d.id} d={d} expanded={expanded === d.id} onToggle={() => setExpanded(expanded === d.id ? null : d.id)} onVote={() => vote("discussion", d.id)} firebaseUser={firebaseUser} isAuthenticated={isAuthenticated} />
                    ))}
                </div>
            )}
        </div>
    );
}

function SolutionCard({ s, expanded, onToggle, onVote, canVote }: {
    s: Solution; expanded: boolean; onToggle: () => void; onVote: () => void; canVote: boolean;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <button onClick={onToggle} className="text-left">
                    <h3 className="text-base font-semibold text-slate-900 hover:text-primary-700">{s.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{s.language || "code"}</span>
                        {s.timeComplexity && <span>⏱ {s.timeComplexity}</span>}
                        {s.spaceComplexity && <span>💾 {s.spaceComplexity}</span>}
                        <span>· {timeAgo(s.createdAt)}</span>
                    </div>
                </button>
                <VoteButton voted={s.hasVoted} count={s.upvotes} onClick={onVote} disabled={!canVote} />
            </div>
            {!expanded ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{communityExcerpt(s.bodyHtml)}</p>
            ) : (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    <FormattedContent html={s.bodyHtml} className="prose-sm" />
                </div>
            )}
            <div className="mt-3 flex items-center justify-between">
                <Avatar a={s.author} />
                <button onClick={onToggle} className="text-xs font-medium text-primary-700 hover:underline">
                    {expanded ? "Collapse" : "Read full solution →"}
                </button>
            </div>
        </div>
    );
}

function DiscussionCard({ d, expanded, onToggle, onVote, firebaseUser, isAuthenticated }: {
    d: Discussion; expanded: boolean; onToggle: () => void; onVote: () => void;
    firebaseUser: User | null | undefined; isAuthenticated: boolean;
}) {
    const [replies, setReplies] = useState<Reply[]>([]);
    const [loadingReplies, setLoadingReplies] = useState(false);
    const [replyHtml, setReplyHtml] = useState("");
    const [sending, setSending] = useState(false);

    const loadReplies = useCallback(async () => {
        setLoadingReplies(true);
        try {
            const url = `/api/practice/discussions/${d.id}/replies`;
            const res = firebaseUser ? await teacherFetch(firebaseUser, url) : await fetch(url);
            const data = await res.json();
            setReplies(Array.isArray(data.items) ? data.items : []);
        } catch {
            setReplies([]);
        } finally {
            setLoadingReplies(false);
        }
    }, [d.id, firebaseUser]);

    useEffect(() => { if (expanded) loadReplies(); }, [expanded, loadReplies]);

    const sendReply = async () => {
        if (!firebaseUser || !replyHtml.trim()) return;
        setSending(true);
        try {
            await teacherFetch(firebaseUser, `/api/practice/discussions/${d.id}/replies`, {
                method: "POST", body: JSON.stringify({ bodyHtml: replyHtml }),
            });
            setReplyHtml("");
            loadReplies();
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <button onClick={onToggle} className="text-left">
                    <h3 className="text-base font-semibold text-slate-900 hover:text-primary-700">{d.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{communityExcerpt(d.bodyHtml)}</p>
                </button>
                <VoteButton voted={d.hasVoted} count={d.upvotes} onClick={onVote} disabled={!isAuthenticated} />
            </div>
            <div className="mt-2 flex items-center justify-between">
                <Avatar a={d.author} />
                <button onClick={onToggle} className="text-xs font-medium text-slate-500 hover:text-primary-700">
                    💬 {d.replyCount} {d.replyCount === 1 ? "reply" : "replies"} · {timeAgo(d.createdAt)}
                </button>
            </div>

            {expanded && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    <FormattedContent html={d.bodyHtml} className="prose-sm" />

                    <div className="mt-4 space-y-3">
                        {loadingReplies ? (
                            <p className="text-xs text-slate-400">Loading replies…</p>
                        ) : (
                            replies.map((r) => (
                                <div key={r.id} className="rounded-lg bg-slate-50 p-3">
                                    <div className="mb-1 flex items-center justify-between">
                                        <Avatar a={r.author} />
                                        <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
                                    </div>
                                    <FormattedContent html={r.bodyHtml} className="prose-sm" size="sm" />
                                </div>
                            ))
                        )}
                    </div>

                    {isAuthenticated ? (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white">
                            <RichTextEditor value={replyHtml} onChange={setReplyHtml} compact minHeight={90} placeholder="Write a reply…" />
                            <div className="flex justify-end p-2">
                                <Button size="sm" variant="primary" onClick={sendReply} isLoading={sending} disabled={!replyHtml.trim()}>Reply</Button>
                            </div>
                        </div>
                    ) : (
                        <p className="mt-3 text-xs text-slate-400">Sign in to reply.</p>
                    )}
                </div>
            )}
        </div>
    );
}
