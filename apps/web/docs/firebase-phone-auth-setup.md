# Firebase Phone Auth Setup Checklist

This is the production checklist for the OTP flow used by `/teacher/onboarding/phone` and `/institute/onboarding/phone`. The client code lives in [`src/lib/auth/usePhoneOtp.ts`](../src/lib/auth/usePhoneOtp.ts).

If OTPs fail in production with `auth/invalid-app-credential`, `auth/captcha-check-failed`, or `auth/internal-error`, the cause is almost always one of the items below — not the application code.

## 1. Authorized domains

**Firebase Console → Authentication → Settings → Authorized domains**

Required entries:

- `placementranker.com`
- `www.placementranker.com`
- `localhost` (auto-added; keep it)
- `*.vercel.app` is **not** auto-trusted — add each preview domain you intend to test from, or rely on the `NEXT_PUBLIC_OTP_DEV_BYPASS=1` env-var fallback (see `usePhoneOtp.ts`).

Missing the production domains is the #1 cause of `auth/invalid-app-credential`.

## 2. Phone provider enabled

**Firebase Console → Authentication → Sign-in method → Phone**

- Must be **Enabled**.
- Daily SMS quota — Firebase free tier caps at 10 SMS/day per project. Check the project's usage on the same page. India SMS is one of the more expensive geographies; if quota is exhausted, paid Blaze plan is required.

## 3. reCAPTCHA Enterprise (if your project uses it)

Newer Firebase projects (created after late 2023) default to **reCAPTCHA Enterprise** instead of reCAPTCHA v2/v3 for the phone-auth challenge. If your project is one of them, additional setup is required:

1. Enable the **reCAPTCHA Enterprise API** in your linked GCP project (Cloud Console → APIs & Services → Library).
2. Create a **reCAPTCHA Enterprise site key** scoped to the production domain (`placementranker.com`).
3. **Firebase Console → Authentication → Settings → reCAPTCHA Enterprise** — paste the site key here.

To check which mode your project uses: visit the Firebase Console Authentication settings page; the reCAPTCHA Enterprise section is only visible if your project is on the new path.

If reCAPTCHA Enterprise is enabled but the site key isn't pasted into Firebase, every `signInWithPhoneNumber` call fails with `auth/invalid-app-credential` even though everything else is configured correctly.

## 4. App Check (CRITICAL — has nuked production twice)

App Check is initialised in [`src/lib/firebase/appCheck.ts`](../src/lib/firebase/appCheck.ts) using the **reCAPTCHA v3** provider, env-gated on `NEXT_PUBLIC_RECAPTCHA_V3_KEY`. When the env var is missing, init is a no-op — safe for local dev and when App Check enforcement is off.

**Failure mode:** If App Check is in *Enforce* mode for the Authentication or Firestore API but the client isn't producing valid App Check tokens, every Firebase call fails with `auth/firebase-app-check-token-is-invalid` (Auth) or a `PERMISSION_DENIED` (Firestore). This will break sign-in, sign-up, OTP, and every protected Firestore read in one shot.

### One-time setup procedure

Do these in order. **Skipping or reordering steps will break production.**

1. **GCP Console → Security → reCAPTCHA Enterprise → Create Key**
   - Choose **"Score-based key (v3)"** (NOT challenge-based)
   - Allowed domains: `placementranker.com`, `www.placementranker.com`, `localhost`
   - Copy the resulting site key.

2. **Firebase Console → App Check → Apps**
   - Click your web app → choose **reCAPTCHA v3** → paste the site key → Save.

3. **Add the env var locally and in Vercel:**
   ```
   NEXT_PUBLIC_RECAPTCHA_V3_KEY=<your-v3-site-key>
   ```
   Add to `.env.local` AND all three Vercel environments (Production, Preview, Development).

4. **Deploy.** The client now starts producing App Check tokens on every Firebase call. While the API is still in Monitor mode (step 6), these tokens just get logged — nothing breaks if they're invalid.

5. **Watch the Firebase Console for ~24 hours.**
   Firebase Console → App Check → APIs → click your API row. Verify:
   - **"Verified requests" approaches ~100%** (tokens are being generated correctly).
   - **"Unverified: unknown origin requests" drops near 0%**.

   If you see persistent "Unverified: outdated client requests" — those are real users on old cached JS. Wait for the Vercel cache to roll over.

6. **Only NOW flip the API to "Enforce".**
   Firebase Console → App Check → APIs → row menu → Enforce. Propagation takes up to 15 minutes.

### Emergency rollback (if enforce was clicked too early)

This has happened twice. The symptom: every signup / sign-in fails with `auth/firebase-app-check-token-is-invalid`. The fix:

1. Firebase Console → App Check → APIs → the affected API row → **Unenforce**.
2. Wait up to 15 minutes for propagation.
3. Auth / Firestore start working again.

You don't lose security by un-enforcing — App Check is one layer of many. The server-side rate limit (`/api/onboarding/otp-send` + `otp_attempts`), institute velocity caps, and phone uniqueness checks remain active and bound the abuse surface on their own.

### Debug mode for previews / strict ad-blocker testing

For Vercel preview deploys or local testing where reCAPTCHA can't run (e.g. behind aggressive ad-blockers), Firebase supports a debug token:

1. Open the preview URL in the browser. Console will log a debug token UUID.
2. Firebase Console → App Check → Apps → your web app → **Manage debug tokens** → register the UUID.
3. (Optional) Pin the token per-environment by setting `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=<uuid>` in that env. The init helper picks it up automatically.

**Never set `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` in production.**

## 5. Browser-side preconditions (rare but worth knowing)

- The phone-auth flow requires third-party cookies for the reCAPTCHA frame. Heavy ad-blockers (uBlock Origin with anti-tracking lists, Brave's Shields on Aggressive) sometimes block `google.com/recaptcha/*` and fail the send silently.
- The reCAPTCHA host element must remain in the DOM and not be `display: none`. This was the cause of the original production OTP failures — see the doc-block in `usePhoneOtp.ts`.

## 6. Verification steps after any infrastructure change

After changing any of the above:

1. Hard-reload the production site (`Cmd-Shift-R` / `Ctrl-Shift-R`) to bust the Firebase Auth client cache.
2. Open DevTools Console → look for `[usePhoneOtp] sendOtp failed` logs. The `code` field tells you exactly which Firebase error fired.
3. Open DevTools Network → filter for `recaptcha` and `identitytoolkit` — both should return 200. A 400 from `identitytoolkit` with a `INVALID_RECAPTCHA_TOKEN` body confirms reCAPTCHA Enterprise misconfig.

## 7. Server-side rate limiting

The hook calls [`POST /api/onboarding/otp-send`](../src/app/api/onboarding/otp-send/route.ts) *before* every Firebase `signInWithPhoneNumber`. This is a Firestore-backed limiter that records every attempt to `otp_attempts/{auto}` and rejects with `429` if any of the following caps trips:

| Window | Scope | Cap |
|---|---|---|
| 30 seconds | (uid, phone) pair | 1 attempt |
| 1 hour | per uid | 5 attempts |
| 1 hour | per IP-hash | 10 attempts |

A `429` response includes `{ retryAfterSeconds, reason }` in the body and a `Retry-After` header. The hook pins the client-side countdown to this server value so the Resend button displays the *real* wait, not the optimistic 30s default.

The required composite indexes are defined in [`firebase/firestore.indexes.json`](../../../firebase/firestore.indexes.json):
- `otp_attempts(uid asc, phone asc, createdAt asc)`
- `otp_attempts(uid asc, createdAt asc)`
- `otp_attempts(ipHash asc, createdAt asc)`

After modifying those, deploy with:

```bash
firebase deploy --only firestore:indexes
```

Tuning the limits: change the `MIN_GAP_SECONDS_PER_UID_PHONE` / `MAX_PER_UID_PER_HOUR` / `MAX_PER_IP_PER_HOUR` constants at the top of the route file. Audit query in the Firebase Console: `otp_attempts` collection, group by `uid` or `ipHash`, sort by `createdAt desc`.

## 8. Local development

Dev-mode bypass is automatically enabled on:

- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `[::1]`
- Any host where `NEXT_PUBLIC_OTP_DEV_BYPASS=1` is set in the environment

In bypass mode, **any 6-digit OTP is accepted** — the SMS is never sent, and the rate-limit precheck is skipped entirely. The dev-mode banner in the UI surfaces this so testers don't think the system is broken.

Never set `NEXT_PUBLIC_OTP_DEV_BYPASS=1` on the Vercel **production** environment.
