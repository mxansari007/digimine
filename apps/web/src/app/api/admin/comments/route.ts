/**
 * Admin moderation feed: list recent comments across every article.
 *
 * Uses Firestore's `collectionGroup("comments")` so we get all comment docs in
 * a single query regardless of which article they live under. Each comment doc
 * stores `userId`, `displayName`, `photoURL`, `body`, `createdAt` (server TS).
 *
 * We hydrate each row with the parent article's title + slug for display, with
 * a small in-memory cache to avoid N+1 article reads on a page of 50 comments.
 *
 * Auth: admin / super_admin only. The cron / dashboard never proxies through
 * the client SDK so Firestore rules can stay strict.
 *
 *   GET /api/admin/comments?limit=50&before=<ISO>
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/middleware/requireAdmin";

export const dynamic = "force-dynamic";

type ApiComment = {
    id: string;
    articleId: string;
    articleTitle: string | null;
    articleSlug: string | null;
    userId: string;
    displayName: string;
    photoURL: string | null;
    body: string;
    createdAt: string | null;
};

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const before = searchParams.get("before");

    try {
        let q = adminDb
            .collectionGroup("comments")
            .orderBy("createdAt", "desc")
            .limit(limit);

        if (before) {
            const beforeDate = new Date(before);
            if (!isNaN(beforeDate.getTime())) {
                q = q.startAfter(Timestamp.fromDate(beforeDate));
            }
        }

        const snap = await q.get();

        // Batch-resolve parent article titles to avoid N+1.
        const articleIds = new Set<string>();
        for (const d of snap.docs) {
            const articleRef = d.ref.parent.parent;
            if (articleRef) articleIds.add(articleRef.id);
        }
        const articleMeta = new Map<string, { title: string | null; slug: string | null }>();
        await Promise.all(
            Array.from(articleIds).map(async (id) => {
                try {
                    const aSnap = await adminDb.collection("articles").doc(id).get();
                    const data = aSnap.data() || {};
                    articleMeta.set(id, {
                        title: typeof data.title === "string" ? data.title : null,
                        slug: typeof data.slug === "string" ? data.slug : null,
                    });
                } catch {
                    articleMeta.set(id, { title: null, slug: null });
                }
            })
        );

        const comments: ApiComment[] = snap.docs.map((d) => {
            const data = d.data();
            const articleId = d.ref.parent.parent?.id || "";
            const meta = articleMeta.get(articleId) || { title: null, slug: null };
            const ts = data.createdAt;
            const createdAt =
                ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
            return {
                id: d.id,
                articleId,
                articleTitle: meta.title,
                articleSlug: meta.slug,
                userId: String(data.userId || ""),
                displayName: String(data.displayName || "Anonymous"),
                photoURL: (data.photoURL as string | null) ?? null,
                body: String(data.body || ""),
                createdAt,
            };
        });

        return NextResponse.json({ comments });
    } catch (error) {
        console.error("[admin/comments] list failed:", error);
        const message = error instanceof Error ? error.message : "Failed to load comments";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
