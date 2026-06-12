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

    const fail = async (message: string): Promise<ProcessOutcome> => {
        await ref.update({
            status: "failed",
            error: message.slice(0, 500),
            updatedAt: Timestamp.now(),
        });
        return { ok: false, reason: message, permanent: true };
    };

    try {
        const evalSnap = await adminDb
            .collection(PROJECT_EVALS)
            .doc(submission.evaluationId)
            .get();
        if (!evalSnap.exists) return fail("The evaluation this submission belongs to was deleted.");
        const evalData = evalSnap.data() || {};

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
