"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPistonJob = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const SHARED_CONCURRENCY = 3;
/**
 * Process Piston execution jobs from Firestore queue
 * Shared queue: FIFO, max 3 concurrent across all shared users
 * Dedicated queue: priority processing for Institution plans
 */
exports.processPistonJob = functions.firestore
    .document("jobs/{jobId}")
    .onCreate(async (snap, context) => {
    const job = snap.data();
    const jobId = context.params.jobId;
    if (job.status !== "queued")
        return;
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
            const nextData = nextDoc.data();
            if (nextData.status === "queued") {
                await processSingleJob(nextDoc.ref, nextData);
            }
        }
    }
    catch (error) {
        functions.logger.error(`Job ${jobId} failed:`, error);
        await snap.ref.update({
            status: "failed",
            error: error.message || "Execution failed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
});
async function processSingleJob(ref, job) {
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
        if (!pistonUrl)
            throw new Error("Piston URL not configured");
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
    }
    catch (error) {
        await ref.update({
            status: "failed",
            error: error.message || "Execution failed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
}
//# sourceMappingURL=pistonQueue.js.map