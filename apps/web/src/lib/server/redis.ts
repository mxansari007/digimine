import Redis from "ioredis";

/**
 * Shared Redis client (DigitalOcean Managed Redis / Valkey or self-hosted).
 *
 * Set REDIS_URL to a `rediss://…` (TLS, DO Managed) or `redis://…` URL. If it
 * is absent or the connection fails, every helper here degrades gracefully —
 * the app keeps working by going straight to Firestore. Redis is an
 * optimization layer, never a hard dependency.
 *
 * On Vercel/serverless we reuse a single client across warm invocations via a
 * global, and keep the connection lazy + non-blocking so a Redis outage can
 * never hang or crash a request.
 */
const g = globalThis as unknown as { __digimineRedis?: Redis | null };

export function getRedis(): Redis | null {
    if (g.__digimineRedis !== undefined) return g.__digimineRedis;

    const url = process.env.REDIS_URL;
    if (!url) {
        g.__digimineRedis = null;
        return null;
    }

    try {
        const client = new Redis(url, {
            lazyConnect: false,
            maxRetriesPerRequest: 1,
            // Never queue commands while disconnected — fail fast so callers
            // can fall back to Firestore instead of hanging.
            enableOfflineQueue: false,
            connectTimeout: 1500,
            // DO Managed Redis uses TLS (rediss://); ioredis enables it from the scheme.
        });
        client.on("error", (err) => {
            // Log once-ish; do not throw — keep the app alive without Redis.
            console.error("[redis] connection error:", err?.message || err);
        });
        g.__digimineRedis = client;
        return client;
    } catch (err) {
        console.error("[redis] init failed:", err);
        g.__digimineRedis = null;
        return null;
    }
}
