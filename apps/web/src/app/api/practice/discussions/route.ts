import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { loadProblemById } from "@/lib/server/practice";
import {
    DISCUSSIONS,
    authorSnapshot,
    capHtml,
    serializeDiscussion,
    votedTargetIds,
} from "@/lib/server/practiceCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/practice/discussions?problemId=...&sort=top|newest */
export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const problemId = url.searchParams.get("problemId") || "";
        const sort = url.searchParams.get("sort") === "top" ? "top" : "newest";
        if (!problemId) return NextResponse.json({ error: "problemId required" }, { status: 400 });

        // Fetch by problem, sort in memory (avoids composite indexes; per-problem volume is small).
        const snap = await adminDb.collection(DISCUSSIONS).where("problemId", "==", problemId).limit(200).get();
        const items = snap.docs.map((d) => serializeDiscussion(d.id, d.data() || {}));
        items.sort((a, b) =>
            sort === "top" ? b.upvotes - a.upvotes : Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")
        );

        // Annotate which the caller has upvoted.
        const userId = await getBearerUserId(req).catch(() => null);
        let voted: Set<string> = new Set();
        if (userId) voted = await votedTargetIds(userId, items.map((i) => i.id));

        return NextResponse.json({
            items: items.map((i) => ({ ...i, hasVoted: voted.has(i.id) })),
        });
    } catch (error: any) {
        console.error("List discussions failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** POST /api/practice/discussions  { problemId, title, bodyHtml, tags? } */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to post." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const problemId = String(body.problemId || "");
        const title = String(body.title || "").trim();
        const bodyHtml = capHtml(body.bodyHtml || "");
        const tags = Array.isArray(body.tags) ? body.tags.slice(0, 6).map((t: any) => String(t).slice(0, 24)) : [];
        if (!problemId || !title || !bodyHtml.trim()) {
            return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
        }

        const problem = await loadProblemById(problemId);
        if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

        const author = await authorSnapshot(userId);
        const now = Timestamp.now();
        const ref = adminDb.collection(DISCUSSIONS).doc();
        await ref.set({
            problemId,
            problemSlug: (problem as any).slug || "",
            author,
            title: title.slice(0, 180),
            bodyHtml,
            tags,
            upvotes: 0,
            replyCount: 0,
            createdAt: now,
            updatedAt: now,
        });

        const doc = await ref.get();
        return NextResponse.json({ discussion: { ...serializeDiscussion(ref.id, doc.data() || {}), hasVoted: false } });
    } catch (error: any) {
        console.error("Create discussion failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
