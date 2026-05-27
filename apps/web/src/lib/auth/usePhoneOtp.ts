"use client";

/**
 * Shared Firebase phone-OTP hook used by every onboarding flow that needs
 * a verified phone (teacher + institute today; student-creator flow later).
 *
 * Why a hook (and not duplicated per page):
 *   The teacher + institute phone pages diverged on details that don't
 *   matter (countdown timing, ref naming) while sharing two real bugs that
 *   caused production failures:
 *
 *     1. The reCAPTCHA host element used `display: none`. Firebase's
 *        invisible reCAPTCHA mounts an iframe inside the host; a
 *        display-none parent prevents that iframe from initialising and
 *        bubbles up as `auth/captcha-check-failed` or `auth/internal-error`.
 *        The container MUST be in the layout flow. The caller spreads
 *        `recaptchaHostProps` onto their own div, which positions the host
 *        off-screen but in-flow.
 *
 *     2. The verifier was cached on a ref and reused across sends. But
 *        `signInWithPhoneNumber` *consumes* the verifier — the token inside
 *        it is one-shot. The next `signInWithPhoneNumber` against the same
 *        verifier fails with `auth/captcha-check-failed` or
 *        "reCAPTCHA has already been rendered in this element". The fix is
 *        to clear + recreate the verifier before every send.
 *
 * Things to verify on the Firebase Console side if OTPs still fail in
 * production after deploying this hook (see also
 * `docs/firebase-phone-auth-setup.md`):
 *
 *   - Authentication → Settings → Authorized domains contains both
 *     `placementranker.com` AND `www.placementranker.com`.
 *   - If reCAPTCHA Enterprise is enabled on the GCP project, the site key
 *     must be configured in Authentication → Settings → reCAPTCHA
 *     Enterprise.
 *   - If App Check is in *enforce* mode, the web app must initialise App
 *     Check with a valid attestation provider (reCAPTCHA v3 or Enterprise).
 *   - Phone provider must be enabled and have non-zero SMS quota remaining
 *     for the day.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    type ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

// Hosts on which we bypass real Firebase phone auth and accept any 6-digit
// OTP. Local dev only — we explicitly *do not* enable this on Vercel preview
// URLs, because that's how prod bugs sneak through review.
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function isDevHost(): boolean {
    if (typeof window === "undefined") return false;
    if (DEV_HOSTS.has(window.location.hostname)) return true;
    // Explicit opt-in for non-localhost dev environments (eg. a tunnelled
    // ngrok URL pointing at the dev server). Set
    //   NEXT_PUBLIC_OTP_DEV_BYPASS=1
    // on those deployments only — NEVER in production.
    return process.env.NEXT_PUBLIC_OTP_DEV_BYPASS === "1";
}

export type PhoneOtpStep = "phone" | "otp";

export interface RecaptchaHostProps {
    id: string;
    "aria-hidden": true;
    style: CSSProperties;
}

export interface UsePhoneOtpResult {
    /**
     * Props to spread onto a host `<div>` that must stay in the render tree.
     * CRITICAL: do not override `style` to `{ display: "none" }` — Firebase's
     * invisible reCAPTCHA cannot mount its iframe inside a display-none
     * parent. The default style keeps the element in-flow but invisible.
     */
    recaptchaHostProps: RecaptchaHostProps;

    phone: string;
    setPhone: (next: string) => void;
    otp: string;
    setOtp: (next: string) => void;

    step: PhoneOtpStep;
    error: string;
    sending: boolean;
    verifying: boolean;
    /** Seconds left on the resend cooldown; 0 means user can resend. */
    countdown: number;
    /** True when the dev bypass is active. Surface in UI so testers know. */
    isDevMode: boolean;

    sendOtp: () => Promise<void>;
    /**
     * Verify the 6-digit code with Firebase. On success, returns the Firebase
     * idToken so the caller can authenticate a follow-up server request.
     * Returns null on failure (`error` will be populated).
     */
    verifyOtp: () => Promise<{ idToken: string } | null>;
    /** Reset to step="phone" and recycle the verifier so retries don't reuse it. */
    changeNumber: () => void;
}

export function usePhoneOtp(): UsePhoneOtpResult {
    const reactId = useId();
    const containerIdRef = useRef<string>(`recaptcha-${reactId}`);
    const verifierRef = useRef<RecaptchaVerifier | null>(null);
    const confirmationRef = useRef<ConfirmationResult | null>(null);

    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState<PhoneOtpStep>("phone");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [devMode] = useState<boolean>(() => isDevHost());

    // Resend cooldown ticker.
    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    // Always clean up the verifier on unmount — leaks the underlying iframe
    // otherwise.
    useEffect(() => {
        return () => {
            try {
                verifierRef.current?.clear();
            } catch {
                /* ignore */
            }
            verifierRef.current = null;
        };
    }, []);

    /**
     * Create a fresh RecaptchaVerifier, clearing any previous one first.
     *
     * We deliberately recreate per `sendOtp` call rather than cache. Each
     * `signInWithPhoneNumber` consumes the verifier's token; the next send
     * with the same instance fails. The cost of recreation is ~negligible
     * (no extra network for invisible reCAPTCHA), so we prefer correctness.
     */
    const newVerifier = useCallback((): RecaptchaVerifier => {
        try {
            verifierRef.current?.clear();
        } catch {
            /* ignore */
        }
        verifierRef.current = null;

        const container = document.getElementById(containerIdRef.current);
        if (!container) {
            throw new Error(
                "reCAPTCHA host element not mounted. Spread `recaptchaHostProps` onto a div inside the form."
            );
        }

        // Critical for resend: `RecaptchaVerifier.clear()` zeroes Firebase's
        // internal state but does NOT remove the iframe Firebase mounted
        // inside the host element. If we hand the same host to a new
        // `RecaptchaVerifier`, Firebase sees the leftover iframe and throws:
        //   "reCAPTCHA has already been rendered in this element"
        // Wiping `innerHTML` here guarantees the new verifier gets a virgin
        // host on every send/resend cycle.
        container.innerHTML = "";

        const verifier = new RecaptchaVerifier(auth, containerIdRef.current, {
            size: "invisible",
            callback: () => {
                /* solved — token is consumed when signInWithPhoneNumber fires */
            },
            "expired-callback": () => {
                setError("reCAPTCHA expired. Tap Resend to try again.");
            },
        });
        verifierRef.current = verifier;
        return verifier;
    }, []);

    const sendOtp = useCallback(async () => {
        setError("");
        if (!phone || phone.length < 8) {
            setError("Enter a valid phone number.");
            return;
        }
        setSending(true);
        try {
            if (devMode) {
                console.warn(
                    "[usePhoneOtp] Dev bypass active — any 6-digit OTP will succeed. " +
                        "This MUST NOT activate in production."
                );
                confirmationRef.current = {
                    confirm: async () => {
                        /* dev no-op */
                    },
                } as unknown as ConfirmationResult;
                setStep("otp");
                setCountdown(30);
                return;
            }

            // Server-side rate-limit precheck. Sits in front of Firebase so
            // attackers can't bypass the client-side countdown by scripting.
            // The endpoint records every attempt in Firestore — even denied
            // attempts contribute to the per-uid / per-IP hourly caps.
            const current = auth.currentUser;
            if (!current) {
                setError("Sign in to request an OTP.");
                return;
            }
            const idToken = await current.getIdToken();
            const preRes = await fetch("/api/onboarding/otp-send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ phone }),
            });
            if (preRes.status === 429) {
                const data = (await preRes.json().catch(() => ({}))) as {
                    error?: string;
                    retryAfterSeconds?: number;
                };
                // Pin the countdown to the server's Retry-After so the
                // Resend button shows the *real* wait, not the optimistic 30s.
                if (data.retryAfterSeconds && data.retryAfterSeconds > 0) {
                    setCountdown(Math.min(data.retryAfterSeconds, 3600));
                }
                setError(data.error || "Too many OTP requests. Please wait a bit.");
                return;
            }
            if (!preRes.ok) {
                const data = (await preRes.json().catch(() => ({}))) as { error?: string };
                setError(data.error || "Couldn't request an OTP. Please try again.");
                return;
            }

            const verifier = newVerifier();
            const result = await signInWithPhoneNumber(auth, phone, verifier);
            confirmationRef.current = result;
            setStep("otp");
            setCountdown(30);
        } catch (err) {
            const e = err as { code?: string; message?: string };
            // Surface the Firebase error code in logs so production debugging
            // doesn't require enabling verbose Firebase logging.
            console.error("[usePhoneOtp] sendOtp failed", {
                code: e.code,
                message: e.message,
                phone,
            });
            setError(formatSendError(e));
        } finally {
            setSending(false);
        }
    }, [phone, devMode, newVerifier]);

    const verifyOtp = useCallback(async (): Promise<{ idToken: string } | null> => {
        if (!confirmationRef.current || otp.length < 6) {
            setError("Enter the 6-digit OTP.");
            return null;
        }
        setVerifying(true);
        setError("");
        try {
            await confirmationRef.current.confirm(otp);
            // In dev mode the mock `confirm` is a no-op — we still grab the
            // *current* user's idToken so the server can authenticate the
            // follow-up call. In real mode `confirm` may sign the user into
            // a phone-auth Firebase user, but that's irrelevant to the
            // caller — they have their own auth session already.
            const current = auth.currentUser;
            const idToken = current ? await current.getIdToken(true) : "";
            return { idToken };
        } catch (err) {
            const e = err as { code?: string; message?: string };
            console.error("[usePhoneOtp] verifyOtp failed", {
                code: e.code,
                message: e.message,
            });
            setError(formatVerifyError(e));
            return null;
        } finally {
            setVerifying(false);
        }
    }, [otp]);

    const changeNumber = useCallback(() => {
        setStep("phone");
        setOtp("");
        setError("");
        confirmationRef.current = null;
        try {
            verifierRef.current?.clear();
        } catch {
            /* ignore */
        }
        verifierRef.current = null;
    }, []);

    // Spread these on a host <div> in the form. The host MUST stay in the
    // tree (no conditional rendering, no display:none) for invisible
    // reCAPTCHA to mount its iframe.
    const recaptchaHostProps = useMemo<RecaptchaHostProps>(
        () => ({
            id: containerIdRef.current,
            "aria-hidden": true,
            style: {
                position: "absolute",
                width: 0,
                height: 0,
                overflow: "hidden",
                visibility: "hidden",
                pointerEvents: "none",
            },
        }),
        []
    );

    return {
        recaptchaHostProps,
        phone,
        setPhone,
        otp,
        setOtp,
        step,
        error,
        sending,
        verifying,
        countdown,
        isDevMode: devMode,
        sendOtp,
        verifyOtp,
        changeNumber,
    };
}

// ─── Error mapping ─────────────────────────────────────────────────────

function formatSendError(e: { code?: string; message?: string }): string {
    switch (e.code) {
        case "auth/invalid-app-credential":
            // The single most common production failure. Almost always means
            // either the site domain isn't in Firebase Console authorised
            // domains, OR reCAPTCHA Enterprise needs setup, OR App Check is
            // misconfigured. See docs/firebase-phone-auth-setup.md.
            return "We couldn't reach the SMS service. Please refresh the page and try again. If this keeps happening, contact support.";
        case "auth/invalid-phone-number":
            return "That phone number doesn't look right. Use the +91 country code followed by 10 digits.";
        case "auth/quota-exceeded":
            return "Too many SMS sent recently. Please wait a few minutes and try again.";
        case "auth/captcha-check-failed":
            return "Robot-check failed. Refresh the page and try again — make sure ad-blockers aren't blocking Google reCAPTCHA.";
        case "auth/too-many-requests":
            return "Too many attempts from this device. Please wait 15 minutes before trying again.";
        case "auth/network-request-failed":
            return "Network problem. Check your connection and try again.";
        default:
            return e.message || "We couldn't send the OTP. Please try again in a minute.";
    }
}

function formatVerifyError(e: { code?: string; message?: string }): string {
    switch (e.code) {
        case "auth/invalid-verification-code":
            return "That code didn't match. Double-check and try again.";
        case "auth/code-expired":
            return "This code has expired. Tap Resend to get a new one.";
        case "auth/missing-verification-code":
            return "Enter the 6-digit code we sent you.";
        default:
            return e.message || "We couldn't verify that code. Please try again.";
    }
}
