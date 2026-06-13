/**
 * Submission processor — the one function that takes a queued submission
 * through fetch → select → LLM pipeline → scored/failed.
 *
 * Invocation model (no dedicated worker):
 *   - the student client fire-and-forgets POST /api/project-eval/process
 *     right after submitting; that HTTP invocation does the work
 *     (maxDuration 300 on the route);
 *   - a transaction guard (queued → processing) makes concurrent triggers
 *     harmless;
 *   - `reapStuckSubmissions` re-queues anything a killed function left in
 *     "processing", and the teacher UI has a manual Retry.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    downloadRepoTarball,
    extractTarball,
    fetchRepoCommitInfo,
    parseGitHubUrl,
} from "./github";
import { selectFiles } from "./select";
import { runEvaluationPipeline, type EvalContext } from "./pipeline";
import { PROJECT_EVALS, PROJECT_SUBMISSIONS } from "./store";
import { chargeCredits, refundCredits } from "@/lib/server/credits";
import { reserveAiTaskUsage, refundAiTaskUsage } from "@/lib/server/aiTaskUsage";
import { getTeachingEntitlements } from "@/lib/server/teachingEntitlements";

export type ProcessOutcome =
    | { ok: true; status: "scored" }
    | { ok: false; reason: string; permanent?: boolean };

/** Atomically claim a queued submission. Returns its data or null. */
async function claimSubmission(submissionId: string): Promise<any | null> {
    const ref = adminDb.collection(PROJECT_SUBMISSIONS).doc(submissionId);
    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const data = snap.data() || {};
        if (data.status !== "queued") return null;
        tx.update(ref, {
            status: "processing",
            processingStartedAt: Timestamp.now(),
            error: null,
            updatedAt: Timestamp.now(),
        });
        return { id: snap.id, ...data };
    });
}

export async function processSubmission(submissionId: string): Promise<ProcessOutcome> {
    const submission = await claimSubmission(submissionId);
    if (!submission) {
        return { ok: false, reason: "Submission is not queued (already processed or in progress)." };
    }
    const ref = adminDb.collection(PROJECT_SUBMISSIONS).doc(submissionId);

    // Each submission is billed to the EVALUATION OWNER (the teacher /
    // institute admin who created it — never the submitting student),
    // overflow model: the owner's plan includes an allowance of evaluations
    // (admin-set limit + period); only beyond it do AI credits pay. So a
    // submission is paid by EITHER the plan quota OR credits, never both —
    // tracked here so `fail` returns exactly the one that was spent.
    const paid = {
        credits: { userId: "", amount: 0 },
        quota: { userId: "", periodKey: "" },
    };

    const fail = async (message: string): Promise<ProcessOutcome> => {
        if (paid.credits.amount > 0) {
            await refundCredits({
                userId: paid.credits.userId,
                task: "project_evaluation",
                amount: paid.credits.amount,
                ref: submissionId,
                note: "Evaluation failed",
            });
        }
        if (paid.quota.periodKey) {
            await refundAiTaskUsage(
                paid.quota.userId,
                "project_evaluation",
                paid.quota.periodKey,
                1
            ).catch(() => {});
        }
        await ref.update({
            status: "failed",
            error: message.slice(0, 500),
            creditsCharged: 0,
            updatedAt: Timestamp.now(),
        });
        return { ok: false, reason: message, permanent: true };
    };

    // A reaped retry of an attempt that already paid carries its marker on
    // the doc — adopt it instead of paying twice (a failure still refunds it
    // via `fail`). Read off the submission so the refund works even if the
    // evaluation has since been deleted.
    const prevCredits =
        typeof submission.creditsCharged === "number" ? submission.creditsCharged : 0;
    const prevCreditOwner =
        typeof submission.creditsChargedTo === "string" ? submission.creditsChargedTo : "";
    if (prevCreditOwner && prevCredits > 0) {
        paid.credits = { userId: prevCreditOwner, amount: prevCredits };
    }
    const prevQuotaPeriod =
        typeof submission.evalQuotaPeriod === "string" ? submission.evalQuotaPeriod : "";
    const prevQuotaOwner =
        typeof submission.evalQuotaPaidBy === "string" ? submission.evalQuotaPaidBy : "";
    if (prevQuotaPeriod && prevQuotaOwner) {
        paid.quota = { userId: prevQuotaOwner, periodKey: prevQuotaPeriod };
    }
    const alreadyPaid = paid.credits.amount > 0 || Boolean(paid.quota.periodKey);

    try {
        const evalSnap = await adminDb
            .collection(PROJECT_EVALS)
            .doc(submission.evaluationId)
            .get();
        if (!evalSnap.exists) return fail("The evaluation this submission belongs to was deleted.");
        const evalData = evalSnap.data() || {};

        // Bill once per submission, to the evaluation owner: plan allowance
        // first, credits only on overflow.
        const ownerId = typeof evalData.teacherId === "string" ? evalData.teacherId : "";
        if (ownerId && !alreadyPaid) {
            const ent = await getTeachingEntitlements(ownerId);
            const allowance = ent.ok
                ? ent.resolved.aiAllowances.project_evaluation
                : { limit: -1 as number, period: "month" as const };
            const reservation = await reserveAiTaskUsage(
                ownerId,
                "project_evaluation",
                1,
                allowance
            );
            if (reservation.fromQuota === 1) {
                // Covered by the owner's plan allowance — free.
                paid.quota = { userId: ownerId, periodKey: reservation.periodKey };
                await ref.update({
                    evalQuotaPaidBy: ownerId,
                    evalQuotaPeriod: reservation.periodKey,
                    creditsCharged: 0,
                    updatedAt: Timestamp.now(),
                });
            } else {
                // Allowance exhausted — pay with credits.
                const charge = await chargeCredits({
                    userId: ownerId,
                    task: "project_evaluation",
                    ref: submissionId,
                    note: `Submission scored beyond plan · ${String(evalData.title || "").slice(0, 70)}`,
                });
                if (!charge.ok) {
                    return fail(
                        "The evaluation owner has used their plan's evaluation allowance and is out of AI credits. The teacher can buy credits and retry this submission."
                    );
                }
                if (charge.charged === 0) {
                    // Credits are off (or evals are credit-free) and the plan
                    // allowance is spent — can't run this one.
                    return fail(
                        "The evaluation owner has used their plan's evaluation allowance. Upgrade the plan or enable AI credits to score more."
                    );
                }
                paid.credits = { userId: ownerId, amount: charge.charged };
                await ref.update({
                    creditsCharged: charge.charged,
                    creditsChargedTo: ownerId,
                    updatedAt: Timestamp.now(),
                });
            }
        }

        const parsed = parseGitHubUrl(submission.repoUrl);
        if (!parsed) return fail("The repository URL is not a valid GitHub repository link.");
        if (submission.repoRef) parsed.ref = submission.repoRef;

        // Fetch + extract + select. Commit info runs alongside the download.
        const [tarball, commitInfo] = await Promise.all([
            downloadRepoTarball(parsed),
            fetchRepoCommitInfo(parsed),
        ]);
        const allFiles = extractTarball(tarball);
        const selection = selectFiles(allFiles);
        if (selection.files.length === 0) {
            return fail(
                "No readable source files were found in the repository (only binaries/vendored files)."
            );
        }

        const ctx: EvalContext = {
            title: evalData.title || "",
            brief: evalData.brief || "",
            techStack: evalData.techStack ?? null,
            parameters: Array.isArray(evalData.parameters) ? evalData.parameters : [],
        };
        if (ctx.parameters.length === 0) {
            return fail("The evaluation has no scoring parameters — ask your teacher to update it.");
        }

        const result = await runEvaluationPipeline(ctx, selection);

        const totalScore = result.scores.reduce((sum, s) => sum + s.score, 0);
        const maxTotalScore = ctx.parameters.reduce((sum, p) => sum + p.maxScore, 0);

        await ref.update({
            status: "scored",
            repoMeta: {
                fileCount: allFiles.length,
                totalBytes: allFiles.reduce((sum, f) => sum + f.size, 0),
                languages: selection.languages,
                detectedStack: result.detectedStack,
                hasReadme: selection.hasReadme,
                analyzedFiles: selection.files.map((f) => f.path),
                truncated: selection.truncated,
                commitCount: commitInfo.commitCount,
                lastCommitAt: commitInfo.lastCommitAt
                    ? Timestamp.fromDate(new Date(commitInfo.lastCommitAt))
                    : null,
                defaultBranch: commitInfo.defaultBranch,
            },
            overview: result.overview,
            scores: result.scores,
            totalScore: Math.round(totalScore * 10) / 10,
            maxTotalScore,
            error: null,
            // A fresh score is the teacher's to release — never auto-publish,
            // and a re-evaluation withholds the previously released result
            // until the teacher reviews the new marks and re-publishes.
            resultPublished: false,
            resultPublishedAt: null,
            processedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        // Counter is display-only; recomputed truth is one query away.
        await adminDb
            .collection(PROJECT_EVALS)
            .doc(submission.evaluationId)
            .update({
                evaluatedCount: (evalData.evaluatedCount ?? 0) + 1,
                updatedAt: Timestamp.now(),
            })
            .catch(() => {});

        return { ok: true, status: "scored" };
    } catch (error: any) {
        console.error(`Project eval processing failed for ${submissionId}:`, error);
        return fail(error?.message || "Evaluation failed unexpectedly. Try again.");
    }
}
