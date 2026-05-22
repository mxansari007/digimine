import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/middleware/requireAdmin";

export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await req.json();
        const { contentId, contentType, teacherId, reason } = body;
        const adminId = auth.uid;

        if (!contentId || !contentType || !reason) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        let contentRef;

        if (contentType === "question") {
            if (!teacherId) {
                return NextResponse.json({ error: "teacherId required for question rejection" }, { status: 400 });
            }
            contentRef = adminDb.collection("teachers").doc(teacherId).collection("questions").doc(contentId);
        } else {
            const collectionName = contentType === "test" ? "tests" : `${contentType}s`;
            contentRef = adminDb.collection(collectionName).doc(contentId);
        }

        await contentRef.update({
            visibility: "rejected",
            reviewNotes: reason,
            reviewedBy: adminId,
            reviewedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Reject content error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to reject content" },
            { status: 500 }
        );
    }
}
