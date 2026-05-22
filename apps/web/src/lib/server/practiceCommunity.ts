/**
 * Server helpers for the practice community layer (discussions, solutions,
 * replies, votes, public profiles). Uses the Firebase Admin SDK, so all reads
 * here bypass security rules — the rules still protect direct client access.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const DISCUSSIONS = "practiceDiscussions";
export const REPLIES = "practiceDiscussionReplies";
export const SOLUTIONS = "practiceSolutions";
export const VOTES = "practiceVotes";

export type VoteTargetType = "discussion" | "solution" | "reply";

const COLLECTION_FOR: Record<VoteTargetType, string> = {
    discussion: DISCUSSIONS,
    solution: SOLUTIONS,
    reply: REPLIES,
};

export function voteId(userId: string, targetId: string) {
    return `${userId}_${targetId}`;
}

/** Strip HTML to a bounded, safe length cap (defense-in-depth on input). */
export function capHtml(html: string, max = 60000): string {
    const s = String(html || "");
    return s.length > max ? s.slice(0, max) : s;
}

export function serializeAuthor(raw: any) {
    const a = raw?.author || {};
    return {
        userId: a.userId || "",
        name: a.name || "Anonymous",
        avatarUrl: a.avatarUrl || null,
    };
}

export function serializeDiscussion(id: string, raw: any) {
    return {
        id,
        problemId: raw.problemId || "",
        problemSlug: raw.problemSlug || "",
        author: serializeAuthor(raw),
        title: raw.title || "",
        bodyHtml: raw.bodyHtml || "",
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        upvotes: raw.upvotes ?? 0,
        replyCount: raw.replyCount ?? 0,
        createdAt: toIsoDate(raw.createdAt),
        updatedAt: toIsoDate(raw.updatedAt),
    };
}

export function serializeReply(id: string, raw: any) {
    return {
        id,
        discussionId: raw.discussionId || "",
        problemId: raw.problemId || "",
        author: serializeAuthor(raw),
        bodyHtml: raw.bodyHtml || "",
        upvotes: raw.upvotes ?? 0,
        createdAt: toIsoDate(raw.createdAt),
    };
}

export function serializeSolution(id: string, raw: any) {
    return {
        id,
        problemId: raw.problemId || "",
        problemSlug: raw.problemSlug || "",
        author: serializeAuthor(raw),
        title: raw.title || "",
        bodyHtml: raw.bodyHtml || "",
        language: raw.language || "",
        timeComplexity: raw.timeComplexity || null,
        spaceComplexity: raw.spaceComplexity || null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        upvotes: raw.upvotes ?? 0,
        createdAt: toIsoDate(raw.createdAt),
        updatedAt: toIsoDate(raw.updatedAt),
    };
}

/** Build a denormalized author snapshot from the user's doc. */
export async function authorSnapshot(userId: string) {
    const snap = await adminDb.collection("users").doc(userId).get();
    const u = snap.exists ? snap.data() || {} : {};
    const name =
        u.displayName ||
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
        (u.email ? String(u.email).split("@")[0] : "") ||
        "Anonymous";
    return { userId, name, avatarUrl: u.photoURL || null };
}

/**
 * Toggle an upvote for (userId, target). Returns the new vote state + count.
 * Uses a dedupe doc in `practiceVotes` and a transactional counter on the
 * target document.
 */
export async function toggleVote(userId: string, targetType: VoteTargetType, targetId: string) {
    const targetRef = adminDb.collection(COLLECTION_FOR[targetType]).doc(targetId);
    const voteRef = adminDb.collection(VOTES).doc(voteId(userId, targetId));

    return adminDb.runTransaction(async (tx) => {
        const [targetDoc, voteDoc] = await Promise.all([tx.get(targetRef), tx.get(voteRef)]);
        if (!targetDoc.exists) throw new Error("Not found");
        const current = targetDoc.data()?.upvotes ?? 0;
        if (voteDoc.exists) {
            tx.delete(voteRef);
            tx.update(targetRef, { upvotes: Math.max(0, current - 1) });
            return { voted: false, upvotes: Math.max(0, current - 1) };
        }
        tx.set(voteRef, { userId, targetType, targetId, createdAt: Timestamp.now() });
        tx.update(targetRef, { upvotes: current + 1 });
        return { voted: true, upvotes: current + 1 };
    });
}

/** Which of the given target ids has this user upvoted? */
export async function votedTargetIds(userId: string, targetIds: string[]): Promise<Set<string>> {
    const ids = targetIds.filter(Boolean);
    if (!ids.length) return new Set();
    const refs = ids.map((tid) => adminDb.collection(VOTES).doc(voteId(userId, tid)));
    const snaps = await adminDb.getAll(...refs);
    const out = new Set<string>();
    snaps.forEach((s, i) => {
        if (s.exists) out.add(ids[i]);
    });
    return out;
}

export const incReply = FieldValue.increment(1);
export const decReply = FieldValue.increment(-1);
