import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import {
    DISCUSSIONS,
    REPLIES,
    authorSnapshot,
    capHtml,
    incReply,
    serializeReply,
    votedTargetIds,
} from "@/lib/server/practiceCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/practice/discussions/[id]/replies */
export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const discussionId = params.id;
        const snap = await adminDb.collection(REPLIES).where("discussionId", "==", discussionId).limit(300).get();
        const items = snap.docs.map((d) => serializeReply(d.id, d.data() || {}));
        items.sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));

        const userId = await getBearerUserId(req).catch(() => null);
        let voted: Set<string> = new Set();
        if (userId) voted = await votedTargetIds(userId, items.map((i) => i.id));

        return NextResponse.json({ items: items.map((i) => ({ ...i, hasVoted: voted.has(i.id) })) });
    } catch (error: any) {
        console.error("List replies failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** POST /api/practice/discussions/[id]/replies  { bodyHtml } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to reply." }, { status: 401 });

        const discussionId = params.id;
        const body = await req.json().catch(() => ({}));
        const bodyHtml = capHtml(body.bodyHtml || "", 20000);
        if (!bodyHtml.trim()) return NextResponse.json({ error: "Reply is empty." }, { status: 400 });

        const discRef = adminDb.collection(DISCUSSIONS).doc(discussionId);
        const disc = await discRef.get();
        if (!disc.exists) return NextResponse.json({ error: "Discussion not found" }, { status: 404 });

        const author = await authorSnapshot(userId);
        const now = Timestamp.now();
        const ref = adminDb.collection(REPLIES).doc();
        await ref.set({
            discussionId,
            problemId: disc.data()?.problemId || "",
            author,
            bodyHtml,
            upvotes: 0,
            createdAt: now,
        });
        await discRef.update({ replyCount: incReply, updatedAt: now });

        const doc = await ref.get();
        return NextResponse.json({ reply: { ...serializeReply(ref.id, doc.data() || {}), hasVoted: false } });
    } catch (error: any) {
        console.error("Create reply failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
