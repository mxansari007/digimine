"use client";

import { auth } from "./firebase/client";

/**
 * Web app base URL — used to call /api/admin/* and /api/teacher/* endpoints
 * directly (cross-origin) instead of going through the Next.js rewrite in
 * `admin/next.config.js`. The rewrite is reliable for server-side renders
 * but emits a 30x redirect for cross-domain destinations on Vercel, and
 * browsers STRIP the `Authorization` header when following a cross-origin
 * redirect — so direct calls are the only way to keep the bearer token
 * intact. Server-side responses include CORS headers for this origin (see
 * apps/web/src/lib/server/adminCors.ts).
 *
 * Set `NEXT_PUBLIC_WEB_API_URL=https://www.placementranker.com` on the
 * admin app's Vercel project (production + preview). Falls back to "" for
 * local dev where same-origin requests work via the rewrite.
 */
const WEB_API_URL = (process.env.NEXT_PUBLIC_WEB_API_URL || "").replace(/\/$/, "");

/**
 * Fetch wrapper that automatically attaches the current user's Firebase ID token
 * as a Bearer authorization header. Used to talk to the @digimine/web app's
 * admin API routes.
 *
 * If the input is a relative API path AND `NEXT_PUBLIC_WEB_API_URL` is set,
 * the path is rewritten to an absolute URL so the request lands on the web
 * app directly (no rewrite/redirect chain).
 */
export async function authedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
): Promise<Response> {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Not authenticated");
    }
    const token = await user.getIdToken();

    // Rewrite relative /api/admin/* and /api/teacher/* paths to absolute
    // web-app URLs. Skips when already absolute or when WEB_API_URL is unset.
    if (typeof input === "string" && WEB_API_URL && /^\/api\/(admin|teacher)\//.test(input)) {
        input = WEB_API_URL + input;
    }

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    return fetch(input, { ...init, headers });
}
