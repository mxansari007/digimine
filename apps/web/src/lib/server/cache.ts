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
export interface CachedJsonOptions {
    /**
     * Separate TTL applied when the fetcher returns `null` (or `undefined`).
     * Defaults to a short value so a not-yet-published article isn't stuck
     * 404'ing for the full positive TTL after the admin publishes it.
     * Set to `0` to bypass caching null results entirely.
     */
    negativeTtlSeconds?: number;
}

export async function cachedJson<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
    opts?: CachedJsonOptions
): Promise<T> {
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

    // Decide TTL — null/undefined results get a short "negative" window so a
    // miss caused by a still-being-published doc clears quickly. Default 60s.
    const negTtl = opts?.negativeTtlSeconds ?? 60;
    const ttl = data == null ? negTtl : ttlSeconds;

    if (ttl > 0) {
        try {
            await redis.set(key, JSON.stringify(data), "EX", ttl);
        } catch (err) {
            console.error(`[cache] set failed for ${key}:`, err);
        }
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
