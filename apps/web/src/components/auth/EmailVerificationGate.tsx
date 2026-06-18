"use client";

/**
 * Email verification gate.
 *
 * Wraps the role layouts (teacher / institute / dashboard / classroom / join)
 * and short-circuits to the /verify-email page whenever the signed-in user's
 * Firebase auth `emailVerified` flag is false. Verification is required
 * BEFORE onboarding and before using any feature. The gate is bypassed only
 * for:
 *   - users who signed in via Google / phone (email already trusted)
 *   - the auth funnel itself in `BYPASS_PREFIXES` (login/register/role-select
 *     and the verify-email page) — you can't verify if you can't reach these
 *   - dev opt-out via NEXT_PUBLIC_SKIP_EMAIL_VERIFICATION=1
 *
 * This is the UX half only — every sensitive API route independently enforces
 * the same policy via `requireVerifiedUser`, since a client gate can be
 * bypassed.
 *
 * The gate polls `firebaseUser.reload()` whenever the window regains focus
 * so a user can verify their email in another tab and bounce back to find
 * the app already unlocked.
 */
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { isLocalhost } from "@/lib/dev";

/**
 * Paths that must remain reachable without a verified email — ONLY the auth
 * funnel itself (you can't verify if you can't reach these). Onboarding is
 * deliberately NOT here: a user must verify their email BEFORE they can
 * onboard (become a teacher/institute) or use any feature.
 *  - /verify-email   → the gate target itself
 *  - /login, /register, /signup → auth funnel
 *  - /role-select    → post-signup role chooser (its actions are also
 *                      independently verified server-side)
 */
const BYPASS_PREFIXES = [
    "/verify-email",
    "/login",
    "/register",
    "/signup",
    "/role-select",
];

function pathBypasses(pathname: string): boolean {
    return BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
}

interface EmailVerificationGateProps {
    children: ReactNode;
}

export function EmailVerificationGate({ children }: EmailVerificationGateProps) {
    const { firebaseUser, loading } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname() ?? "";
    const [reloadedAt, setReloadedAt] = useState(0);

    // Refresh the Firebase user record on focus so flipping `emailVerified`
    // in another tab unblocks the UI without a manual page refresh.
    useEffect(() => {
        if (!firebaseUser) return;
        const handler = () => {
            firebaseUser
                .reload()
                .then(() => setReloadedAt(Date.now()))
                .catch(() => {
                    /* swallow — network blip, next focus retries */
                });
        };
        window.addEventListener("focus", handler);
        return () => window.removeEventListener("focus", handler);
    }, [firebaseUser]);

    // Phone-auth and Google-auth providers don't need email verification
    // (Google emails are trusted, phone auth has no email). Only gate
    // password sign-ins where Firebase actually owns the email.
    const requiresVerification = (() => {
        if (!firebaseUser) return false;
        if (firebaseUser.emailVerified) return false;
        // Dev escape hatch — OFF by default so verification is enforced
        // everywhere (including localhost). A developer who needs to skip it
        // locally can either set NEXT_PUBLIC_SKIP_EMAIL_VERIFICATION=1 or
        // run the app on localhost, which is auto-detected below.
        if (process.env.NEXT_PUBLIC_SKIP_EMAIL_VERIFICATION === "1" || isLocalhost()) {
            return false;
        }
        // Trust Google / federated providers — their email is already verified
        // by the IdP. Only password providers need the gate.
        const providers = firebaseUser.providerData.map((p) => p.providerId);
        if (providers.includes("google.com")) return false;
        if (providers.includes("phone") && !firebaseUser.email) return false;
        return providers.includes("password");
    })();

    const onBypassPath = pathBypasses(pathname);

    useEffect(() => {
        if (loading) return;
        if (!firebaseUser) return;
        if (!requiresVerification) return;
        if (onBypassPath) return;
        router.replace(`/verify-email?next=${encodeURIComponent(pathname || "/")}`);
        // include reloadedAt so the redirect re-fires after a successful
        // reload that didn't actually flip emailVerified.
    }, [loading, firebaseUser, requiresVerification, onBypassPath, pathname, router, reloadedAt]);

    // While the redirect is in flight, render nothing so the protected
    // children never flash. Bypass paths and verified users render normally.
    if (requiresVerification && !onBypassPath) return null;
    return <>{children}</>;
}
