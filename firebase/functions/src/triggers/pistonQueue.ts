import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const SHARED_CONCURRENCY = 3;

interface JobData {
    language: string;
    code: string;
    stdin: string;
    queue: "shared" | "dedicated";
    status: string;
    teacherId: string | null;
    createdAt: admin.firestore.Timestamp;
}

/**
 * Process Piston execution jobs from Firestore queue
 * Shared queue: FIFO, max 3 concurrent across all shared users
 * Dedicated queue: priority processing for Institution plans
 */
export const processPistonJob = functions.firestore
    .document("jobs/{jobId}")
    .onCreate(async (snap, context) => {
        const job = snap.data() as JobData;
        const jobId = context.params.jobId;

        if (job.status !== "queued") return;

        // Check concurrency for shared queue
        if (job.queue === "shared") {
            const runningShared = await db
                .collection("jobs")
                .where("queue", "==", "shared")
                .where("status", "==", "running")
                .count()
                .get();

            if (runningShared.data().count >= SHARED_CONCURRENCY) {
                functions.logger.info(`Shared queue full. Job ${jobId} waiting.`);
                return; // Leave as queued; next completed job will trigger another
            }
        }

        // Mark as running
        await snap.ref.update({ status: "running", startedAt: admin.firestore.FieldValue.serverTimestamp() });

        try {
            const pistonUrl = process.env.PISTON_URL || functions.config().piston?.url;
            if (!pistonUrl) {
                throw new Error("Piston URL not configured");
            }

            const response = await fetch(`${pistonUrl}/api/v2/execute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: job.language,
                    version: "*",
                    files: [{ content: job.code }],
                    stdin: job.stdin || "",
                }),
            });

            if (!response.ok) {
                throw new Error(`Piston API error: ${await response.text()}`);
            }

            const result = await response.json();
            const run = result.run || {};
            const compile = result.compile || {};

            await snap.ref.update({
                status: "completed",
                result: {
                    stdout: run.stdout || "",
                    stderr: run.stderr || "",
                    compileOutput: compile.stderr || "",
                    exitCode: run.code ?? -1,
                    status: run.code === 0 ? "Accepted" : "Error",
                },
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Trigger next queued job in same queue
            const nextJob = await db
                .collection("jobs")
                .where("queue", "==", job.queue)
                .where("status", "==", "queued")
                .orderBy("createdAt", "asc")
                .limit(1)
                .get();

            if (!nextJob.empty) {
                // The onCreate trigger won't fire for existing docs, so we process directly
                const nextDoc = nextJob.docs[0];
                const nextData = nextDoc.data() as JobData;
                if (nextData.status === "queued") {
                    await processSingleJob(nextDoc.ref, nextData);
                }
            }
        } catch (error: any) {
            functions.logger.error(`Job ${jobId} failed:`, error);
            await snap.ref.update({
                status: "failed",
                error: error.message || "Execution failed",
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    });

async function processSingleJob(
    ref: admin.firestore.DocumentReference,
    job: JobData
) {
    if (job.queue === "shared") {
        const runningShared = await db
            .collection("jobs")
            .where("queue", "==", "shared")
            .where("status", "==", "running")
            .count()
            .get();

        if (runningShared.data().count >= SHARED_CONCURRENCY) {
            return;
        }
    }

    await ref.update({ status: "running", startedAt: admin.firestore.FieldValue.serverTimestamp() });

    try {
        const pistonUrl = process.env.PISTON_URL || functions.config().piston?.url;
        if (!pistonUrl) throw new Error("Piston URL not configured");

        const response = await fetch(`${pistonUrl}/api/v2/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                language: job.language,
                version: "*",
                files: [{ content: job.code }],
                stdin: job.stdin || "",
            }),
        });

        if (!response.ok) {
            throw new Error(`Piston API error: ${await response.text()}`);
        }

        const result = await response.json();
        const run = result.run || {};
        const compile = result.compile || {};

        await ref.update({
            status: "completed",
            result: {
                stdout: run.stdout || "",
                stderr: run.stderr || "",
                compileOutput: compile.stderr || "",
                exitCode: run.code ?? -1,
                status: run.code === 0 ? "Accepted" : "Error",
            },
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error: any) {
        await ref.update({
            status: "failed",
            error: error.message || "Execution failed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
}
