/**
 * Two-lane admission control for the code-execution path.
 *
 * The judge runs synchronously inside the request, so this is a *concurrent
 * admission semaphore*, not a queue with workers. It uses a Redis counter
 * to track in-flight judge calls across all serverless instances and
 * reserves slots for Premium users so they're never starved by a surge of
 * free traffic.
 *
 * Rules (with defaults — tune via env):
 *   - JUDGE_MAX_CONCURRENT  = 12   ← hard cap on parallel judge calls
 *   - JUDGE_PREMIUM_RESERVE = 4    ← slots free users may NOT use
 *
 *   • Premium can use up to MAX slots.
 *   • Free can use up to (MAX − RESERVE) slots.
 *   • When the system is below the free ceiling: both lanes flow freely.
 *   • When the system is between the free ceiling and MAX: only Premium
 *     gets in; Free is told to retry.
 *
 * Fail-open: if Redis is down, every request is admitted. Better to lose
 * the priority guarantee than to take the whole site down.
 */
import { getRedis } from "@/lib/server/redis";

const KEY = "judge:inflight";
const TTL_SECONDS = 60; // safety net if a request dies before releasing.

function intEnv(name: string, fallback: number): number {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

const MAX_CONCURRENT = intEnv("JUDGE_MAX_CONCURRENT", 12);
const PREMIUM_RESERVE = intEnv("JUDGE_PREMIUM_RESERVE", 4);
const FREE_CEILING = Math.max(0, MAX_CONCURRENT - PREMIUM_RESERVE);

export interface JudgeSlot {
    /** True when the call may proceed. */
    ok: boolean;
    /** Why it was rejected (only when !ok). */
    reason?: "free_lane_full" | "capacity_exceeded";
    /** Current in-flight count after attempted acquire. */
    inflight: number;
    /** Hint (seconds) for the client to retry. */
    retryAfterSec?: number;
    /** Always call release(), even on success path's finally — it's a no-op
     *  for rejected/non-Redis slots. */
    release: () => Promise<void>;
}

const NOOP_RELEASE = async () => {};

/**
 * Try to acquire one judge slot.
 *
 *   const slot = await acquireJudgeSlot({ premium });
 *   if (!slot.ok) return NextResponse.json(..., { status: 429 });
 *   try {
 *       const result = await judgeDsa(...);
 *   } finally {
 *       await slot.release();
 *   }
 */
export async function acquireJudgeSlot({ premium }: { premium: boolean }): Promise<JudgeSlot> {
    const redis = getRedis();
    // Fail-open when Redis isn't available — no admission control, but the
    // app keeps working.
    if (!redis) {
        return { ok: true, inflight: 0, release: NOOP_RELEASE };
    }

    try {
        const pipe = redis.pipeline();
        pipe.incr(KEY);
        pipe.expire(KEY, TTL_SECONDS);
        const res = await pipe.exec();
        const inflight = (res?.[0]?.[1] as number) ?? 0;

        const cap = premium ? MAX_CONCURRENT : FREE_CEILING;
        if (inflight > cap) {
            // Roll back our increment — we didn't actually take the slot.
            await redis.decr(KEY).catch(() => {});
            return {
                ok: false,
                reason: premium ? "capacity_exceeded" : "free_lane_full",
                inflight,
                // Free retry quickly under a surge; premium-rejected only when
                // truly slammed, so a longer back-off is fair.
                retryAfterSec: premium ? 5 : 3,
                release: NOOP_RELEASE,
            };
        }

        let released = false;
        const release = async () => {
            if (released) return;
            released = true;
            await redis.decr(KEY).catch(() => {});
        };

        return { ok: true, inflight, release };
    } catch (err) {
        // Redis hiccup — fail-open, log, move on.
        console.error("[judgeQueue] acquire failed, admitting:", err);
        return { ok: true, inflight: 0, release: NOOP_RELEASE };
    }
}
