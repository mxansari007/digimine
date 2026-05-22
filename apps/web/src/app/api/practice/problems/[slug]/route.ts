import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import {
    PROGRESS,
    loadProblemBySlug,
    progressId,
    serializeProblemPublic,
    serializeProgress,
} from "@/lib/server/practice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
    try {
        const slug = decodeURIComponent(params.slug || "");
        const problem = await loadProblemBySlug(slug);
        if (!problem || (problem as any).status !== "published") {
            return NextResponse.json({ error: "Problem not found" }, { status: 404 });
        }

        const publicProblem = serializeProblemPublic(problem.id, problem);

        // Attach the caller's progress if signed in (best-effort).
        let progress = null;
        const userId = await getBearerUserId(req).catch(() => null);
        if (userId) {
            const snap = await adminDb.collection(PROGRESS).doc(progressId(userId, problem.id)).get();
            if (snap.exists) progress = serializeProgress(snap.id, snap.data() || {});
        }

        return NextResponse.json({ problem: publicProblem, progress });
    } catch (error: any) {
        console.error("Get practice problem failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
