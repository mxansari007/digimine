/**
 * Classroom community types — discussion threads and direct messages.
 *
 * Firestore (all server-only, admin SDK via /api routes):
 *   classThreads/{threadId}                    — one discussion post
 *   classThreads/{threadId}/votes/{uid}        — upvote dedupe (one doc per voter)
 *   classThreads/{threadId}/replies/{replyId}  — replies
 *   classThreads/{threadId}/replies/{replyId}/votes/{uid}
 *   dmThreads/{uidA_uidB}                      — 1:1 conversation (ids sorted)
 *   dmThreads/{id}/messages/{autoId}           — messages
 *
 * Access: class members only (active students of the class, the class
 * teacher, institute admins of the class's institute). DMs additionally
 * require the two users to share at least one classroom relationship.
 * Upvote-only on purpose — it's a study group, not karma farming.
 */

export type ThreadTag = "question" | "discussion" | "resource" | "announcement";

/** An uploaded image attached to a thread or reply. */
export interface ThreadAttachment {
    url: string;
    name: string;
}

export interface ClassThread {
    id: string;
    classId: string;
    authorId: string;
    /** Denormalized at write time so lists render without N user reads. */
    authorName: string;
    authorAvatar: string | null;
    /** "teacher" lets the UI badge the teacher's posts. */
    authorRole: "student" | "teacher" | "institute_admin";
    title: string;
    /** Plain text; triple-backtick fences render as code blocks. */
    body: string;
    attachments: ThreadAttachment[];
    tag: ThreadTag;
    upvoteCount: number;
    replyCount: number;
    /** Teacher-only moderation. */
    isPinned: boolean;
    isLocked: boolean;
    isDeleted: boolean;
    /** Bumped on every reply — drives the default "Active" sort. */
    lastActivityAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ClassThreadReply {
    id: string;
    threadId: string;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    authorRole: "student" | "teacher" | "institute_admin";
    body: string;
    attachments: ThreadAttachment[];
    upvoteCount: number;
    /** Marked by the thread author or the teacher — "this solved it". */
    isAnswer: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface DmParticipant {
    name: string;
    avatarUrl: string | null;
    role: "student" | "teacher" | "institute_admin";
}

export interface DmThread {
    id: string;
    /** Always exactly two uids, sorted — the doc id is `${a}_${b}`. */
    participantIds: string[];
    participants: Record<string, DmParticipant>;
    lastMessage: { text: string; senderId: string; at: Date } | null;
    /** Per-uid unread counters; reset when that user opens the thread. */
    unread: Record<string, number>;
    createdAt: Date;
    updatedAt: Date;
}

export interface DmMessage {
    id: string;
    senderId: string;
    text: string;
    createdAt: Date;
}

export const CLASS_COMMUNITY_LIMITS = {
    threadTitleMax: 160,
    threadBodyMax: 8000,
    replyBodyMax: 4000,
    dmMessageMax: 2000,
    maxAttachments: 4,
} as const;
