import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import {
    PROJECT_EVALS,
    serializeEvaluation,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/**
 * Institute-wide overview: every project evaluation created by the
 * institute's teachers, with teacher names attached. Institute admins
 * drill into submissions through the teacher endpoints (which authorize
 * them via canManageEvaluation).
 */
export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const snap = await adminDb
            .collection(PROJECT_EVALS)
            .where("instituteId", "==", params.instituteId)
            .orderBy("createdAt", "desc")
            .limit(200)
            .get();

        const teacherIds = new Set<string>();
        snap.docs.forEach((d) => {
            const tid = d.data()?.teacherId;
            if (typeof tid === "string" && tid) teacherIds.add(tid);
        });
        const teacherNames = new Map<string, string>();
        await Promise.all(
            Array.from(teacherIds).map(async (tid) => {
                const t = await adminDb.collection("teachers").doc(tid).get();
                teacherNames.set(tid, t.exists ? t.data()?.profile?.name || "Teacher" : "Teacher");
            })
        );

        return NextResponse.json({
            evaluations: snap.docs.map((d) => ({
                ...serializeEvaluation(d),
                teacherName: teacherNames.get(d.data()?.teacherId) || "Teacher",
            })),
        });
    } catch (error: any) {
        console.error("List institute project evals failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
