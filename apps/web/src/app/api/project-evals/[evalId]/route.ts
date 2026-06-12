import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    canManageEvaluation,
    getEvaluationById,
    serializeEvaluation,
    studentCanAccessEvaluation,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

/** Evaluation detail for an assigned student (owner/admin also pass). */
export async function GET(req: Request, { params }: { params: { evalId: string } }) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        }
        const evalData = await getEvaluationById(params.evalId);
        if (!evalData) {
            return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
        }
        const allowed =
            (await studentCanAccessEvaluation(evalData, userId)) ||
            (await canManageEvaluation(evalData, userId));
        if (!allowed) {
            return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
        }
        return NextResponse.json({ evaluation: serializeEvaluation(evalData) });
    } catch (error: any) {
        console.error("Get assigned project eval failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
