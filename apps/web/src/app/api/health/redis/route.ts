import { NextResponse } from "next/server";
import { getRedis } from "@/lib/server/redis";

export const dynamic = "force-dynamic";

/**
 * Cache health probe. Confirms Redis connectivity and shows whether the cache
 * is actually serving — the keyspace hit/miss ratio is the real proof.
 *
 * Optional guard: set REDIS_HEALTH_TOKEN and call /api/health/redis?token=…
 * (recommended in production so the key list isn't public).
 */
export async function GET(req: Request) {
    const required = process.env.REDIS_HEALTH_TOKEN;
    if (required) {
        const token = new URL(req.url).searchParams.get("token");
        if (token !== required) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const redis = getRedis();
    if (!redis) {
        return NextResponse.json({ configured: false, note: "REDIS_URL not set — running on per-instance fallback cache." });
    }

    try {
        const t0 = Date.now();
        const pong = await redis.ping();
        const pingMs = Date.now() - t0;

        // Hit/miss ratio (the headline metric).
        const stats = await redis.info("stats");
        const hits = Number(/keyspace_hits:(\d+)/.exec(stats)?.[1] ?? 0);
        const misses = Number(/keyspace_misses:(\d+)/.exec(stats)?.[1] ?? 0);
        const total = hits + misses;
        const hitRate = total > 0 ? +((hits / total) * 100).toFixed(1) : null;

        // Which app cache keys exist right now, and how long they live.
        const keys = await redis.keys("catalog:*");
        const practiceKeys = await redis.keys("practice:*");
        const all = [...keys, ...practiceKeys].slice(0, 50);
        const withTtl = await Promise.all(all.map(async (k) => ({ key: k, ttl: await redis.ttl(k) })));

        return NextResponse.json({
            configured: true,
            connected: pong === "PONG",
            pingMs,
            keyspace: { hits, misses, hitRatePct: hitRate },
            cacheKeys: withTtl,
            cacheKeyCount: keys.length + practiceKeys.length,
        });
    } catch (err: any) {
        return NextResponse.json({ configured: true, connected: false, error: String(err?.message || err) }, { status: 503 });
    }
}
