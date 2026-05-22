"use client";

import { auth } from "./firebase/client";

/**
 * Fetch wrapper that automatically attaches the current user's Firebase ID token
 * as a Bearer authorization header. Used to talk to the @digimine/web app's
 * admin API routes (proxied via next.config.js rewrites).
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

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    return fetch(input, { ...init, headers });
}
