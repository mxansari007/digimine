import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId, requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    DM_THREADS,
    canDirectMessage,
    dmMuteBlocks,
    dmThreadId,
    getCommunityRole,
    getUserIdentity,
    serializeDmThread,
} from "@/lib/server/classCommunity";

export const dynamic = "force-dynamic";

/** My conversations, most recent first. */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        const snap = await adminDb
            .collection(DM_THREADS)
            .where("participantIds", "array-contains", userId)
            .orderBy("updatedAt", "desc")
            .limit(100)
            .get();

        return NextResponse.json({
            conversations: snap.docs.map((d) => serializeDmThread(d, userId)),
        });
    } catch (error: any) {
        console.error("List conversations failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Open (create or fetch) a conversation with someone you share a
 * classroom with. Body: { recipientId }.
 */
export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const userId = auth.userId;

        const body = await req.json().catch(() => ({}));
        const recipientId = typeof body.recipientId === "string" ? body.recipientId.trim() : "";
        if (!recipientId || recipientId === userId) {
            return NextResponse.json({ error: "Pick someone to message." }, { status: 400 });
        }

        const threadId = dmThreadId(userId, recipientId);
        const ref = adminDb.collection(DM_THREADS).doc(threadId);
        const existing = await ref.get();

        if (await dmMuteBlocks(userId, recipientId)) {
            return NextResponse.json(
                { error: "Your teacher has muted your messages to this class." },
                { status: 403 }
            );
        }

        if (!existing.exists) {
            if (!(await canDirectMessage(userId, recipientId))) {
                return NextResponse.json(
                    { error: "You can message classmates and teachers from your classes." },
                    { status: 403 }
                );
            }
            const [meIdentity, themIdentity, meRole, themRole] = await Promise.all([
                getUserIdentity(userId),
                getUserIdentity(recipientId),
                getCommunityRole(userId),
                getCommunityRole(recipientId),
            ]);
            const now = Timestamp.now();
            await ref.set({
                participantIds: [userId, recipientId].sort(),
                participants: {
                    [userId]: { name: meIdentity.name, avatarUrl: meIdentity.avatarUrl, role: meRole },
                    [recipientId]: { name: themIdentity.name, avatarUrl: themIdentity.avatarUrl, role: themRole },
                },
                lastMessage: null,
                unread: { [userId]: 0, [recipientId]: 0 },
                createdAt: now,
                updatedAt: now,
            });
        }

        const fresh = await ref.get();
        return NextResponse.json({ conversation: serializeDmThread(fresh, userId) });
    } catch (error: any) {
        console.error("Open conversation failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
