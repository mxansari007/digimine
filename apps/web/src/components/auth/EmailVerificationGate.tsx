"use client";

/**
 * Email verification gate.
 *
 * Wraps the role layouts (teacher / institute / dashboard) and short-circuits
 * to the /verify-email page whenever the signed-in user's Firebase auth
 * `emailVerified` flag is false. The gate is bypassed for:
 *   - users who signed in via Google / phone (already trusted)
 *   - any sub-tree explicitly listed in `BYPASS_PREFIXES` (signup funnels,
 *     onboarding wizards, the verify-email page itself, public results pages)
 *
 * The gate polls `firebaseUser.reload()` whenever the window regains focus
 * so a user can verify their email in another tab and bounce back to find
 * the app already unlocked.
 */
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";

/**
 * Paths that must remain reachable without a verified email.
 *  - /verify-email   → the gate target itself
 *  - /login, /signup → auth funnel
 *  - /role-select    → post-signup role chooser
 *  - /*onboarding/*  → role-specific onboarding wizards (teacher + institute)
 *  - /dashboard/.../results → universal results pages
 */
const BYPASS_PREFIXES = [
    "/verify-email",
    "/login",
    "/register",
    "/signup",
    "/role-select",
    "/teacher/onboarding",
    "/institute/onboarding",
    "/dashboard/tests/results",
    "/dashboard/quizzes/results",
    "/dashboard/contests/results",
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
