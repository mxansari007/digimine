import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    PROJECT_SUBMISSIONS,
    serializeSubmission,
    submissionDocId,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/** The signed-in student's own submission — used for status polling. */
export async function GET(req: Request, { params }: { params: { evalId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        }
        const snap = await adminDb
            .collection(PROJECT_SUBMISSIONS)
            .doc(submissionDocId(params.evalId, userId))
            .get();
        if (!snap.exists) {
            return NextResponse.json({ submission: null });
        }
        return NextResponse.json({
            submission: serializeSubmission(snap, { forStudent: true }),
        });
    } catch (error: any) {
        console.error("Get my project submission failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
