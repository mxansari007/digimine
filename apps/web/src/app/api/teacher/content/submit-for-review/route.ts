import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export async function POST(req: Request) {
    try {
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in to submit content for review." }, { status: 401 });
        }

        const body = await req.json();
        const { contentId, contentType, teacherId, suggestedPrice } = body;

        if (!contentId || !contentType || !teacherId) {
            return NextResponse.json({ error: "contentId, contentType, and teacherId are required" }, { status: 400 });
        }

        if (tokenUserId !== teacherId) {
            return NextResponse.json(
                { error: "You can only submit your own content for review." },
                { status: 403 }
            );
        }

        const collectionName = contentType === "test" ? "tests" : `${contentType}s`;
        const contentRef = adminDb.collection(collectionName).doc(contentId);
        const contentSnap = await contentRef.get();

        if (!contentSnap.exists) {
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }

        const content = contentSnap.data()!;
        if (content.teacherId !== teacherId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        if (content.visibility !== "private" && content.visibility !== "rejected") {
            return NextResponse.json(
                { error: `Cannot submit content with status: ${content.visibility}` },
                { status: 400 }
            );
        }

        await contentRef.update({
            visibility: "submitted_for_review",
            suggestedPrice: suggestedPrice || 0,
            submittedForReviewAt: Timestamp.now(),
            reviewNotes: null,
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Submit for review error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to submit for review" },
            { status: 500 }
        );
    }
}
