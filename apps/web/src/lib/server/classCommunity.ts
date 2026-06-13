/**
 * Server core for classroom community features (threads + DMs).
 *
 * Access model:
 *  - Threads: active students of the class, the class teacher, and admins
 *    of the class's institute. Everything flows through `resolveClassMember`.
 *  - DMs: the two users must share a classroom relationship — same class
 *    as students, or teacher↔student of one of the teacher's classes.
 *
 * All collections are server-only (admin SDK); see firestore.rules.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import { getClassById } from "@/lib/server/classes";
import { isInstituteAdmin } from "@/lib/server/institutes";

export const CLASS_THREADS = "classThreads";
export const DM_THREADS = "dmThreads";

export type CommunityRole = "student" | "teacher" | "institute_admin";

/**
 * Per-class moderation flags a teacher can set on a student. Stored on the
 * roster doc (`classes/{classId}/students/{uid}.communityBlock`).
 *   threads — can't start threads or reply in this class's discussions
 *   dm      — can't message members of this class
 */
export interface CommunityBlock {
    threads: boolean;
    dm: boolean;
}

const NO_BLOCK: CommunityBlock = { threads: false, dm: false };

function readBlock(data: any): CommunityBlock {
    const cb = data?.communityBlock || {};
    return { threads: Boolean(cb.threads), dm: Boolean(cb.dm) };
}

export type ClassMember =
    | { ok: true; userId: string; role: CommunityRole; classDoc: any; block: CommunityBlock }
    | { ok: false; status: number; error: string };

export async function resolveClassMember(classId: string, userId: string): Promise<ClassMember> {
    if (!userId) return { ok: false, status: 401, error: "Sign in to continue." };
    const classDoc = await getClassById(classId);
    if (!classDoc) return { ok: false, status: 404, error: "Class not found." };
    if (classDoc.teacherId === userId) {
        return { ok: true, userId, role: "teacher", classDoc, block: NO_BLOCK };
    }
    // Read the roster doc directly so we get membership AND the moderation
    // flags in one round trip (replaces the boolean-only enrollment check).
    const rosterSnap = await adminDb
        .collection("classes")
        .doc(classId)
        .collection("students")
        .doc(userId)
        .get();
    if (rosterSnap.exists && rosterSnap.data()?.status === "active") {
        return { ok: true, userId, role: "student", classDoc, block: readBlock(rosterSnap.data()) };
    }
    if (classDoc.instituteId && (await isInstituteAdmin(classDoc.instituteId, userId))) {
        return { ok: true, userId, role: "institute_admin", classDoc, block: NO_BLOCK };
    }
    return { ok: false, status: 403, error: "You are not a member of this class." };
}

/** Denormalized author identity stamped onto threads/replies/DMs. */
export interface AuthorIdentity {
    name: string;
    avatarUrl: string | null;
}

/**
 * Validate client-supplied image attachments. Caps the count and keeps
 * only https URLs from our storage bucket / the local emulator — rendering
 * an arbitrary <img> isn't an XSS, but we don't want threads embedding
 * off-platform images either.
 */
export function sanitizeAttachments(raw: any): Array<{ url: string; name: string }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ url: string; name: string }> = [];
    for (const a of raw) {
        const url = typeof a?.url === "string" ? a.url.trim() : "";
        if (!url || url.length > 2000) continue;
        const allowed =
            /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(url) ||
            /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url); // emulator
        if (!allowed) continue;
        const name = typeof a?.name === "string" ? a.name.slice(0, 120) : "image";
        out.push({ url, name });
        if (out.length >= 4) break;
    }
    return out;
}

export async function getUserIdentity(userId: string): Promise<AuthorIdentity> {
    const snap = await adminDb.collection("users").doc(userId).get();
    const data = snap.exists ? snap.data() || {} : {};
    const name =
        data.displayName ||
        `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
        "Member";
    return { name, avatarUrl: data.photoURL || null };
}

// ─────────────────────────────────────────────────────────────────────
// Threads
// ─────────────────────────────────────────────────────────────────────

export function serializeThread(doc: any, opts: { myVote?: boolean } = {}) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        classId: data.classId || "",
        authorId: data.authorId || "",
        authorName: data.authorName || "Member",
        authorAvatar: data.authorAvatar ?? null,
        authorRole: data.authorRole || "student",
        title: data.title || "",
        body: data.body || "",
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        tag: data.tag || "discussion",
        upvoteCount: data.upvoteCount ?? 0,
        replyCount: data.replyCount ?? 0,
        isPinned: Boolean(data.isPinned),
        isLocked: Boolean(data.isLocked),
        lastActivityAt: toIsoDate(data.lastActivityAt),
        createdAt: toIsoDate(data.createdAt),
        ...(opts.myVote !== undefined ? { myVote: opts.myVote } : {}),
    };
}

export function serializeReply(doc: any, opts: { myVote?: boolean } = {}) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        authorId: data.authorId || "",
        authorName: data.authorName || "Member",
        authorAvatar: data.authorAvatar ?? null,
        authorRole: data.authorRole || "student",
        body: data.body || "",
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        upvoteCount: data.upvoteCount ?? 0,
        isAnswer: Boolean(data.isAnswer),
        createdAt: toIsoDate(data.createdAt),
        ...(opts.myVote !== undefined ? { myVote: opts.myVote } : {}),
    };
}

/**
 * Toggle the caller's upvote on a thread or reply ref. Transactional so
 * concurrent toggles can't skew the counter. Returns the new state.
 */
export async function toggleVote(
    targetRef: FirebaseFirestore.DocumentReference,
    userId: string
): Promise<{ voted: boolean; upvoteCount: number }> {
    const voteRef = targetRef.collection("votes").doc(userId);
    return adminDb.runTransaction(async (tx) => {
        const [target, vote] = await Promise.all([tx.get(targetRef), tx.get(voteRef)]);
        if (!target.exists) throw new Error("Not found.");
        const current = target.data()?.upvoteCount ?? 0;
        if (vote.exists) {
            tx.delete(voteRef);
            tx.update(targetRef, { upvoteCount: Math.max(0, current - 1) });
            return { voted: false, upvoteCount: Math.max(0, current - 1) };
        }
        tx.set(voteRef, { value: 1, at: Timestamp.now() });
        tx.update(targetRef, { upvoteCount: current + 1 });
        return { voted: true, upvoteCount: current + 1 };
    });
}

/** Which of the given target refs has this user upvoted? */
export async function getMyVotes(
    refs: FirebaseFirestore.DocumentReference[],
    userId: string
): Promise<Set<string>> {
    const voted = new Set<string>();
    await Promise.all(
        refs.map(async (ref) => {
            const v = await ref.collection("votes").doc(userId).get();
            if (v.exists) voted.add(ref.id);
        })
    );
    return voted;
}

// ─────────────────────────────────────────────────────────────────────
// Direct messages
// ─────────────────────────────────────────────────────────────────────

export function dmThreadId(a: string, b: string): string {
    return [a, b].sort().join("_");
}

/** Class ids the user belongs to — as an enrolled student or as teacher. */
export async function classIdsFor(userId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const [enrolled, taught] = await Promise.all([
        adminDb
            .collectionGroup("students")
            .where("studentId", "==", userId)
            .where("status", "==", "active")
            .get(),
        adminDb.collection("classes").where("teacherId", "==", userId).get(),
    ]);
    enrolled.docs.forEach((d) => {
        const segments = d.ref.path.split("/");
        if (segments[0] === "classes" && segments.length >= 2) ids.add(segments[1]);
    });
    taught.docs.forEach((d) => ids.add(d.id));
    return ids;
}

/**
 * Two users may DM when they share at least one classroom (classmates, or
 * teacher and student of the same class). Keeps DMs a study channel, not
 * an open inbox for strangers.
 */
export async function canDirectMessage(a: string, b: string): Promise<boolean> {
    if (!a || !b || a === b) return false;
    const [setA, setB] = await Promise.all([classIdsFor(a), classIdsFor(b)]);
    for (const id of setA) {
        if (setB.has(id)) return true;
    }
    return false;
}

/** Class ids where this user has been DM-muted by the teacher. */
async function dmMutedClassIds(userId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const snap = await adminDb
        .collectionGroup("students")
        .where("studentId", "==", userId)
        .where("status", "==", "active")
        .get();
    snap.docs.forEach((d) => {
        if (d.data()?.communityBlock?.dm) {
            const segments = d.ref.path.split("/");
            if (segments[0] === "classes" && segments.length >= 2) ids.add(segments[1]);
        }
    });
    return ids;
}

/**
 * True when `sender` has been DM-muted in a class that `recipient` also
 * belongs to — i.e. the teacher told them not to message people in that
 * class. Scoped per class: a mute in one class never blocks DMs to a
 * different class's members. Teachers/admins are never muted.
 */
export async function dmMuteBlocks(sender: string, recipient: string): Promise<boolean> {
    const muted = await dmMutedClassIds(sender);
    if (muted.size === 0) return false;
    const recipientClasses = await classIdsFor(recipient);
    for (const id of muted) {
        if (recipientClasses.has(id)) return true;
    }
    return false;
}

export async function getCommunityRole(userId: string): Promise<CommunityRole> {
    const teacherSnap = await adminDb.collection("teachers").doc(userId).get();
    if (teacherSnap.exists) return "teacher";
    const userSnap = await adminDb.collection("users").doc(userId).get();
    return userSnap.data()?.role === "institute_admin" ? "institute_admin" : "student";
}

export function serializeDmThread(doc: any, viewerId: string) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    const otherId =
        (Array.isArray(data.participantIds) ? data.participantIds : []).find(
            (id: string) => id !== viewerId
        ) || "";
    const other = data.participants?.[otherId] || {};
    // User-initiated blocks live on the thread doc as a list of blocker uids.
    // `blockedByMe` drives the Unblock affordance; `blockedByOther` (kept
    // intentionally vague to the blocked party) just disables the composer.
    const blockedBy: string[] = Array.isArray(data.blockedBy) ? data.blockedBy : [];
    return {
        id: doc.id || data.id,
        otherId,
        otherName: other.name || "Member",
        otherAvatar: other.avatarUrl ?? null,
        otherRole: other.role || "student",
        lastMessage: data.lastMessage
            ? {
                  text: data.lastMessage.text || "",
                  senderId: data.lastMessage.senderId || "",
                  at: toIsoDate(data.lastMessage.at),
              }
            : null,
        unread: data.unread?.[viewerId] ?? 0,
        blockedByMe: blockedBy.includes(viewerId),
        blockedByOther: blockedBy.some((id) => id && id !== viewerId),
        isBlocked: blockedBy.length > 0,
        updatedAt: toIsoDate(data.updatedAt),
    };
}
