/**
 * GET /api/ai-interview/session/[id]
 *
 * Returns one owned session + its public problem (hidden tests redacted), for
 * the interview room (resume) and the results page.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { loadProblemById, serializeProblemPublic } from "@/lib/server/practice";
import { AI_INTERVIEW_SESSIONS } from "@/lib/server/aiInterview";
import type { AIInterviewSession } from "@digimine/types";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const id = decodeURIComponent(params.id || "");
        const snap = await adminDb.collection(AI_INTERVIEW_SESSIONS).doc(id).get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Interview not found" }, { status: 404 });
        }
        const session = snap.data() as AIInterviewSession;
        if (session.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Conversational interviews have no problem (problemId === ""); never
        // call loadProblemById("") — Firestore rejects an empty document path.
        const problem = session.problemId
            ? await loadProblemById(session.problemId)
            : null;
        const publicProblem = problem
            ? serializeProblemPublic(problem.id, problem)
            : null;

        return NextResponse.json({ session, problem: publicProblem });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/session/[id]] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to load interview" },
            { status: 500 }
        );
    }
}
