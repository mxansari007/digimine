"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell } from "@/components/classroom/ui";
import {
    Attachment,
    Avatar,
    ReplyRow,
    TeacherBadge,
    ThreadRow,
    VotePill,
    startConversation,
    timeAgo,
} from "@/components/classroom/community";
import { AttachImages, PostBody } from "@/components/classroom/postContent";

function ThreadDetailInner() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    const threadId = params.threadId as string;
    const fromTeacher = searchParams.get("from") === "teacher";

    const [thread, setThread] = useState<ThreadRow | null>(null);
    const [replies, setReplies] = useState<ReplyRow[]>([]);
    const [role, setRole] = useState<string>("student");
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [replyText, setReplyText] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([]);
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/classes/${classId}/threads/${threadId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't load this post.");
            setThread(data.thread);
            setReplies(data.replies || []);
            setRole(data.role || "student");
            setMuted(Boolean(data.block?.threads));
        } catch (err: any) {
            setError(err.message || "Couldn't load this post.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, classId, threadId]);

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/threads/${threadId}`)}`);
            return;
        }
        load();
    }, [authLoading, firebaseUser, router, classId, threadId, load]);

    const api = async (method: string, path: string, body?: any) => {
        const token = await firebaseUser!.getIdToken();
        const res = await fetch(path, {
            method,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        return data;
    };

    const voteThread = async () => {
        if (!firebaseUser || !thread) return;
        setThread({ ...thread, myVote: !thread.myVote, upvoteCount: thread.upvoteCount + (thread.myVote ? -1 : 1) });
        api("POST", `/api/classes/${classId}/threads/${threadId}`).catch(() => load());
    };

    const voteReply = async (reply: ReplyRow) => {
        if (!firebaseUser) return;
        setReplies((prev) =>
            prev.map((r) =>
                r.id === reply.id
                    ? { ...r, myVote: !r.myVote, upvoteCount: r.upvoteCount + (r.myVote ? -1 : 1) }
                    : r
            )
        );
        api("PATCH", `/api/classes/${classId}/threads/${threadId}/replies`, {
            replyId: reply.id,
            action: "vote",
        }).catch(() => load());
    };

    const sendReply = async () => {
        if (!firebaseUser || (!replyText.trim() && replyAttachments.length === 0)) return;
        setSending(true);
        try {
            const data = await api("POST", `/api/classes/${classId}/threads/${threadId}/replies`, {
                body: replyText.trim(),
                attachments: replyAttachments,
            });
            setReplies((prev) => [...prev, data.reply]);
            setReplyText("");
            setReplyAttachments([]);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setSending(false);
        }
    };

    const markAnswer = async (reply: ReplyRow) => {
        try {
            await api("PATCH", `/api/classes/${classId}/threads/${threadId}/replies`, {
                replyId: reply.id,
                action: "mark_answer",
            });
            setReplies((prev) =>
                prev.map((r) => (r.id === reply.id ? { ...r, isAnswer: !r.isAnswer } : r))
            );
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const moderate = async (patch: Record<string, boolean>) => {
        try {
            const data = await api("PATCH", `/api/classes/${classId}/threads/${threadId}`, patch);
            setThread((prev) => (prev ? { ...prev, ...data.thread } : data.thread));
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const removeThread = async () => {
        if (!confirm("Delete this post?")) return;
        try {
            await api("DELETE", `/api/classes/${classId}/threads/${threadId}`);
            router.push(`/classroom/${classId}/threads`);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const removeReply = async (reply: ReplyRow) => {
        if (!confirm("Delete this reply?")) return;
        try {
            await api("PATCH", `/api/classes/${classId}/threads/${threadId}/replies`, {
                replyId: reply.id,
                action: "delete",
            });
            setReplies((prev) => prev.filter((r) => r.id !== reply.id));
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const message = async (uid: string) => {
        if (!firebaseUser || uid === firebaseUser.uid) return;
        try {
            const convoId = await startConversation(firebaseUser, uid);
            if (convoId) router.push(`/messages?open=${convoId}`);
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background px-4 py-10">
                <div className="mx-auto max-w-4xl space-y-3">
                    <div className="h-40 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    <div className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                </div>
            </div>
        );
    }
    if (error || !thread) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background px-4">
                <Card className="max-w-sm p-8 text-center">
                    <p className="text-sm text-slate-500">{error || "Post not found."}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(`/classroom/${classId}/threads`)}>
                        Back to discussions
                    </Button>
                </Card>
            </div>
        );
    }

    const isModerator = role !== "student";
    const isAuthor = thread.authorId === firebaseUser?.uid;
    const canReply = (!thread.isLocked || isModerator) && !muted;

    return (
        <ClassroomShell
            backHref={`/classroom/${classId}/threads${fromTeacher ? "?from=teacher" : ""}`}
            backLabel="Discussions"
            eyebrow={thread.tag}
            title={thread.title}
            subtitle={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Avatar name={thread.authorName} src={thread.authorAvatar} size="sm" />
                    <span>{thread.authorName}</span>
                    {thread.authorRole !== "student" && <TeacherBadge />}
                    <span>· {timeAgo(thread.createdAt)}</span>
                    {thread.authorId !== firebaseUser?.uid && (
                        <button
                            type="button"
                            onClick={() => message(thread.authorId)}
                            className="text-primary-700 dark:text-primary-300 hover:underline focus-visible:underline"
                        >
                            · Message
                        </button>
                    )}
                </span>
            }
            aside={
                (isModerator || isAuthor) ? (
                    <div className="flex gap-1.5">
                        {isModerator && (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => moderate({ isPinned: !thread.isPinned })}>
                                    {thread.isPinned ? "Unpin" : "Pin"}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => moderate({ isLocked: !thread.isLocked })}>
                                    {thread.isLocked ? "Unlock" : "Lock"}
                                </Button>
                            </>
                        )}
                        {(isAuthor || isModerator) && (
                            <Button variant="ghost" size="sm" onClick={removeThread}>
                                Delete
                            </Button>
                        )}
                    </div>
                ) : undefined
            }
        >
            {/* Post body with vote */}
            <div className="flex gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface p-5 shadow-soft-sm">
                <VotePill
                    count={thread.upvoteCount}
                    voted={Boolean(thread.myVote)}
                    onToggle={voteThread}
                    label="Upvote this post"
                />
                <div className="min-w-0 flex-1">
                    <PostBody text={thread.body} attachments={thread.attachments} />
                </div>
            </div>

            {/* Replies */}
            <section>
                <h2 className="font-display text-base font-semibold text-gray-900">
                    Replies <span className="font-mono text-xs font-normal text-slate-400">{replies.length}</span>
                </h2>
                <div className="mt-3 space-y-2">
                    {replies.length === 0 && (
                        <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-5 py-8 text-center text-sm text-slate-400">
                            No replies yet — be the first to help.
                        </p>
                    )}
                    {[...replies]
                        .sort((a, b) => Number(b.isAnswer) - Number(a.isAnswer))
                        .map((r) => (
                            <div
                                key={r.id}
                                className={`flex gap-3 rounded-2xl border bg-surface p-4 shadow-soft-sm ${
                                    r.isAnswer
                                        ? "border-success-300 dark:border-success-500/40"
                                        : "border-slate-200 dark:border-slate-700"
                                }`}
                            >
                                <VotePill
                                    count={r.upvoteCount}
                                    voted={Boolean(r.myVote)}
                                    onToggle={() => voteReply(r)}
                                    label="Upvote this reply"
                                />
                                <div className="min-w-0 flex-1">
                                    {r.isAnswer && (
                                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-success-700 dark:text-success-300">
                                            ✓ Marked as the answer
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                        <Avatar name={r.authorName} src={r.authorAvatar} size="sm" />
                                        <span className="font-medium text-gray-900">{r.authorName}</span>
                                        {r.authorRole !== "student" && <TeacherBadge />}
                                        <span>· {timeAgo(r.createdAt)}</span>
                                    </div>
                                    <div className="mt-1.5">
                                        <PostBody text={r.body} attachments={r.attachments} />
                                    </div>
                                    <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
                                        {(thread.authorId === firebaseUser?.uid || isModerator) && (
                                            <button type="button" onClick={() => markAnswer(r)} className="hover:text-success-700 focus-visible:underline">
                                                {r.isAnswer ? "Unmark answer" : "Mark as answer"}
                                            </button>
                                        )}
                                        {r.authorId !== firebaseUser?.uid && (
                                            <button type="button" onClick={() => message(r.authorId)} className="hover:text-primary-700 focus-visible:underline">
                                                Message
                                            </button>
                                        )}
                                        {(r.authorId === firebaseUser?.uid || isModerator) && (
                                            <button type="button" onClick={() => removeReply(r)} className="hover:text-danger-600 focus-visible:underline">
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>

                {/* Reply composer */}
                {canReply ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface p-4 shadow-soft-sm">
                        <textarea
                            className="min-h-[80px] w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm leading-relaxed text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="Write a reply — explain your reasoning. Use ``` for code blocks."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            maxLength={4000}
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            {firebaseUser && (
                                <AttachImages
                                    uid={firebaseUser.uid}
                                    attachments={replyAttachments}
                                    onChange={setReplyAttachments}
                                    onError={(m) => toast.error(m)}
                                />
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={sendReply}
                                disabled={sending || (!replyText.trim() && replyAttachments.length === 0)}
                            >
                                {sending ? "Replying…" : "Reply"}
                            </Button>
                        </div>
                    </div>
                ) : muted ? (
                    <p className="mt-4 rounded-xl border border-accent-200 dark:border-accent-500/30 bg-accent-50/60 dark:bg-accent-500/10 px-4 py-3 text-center text-xs text-accent-700 dark:text-accent-300">
                        Your teacher has muted you in this class&apos;s discussions — you can read but not reply.
                    </p>
                ) : (
                    <p className="mt-4 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-center text-xs text-slate-500">
                        Your teacher locked this post — no new replies.
                    </p>
                )}
            </section>
        </ClassroomShell>
    );
}

export default function ThreadDetailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <ThreadDetailInner />
        </Suspense>
    );
}
