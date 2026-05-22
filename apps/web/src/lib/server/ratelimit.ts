import { getRedis } from "@/lib/server/redis";

/**
 * Sliding-window rate limiter on shared Redis (sorted sets).
 *
 * Fail-OPEN: if Redis is unavailable, requests are allowed — a rate limiter
 * must never take the whole site down. Use a separate `prefix` per bucket
 * (e.g. "submit", "search") and an identifier (uid or IP).
 */
export type RateLimitResult = { success: boolean; remaining: number; limit: number; resetMs: number };

export async function rateLimit(
    prefix: string,
    identifier: string,
    opts: { limit: number; windowSeconds: number }
): Promise<RateLimitResult> {
    const { limit, windowSeconds } = opts;
    const redis = getRedis();
    if (!redis) return { success: true, remaining: limit, limit, resetMs: 0 };

    const key = `rl:${prefix}:${identifier}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const clearBefore = now - windowMs;

    try {
        const pipe = redis.pipeline();
        pipe.zremrangebyscore(key, 0, clearBefore); // drop entries outside the window
        pipe.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`); // record this hit
        pipe.zcard(key); // count hits in the window
        pipe.pexpire(key, windowMs); // auto-clean idle keys
        const res = await pipe.exec();
        const count = (res?.[2]?.[1] as number) ?? 0;
        const success = count <= limit;
        return { success, remaining: Math.max(0, limit - count), limit, resetMs: now + windowMs };
    } catch (err) {
        console.error(`[ratelimit] ${prefix} failed, allowing:`, err);
        return { success: true, remaining: limit, limit, resetMs: 0 };
    }
}

/** Best-effort client IP from standard proxy headers (Vercel/Cloudflare). */
export function clientIp(req: Request): string {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return req.headers.get("x-real-ip") || "unknown";
}
