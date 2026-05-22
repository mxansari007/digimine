import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/middleware/requireAdmin";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const results: any[] = [];
        const collections = ["quizzes", "tests", "courses", "contests", "questions"];

        for (const col of collections) {
            try {
                const snapshot = await adminDb
                    .collection(col)
                    .where("reviewStatus", "==", "pending_review")
                    .orderBy("submittedForReviewAt", "desc")
                    .limit(50)
                    .get();

                snapshot.docs.forEach((doc) => {
                    const data = doc.data();
                    results.push({
                        id: doc.id,
                        type: col === "tests" ? "test" : col === "questions" ? "question" : col.slice(0, -1),
                        collection: col,
                        ...data,
                        submittedForReviewAt: data.submittedForReviewAt?.toDate?.() || data.submittedForReviewAt,
                    });
                });
            } catch {
                // Skip collections that don't have proper indexes yet
            }
        }

        // Sort by submitted date descending
        results.sort((a, b) => new Date(b.submittedForReviewAt || 0).getTime() - new Date(a.submittedForReviewAt || 0).getTime());

        return NextResponse.json({ items: results, total: results.length });
    } catch (error: any) {
        console.error("Review queue error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
