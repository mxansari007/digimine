"use client";

/**
 * Public teacher claim page — the landing point for the one-time link an
 * institute admin sends a teacher to set up their account.
 *
 *   /claim/{token}
 *
 * Flow:
 *   1. On mount: GET /api/teacher/claim/{token} to verify the link.
 *      - Invalid / expired / already-used → friendly error screen.
 *      - Valid → render the form pre-filled with the email (read-only).
 *   2. User enters first name, last name, password.
 *   3. POST /api/teacher/claim/{token} creates their Firebase Auth user +
 *      teacher doc + flips the invite row to active.
 *   4. Client signs them in with email+password and redirects to
 *      /teacher/dashboard.
 *
 * Auth: the token IS the proof. No prior sign-in required. The route lives
 * outside the (auth)/(teacher) groups so it's fully public.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@digimine/ui";
import { Check, Lock, Mail } from "lucide-react";
import { signIn } from "@/lib/firebase/auth";
import {
    OnboardingShell,
    StepHeader,
    FormField,
    textInputClass,
} from "@/components/onboarding";

type InviteState =
    | { kind: "loading" }
    | { kind: "valid"; email: string; instituteName: string; instituteId: string }
    | { kind: "invalid"; message: string };

export default function ClaimPage() {
    const params = useParams();
    const router = useRouter();
    const token = String(params?.token || "");

    const [invite, setInvite] = useState<InviteState>({ kind: "loading" });
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    // Verify the token on mount.
    useEffect(() => {
        if (!token) {
            setInvite({ kind: "invalid", message: "Missing claim token." });
            return;
        }
        (async () => {
            try {
                const res = await fetch(`/api/teacher/claim/${encodeURIComponent(token)}`);
                const data = await res.json();
                if (!res.ok || !data?.valid) {
                    setInvite({
                        kind: "invalid",
                        message: data?.message || "This link is no longer valid.",
                    });
                    return;
                }
                setInvite({
                    kind: "valid",
                    email: data.email,
                    instituteName: data.instituteName,
                    instituteId: data.instituteId,
                });
            } catch (err) {
                setInvite({
                    kind: "invalid",
                    message: (err as Error)?.message || "Could not verify this link.",
                });
            }
        })();
    }, [token]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (invite.kind !== "valid") return;
            setError("");

            if (!firstName.trim()) {
                setError("Please enter your first name.");
                return;
            }
            if (password.length < 8) {
                setError("Password must be at least 8 characters.");
                return;
            }
            if (password !== confirm) {
                setError("Passwords do not match.");
                return;
            }

            setSubmitting(true);
            try {
                const res = await fetch(`/api/teacher/claim/${encodeURIComponent(token)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        firstName: firstName.trim(),
                        lastName: lastName.trim(),
                        password,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data?.ok) {
                    setError(data?.error || "Failed to set up your account.");
                    setSubmitting(false);
                    return;
                }

                // Account is live — sign them in client-side and bounce to
                // the teacher dashboard.
                setSuccess(true);
                try {
                    await signIn(invite.email, password);
                } catch (signinErr) {
                    // Sign-in failed for some reason — fall back to login
                    // page where the user can retry with their fresh
                    // credentials.
                    console.error("[claim] auto-sign-in failed:", signinErr);
                    router.replace("/login");
                    return;
                }
                router.replace("/teacher/dashboard");
            } catch (err) {
                setError((err as Error)?.message || "Failed to set up your account.");
                setSubmitting(false);
            }
        },
        [invite, firstName, lastName, password, confirm, router, token]
    );

    // ── Loading state ─────────────────────────────────────────────────
    if (invite.kind === "loading") {
        return (
            <OnboardingShell maxWidth="md">
                <Card className="p-10 text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-100 border-t-primary-600" />
                    <p className="mt-4 text-sm text-slate-500">Verifying your link…</p>
                </Card>
            </OnboardingShell>
        );
    }

    // ── Invalid / expired ─────────────────────────────────────────────
    if (invite.kind === "invalid") {
        return (
            <OnboardingShell maxWidth="md">
                <StepHeader
                    title="Link not valid"
                    subtitle={invite.message}
                    icon={
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-6 w-6"
                            aria-hidden
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" x2="12" y1="8" y2="12" />
                            <line x1="12" x2="12.01" y1="16" y2="16" />
                        </svg>
                    }
                />
                <Card className="mt-6 p-6 text-center text-sm text-slate-600">
                    <p>
                        Already have an account?{" "}
                        <Link
                            href="/login"
                            className="font-medium text-primary-700 hover:text-primary-800"
                        >
                            Sign in →
                        </Link>
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                        If you believe this is a mistake, ask your institute admin to
                        send a fresh invite.
                    </p>
                </Card>
            </OnboardingShell>
        );
    }

    // ── Post-success render (while we sign them in) ───────────────────
    if (success) {
        return (
            <OnboardingShell maxWidth="md">
                <Card className="p-10 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden />
                    </div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                        Account ready!
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Signing you in to {invite.instituteName}…
                    </p>
                </Card>
            </OnboardingShell>
        );
    }

    // ── Valid invite → password setup form ────────────────────────────
    return (
        <OnboardingShell maxWidth="md">
            <div className="mb-6">
                <StepHeader
                    eyebrow="Teacher invite"
                    title={`Join ${invite.instituteName}`}
                    subtitle="Set up your account to accept the invitation. We've already verified your email — just pick a password."
                />
            </div>

            <Card className="p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Email — display only, derived from the invite */}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <Mail
                            className="h-4 w-4 flex-shrink-0 text-slate-500"
                            strokeWidth={2}
                            aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Email (verified via this link)
                            </p>
                            <p className="truncate text-sm font-medium text-slate-900">
                                {invite.email}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="First name" required>
                            <input
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className={textInputClass}
                                placeholder="Anita"
                                disabled={submitting}
                                autoFocus
                                autoComplete="given-name"
                            />
                        </FormField>
                        <FormField label="Last name">
                            <input
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className={textInputClass}
                                placeholder="Verma"
                                disabled={submitting}
                                autoComplete="family-name"
                            />
                        </FormField>
                    </div>

                    <FormField
                        label="Set a password"
                        required
                        hint="At least 8 characters"
                    >
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={textInputClass}
                            placeholder="••••••••"
                            disabled={submitting}
                            autoComplete="new-password"
                            minLength={8}
                        />
                    </FormField>

                    <FormField label="Confirm password" required>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={textInputClass}
                            placeholder="••••••••"
                            disabled={submitting}
                            autoComplete="new-password"
                            minLength={8}
                        />
                    </FormField>

                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                            {error}
                        </div>
                    )}

                    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        <Lock
                            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500"
                            strokeWidth={2}
                            aria-hidden
                        />
                        <p>
                            Your password is encrypted and stored only by Firebase
                            Auth. We never see it.
                        </p>
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full"
                        isLoading={submitting}
                        disabled={
                            submitting ||
                            !firstName.trim() ||
                            password.length < 8 ||
                            password !== confirm
                        }
                    >
                        Create my account &amp; join
                    </Button>
                </form>
            </Card>
        </OnboardingShell>
    );
}
