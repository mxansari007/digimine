import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/middleware/requireAdmin";

export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await req.json();
        const { contentId, contentType, teacherId, finalPrice } = body;
        const adminId = auth.uid;

        if (!contentId || !contentType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        let contentRef;
        let contentSnap;
        let actualTeacherId = teacherId;

        if (contentType === "question") {
            if (!teacherId) {
                return NextResponse.json({ error: "teacherId required for question approval" }, { status: 400 });
            }
            contentRef = adminDb.collection("teachers").doc(teacherId).collection("questions").doc(contentId);
            contentSnap = await contentRef.get();
        } else {
            const collectionName = contentType === "test" ? "tests" : `${contentType}s`;
            contentRef = adminDb.collection(collectionName).doc(contentId);
            contentSnap = await contentRef.get();
        }

        if (!contentSnap.exists) {
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }

        const content = contentSnap.data()!;
        actualTeacherId = actualTeacherId || content.teacherId;

        // Update original content
        await contentRef.update({
            visibility: "published",
            finalPrice: finalPrice || content.suggestedPrice || 0,
            reviewedBy: adminId,
            reviewedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        // Clone to public_content collection (skip individual questions — they belong inside quizzes/tests)
        if (contentType !== "question") {
            const publicRef = adminDb.collection("public_content").doc(contentId);
            await publicRef.set({
                id: contentId,
                originalContentId: contentId,
                contentType,
                originalTeacherId: actualTeacherId,
                teacherName: content.teacherName || content.profile?.name || "",
                title: content.title || content.name || "Untitled",
                description: content.description || "",
                thumbnailUrl: content.thumbnailUrl || null,
                finalPrice: finalPrice || content.suggestedPrice || 0,
                revenueShare: 0.7,
                salesCount: 0,
                revenueGenerated: 0,
                teacherEarnings: 0,
                isFeatured: false,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Approve content error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to approve content" },
            { status: 500 }
        );
    }
}
