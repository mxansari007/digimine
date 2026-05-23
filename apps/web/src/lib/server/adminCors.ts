/**
 * Minimal CORS helper for admin API routes that are called from the admin
 * subdomain (admin.placementranker.com) or from a local admin dev server.
 *
 * Why this exists: the admin app's `next.config.js` rewrites `/api/admin/*`
 * to the web app's URL. On Vercel, when the destination is on a different
 * domain, that rewrite ends up as a 30x redirect rather than a true
 * server-side proxy — which makes the resulting POST cross-origin, so the
 * browser sends a preflight that's rejected without CORS headers.
 *
 * Whitelist is explicit (no wildcard) so credentials/Authorization can be
 * sent safely. Add new origins as new admin surfaces appear.
 */
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set<string>([
    "https://admin.placementranker.com",
    "http://localhost:3001",
    "http://localhost:3000",
]);

/** Build the CORS header set for a given Origin, or `{}` if it isn't allowed. */
export function adminCorsHeaders(origin: string | null): Record<string, string> {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
    };
}

/** Reusable preflight handler — drop into any admin route as `export const OPTIONS = corsPreflight;`. */
export function corsPreflight(req: NextRequest): NextResponse {
    const origin = req.headers.get("origin");
    return new NextResponse(null, { status: 204, headers: adminCorsHeaders(origin) });
}

/**
 * Wrap a NextResponse with CORS headers for the given request. Pass through
 * the response when the origin isn't allowed — server-to-server calls don't
 * need the headers.
 */
export function withCors(req: NextRequest, res: NextResponse): NextResponse {
    const origin = req.headers.get("origin");
    const headers = adminCorsHeaders(origin);
    for (const [k, v] of Object.entries(headers)) {
        res.headers.set(k, v);
    }
    return res;
}
