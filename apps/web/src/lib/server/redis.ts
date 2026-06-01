import type IORedis from "ioredis";

/**
 * Shared Redis client (DigitalOcean Managed Redis / Valkey or self-hosted).
 *
 * Set REDIS_URL to a `rediss://…` (TLS, DO Managed) or `redis://…` URL. If it
 * is absent or the connection fails, every helper here degrades gracefully —
 * the app keeps working by going straight to Firestore. Redis is an
 * optimization layer, never a hard dependency.
 *
 * `ioredis` is imported LAZILY (a runtime require inside the REDIS_URL guard,
 * not a top-level import). A top-level import forces ioredis into every
 * serverless function that transitively imports this module — and Next's file
 * tracer doesn't always include it in every bundle (e.g. the courses/[slug]
 * SSR lambda), which then crashes at load with "Cannot find module 'ioredis'".
 * Deferring the require to call-time, wrapped in the try/catch below, means a
 * lambda that doesn't use Redis (no REDIS_URL, or a missing/untraced ioredis)
 * simply returns null and falls back to Firestore instead of crashing.
 *
 * On Vercel/serverless we reuse a single client across warm invocations via a
 * global, and keep the connection non-blocking so a Redis outage can never hang
 * or crash a request.
 */
const g = globalThis as unknown as { __digimineRedis?: IORedis | null };

export function getRedis(): IORedis | null {
    if (g.__digimineRedis !== undefined) return g.__digimineRedis;

    const url = process.env.REDIS_URL;
    if (!url) {
        g.__digimineRedis = null;
        return null;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("ioredis");
        const Redis = (mod.default || mod) as typeof IORedis;
        const client: IORedis = new Redis(url, {
            lazyConnect: false,
            maxRetriesPerRequest: 1,
            // Never queue commands while disconnected — fail fast so callers
            // can fall back to Firestore instead of hanging.
            enableOfflineQueue: false,
            connectTimeout: 1500,
            // DO Managed Redis uses TLS (rediss://); ioredis enables it from the scheme.
        });
        client.on("error", (err: Error) => {
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
