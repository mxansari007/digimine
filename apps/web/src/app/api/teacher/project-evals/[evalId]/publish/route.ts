import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    PROJECT_SUBMISSIONS,
    canManageEvaluation,
    getEvaluationById,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/**
 * Bulk release control for an evaluation's results. `publish: true`
 * releases every scored submission to its student in one action;
 * `publish: false` withholds them all. Pass `submissionIds` to limit the
 * action to a subset (e.g. only the currently-filtered rows). Only
 * "scored" submissions are touched — queued/processing/failed are skipped.
 */
export async function POST(req: Request, { params }: { params: { evalId: string } }) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const evalData = await getEvaluationById(params.evalId);
        if (!evalData || !(await canManageEvaluation(evalData, auth.userId))) {
            return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
        }

        const body = await req.json().catch(() => ({}));
        const publish = body.publish !== false; // default: release
        const onlyIds =
            Array.isArray(body.submissionIds) && body.submissionIds.length > 0
                ? new Set(body.submissionIds.filter((id: any) => typeof id === "string"))
                : null;

        // evaluationId-only query rides the automatic single-field index;
        // status is filtered in code so no composite index is needed.
        const snap = await adminDb
            .collection(PROJECT_SUBMISSIONS)
            .where("evaluationId", "==", params.evalId)
            .get();

        const targets = snap.docs.filter((d) => {
            const s = d.data() || {};
            if (s.status !== "scored") return false;
            if (onlyIds && !onlyIds.has(d.id)) return false;
            // Skip rows already in the desired state — keeps timestamps honest.
            return Boolean(s.resultPublished) !== publish;
        });

        // Firestore batches cap at 500 writes; chunk to stay well under.
        const now = Timestamp.now();
        for (let i = 0; i < targets.length; i += 400) {
            const batch = adminDb.batch();
            for (const d of targets.slice(i, i + 400)) {
                batch.update(d.ref, {
                    resultPublished: publish,
                    resultPublishedAt: publish ? now : null,
                    updatedAt: now,
                });
            }
            await batch.commit();
        }

        return NextResponse.json({ ok: true, published: publish, count: targets.length });
    } catch (error: any) {
        console.error("Bulk publish project results failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
