"use client";

/**
 * Firebase App Check initialisation for the web client.
 *
 * App Check is Firebase's anti-abuse layer — it adds an attestation token
 * to every Firebase API call (Auth, Firestore, Storage, Functions) proving
 * the request came from an authentic browser running our site, not a
 * scripted client. Once App Check is *enforced* in the Firebase Console
 * for a given API, every request without a valid token gets rejected.
 *
 * We use the **reCAPTCHA v3** provider — it's free up to 1M assessments
 * per month and silent (no user friction). reCAPTCHA Enterprise is the
 * paid alternative; we don't need its extra fraud signals at our scale
 * because the abuse surface is already bounded by:
 *   - Server-side OTP rate limit (`/api/onboarding/otp-send`)
 *   - Institute signup velocity caps
 *   - Phone uniqueness + email blocklist
 *
 * Env-gated by design:
 *   This function is safe to call with or without the v3 site key. When
 *   `NEXT_PUBLIC_RECAPTCHA_V3_KEY` is unset, init is skipped and we log
 *   a warning. That lets us ship the wiring before the key is created in
 *   GCP — the moment the key is added to Vercel env vars, the next deploy
 *   turns App Check on without any further code change.
 *
 * Setup checklist (see `docs/firebase-phone-auth-setup.md`):
 *   1. GCP Console → reCAPTCHA Enterprise API → create v3 site key
 *      scoped to placementranker.com / www.placementranker.com / localhost
 *   2. Firebase Console → App Check → Apps → register web app with that key
 *   3. Add `NEXT_PUBLIC_RECAPTCHA_V3_KEY=<key>` to `.env.local` + Vercel
 *   4. Deploy. Watch Firebase Console → App Check → APIs. "Verified
 *      requests" should climb to ~100% over a day.
 *   5. ONLY THEN flip the API from "Monitor" to "Enforce".
 *
 * Local dev / preview debug tokens:
 *   For environments where the v3 challenge can't run (Vercel preview
 *   builds, local dev with strict ad-blockers), set
 *   `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` to a debug token registered in
 *   Firebase Console → App Check → Apps → Manage debug tokens. NEVER set
 *   this in production.
 */
import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

let initialised = false;

export function initAppCheck(app: FirebaseApp): void {
    // App Check is a browser-side concern. Bail on the server.
    if (typeof window === "undefined") return;

    // initializeAppCheck throws if called twice for the same app — guard
    // against React Strict Mode double-invocation and Fast Refresh.
    if (initialised) return;

    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    if (debugToken) {
        // The Firebase SDK reads this global before initializing App Check
        // and uses the debug token instead of running the v3 challenge.
        // Must be set BEFORE `initializeAppCheck` runs.
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
            debugToken;
    }

    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_V3_KEY;
    if (!siteKey) {
        // No key configured. Safe in dev / when App Check isn't enforced
        // yet. If Firebase Console has enforcement on, every Firebase API
        // call will fail with `auth/firebase-app-check-token-is-invalid`
        // (or similar for Firestore/Storage) — that's the user-visible
        // signal that this needs setting up.
        if (process.env.NODE_ENV !== "production") {
            console.info(
                "[appCheck] NEXT_PUBLIC_RECAPTCHA_V3_KEY not set — App Check disabled. " +
                    "Safe in dev; in prod this breaks auth/firestore if App Check is enforced."
            );
        }
        return;
    }

    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true,
        });
        initialised = true;
    } catch (err) {
        const msg = (err as Error)?.message || "";
        // "already-initialized" is benign — happens during Fast Refresh.
        if (!/already/i.test(msg)) {
            console.error("[appCheck] init failed:", err);
        }
    }
}
