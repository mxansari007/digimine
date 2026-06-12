import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    PROJECT_EVALS,
    PROJECT_SUBMISSIONS,
    canManageEvaluation,
    getEvaluationById,
    sanitizeParameters,
    serializeEvaluation,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

type Params = { params: { evalId: string } };

async function authorize(req: Request, evalId: string) {
    const auth = await requireVerifiedUser(req);
    if (!auth.ok) {
        return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
    }
    const evalData = await getEvaluationById(evalId);
    if (!evalData) {
        return { error: NextResponse.json({ error: "Evaluation not found." }, { status: 404 }) };
    }
    if (!(await canManageEvaluation(evalData, auth.userId))) {
        return { error: NextResponse.json({ error: "Evaluation not found." }, { status: 404 }) };
    }
    return { userId: auth.userId, evalData };
}

/** Evaluation detail for its owner teacher / institute admin. */
export async function GET(req: Request, { params }: Params) {
    try {
        const auth = await authorize(req, params.evalId);
        if ("error" in auth) return auth.error;
        return NextResponse.json({ evaluation: serializeEvaluation(auth.evalData) });
    } catch (error: any) {
        console.error("Get project eval failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Update title/brief/stack/parameters/assignment/due date, or move
 * status between draft → published → closed. Parameter edits after
 * submissions exist are allowed — existing reports keep the parameter
 * snapshot they were scored with; re-evaluate to apply the new rubric.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const auth = await authorize(req, params.evalId);
        if ("error" in auth) return auth.error;
        const body = await req.json().catch(() => ({}));
        const updates: Record<string, any> = { updatedAt: Timestamp.now() };

        if (typeof body.title === "string" && body.title.trim()) {
            updates.title = body.title.trim().slice(0, 120);
        }
        if (typeof body.brief === "string" && body.brief.trim()) {
            updates.brief = body.brief.trim().slice(0, 6000);
        }
        if (typeof body.techStack === "string") {
            updates.techStack = body.techStack.trim().slice(0, 200) || null;
        }
        if (body.assignedMode === "all_students" || body.assignedMode === "classes") {
            updates.assignedMode = body.assignedMode;
        }
        if (Array.isArray(body.classIds)) {
            updates.classIds = body.classIds
                .filter((id: any) => typeof id === "string" && id)
                .slice(0, 50);
        }
        if (body.dueAt === null) updates.dueAt = null;
        else if (typeof body.dueAt === "string") {
            const d = new Date(body.dueAt);
            if (isNaN(d.getTime())) {
                return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
            }
            updates.dueAt = Timestamp.fromDate(d);
        }
        if (body.parameters !== undefined) {
            const parameters = sanitizeParameters(body.parameters);
            if ("error" in parameters) {
                return NextResponse.json({ error: parameters.error }, { status: 400 });
            }
            updates.parameters = parameters;
            updates.maxTotalScore = parameters.reduce((sum, p) => sum + p.maxScore, 0);
        }
        if (["draft", "published", "closed"].includes(body.status)) {
            updates.status = body.status;
        }

        const finalMode = updates.assignedMode ?? auth.evalData.assignedMode;
        const finalClassIds = updates.classIds ?? auth.evalData.classIds ?? [];
        if (finalMode === "classes" && finalClassIds.length === 0) {
            return NextResponse.json(
                { error: "Select at least one class, or assign to all students." },
                { status: 400 }
            );
        }

        await adminDb.collection(PROJECT_EVALS).doc(params.evalId).update(updates);
        const fresh = await getEvaluationById(params.evalId);
        return NextResponse.json({ evaluation: serializeEvaluation(fresh) });
    } catch (error: any) {
        console.error("Update project eval failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Delete — only drafts or evaluations with zero submissions. */
export async function DELETE(req: Request, { params }: Params) {
    try {
        const auth = await authorize(req, params.evalId);
        if ("error" in auth) return auth.error;
        const submissions = await adminDb
            .collection(PROJECT_SUBMISSIONS)
            .where("evaluationId", "==", params.evalId)
            .limit(1)
            .get();
        if (!submissions.empty) {
            return NextResponse.json(
                { error: "This evaluation has submissions — close it instead of deleting." },
                { status: 409 }
            );
        }
        await adminDb.collection(PROJECT_EVALS).doc(params.evalId).delete();
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Delete project eval failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
