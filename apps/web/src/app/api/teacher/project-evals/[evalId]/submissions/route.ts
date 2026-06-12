import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    PROJECT_SUBMISSIONS,
    canManageEvaluation,
    getEvaluationById,
    reapStuckSubmissions,
    serializeSubmission,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/**
 * All submissions for an evaluation — owner teacher or institute admin.
 * Opportunistically re-queues stuck "processing" rows so a teacher
 * refreshing the list self-heals timed-out evaluations without a cron.
 */
export async function GET(req: Request, { params }: { params: { evalId: string } }) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const evalData = await getEvaluationById(params.evalId);
        if (!evalData || !(await canManageEvaluation(evalData, auth.userId))) {
            return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
        }

        await reapStuckSubmissions(params.evalId).catch(() => {});

        const snap = await adminDb
            .collection(PROJECT_SUBMISSIONS)
            .where("evaluationId", "==", params.evalId)
            .orderBy("submittedAt", "desc")
            .limit(300)
            .get();
        return NextResponse.json({
            submissions: snap.docs.map((d) => serializeSubmission(d)),
        });
    } catch (error: any) {
        console.error("List project submissions failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
