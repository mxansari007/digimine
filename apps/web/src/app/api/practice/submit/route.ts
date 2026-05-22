import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { loadProblemById, loadProblemBySlug, recordSubmission } from "@/lib/server/practice";
import { judgeDsa, judgeSql } from "@/lib/server/practiceJudge";
import { checkQuota } from "@/lib/server/entitlements";
import { rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Run or submit a solution.
 *
 * Body: { problemId | slug, mode: "run"|"submit", language, code }
 *   - "run"    judges visible samples only; doesn't affect mastery/schedule.
 *   - "submit" judges all tests; on accept advances SM-2 + mastery.
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to submit." }, { status: 401 });

        // Protect the judge (Piston) from floods/abuse: cap code executions per
        // user. Fail-open if Redis is down. Tune as needed.
        const rl = await rateLimit("practice-run", userId, { limit: 30, windowSeconds: 60 });
        if (!rl.success) {
            return NextResponse.json(
                { error: "You're running code too fast. Please wait a few seconds and try again.", code: "rate_limited" },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        const body = await req.json().catch(() => ({}));
        const mode: "run" | "submit" = body.mode === "submit" ? "submit" : "run";
        const language = String(body.language || "");
        const code = String(body.code || "");
        if (!code.trim()) return NextResponse.json({ error: "Code is empty." }, { status: 400 });

        const problem = body.problemId
            ? await loadProblemById(String(body.problemId))
            : await loadProblemBySlug(String(body.slug || ""));
        if (!problem || (problem as any).status !== "published") {
            return NextResponse.json({ error: "Problem not found" }, { status: 404 });
        }

        // Freemium gate: only graded "submit"s consume the daily quota.
        // In launch mode (enforcement off) the quota is unlimited, so this is
        // a no-op until you flip the switch in the admin subscription manager.
        if (mode === "submit") {
            const quota = await checkQuota(userId, "practiceSubmissionsPerDay", { consume: true });
            if (!quota.allowed) {
                return NextResponse.json(
                    {
                        error: `You've hit today's free submission limit (${quota.limit}). Upgrade for unlimited submissions.`,
                        code: "quota_exceeded",
                        limit: quota.limit,
                        upgradeUrl: "/membership",
                    },
                    { status: 402 }
                );
            }
        }

        // Judge.
        const judge =
            problem.kind === "sql"
                ? await judgeSql(problem, code)
                : await judgeDsa(problem, language, code, mode);

        // Persist + update progress/mastery.
        const record = await recordSubmission({
            userId,
            problem,
            mode,
            language: problem.kind === "sql" ? "sql" : language,
            code,
            judge,
        });

        return NextResponse.json({
            submissionId: record.submissionId,
            verdict: judge.verdict,
            passedCount: judge.passedCount,
            totalCount: judge.totalCount,
            runtimeMs: judge.runtimeMs,
            results: judge.results,
            accepted: judge.verdict === "accepted",
            grade: (record as any).grade ?? null,
            newlySolved: (record as any).newlySolved ?? false,
        });
    } catch (error: any) {
        console.error("Practice submit failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
