import { NextRequest, NextResponse } from "next/server";
import { executeDirect } from "@/lib/code-executor/direct";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

// ============================================================
// Code Execution API Proxy
// Supports:
//   1. Direct execution (child_process) — default for Railway/self-hosted
//   2. Judge0 CE (free public API) — fallback
//   3. Piston (self-hosted) — optional external instance
//
// Auto-detection order:
//   - If CODE_EXECUTION_PROVIDER=direct → use child_process (local/Railway)
//   - If CODE_EXECUTION_URL contains "piston" or ends with /api/v2/execute → Piston
//   - If CODE_EXECUTION_URL contains "judge0" → Judge0
//   - Otherwise → Judge0 CE (default)
// ============================================================

const DEFAULT_JUDGE0_URL = "https://ce.judge0.com/submissions";

const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
    python: 71,
    javascript: 63,
    cpp: 54,
    java: 62,
};

const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
    python: { language: "python", version: "*" },
    javascript: { language: "javascript", version: "*" },
    cpp: { language: "cpp", version: "*" },
    java: { language: "java", version: "*" },
};

function toBase64(str: string): string {
    return Buffer.from(str, "utf-8").toString("base64");
}

function fromBase64(str: string | null): string {
    if (!str) return "";
    return Buffer.from(str, "base64").toString("utf-8");
}

function detectProvider(): "direct" | "piston" | "judge0" {
    const provider = process.env.CODE_EXECUTION_PROVIDER;
    if (provider === "direct") return "direct";
    if (provider === "piston") return "piston";
    if (provider === "judge0") return "judge0";

    const url = process.env.CODE_EXECUTION_URL;
    if (!url) return "judge0"; // default to Judge0 CE
    if (url.includes("judge0")) return "judge0";
    if (url.includes("piston") || url.endsWith("/api/v2/execute")) return "piston";
    return "judge0";
}

async function executeWithPiston(
    url: string,
    language: string,
    code: string,
    stdin: string
): Promise<{ stdout: string; stderr: string; compileOutput: string; exitCode: number; status: string }> {
    const pistonLang = PISTON_LANGUAGE_MAP[language];
    if (!pistonLang) {
        throw new Error(`Unsupported language: ${language}`);
    }

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            language: pistonLang.language,
            version: pistonLang.version,
            files: [{ content: code }],
            stdin: stdin || "",
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Piston API error: ${errorText}`);
    }

    const result = await response.json();
    const run = result.run || {};
    const compile = result.compile || {};

    return {
        stdout: run.stdout || "",
        stderr: run.stderr || "",
        compileOutput: compile.stderr || "",
        exitCode: run.code ?? -1,
        status: run.code === 0 ? "Accepted" : "Error",
    };
}

async function executeWithJudge0(
    url: string,
    language: string,
    code: string,
    stdin: string
): Promise<{ stdout: string; stderr: string; compileOutput: string; exitCode: number; status: string }> {
    const languageId = JUDGE0_LANGUAGE_MAP[language];
    if (!languageId) {
        throw new Error(`Unsupported language: ${language}`);
    }

    const response = await fetch(`${url}?wait=true&base64_encoded=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            language_id: languageId,
            source_code: toBase64(code),
            stdin: toBase64(stdin || ""),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Judge0 API error: ${errorText}`);
    }

    const result = await response.json();
    const stdout = fromBase64(result.stdout);
    const stderr = fromBase64(result.stderr);
    const compileOutput = fromBase64(result.compile_output);
    const exitCode = result.status?.id === 3 ? 0 : (result.exit_code ?? -1);

    return {
        stdout: stdout || "",
        stderr: stderr || "",
        compileOutput: compileOutput || "",
        exitCode,
        status: result.status?.description || "Unknown",
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { language, code, stdin, teacherId } = body;

        if (!language || !code) {
            return NextResponse.json(
                { error: "Language and code are required" },
                { status: 400 }
            );
        }

        // Determine queue based on teacher plan
        let queue: "shared" | "dedicated" = "shared";
        if (teacherId) {
            const teacherRef = adminDb.collection("teachers").doc(teacherId);
            const teacherSnap = await teacherRef.get();
            if (teacherSnap.exists) {
                const planId = teacherSnap.data()?.subscription?.planId;
                if (planId === "institution") {
                    queue = "dedicated";
                }
            }
        }

        // For Piston provider with queue management
        const provider = detectProvider();
        if (provider === "piston") {
            // Check if queue is full for shared users
            if (queue === "shared") {
                const runningJobs = await adminDb
                    .collection("jobs")
                    .where("queue", "==", "shared")
                    .where("status", "==", "running")
                    .count()
                    .get();

                const maxShared = parseInt(process.env.PISTON_QUEUE_MAX_SHARED || "3", 10);
                if (runningJobs.data().count >= maxShared) {
                    // Queue is full, create a job document and return 202
                    const jobRef = adminDb.collection("jobs").doc();
                    await jobRef.set({
                        teacherId: teacherId || null,
                        queue: "shared",
                        status: "queued",
                        language,
                        code,
                        stdin: stdin || "",
                        result: null,
                        error: null,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                    return NextResponse.json(
                        {
                            status: "queued",
                            jobId: jobRef.id,
                            message: "Queue is full. Your job has been queued.",
                        },
                        { status: 202 }
                    );
                }
            }

            // Execute directly or create dedicated job
            const url = process.env.CODE_EXECUTION_URL;
            if (!url) {
                return NextResponse.json(
                    { error: "CODE_EXECUTION_URL is required for Piston provider" },
                    { status: 500 }
                );
            }

            if (queue === "dedicated") {
                // For dedicated queue, create a job doc and let the trigger handle it
                const jobRef = adminDb.collection("jobs").doc();
                await jobRef.set({
                    teacherId: teacherId || null,
                    queue: "dedicated",
                    status: "queued",
                    language,
                    code,
                    stdin: stdin || "",
                    result: null,
                    error: null,
                    createdAt: FieldValue.serverTimestamp(),
                });
                return NextResponse.json(
                    {
                        status: "queued",
                        jobId: jobRef.id,
                        message: "Job submitted to dedicated queue.",
                    },
                    { status: 202 }
                );
            }

            const result = await executeWithPiston(url, language, code, stdin || "");
            return NextResponse.json({
                stdout: result.stdout,
                stderr: result.stderr,
                compileOutput: result.compileOutput,
                status: result.status,
                exitCode: result.exitCode,
                provider,
                queue,
            });
        }

        // Direct or Judge0 execution (no queue)
        let result;
        if (provider === "direct") {
            const directResult = await executeDirect(language, code, stdin || "");
            result = {
                stdout: directResult.stdout,
                stderr: directResult.stderr,
                compileOutput: directResult.compileOutput,
                status: directResult.exitCode === 0 ? "Accepted" : "Error",
                exitCode: directResult.exitCode,
            };
        } else {
            const url = process.env.CODE_EXECUTION_URL || DEFAULT_JUDGE0_URL;
            result = await executeWithJudge0(url, language, code, stdin || "");
        }

        return NextResponse.json({
            stdout: result.stdout,
            stderr: result.stderr,
            compileOutput: result.compileOutput,
            status: result.status,
            exitCode: result.exitCode,
            provider,
            queue,
        });
    } catch (error: any) {
        console.error("Code execution error:", error);
        return NextResponse.json(
            { error: "Code execution failed", details: error.message },
            { status: 500 }
        );
    }
}
