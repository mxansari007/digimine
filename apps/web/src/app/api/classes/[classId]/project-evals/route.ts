import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertClassEnrollment } from "@/lib/server/classes";
import {
    PROJECT_SUBMISSIONS,
    listClassProjectEvals,
    serializeEvaluation,
    serializeSubmission,
    submissionDocId,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/**
 * Project evaluations visible inside a classroom (class-assigned plus the
 * teacher's "all students" ones), each with the calling student's own
 * submission attached. Enrolled students only — same gate as the other
 * classroom content lists.
 */
export async function GET(req: Request, { params }: { params: { classId: string } }) {
    try {
        const access = await assertClassEnrollment(req, params.classId);
        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const evals = await listClassProjectEvals({
            id: params.classId,
            teacherId: access.classDoc?.teacherId,
        });
        const items = await Promise.all(
            evals.map(async (ev) => {
                const snap = await adminDb
                    .collection(PROJECT_SUBMISSIONS)
                    .doc(submissionDocId(ev.id, access.userId))
                    .get();
                return {
                    ...serializeEvaluation(ev),
                    mySubmission: snap.exists
                        ? serializeSubmission(snap, { forStudent: true })
                        : null,
                };
            })
        );
        return NextResponse.json({ items });
    } catch (error: any) {
        console.error("Classroom project evals error:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
