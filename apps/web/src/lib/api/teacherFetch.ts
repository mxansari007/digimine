"use client";

import type { User } from "firebase/auth";

/**
 * Client-side fetch wrapper that attaches the current user's Firebase ID
 * token as a Bearer authorization header. Used by teacher pages calling
 * any `/api/teacher/*` route that authenticates via `getBearerUserId`.
 *
 * Caller passes their `firebaseUser` (from `useAuthContext`) — we don't grab
 * `auth.currentUser` ourselves because some flows (onboarding) refresh the
 * user mid-flight and we want to use the one the page is actually rendering.
 */
export async function teacherFetch(
    user: User | null | undefined,
    input: RequestInfo | URL,
    init: RequestInit = {}
): Promise<Response> {
    if (!user) {
        throw new Error("Not signed in.");
    }
    const token = await user.getIdToken();
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    return fetch(input, { ...init, headers });
}
