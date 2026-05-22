/**
 * Piston code execution job queue types
 */

export type JobStatus = "queued" | "running" | "completed" | "failed";
export type JobQueue = "shared" | "dedicated";

export interface ExecutionJob {
    id: string;
    teacherId: string | null;
    queue: JobQueue;
    status: JobStatus;
    language: string;
    code: string;
    stdin: string;
    result: ExecutionResult | null;
    error: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    compileOutput: string;
    exitCode: number;
    status: string;
}

export interface CreateJobInput {
    teacherId: string | null;
    queue: JobQueue;
    language: string;
    code: string;
    stdin: string;
}
