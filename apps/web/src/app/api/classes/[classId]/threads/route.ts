import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    CLASS_THREADS,
    getMyVotes,
    getUserIdentity,
    resolveClassMember,
    sanitizeAttachments,
    serializeThread,
} from "@/lib/server/classCommunity";

export const dynamic = "force-dynamic";

const TAGS = ["question", "discussion", "resource", "announcement"];

/** List a class's discussion threads. ?sort=active|top|new (default active). */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }
        const { searchParams } = new URL(req.url);
        const sort = searchParams.get("sort") || "active";
        const orderField =
            sort === "top" ? "upvoteCount" : sort === "new" ? "createdAt" : "lastActivityAt";
        // Optional tag filter (announcement | resource | question | discussion).
        // Applied in code so we don't need a composite index per tag+sort.
        const tag = searchParams.get("tag");

        // Prefer the indexed query, but fall back to an unordered fetch +
        // in-code sort when the composite index isn't deployed/built yet
        // (the emulator ignores indexes; production requires them and they
        // take a few minutes to build after `deploy:indexes`). The list is
        // capped at 100, so sorting in code is cheap and the discussions
        // board never hard-fails on index timing.
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await adminDb
                .collection(CLASS_THREADS)
                .where("classId", "==", params.classId)
                .orderBy(orderField, "desc")
                .limit(100)
                .get();
        } catch {
            snap = await adminDb
                .collection(CLASS_THREADS)
                .where("classId", "==", params.classId)
                .limit(100)
                .get();
        }

        const sortVal = (d: FirebaseFirestore.QueryDocumentSnapshot): number => {
            const v = d.data()[orderField];
            if (orderField === "upvoteCount") return typeof v === "number" ? v : 0;
            return v?.toMillis?.() ?? 0; // createdAt / lastActivityAt timestamps
        };

        let docs = snap.docs.filter((d) => !d.data().isDeleted);
        if (tag) docs = docs.filter((d) => d.data().tag === tag);
        // Sort in code so the result is correct whether or not the DB ordered it.
        docs.sort((a, b) => sortVal(b) - sortVal(a));
        const voted = await getMyVotes(docs.map((d) => d.ref), member.userId);
        const threads = docs
            .map((d) => serializeThread(d, { myVote: voted.has(d.id) }))
            // Pinned posts surface first regardless of sort.
            .sort((a: any, b: any) => Number(b.isPinned) - Number(a.isPinned));

        return NextResponse.json({ threads, role: member.role, block: member.block });
    } catch (error: any) {
        console.error("List threads failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Start a thread. */
export async function POST(req: Request, { params }: { params: { classId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const member = await resolveClassMember(params.classId, userId || "");
        if (!member.ok) {
            return NextResponse.json({ error: member.error }, { status: member.status });
        }

        if (member.role === "student" && member.block.threads) {
            return NextResponse.json(
                { error: "Your teacher has muted you in this class's discussions." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
        const text = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
        const attachments = sanitizeAttachments(body.attachments);
        const tag = TAGS.includes(body.tag) ? body.tag : "discussion";

        if (!title) return NextResponse.json({ error: "Give your post a title." }, { status: 400 });
        if (!text && attachments.length === 0) {
            return NextResponse.json(
                { error: "Write something or attach an image — what do you want to ask or share?" },
                { status: 400 }
            );
        }
        if (tag === "announcement" && member.role === "student") {
            return NextResponse.json(
                { error: "Only your teacher can post announcements." },
                { status: 403 }
            );
        }

        const identity = await getUserIdentity(member.userId);
        const now = Timestamp.now();
        const ref = adminDb.collection(CLASS_THREADS).doc();
        const data = {
            classId: params.classId,
            authorId: member.userId,
            authorName: identity.name,
            authorAvatar: identity.avatarUrl,
            authorRole: member.role,
            title,
            body: text,
            attachments,
            tag,
            upvoteCount: 0,
            replyCount: 0,
            isPinned: false,
            isLocked: false,
            isDeleted: false,
            lastActivityAt: now,
            createdAt: now,
            updatedAt: now,
        };
        await ref.set(data);
        return NextResponse.json({ thread: serializeThread({ id: ref.id, ...data }, { myVote: false }) });
    } catch (error: any) {
        console.error("Create thread failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
