"use client";

/**
 * /verify-email
 *
 * Landing page shown whenever a password-signed-in user reaches a gated
 * area without having clicked the link in their verification email. The
 * page:
 *   - shows the email the verification was sent to
 *   - lets the user resend (30s cooldown)
 *   - exposes a manual "I've verified" button that calls firebaseUser.reload()
 *   - auto-reloads on window focus + every 5s while open
 *   - on successful verification, redirects to the originally-requested URL
 *     (?next=...) — or the role's home if not supplied
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut as firebaseSignOut } from "firebase/auth";
import { Button, Card } from "@digimine/ui";
import { Mail, RefreshCcw, CheckCircle2, LogOut, AlertTriangle } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { auth } from "@digimine/config";
import { PageLoading } from "@/components/common";
import { userHomePath } from "@/lib/auth/redirects";

const RESEND_COOLDOWN_SECONDS = 30;

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams?.get("next") || null;
    const { firebaseUser, user, loading } = useAuthContext();

    const [resendCooldown, setResendCooldown] = useState(0);
    const [resending, setResending] = useState(false);
    const [resendError, setResendError] = useState("");
    const [resendOk, setResendOk] = useState(false);
    const [checking, setChecking] = useState(false);
    const [checkInfo, setCheckInfo] = useState("");

    // Tick cooldown down every second.
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const redirectTarget = useCallback(() => {
        if (next && next.startsWith("/")) return next;
        if (user) return userHomePath(user);
        return "/";
    }, [next, user]);

    const checkVerification = useCallback(
        async (silent = false) => {
            if (!firebaseUser) return;
            if (!silent) {
                setChecking(true);
                setCheckInfo("");
            }
            try {
                await firebaseUser.reload();
                if (firebaseUser.emailVerified) {
                    router.replace(redirectTarget());
                } else if (!silent) {
                    setCheckInfo(
                        "Still not verified. If you clicked the link, try refreshing this page after a few seconds."
                    );
                }
            } catch (e) {
                if (!silent) {
                    setCheckInfo(
                        (e as Error)?.message ||
                            "Could not check verification status. Try again."
                    );
                }
            } finally {
                if (!silent) setChecking(false);
            }
        },
        [firebaseUser, redirectTarget, router]
    );

    // If the user is already verified by the time they land here, bounce
    // them straight to their home.
    useEffect(() => {
        if (loading) return;
        if (!firebaseUser) {
            router.replace("/login");
            return;
        }
        if (firebaseUser.emailVerified) {
            router.replace(redirectTarget());
        }
    }, [loading, firebaseUser, redirectTarget, router]);

    // Background poll — every 5s, also on window focus.
    const lastSilentCheckRef = useRef(0);
    useEffect(() => {
        if (!firebaseUser || firebaseUser.emailVerified) return;
        const interval = window.setInterval(() => {
            lastSilentCheckRef.current = Date.now();
            checkVerification(true);
        }, 5000);
        const onFocus = () => checkVerification(true);
        window.addEventListener("focus", onFocus);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", onFocus);
        };
    }, [firebaseUser, checkVerification]);

    const handleResend = useCallback(async () => {
        if (!firebaseUser || resendCooldown > 0) return;
        setResending(true);
        setResendError("");
        setResendOk(false);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/auth/send-verification-email", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(
                    data?.error || "Failed to send verification email."
                );
            }
            setResendOk(true);
            setResendCooldown(RESEND_COOLDOWN_SECONDS);
        } catch (e) {
            setResendError(
                (e as Error)?.message || "Failed to send verification email."
            );
        } finally {
            setResending(false);
        }
    }, [firebaseUser, resendCooldown]);

    const handleSignOut = async () => {
        try {
            await firebaseSignOut(auth);
        } catch {
            /* ignore */
        }
        router.replace("/login");
    };

    if (loading || !firebaseUser) return <PageLoading />;
    if (firebaseUser.emailVerified) return <PageLoading />;

    return (
        <Card className="w-full max-w-md p-8 shadow-lg">
            <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                    <Mail className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                </span>
                <h1 className="mt-5 text-xl font-bold text-slate-900">
                    Verify your email to continue
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                    We sent a verification link to{" "}
                    <span className="font-semibold text-slate-900">
                        {firebaseUser.email}
                    </span>
                    . Click it to unlock your account.
                </p>
            </div>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="flex items-start gap-2">
                    <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                        strokeWidth={2}
                        aria-hidden
                    />
                    <span>
                        Features stay disabled until your email is verified. Check your
                        spam folder if you don&apos;t see the email within a minute.
                    </span>
                </p>
            </div>

            <div className="mt-5 space-y-2.5">
                <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => checkVerification(false)}
                    isLoading={checking}
                    disabled={checking}
                >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                    I&apos;ve verified — let me in
                </Button>
                <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleResend}
                    isLoading={resending}
                    disabled={resending || resendCooldown > 0}
                >
                    <RefreshCcw className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                    {resendCooldown > 0
                        ? `Resend in ${resendCooldown}s`
                        : "Resend verification email"}
                </Button>
            </div>

            {checkInfo && (
                <p className="mt-3 text-center text-xs text-slate-500">{checkInfo}</p>
            )}
            {resendOk && (
                <p className="mt-3 text-center text-xs text-emerald-700">
                    Verification email sent. Check your inbox.
                </p>
            )}
            {resendError && (
                <p className="mt-3 text-center text-xs text-rose-600">{resendError}</p>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4">
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="mx-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                >
                    <LogOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Sign in with a different account
                </button>
            </div>
        </Card>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={<PageLoading />}>
            <VerifyEmailContent />
        </Suspense>
    );
}
