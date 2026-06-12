import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { processSubmission } from "@/lib/server/projectEval/process";
import {
    PROJECT_SUBMISSIONS,
    canManageEvaluation,
    getEvaluationById,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";
/**
 * The whole evaluation runs inside this invocation: repo download +
 * 3–5 LLM calls. Fluid compute default is 300s; typical runs are
 * 60–150s. A killed run is recovered by reapStuckSubmissions.
 */
export const maxDuration = 300;

/**
 * Trigger processing of a queued submission. Callable by:
 *  - the submitting student (the client fire-and-forgets this right
 *    after submit — that HTTP request IS the compute);
 *  - the owner teacher / institute admin (Retry / Re-evaluate buttons);
 *  - automation with `x-eval-secret: CRON_SECRET` (reap route, an
 *    external worker, or a manual curl).
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
        if (!submissionId) {
            return NextResponse.json({ error: "submissionId required" }, { status: 400 });
        }

        const secret = req.headers.get("x-eval-secret") || "";
        const isInternal = Boolean(process.env.CRON_SECRET) && secret === process.env.CRON_SECRET;

        if (!isInternal) {
            const userId = await getBearerUserId(req).catch(() => null);
            if (!userId) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            const snap = await adminDb.collection(PROJECT_SUBMISSIONS).doc(submissionId).get();
            if (!snap.exists) {
                return NextResponse.json({ error: "Submission not found." }, { status: 404 });
            }
            const data = snap.data() || {};
            if (data.studentId !== userId) {
                const evalData = await getEvaluationById(data.evaluationId);
                if (!evalData || !(await canManageEvaluation(evalData, userId))) {
                    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
                }
            }
        }

        const outcome = await processSubmission(submissionId);
        if (!outcome.ok) {
            // "not queued" double-triggers are expected and fine — report 200.
            return NextResponse.json({ ok: false, reason: outcome.reason });
        }
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Process project submission failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
