"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell } from "@/components/classroom/ui";
import {
    Attachment,
    Avatar,
    TagChip,
    TeacherBadge,
    ThreadRow,
    VotePill,
    timeAgo,
} from "@/components/classroom/community";
import { AttachImages } from "@/components/classroom/postContent";

const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

const SORTS = [
    { id: "active", label: "Active" },
    { id: "top", label: "Top" },
    { id: "new", label: "New" },
] as const;

const FILTERS = [
    { id: "" as const, label: "All" },
    { id: "announcement" as const, label: "Announcements" },
    { id: "question" as const, label: "Questions" },
    { id: "resource" as const, label: "Resources" },
    { id: "discussion" as const, label: "Discussion" },
] as const;

function ClassroomThreadsInner() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    // Teachers arrive from their own class page (`?from=teacher`) and should
    // return there, not to the student classroom hub.
    const fromTeacher = searchParams.get("from") === "teacher";
    const threadHref = (id: string) =>
        `/classroom/${classId}/threads/${id}${fromTeacher ? "?from=teacher" : ""}`;

    const [threads, setThreads] = useState<ThreadRow[]>([]);
    const [role, setRole] = useState<string>("student");
    const [muted, setMuted] = useState(false);
    const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("active");
    const [filterTag, setFilterTag] = useState<"" | ThreadRow["tag"]>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Composer
    const [composing, setComposing] = useState(false);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [tag, setTag] = useState<ThreadRow["tag"]>("question");
    const [posting, setPosting] = useState(false);

    // Deep-link from the teacher's class page: `?compose=announcement`
    // (or resource) auto-opens the composer preset to that tag.
    const composeParam = searchParams.get("compose");
    useEffect(() => {
        if (composeParam === "announcement" || composeParam === "resource") {
            setTag(composeParam);
            setComposing(true);
        }
    }, [composeParam]);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setError("");
        try {
            const token = await firebaseUser.getIdToken();
            const qs = `sort=${sort}${filterTag ? `&tag=${filterTag}` : ""}`;
            const res = await fetch(`/api/classes/${classId}/threads?${qs}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't load discussions.");
            setThreads(data.threads || []);
            setRole(data.role || "student");
            setMuted(Boolean(data.block?.threads));
        } catch (err: any) {
            setError(err.message || "Couldn't load discussions.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, classId, sort, filterTag]);

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/threads`)}`);
            return;
        }
        load();
    }, [authLoading, firebaseUser, router, classId, load]);

    const post = async () => {
        if (!firebaseUser || !title.trim() || (!body.trim() && attachments.length === 0)) return;
        setPosting(true);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/classes/${classId}/threads`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: title.trim(), body: body.trim(), tag, attachments }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't post.");
            setTitle("");
            setBody("");
            setAttachments([]);
            setComposing(false);
            toast.success("Posted.");
            router.push(threadHref(data.thread.id));
        } catch (err: any) {
            toast.error(err.message || "Couldn't post.");
        } finally {
            setPosting(false);
        }
    };

    const vote = async (thread: ThreadRow) => {
        if (!firebaseUser) return;
        // Optimistic toggle.
        setThreads((prev) =>
            prev.map((t) =>
                t.id === thread.id
                    ? { ...t, myVote: !t.myVote, upvoteCount: t.upvoteCount + (t.myVote ? -1 : 1) }
                    : t
            )
        );
        try {
            const token = await firebaseUser.getIdToken();
            await fetch(`/api/classes/${classId}/threads/${thread.id}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
            load();
        }
    };

    const tagOptions: Array<{ id: ThreadRow["tag"]; label: string }> = [
        { id: "question", label: "Question" },
        { id: "discussion", label: "Discussion" },
        { id: "resource", label: "Resource" },
        ...(role !== "student" ? [{ id: "announcement" as const, label: "Announcement" }] : []),
    ];

    return (
        <ClassroomShell
            backHref={fromTeacher ? `/teacher/classes/${classId}` : `/classroom/${classId}`}
            backLabel={fromTeacher ? "Class" : "Classroom"}
            eyebrow={role !== "student" ? "Moderating" : "Classroom"}
            title="Discussions"
            subtitle={
                role !== "student"
                    ? "Everything your students post. Pin the important threads; lock or delete anything off-topic."
                    : "Ask doubts, share resources, help each other out. Your teacher reads this too."
            }
            aside={
                !composing && !muted ? (
                    <Button variant="primary" onClick={() => setComposing(true)}>
                        Start a post
                    </Button>
                ) : undefined
            }
        >
            {muted && (
                <div className="rounded-2xl border border-accent-200 dark:border-accent-500/30 bg-accent-50/60 dark:bg-accent-500/10 px-4 py-3 text-sm text-accent-700 dark:text-accent-300">
                    Your teacher has muted you in this class&apos;s discussions. You can still read
                    along, but can&apos;t post or reply for now.
                </div>
            )}

            {composing && (
                <div className="rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-surface p-5 shadow-soft-sm">
                    <div className="flex flex-wrap gap-1.5">
                        {tagOptions.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTag(t.id)}
                                aria-pressed={tag === t.id}
                                className={`rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                                    tag === t.id
                                        ? "border-primary-500 bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300"
                                        : "border-slate-300 dark:border-slate-600 text-slate-500 hover:border-slate-400"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <input
                        className={`${inputClass} mt-3 font-medium`}
                        placeholder={tag === "question" ? "What are you stuck on?" : "Give your post a title"}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={160}
                    />
                    <textarea
                        className={`${inputClass} mt-2 min-h-[110px] leading-relaxed font-mono`}
                        placeholder={"Add the details. Wrap code in triple backticks:\n```js\nconst x = 1;\n```"}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        maxLength={8000}
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {firebaseUser && (
                            <AttachImages
                                uid={firebaseUser.uid}
                                attachments={attachments}
                                onChange={setAttachments}
                                onError={(m) => toast.error(m)}
                            />
                        )}
                        <span className="text-[11px] text-slate-400">
                            <code className="font-mono">```</code> for code · <code className="font-mono">`inline`</code>
                        </span>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setComposing(false)} disabled={posting}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={post}
                            disabled={posting || !title.trim() || (!body.trim() && attachments.length === 0)}
                        >
                            {posting ? "Posting…" : "Post"}
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {/* Tag filters — finding announcements & resources */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilterTag(f.id)}
                            aria-pressed={filterTag === f.id}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                                filterTag === f.id
                                    ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
                                    : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 hover:text-gray-900"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {/* Sort */}
                <div className="flex items-center gap-1.5">
                    {SORTS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setSort(s.id)}
                            aria-pressed={sort === s.id}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                                sort === s.id
                                    ? "bg-gray-900 text-white dark:bg-slate-200 dark:text-slate-900"
                                    : "text-slate-500 hover:text-gray-900"
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <Card intent="danger" className="p-4 text-sm text-danger-700">{error}</Card>}

            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    ))}
                </div>
            ) : threads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-14 text-center">
                    <h2 className="font-display text-lg font-semibold text-gray-900">
                        {filterTag === "announcement"
                            ? "No announcements yet"
                            : filterTag === "resource"
                              ? "No resources shared yet"
                              : filterTag
                                ? "Nothing here yet"
                                : "Nobody has posted yet"}
                    </h2>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                        {filterTag === "announcement"
                            ? "Class announcements from your teacher will show up here."
                            : filterTag === "resource"
                              ? "Helpful links, notes, and references shared with the class land here."
                              : "Stuck on a problem? Found a great resource? Start the first discussion — the whole class (and your teacher) sees it."}
                    </p>
                    {!composing && !muted && (
                        <Button variant="primary" className="mt-4" onClick={() => setComposing(true)}>
                            Start a post
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {threads.map((t) => (
                        <div
                            key={t.id}
                            className={`flex gap-3 rounded-2xl border bg-surface p-3.5 shadow-soft-sm transition-colors hover:border-primary-300 ${
                                t.isPinned
                                    ? "border-primary-200 dark:border-primary-500/30"
                                    : "border-slate-200 dark:border-slate-700"
                            }`}
                        >
                            <VotePill
                                count={t.upvoteCount}
                                voted={Boolean(t.myVote)}
                                onToggle={() => vote(t)}
                                label={`Upvote "${t.title}"`}
                            />
                            <Link
                                href={threadHref(t.id)}
                                className="min-w-0 flex-1 focus:outline-none focus-visible:underline"
                            >
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {t.isPinned && (
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                                            Pinned
                                        </span>
                                    )}
                                    <TagChip tag={t.tag} />
                                    {t.isLocked && <span className="text-[10px] text-slate-400">locked</span>}
                                </div>
                                <h3 className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug text-gray-900">
                                    {t.title}
                                </h3>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                    <Avatar name={t.authorName} src={t.authorAvatar} size="sm" />
                                    <span>{t.authorName}</span>
                                    {t.authorRole !== "student" && <TeacherBadge />}
                                    <span>· {timeAgo(t.lastActivityAt)}</span>
                                    <span className="font-mono">
                                        · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                                    </span>
                                    {t.attachments && t.attachments.length > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-slate-400" title={`${t.attachments.length} image(s)`}>
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
                                            </svg>
                                            {t.attachments.length}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </ClassroomShell>
    );
}

export default function ClassroomThreadsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <ClassroomThreadsInner />
        </Suspense>
    );
}
