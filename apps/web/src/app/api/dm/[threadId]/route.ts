import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { DM_THREADS, dmMuteBlocks, serializeDmThread } from "@/lib/server/classCommunity";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

type Params = { params: { threadId: string } };

async function loadConversation(threadId: string, userId: string) {
    const ref = adminDb.collection(DM_THREADS).doc(threadId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() || {} : null;
    if (!data || !Array.isArray(data.participantIds) || !data.participantIds.includes(userId)) {
        return null;
    }
    return { ref, snap, data };
}

/**
 * Messages in a conversation, oldest first. `?after=<ISO>` returns only
 * newer messages (the chat polls with this). Opening the thread marks it
 * read for the caller.
 */
export async function GET(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        const convo = await loadConversation(params.threadId, userId);
        if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

        const { searchParams } = new URL(req.url);
        const after = searchParams.get("after");
        let query = convo.ref.collection("messages").orderBy("createdAt", "asc").limit(200);
        if (after) {
            const afterDate = new Date(after);
            if (!isNaN(afterDate.getTime())) {
                query = query.startAfter(Timestamp.fromDate(afterDate));
            }
        }
        const snap = await query.get();

        // Mark read (cheap merge — only when something was unread).
        if ((convo.data.unread?.[userId] ?? 0) > 0) {
            await convo.ref.set({ unread: { [userId]: 0 } }, { merge: true });
        }

        return NextResponse.json({
            conversation: serializeDmThread(convo.snap, userId),
            messages: snap.docs.map((d) => {
                const m = d.data();
                return {
                    id: d.id,
                    senderId: m.senderId || "",
                    text: m.text || "",
                    createdAt: toIsoDate(m.createdAt),
                };
            }),
        });
    } catch (error: any) {
        console.error("Get messages failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Send a message. Body: { text }. */
export async function POST(req: Request, { params }: Params) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        const convo = await loadConversation(params.threadId, userId);
        if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

        const body = await req.json().catch(() => ({}));
        const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
        if (!text) return NextResponse.json({ error: "Type a message first." }, { status: 400 });

        const otherId = convo.data.participantIds.find((id: string) => id !== userId) || "";

        // The real mute gate: this is where every message is created, so a
        // student muted after a conversation already exists is still stopped.
        if (await dmMuteBlocks(userId, otherId)) {
            return NextResponse.json(
                { error: "Your teacher has muted your messages to this class." },
                { status: 403 }
            );
        }

        const now = Timestamp.now();
        const msgRef = convo.ref.collection("messages").doc();
        await msgRef.set({ senderId: userId, text, createdAt: now });
        await convo.ref.set(
            {
                lastMessage: { text: text.slice(0, 200), senderId: userId, at: now },
                unread: { [otherId]: (convo.data.unread?.[otherId] ?? 0) + 1 },
                updatedAt: now,
            },
            { merge: true }
        );

        return NextResponse.json({
            message: { id: msgRef.id, senderId: userId, text, createdAt: now.toDate().toISOString() },
        });
    } catch (error: any) {
        console.error("Send message failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
