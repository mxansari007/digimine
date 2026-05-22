import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { questionId } = body;

        if (!questionId) {
            return NextResponse.json({ error: "questionId is required" }, { status: 400 });
        }

        const ref = adminDb.collection("questions").doc(questionId);
        const snap = await ref.get();

        if (!snap.exists) {
            return NextResponse.json({ error: "Question not found" }, { status: 404 });
        }

        await ref.update({
            reviewStatus: "pending_review",
            submittedForReviewAt: new Date(),
            updatedAt: new Date(),
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Submit question for review error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
