import { getRedis } from "@/lib/server/redis";

/**
 * Read-through JSON cache backed by shared Redis.
 *
 * Why this matters for Firestore cost: Next's `unstable_cache` is per-instance,
 * so every cold/!warm Vercel lambda re-reads Firestore. A SHARED Redis cache
 * means the underlying query runs at most once per `ttlSeconds` across the
 * ENTIRE fleet (and all crawler traffic), collapsing reads dramatically.
 *
 * Fail-open: any Redis problem (missing config, timeout, outage) falls straight
 * through to `fetcher()` so the request still succeeds — Redis can never break
 * a page, only speed it up.
 */
export async function cachedJson<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const redis = getRedis();
    if (!redis) return fetcher();

    try {
        const hit = await redis.get(key);
        if (hit != null) return JSON.parse(hit) as T;
    } catch (err) {
        console.error(`[cache] get failed for ${key}:`, err);
        // fall through to fetch
    }

    const data = await fetcher();

    try {
        await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
    } catch (err) {
        console.error(`[cache] set failed for ${key}:`, err);
    }
    return data;
}

/** Drop one or more cache keys (e.g. after an admin edit) — fail-safe. */
export async function invalidateCache(...keys: string[]): Promise<void> {
    const redis = getRedis();
    if (!redis || keys.length === 0) return;
    try {
        await redis.del(...keys);
    } catch (err) {
        console.error("[cache] invalidate failed:", err);
    }
}
