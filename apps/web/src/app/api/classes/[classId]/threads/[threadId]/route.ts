import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    CLASS_THREADS,
    getMyVotes,
    resolveClassMember,
    serializeReply,
    serializeThread,
    toggleVote,
} from "@/lib/server/classCommunity";

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
    return { member, ref, snap, data };
}

/** Thread + replies, with the caller's vote state attached. */
export async function GET(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const loaded = await loadThread(params.classId, params.threadId, userId || "");
        if ("error" in loaded) return loaded.error;
        const { member, ref, snap } = loaded;

        const repliesSnap = await ref.collection("replies").orderBy("createdAt", "asc").limit(300).get();
        const replyDocs = repliesSnap.docs.filter((d) => !d.data().isDeleted);
        const voted = await getMyVotes([ref, ...replyDocs.map((d) => d.ref)], member.userId);

        return NextResponse.json({
            thread: serializeThread(snap, { myVote: voted.has(ref.id) }),
            replies: replyDocs.map((d) => serializeReply(d, { myVote: voted.has(d.id) })),
            role: member.role,
            block: member.block,
        });
    } catch (error: any) {
        console.error("Get thread failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Edit / moderate. Author: title/body. Teacher (or institute admin):
 * pin/lock. Body: any of {title, body, isPinned, isLocked}.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const loaded = await loadThread(params.classId, params.threadId, userId || "");
        if ("error" in loaded) return loaded.error;
        const { member, ref, data } = loaded;

        const body = await req.json().catch(() => ({}));
        const isModerator = member.role !== "student";
        const isAuthor = data.authorId === member.userId;
        const updates: Record<string, any> = { updatedAt: Timestamp.now() };

        if (typeof body.title === "string" || typeof body.body === "string") {
            if (!isAuthor) {
                return NextResponse.json({ error: "Only the author can edit this post." }, { status: 403 });
            }
            if (typeof body.title === "string" && body.title.trim()) {
                updates.title = body.title.trim().slice(0, 160);
            }
            if (typeof body.body === "string" && body.body.trim()) {
                updates.body = body.body.trim().slice(0, 8000);
            }
        }
        if (typeof body.isPinned === "boolean" || typeof body.isLocked === "boolean") {
            if (!isModerator) {
                return NextResponse.json({ error: "Only your teacher can pin or lock posts." }, { status: 403 });
            }
            if (typeof body.isPinned === "boolean") updates.isPinned = body.isPinned;
            if (typeof body.isLocked === "boolean") updates.isLocked = body.isLocked;
        }

        await ref.update(updates);
        const fresh = await ref.get();
        return NextResponse.json({ thread: serializeThread(fresh) });
    } catch (error: any) {
        console.error("Update thread failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Soft-delete — author or teacher/institute admin. */
export async function DELETE(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const loaded = await loadThread(params.classId, params.threadId, userId || "");
        if ("error" in loaded) return loaded.error;
        const { member, ref, data } = loaded;
        if (data.authorId !== member.userId && member.role === "student") {
            return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
        }
        await ref.update({ isDeleted: true, updatedAt: Timestamp.now() });
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Delete thread failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Toggle upvote on the thread itself. */
export async function POST(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const loaded = await loadThread(params.classId, params.threadId, userId || "");
        if ("error" in loaded) return loaded.error;
        const result = await toggleVote(loaded.ref, loaded.member.userId);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Vote thread failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
