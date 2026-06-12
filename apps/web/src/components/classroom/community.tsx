"use client";

/**
 * Shared bits for classroom community surfaces (threads, people, DMs).
 * Same design language as the classroom kit: mono data, quiet slate,
 * teal actions; the teacher is badged, votes are upvote-only.
 */
import type { User } from "firebase/auth";

export type Attachment = { url: string; name: string };

export type ThreadRow = {
    id: string;
    classId: string;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    authorRole: "student" | "teacher" | "institute_admin";
    title: string;
    body: string;
    attachments?: Attachment[];
    tag: "question" | "discussion" | "resource" | "announcement";
    upvoteCount: number;
    replyCount: number;
    isPinned: boolean;
    isLocked: boolean;
    lastActivityAt: string | null;
    createdAt: string | null;
    myVote?: boolean;
};

export type ReplyRow = {
    id: string;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    authorRole: "student" | "teacher" | "institute_admin";
    body: string;
    attachments?: Attachment[];
    upvoteCount: number;
    isAnswer: boolean;
    createdAt: string | null;
    myVote?: boolean;
};

export type MemberRow = {
    id: string;
    role: "student" | "teacher";
    name: string;
    avatarUrl: string | null;
    headline: string | null;
    college: string | null;
    gradYear: number | null;
    skills: string[];
    /** Present only for moderator viewers (teacher / institute admin). */
    block?: { threads: boolean; dm: boolean };
};

export type ConversationRow = {
    id: string;
    otherId: string;
    otherName: string;
    otherAvatar: string | null;
    otherRole: "student" | "teacher" | "institute_admin";
    lastMessage: { text: string; senderId: string; at: string | null } | null;
    unread: number;
    updatedAt: string | null;
};

export function Avatar({
    name,
    src,
    size = "md",
}: {
    name: string;
    src?: string | null;
    size?: "sm" | "md" | "lg";
}) {
    const px = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-xs";
    if (src) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={src} alt={name} className={`${px} shrink-0 rounded-full object-cover`} />;
    }
    return (
        <span
            className={`${px} flex shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/20 font-bold text-primary-700 dark:text-primary-300`}
            aria-hidden
        >
            {(name[0] || "?").toUpperCase()}
        </span>
    );
}

const TAG_STYLE: Record<ThreadRow["tag"], string> = {
    question: "bg-info-50 dark:bg-info-500/15 text-info-700 dark:text-info-300",
    discussion: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    resource: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-300",
    announcement: "bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300",
};

export function TagChip({ tag }: { tag: ThreadRow["tag"] }) {
    return (
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TAG_STYLE[tag]}`}>
            {tag}
        </span>
    );
}

export function TeacherBadge() {
    return (
        <span className="rounded bg-primary-50 dark:bg-primary-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
            Teacher
        </span>
    );
}

/** Upvote toggle — count + chevron, filled when the caller has voted. */
export function VotePill({
    count,
    voted,
    onToggle,
    label,
}: {
    count: number;
    voted: boolean;
    onToggle: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={voted}
            aria-label={label}
            className={`flex min-w-[44px] flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                voted
                    ? "border-primary-300 dark:border-primary-500/40 bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary-300 hover:text-primary-700"
            }`}
        >
            <svg className="h-3.5 w-3.5" fill={voted ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-xs font-bold tabular-nums">{count}</span>
        </button>
    );
}

export function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return "just now";
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Open (or create) a DM with someone and land in /messages with it
 * focused. Returns false when the server refuses (no shared classroom).
 */
export async function startConversation(
    user: User,
    recipientId: string
): Promise<string | null> {
    const token = await user.getIdToken();
    const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't start the conversation.");
    return data.conversation?.id ?? null;
}
