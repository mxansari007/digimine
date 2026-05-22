import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { contentId, contentType } = body;

        if (!contentId || !contentType) {
            return NextResponse.json({ error: "contentId and contentType are required" }, { status: 400 });
        }

        const collectionName = contentType === "test" ? "tests" : `${contentType}s`;
        const ref = adminDb.collection(collectionName).doc(contentId);
        const snap = await ref.get();

        if (!snap.exists) {
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }

        const data = snap.data();
        if (data?.reviewStatus !== "pending_review") {
            return NextResponse.json({ error: "Content is not pending review" }, { status: 400 });
        }

        await ref.update({
            reviewStatus: "draft",
            submittedForReviewAt: null,
            updatedAt: new Date(),
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Withdraw review error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
