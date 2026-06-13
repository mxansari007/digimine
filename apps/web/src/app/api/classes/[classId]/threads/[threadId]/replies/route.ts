import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    CLASS_THREADS,
    getUserIdentity,
    resolveClassMember,
    sanitizeAttachments,
    serializeReply,
    toggleVote,
} from "@/lib/server/classCommunity";
import { createNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

type Params = { params: { classId: string; threadId: string } };

async function loadThread(classId: string, threadId: string, userId: string) {
    const member = await resolveClassMember(classId, userId);
    if (!member.ok) return { error: NextResponse.json({ error: member.error }, { status: member.status }) };
    const ref = adminDb.collection(CLASS_THREADS).doc(threadId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() || {} : null;
    if (!data || data.classId !== classId || data.isDeleted) {
        return { error: NextResponse.json({ error: "Post not found." }, { status: 404 }) };
    }
    return { member, ref, data };
}

/** Add a reply. */
export async function POST(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const loaded = await loadThread(params.classId, params.threadId, userId || "");
        if ("error" in loaded) return loaded.error;
        const { member, ref, data } = loaded;

        if (data.isLocked && member.role === "student") {
            return NextResponse.json(
                { error: "This post is locked — no new replies." },
                { status: 409 }
            );
        }
        if (member.role === "student" && member.block.threads) {
            return NextResponse.json(
                { error: "Your teacher has muted you in this class's discussions." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
        const attachments = sanitizeAttachments(body.attachments);
        if (!text && attachments.length === 0) {
            return NextResponse.json({ error: "Write a reply or attach an image first." }, { status: 400 });
        }

        const identity = await getUserIdentity(member.userId);
        const now = Timestamp.now();
        const replyRef = ref.collection("replies").doc();
        const replyData = {
            threadId: params.threadId,
            authorId: member.userId,
            authorName: identity.name,
            authorAvatar: identity.avatarUrl,
            authorRole: member.role,
            body: text,
            attachments,
            upvoteCount: 0,
            isAnswer: false,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
        };
        await replyRef.set(replyData);
        await ref.update({
            replyCount: (data.replyCount ?? 0) + 1,
            lastActivityAt: now,
            updatedAt: now,
        });

        // Tell the original poster someone replied.
        if (data.authorId && data.authorId !== member.userId) {
            void createNotification(data.authorId, {
                type: "thread_reply",
                title: `${identity.name} replied to your post`,
                body: data.title ? `“${String(data.title).slice(0, 80)}”` : text.slice(0, 140),
                data: { classId: params.classId, threadId: params.threadId, kind: "thread" },
                actorId: member.userId,
                actorName: identity.name,
            });
        }

        return NextResponse.json({
            reply: serializeReply({ id: replyRef.id, ...replyData }, { myVote: false }),
        });
    } catch (error: any) {
        console.error("Create reply failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Reply actions, addressed by body.replyId:
 *  - action "vote"            → toggle upvote (any member)
 *  - action "mark_answer"     → toggle isAnswer (thread author or teacher)
 *  - action "delete"          → soft-delete (reply author or teacher)
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const loaded = await loadThread(params.classId, params.threadId, userId || "");
        if ("error" in loaded) return loaded.error;
        const { member, ref, data } = loaded;

        const body = await req.json().catch(() => ({}));
        const replyId = typeof body.replyId === "string" ? body.replyId : "";
        const action = typeof body.action === "string" ? body.action : "";
        const replyRef = ref.collection("replies").doc(replyId);
        const replySnap = await replyRef.get();
        const reply = replySnap.exists ? replySnap.data() || {} : null;
        if (!reply || reply.isDeleted) {
            return NextResponse.json({ error: "Reply not found." }, { status: 404 });
        }

        if (action === "vote") {
            const result = await toggleVote(replyRef, member.userId);
            return NextResponse.json(result);
        }

        if (action === "mark_answer") {
            const canMark = data.authorId === member.userId || member.role !== "student";
            if (!canMark) {
                return NextResponse.json(
                    { error: "Only the person who asked (or the teacher) can mark the answer." },
                    { status: 403 }
                );
            }
            await replyRef.update({ isAnswer: !reply.isAnswer, updatedAt: Timestamp.now() });
            return NextResponse.json({ isAnswer: !reply.isAnswer });
        }

        if (action === "delete") {
            if (reply.authorId !== member.userId && member.role === "student") {
                return NextResponse.json(
                    { error: "You can only delete your own replies." },
                    { status: 403 }
                );
            }
            await replyRef.update({ isDeleted: true, updatedAt: Timestamp.now() });
            await ref.update({ replyCount: Math.max(0, (data.replyCount ?? 1) - 1) });
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    } catch (error: any) {
        console.error("Reply action failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
