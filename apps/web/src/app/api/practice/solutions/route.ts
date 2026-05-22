import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { PROGRESS, loadProblemById, progressId } from "@/lib/server/practice";
import {
    SOLUTIONS,
    authorSnapshot,
    capHtml,
    serializeSolution,
    votedTargetIds,
} from "@/lib/server/practiceCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/practice/solutions?problemId=...&sort=top|newest */
export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const problemId = url.searchParams.get("problemId") || "";
        const sort = url.searchParams.get("sort") === "newest" ? "newest" : "top";
        if (!problemId) return NextResponse.json({ error: "problemId required" }, { status: 400 });

        const snap = await adminDb.collection(SOLUTIONS).where("problemId", "==", problemId).limit(200).get();
        const items = snap.docs.map((d) => serializeSolution(d.id, d.data() || {}));
        items.sort((a, b) =>
            sort === "newest" ? Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "") : b.upvotes - a.upvotes
        );

        // Has the caller already solved this problem (gates the composer client-side)?
        const userId = await getBearerUserId(req).catch(() => null);
        let voted: Set<string> = new Set();
        let canPost = false;
        if (userId) {
            voted = await votedTargetIds(userId, items.map((i) => i.id));
            const prog = await adminDb.collection(PROGRESS).doc(progressId(userId, problemId)).get();
            canPost = prog.exists && (prog.data()?.status === "solved");
        }

        return NextResponse.json({
            items: items.map((i) => ({ ...i, hasVoted: voted.has(i.id) })),
            canPost,
        });
    } catch (error: any) {
        console.error("List solutions failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** POST /api/practice/solutions  { problemId, title, bodyHtml, language?, timeComplexity?, spaceComplexity?, tags? } */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to post." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const problemId = String(body.problemId || "");
        const title = String(body.title || "").trim();
        const bodyHtml = capHtml(body.bodyHtml || "");
        if (!problemId || !title || !bodyHtml.trim()) {
            return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
        }

        // Gate: only users who have an Accepted solve may publish a solution.
        const prog = await adminDb.collection(PROGRESS).doc(progressId(userId, problemId)).get();
        if (!prog.exists || prog.data()?.status !== "solved") {
            return NextResponse.json(
                { error: "Solve this problem first to publish a solution.", code: "not_solved" },
                { status: 403 }
            );
        }

        const problem = await loadProblemById(problemId);
        if (!problem) return NextResponse.json({ error: "Problem not found" }, { status: 404 });

        const author = await authorSnapshot(userId);
        const now = Timestamp.now();
        const ref = adminDb.collection(SOLUTIONS).doc();
        await ref.set({
            problemId,
            problemSlug: (problem as any).slug || "",
            author,
            title: title.slice(0, 180),
            bodyHtml,
            language: String(body.language || "").slice(0, 24),
            timeComplexity: body.timeComplexity ? String(body.timeComplexity).slice(0, 48) : null,
            spaceComplexity: body.spaceComplexity ? String(body.spaceComplexity).slice(0, 48) : null,
            tags: Array.isArray(body.tags) ? body.tags.slice(0, 6).map((t: any) => String(t).slice(0, 24)) : [],
            upvotes: 0,
            createdAt: now,
            updatedAt: now,
        });

        const doc = await ref.get();
        return NextResponse.json({ solution: { ...serializeSolution(ref.id, doc.data() || {}), hasVoted: false } });
    } catch (error: any) {
        console.error("Create solution failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
