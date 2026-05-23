/**
 * Admin moderation: delete one comment from `articles/{articleId}/comments/{commentId}`.
 *
 * Authorization comes from `requireAdmin`, which verifies the Firebase ID token
 * and checks the user's role is `admin` or `super_admin`. We perform the delete
 * via the Admin SDK so the operation does not depend on Firestore client rules
 * granting cross-user delete — rules stay strict (author-only delete) while
 * admins moderate through this trusted server path.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/middleware/requireAdmin";

export async function DELETE(
    req: NextRequest,
    { params }: { params: { articleId: string; commentId: string } }
) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { articleId, commentId } = params;
    if (!articleId || !commentId) {
        return NextResponse.json({ error: "Missing articleId or commentId" }, { status: 400 });
    }

    try {
        const ref = adminDb
            .collection("articles")
            .doc(articleId)
            .collection("comments")
            .doc(commentId);

        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        await ref.delete();
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[admin/comments] delete failed:", error);
        const message = error instanceof Error ? error.message : "Failed to delete comment";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
