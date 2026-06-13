import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    PROJECT_EVALS,
    PROJECT_SUBMISSIONS,
    canManageEvaluation,
    getEvaluationById,
    serializeSubmission,
} from "@/lib/server/projectEval/store";

export const dynamic = "force-dynamic";

type Params = { params: { evalId: string; submissionId: string } };

async function authorize(req: Request, evalId: string, submissionId: string) {
    const auth = await requireVerifiedUser(req);
    if (!auth.ok) {
        return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
    }
    const evalData = await getEvaluationById(evalId);
    if (!evalData || !(await canManageEvaluation(evalData, auth.userId))) {
        return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
    }
    const snap = await adminDb.collection(PROJECT_SUBMISSIONS).doc(submissionId).get();
    if (!snap.exists || snap.data()?.evaluationId !== evalId) {
        return { error: NextResponse.json({ error: "Submission not found." }, { status: 404 }) };
    }
    return { userId: auth.userId, evalData, snap };
}

/** Full report for one submission. */
export async function GET(req: Request, { params }: Params) {
    try {
        const auth = await authorize(req, params.evalId, params.submissionId);
        if ("error" in auth) return auth.error;
        return NextResponse.json({ submission: serializeSubmission(auth.snap) });
    } catch (error: any) {
        console.error("Get project submission failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Verdict derived from a manual score's share of the max. */
function manualVerdict(score: number, maxScore: number): "met" | "partial" | "not_met" {
    if (maxScore <= 0) return "met";
    const ratio = score / maxScore;
    if (ratio >= 0.8) return "met";
    if (ratio >= 0.4) return "partial";
    return "not_met";
}

/**
 * Teacher review + release control for one submission. Concerns, any
 * combination per request:
 *   - Manual grade (`manualScores` present): the FALLBACK when the AI run
 *     can't happen (out of allowance/credits, provider down). The teacher
 *     enters a mark per parameter; we write them straight into `scores`,
 *     flip the submission to `scored` with `scoredBy: "manual"`, and clear
 *     the failure. No AI, no credits. Allowed from any state except while a
 *     run is actively `processing`.
 *   - Review: per-parameter overrides + comment on an already-scored
 *     submission. AI/manual scores stay in `scores`; overrides live in
 *     `teacherReview` so the report shows both.
 *   - Release: `publish` boolean flips `resultPublished`.
 */
export async function PATCH(req: Request, { params }: Params) {
    try {
        const auth = await authorize(req, params.evalId, params.submissionId);
        if ("error" in auth) return auth.error;
        const data = auth.snap.data() || {};
        const body = await req.json().catch(() => ({}));
        const isManualGrade =
            body.manualScores && typeof body.manualScores === "object";

        const parameters: any[] = Array.isArray(auth.evalData.parameters)
            ? auth.evalData.parameters
            : [];

        // ── Manual grade — the no-AI fallback. ──────────────────────────
        if (isManualGrade) {
            if (data.status === "processing") {
                return NextResponse.json(
                    { error: "This submission is being evaluated right now — wait for it to finish." },
                    { status: 409 }
                );
            }
            if (parameters.length === 0) {
                return NextResponse.json(
                    { error: "This evaluation has no scoring parameters to grade." },
                    { status: 400 }
                );
            }
            const scores = parameters.map((p) => {
                const raw = Number((body.manualScores as any)[p.id]);
                const score = Number.isFinite(raw)
                    ? Math.max(0, Math.min(p.maxScore, Math.round(raw * 10) / 10))
                    : 0;
                return {
                    parameterId: p.id,
                    title: p.title,
                    score,
                    maxScore: p.maxScore,
                    verdict: manualVerdict(score, p.maxScore),
                    confidence: "high" as const,
                    reasoning: "Graded by the teacher.",
                    evidence: [] as string[],
                };
            });
            const totalScore = Math.round(scores.reduce((s, x) => s + x.score, 0) * 10) / 10;
            const maxTotalScore = parameters.reduce((s, p) => s + (p.maxScore || 0), 0);
            const wasScored = data.status === "scored";

            const updates: Record<string, any> = {
                status: "scored",
                scoredBy: "manual",
                scores,
                totalScore,
                maxTotalScore,
                // A manual grade replaces a failed run — clear the error and any
                // stale AI overview so the report reads as a teacher grade.
                error: null,
                overview: null,
                updatedAt: Timestamp.now(),
            };
            const comment =
                typeof body.comment === "string" ? body.comment.trim().slice(0, 3000) : "";
            if (comment) {
                updates.teacherReview = {
                    adjustedScores: {},
                    finalScore: totalScore,
                    comment,
                    reviewedBy: auth.userId,
                    reviewedAt: Timestamp.now(),
                };
            }
            if (typeof body.publish === "boolean") {
                updates.resultPublished = body.publish;
                updates.resultPublishedAt = body.publish ? Timestamp.now() : null;
            }
            await auth.snap.ref.update(updates);
            // Count it as evaluated when it wasn't already scored.
            if (!wasScored) {
                await adminDb
                    .collection(PROJECT_EVALS)
                    .doc(params.evalId)
                    .update({ evaluatedCount: (auth.evalData.evaluatedCount ?? 0) + 1 })
                    .catch(() => {});
            }
            const fresh = await auth.snap.ref.get();
            return NextResponse.json({ submission: serializeSubmission(fresh) });
        }

        // ── Review / release on an already-scored submission. ───────────
        if (data.status !== "scored") {
            return NextResponse.json(
                { error: "You can review or publish a submission once it has been scored." },
                { status: 409 }
            );
        }
        const updates: Record<string, any> = { updatedAt: Timestamp.now() };

        // Review is only (re)written when the caller actually sends review
        // input — a bare { publish: true } must not blank an existing review.
        const hasReviewInput =
            (body.adjustedScores && typeof body.adjustedScores === "object") ||
            typeof body.comment === "string";
        if (hasReviewInput) {
            const comment =
                typeof body.comment === "string" ? body.comment.trim().slice(0, 3000) : "";
            const aiScores: any[] = Array.isArray(data.scores) ? data.scores : [];
            const adjustedScores: Record<string, number> = {};
            if (body.adjustedScores && typeof body.adjustedScores === "object") {
                for (const p of parameters) {
                    const v = Number((body.adjustedScores as any)[p.id]);
                    if (Number.isFinite(v)) {
                        adjustedScores[p.id] = Math.max(
                            0,
                            Math.min(p.maxScore, Math.round(v * 10) / 10)
                        );
                    }
                }
            }
            const finalScore = parameters.reduce((sum, p) => {
                if (p.id in adjustedScores) return sum + adjustedScores[p.id];
                const ai = aiScores.find((s) => s.parameterId === p.id);
                return sum + (typeof ai?.score === "number" ? ai.score : 0);
            }, 0);
            updates.teacherReview = {
                adjustedScores,
                finalScore: Math.round(finalScore * 10) / 10,
                comment,
                reviewedBy: auth.userId,
                reviewedAt: Timestamp.now(),
            };
        }

        if (typeof body.publish === "boolean") {
            updates.resultPublished = body.publish;
            updates.resultPublishedAt = body.publish ? Timestamp.now() : null;
        }

        await auth.snap.ref.update(updates);
        const fresh = await auth.snap.ref.get();
        return NextResponse.json({ submission: serializeSubmission(fresh) });
    } catch (error: any) {
        console.error("Review project submission failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Re-evaluate (or retry a failed run): resets the submission to queued.
 * The client then fire-and-forgets POST /api/project-eval/process.
 */
export async function POST(req: Request, { params }: Params) {
    try {
        const auth = await authorize(req, params.evalId, params.submissionId);
        if ("error" in auth) return auth.error;
        const data = auth.snap.data() || {};
        if (data.status === "processing") {
            return NextResponse.json(
                { error: "This submission is being evaluated right now." },
                { status: 409 }
            );
        }
        await auth.snap.ref.update({
            status: "queued",
            retryCount: 0,
            error: null,
            updatedAt: Timestamp.now(),
        });
        // Keep the display counter roughly honest when re-running a scored one.
        if (data.status === "scored") {
            await adminDb
                .collection(PROJECT_EVALS)
                .doc(params.evalId)
                .update({
                    evaluatedCount: Math.max(0, (auth.evalData.evaluatedCount ?? 1) - 1),
                })
                .catch(() => {});
        }
        const fresh = await auth.snap.ref.get();
        return NextResponse.json({ submission: serializeSubmission(fresh) });
    } catch (error: any) {
        console.error("Re-evaluate project submission failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
