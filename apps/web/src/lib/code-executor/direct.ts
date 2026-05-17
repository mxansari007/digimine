import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const EXEC_TIMEOUT_MS = 10000; // 10 seconds

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    compileOutput: string;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), "piston-"));
    try {
        return await fn(dir);
    } finally {
        // Best-effort cleanup
        try {
            await rm(dir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    }
}

function runWithTimeout(
    command: string,
    args: string[],
    cwd: string,
    stdin: string,
    timeoutMs: number = EXEC_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd,
            timeout: timeoutMs,
            killSignal: "SIGKILL",
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });

        if (stdin) {
            child.stdin?.write(stdin);
            child.stdin?.end();
        }

        child.on("close", (code, signal) => {
            if (signal === "SIGKILL" || signal === "SIGTERM") {
                resolve({ stdout, stderr: stderr || "Time Limit Exceeded", exitCode: -1 });
            } else {
                resolve({ stdout, stderr, exitCode: code ?? -1 });
            }
        });

        child.on("error", (err) => {
            resolve({ stdout, stderr: `Execution error: ${err.message}`, exitCode: -1 });
        });
    });
}

async function runPython(code: string, stdin: string): Promise<ExecutionResult> {
    return withTempDir(async (dir) => {
        const filePath = join(dir, "main.py");
        await writeFile(filePath, code, "utf-8");
        const result = await runWithTimeout("python3", [filePath], dir, stdin);
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            compileOutput: "",
        };
    });
}

async function runJavaScript(code: string, stdin: string): Promise<ExecutionResult> {
    return withTempDir(async (dir) => {
        const filePath = join(dir, "main.js");
        await writeFile(filePath, code, "utf-8");
        const result = await runWithTimeout("node", [filePath], dir, stdin);
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            compileOutput: "",
        };
    });
}

async function runCpp(code: string, stdin: string): Promise<ExecutionResult> {
    return withTempDir(async (dir) => {
        const sourcePath = join(dir, "main.cpp");
        const binaryPath = join(dir, "main");
        await writeFile(sourcePath, code, "utf-8");

        // Compile
        const compileResult = await runWithTimeout(
            "g++",
            ["-std=c++17", "-O2", "-o", binaryPath, sourcePath],
            dir,
            ""
        );

        if (compileResult.exitCode !== 0) {
            return {
                stdout: "",
                stderr: "",
                exitCode: compileResult.exitCode,
                compileOutput: compileResult.stderr || compileResult.stdout,
            };
        }

        // Run
        const runResult = await runWithTimeout(binaryPath, [], dir, stdin);
        return {
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            exitCode: runResult.exitCode,
            compileOutput: "",
        };
    });
}

async function runJava(code: string, stdin: string): Promise<ExecutionResult> {
    return withTempDir(async (dir) => {
        const sourcePath = join(dir, "Main.java");
        await writeFile(sourcePath, code, "utf-8");

        // Compile
        const compileResult = await runWithTimeout("javac", [sourcePath], dir, "");

        if (compileResult.exitCode !== 0) {
            return {
                stdout: "",
                stderr: "",
                exitCode: compileResult.exitCode,
                compileOutput: compileResult.stderr || compileResult.stdout,
            };
        }

        // Run
        const runResult = await runWithTimeout("java", ["-cp", dir, "Main"], dir, stdin);
        return {
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            exitCode: runResult.exitCode,
            compileOutput: "",
        };
    });
}

export async function executeDirect(
    language: string,
    code: string,
    stdin: string
): Promise<ExecutionResult> {
    switch (language) {
        case "python":
            return runPython(code, stdin);
        case "javascript":
            return runJavaScript(code, stdin);
        case "cpp":
            return runCpp(code, stdin);
        case "java":
            return runJava(code, stdin);
        default:
            return {
                stdout: "",
                stderr: `Unsupported language: ${language}`,
                exitCode: 1,
                compileOutput: "",
            };
    }
}
