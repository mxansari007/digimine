import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { loadProblemById, loadProblemBySlug, recordSubmission } from "@/lib/server/practice";
import { judgeDsa, judgeSql } from "@/lib/server/practiceJudge";
import { checkQuota, getEntitlements } from "@/lib/server/entitlements";
import { acquireJudgeSlot } from "@/lib/server/judgeQueue";
import { rateLimit } from "@/lib/server/ratelimit";
import { requireAssignedRole } from "@/lib/server/roleGate";

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
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        const userId = auth.userId;

        // Defense-in-depth: useAttemptGate funnels role-less users through
        // /role-select on the client, but we re-verify here for stale tabs
        // and hand-rolled requests.
        const gate = await requireAssignedRole(userId);
        if (!gate.ok) return gate.response;

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

        // Premium-problem gate: blocks both Run and Submit for free users on
        // a premium-locked problem. The GET route already redacts starters &
        // statements, but a hand-rolled request could still POST anything —
        // catch that here. Uses the STRICT `isPaid` check so launch mode
        // doesn't bypass the gate.
        const ent = await getEntitlements(userId);
        const isPremiumUser = ent.isPaid;
        if ((problem as any).access === "premium" && !isPremiumUser) {
            return NextResponse.json(
                {
                    error: "This problem is part of Premium. Upgrade to run or submit.",
                    code: "premium_required",
                    upgradeUrl: "/membership",
                },
                { status: 402 }
            );
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

        // Two-lane admission: premium users get reserved slots on the judge,
        // so a surge of free traffic can't starve them. Fails open if Redis
        // is unreachable (admission control off, app still works).
        const slot = await acquireJudgeSlot({ premium: isPremiumUser });
        if (!slot.ok) {
            const headers: HeadersInit = slot.retryAfterSec
                ? { "Retry-After": String(slot.retryAfterSec) }
                : {};
            return NextResponse.json(
                {
                    error:
                        slot.reason === "free_lane_full"
                            ? "Our judge is busy with paid submissions right now. Please retry in a few seconds — or upgrade to Premium for priority execution."
                            : "Judge is at capacity. Please retry in a moment.",
                    code: slot.reason,
                    upgradeUrl: slot.reason === "free_lane_full" ? "/membership" : undefined,
                },
                { status: 429, headers }
            );
        }

        // Judge.
        let judge;
        try {
            judge =
                problem.kind === "sql"
                    ? await judgeSql(problem, code)
                    : await judgeDsa(problem, language, code, mode);
        } finally {
            await slot.release();
        }

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
