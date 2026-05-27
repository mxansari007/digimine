"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { signUp, signInWithGoogle } from "@/lib/firebase/auth";
import { isValidEmail } from "@digimine/utils";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "@/lib/firebase/client";
import type { OnboardingStep, User } from "@digimine/types";
import { resumeOnboardingPath } from "@/lib/auth/redirects";

type RoleChoice = "student" | "teacher" | "institute";

function afterSignupPath(role: RoleChoice): string {
    if (role === "teacher") return "/teacher/onboarding/phone";
    if (role === "institute") return "/institute/onboarding";
    return "/dashboard";
}

function initialOnboardingStep(role: RoleChoice): OnboardingStep {
    if (role === "teacher") return "teacher:phone";
    if (role === "institute") return "institute:phone";
    return "complete";
}

/**
 * Best-effort post-signup work that should not block the navigation if
 * it fails:
 *   1. Fires off the Firebase verification email (skipped for accounts
 *      that are already verified — e.g. Google sign-ins).
 *   2. Calls the auto-attach endpoint so students whose email was
 *      pre-registered by an institute admin land directly on their
 *      institute's dashboard.
 *
 * Both calls are wrapped in try/catch so failure of one doesn't kill
 * the other.
 */
async function runPostSignupHooks(
    firebaseUser: FirebaseUser,
    role: RoleChoice
): Promise<void> {
    if (!firebaseUser.emailVerified) {
        try {
            const token = await firebaseUser.getIdToken();
            await fetch("/api/auth/send-verification-email", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (e) {
            console.warn("[register] send-verification-email failed:", e);
        }
    }
    // Auto-attach only matters for students; teachers + institute admins
    // go through their own onboarding which sets institute affiliation.
    if (role !== "student") return;
    try {
        const token = await firebaseUser.getIdToken();
        await fetch("/api/auth/auto-attach-institute", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
    } catch (e) {
        console.warn("[register] auto-attach-institute failed:", e);
    }
}

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const prefillEmail = searchParams.get("email") || "";
    const intent = (searchParams.get("intent") || "").toLowerCase();
    const defaultRole: RoleChoice =
        intent === "institute" ? "institute" : intent === "teacher" ? "teacher" : "student";

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState(prefillEmail);
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<RoleChoice>(defaultRole);
    const [error, setError] = useState("");
    const [existingAccountEmail, setExistingAccountEmail] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string; email?: string; password?: string }>({});
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setExistingAccountEmail(null);
        setFieldErrors({});

        // Validation
        const errors: { firstName?: string; lastName?: string; email?: string; password?: string } = {};
        
        if (!firstName.trim()) errors.firstName = "First name is required";
        if (!lastName.trim()) errors.lastName = "Last name is required";
        if (!email || !isValidEmail(email)) errors.email = "Please enter a valid email address";
        if (!password) {
            errors.password = "Password is required";
        } else if (password.length < 6) {
            errors.password = "Password must be at least 6 characters";
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        setLoading(true);

        try {
            const displayName = `${firstName} ${lastName}`.trim();
            const credential = await signUp(email, password, displayName);

            // Create Firestore user document
            const newUser: User = {
                id: credential.user.uid,
                email: email,
                displayName: displayName,
                firstName: firstName,
                lastName: lastName,
                phoneNumber: null,
                photoURL: null,
                // Teacher and institute roles are written atomically by their
                // respective onboarding flows; defer the role until then so
                // role-less abandoners don't end up with stale teacher/institute
                // role bits.
                role: role === "student" ? "customer" : null,
                onboardingStep: initialOnboardingStep(role),
                purchasedProducts: [],
                purchasedTests: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await setDoc(doc(db, "users", credential.user.uid), newUser);

            // Post-signup hooks. Both are best-effort — if either fails we
            // still let the user continue, but we log so we can debug.
            await runPostSignupHooks(credential.user, role).catch((e) =>
                console.warn("[register] post-signup hooks failed:", e)
            );

            router.push(afterSignupPath(role));
        } catch (err: unknown) {
            const code = (err as { code?: string })?.code || "";
            if (code === "auth/email-already-in-use") {
                // Don't show a generic error — the existing-account banner
                // below renders a Sign-In CTA that pre-fills the email and
                // resumes onboarding via the login redirect logic.
                setExistingAccountEmail(email);
            } else {
                const errorMessage = err instanceof Error ? err.message : "Failed to create account";
                setError(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setError("");
        setGoogleLoading(true);

        try {
            const credential = await signInWithGoogle();

            // Check if user document exists, create if not
            const userRef = doc(db, "users", credential.user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                const nameParts = credential.user.displayName?.split(" ") || [];
                const newUser: User = {
                    id: credential.user.uid,
                    email: credential.user.email || "",
                    displayName: credential.user.displayName,
                    firstName: nameParts[0] || null,
                    lastName: nameParts.slice(1).join(" ") || null,
                    phoneNumber: null,
                    photoURL: credential.user.photoURL,
                    role: role === "student" ? "customer" : null,
                    onboardingStep: initialOnboardingStep(role),
                    purchasedProducts: [],
                    purchasedTests: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await setDoc(userRef, newUser);
            } else {
                // Existing account "signing up" with Google. Don't trash the
                // role they already have — just resume where they left off.
                const data = userSnap.data();
                const existingRole = (data?.role ?? null) as
                    | "customer"
                    | "teacher"
                    | "institute_admin"
                    | null;
                const wantedRole =
                    role === "student"
                        ? "customer"
                        : role === "teacher"
                          ? "teacher"
                          : "institute_admin";
                const resume = resumeOnboardingPath(
                    (data?.onboardingStep ?? null) as OnboardingStep | null
                );

                // Role mismatch: the user picked a role the existing account
                // doesn't have. We can't silently re-role them (auth pivot
                // affects content access, billing, attempts), so we surface
                // the existing-account banner the same way we do for
                // email-already-in-use. They'll see "you already have an
                // account — sign in to continue" pointing at /login.
                if (existingRole && existingRole !== wantedRole) {
                    setExistingAccountEmail(credential.user.email || email || "");
                    return;
                }

                // Mid-onboarding for the same role → resume.
                if (resume) {
                    router.push(resume);
                    return;
                }
            }

            // Same post-signup hooks. Google sign-ins already have
            // emailVerified=true so the verification email send is skipped
            // (the helper checks before calling).
            await runPostSignupHooks(credential.user, role).catch((e) =>
                console.warn("[register] post-signup hooks failed:", e)
            );

            router.push(afterSignupPath(role));
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to sign up with Google";
            setError(errorMessage);
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <Card padding="lg" className="w-full max-w-md">
            <div className="text-center mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    Create Account
                </h1>
                <p className="text-gray-600">Start your digital product journey</p>
            </div>

            {existingAccountEmail && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">
                        You already have an account.
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                        Sign in to complete your onboarding — we&apos;ll pick up right where you left off.
                    </p>
                    <Link
                        href={`/login?email=${encodeURIComponent(existingAccountEmail)}&resume=1`}
                        className="mt-3 inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
                    >
                        Sign in to continue
                    </Link>
                </div>
            )}

            {/* Google Sign Up - Primary Option */}
            <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full mb-6 flex items-center justify-center gap-2"
                onClick={handleGoogleSignUp}
                isLoading={googleLoading}
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                </svg>
                Continue with Google
            </Button>

            <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">Or sign up with email</span>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label
                            htmlFor="firstName"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            First Name
                        </label>
                        <input
                            id="firstName"
                            type="text"
                            value={firstName}
                            onChange={(e) => {
                                setFirstName(e.target.value);
                                if (fieldErrors.firstName) setFieldErrors({ ...fieldErrors, firstName: undefined });
                            }}
                            className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.firstName ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-primary-500 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`}
                            placeholder="John"
                        />
                        {fieldErrors.firstName && (
                            <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                {fieldErrors.firstName}
                            </p>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="lastName"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Last Name
                        </label>
                        <input
                            id="lastName"
                            type="text"
                            value={lastName}
                            onChange={(e) => {
                                setLastName(e.target.value);
                                if (fieldErrors.lastName) setFieldErrors({ ...fieldErrors, lastName: undefined });
                            }}
                            className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.lastName ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-primary-500 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`}
                            placeholder="Doe"
                        />
                        {fieldErrors.lastName && (
                            <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                {fieldErrors.lastName}
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="email"
                        className="block text-sm font-medium text-gray-700 mb-1"
                    >
                        Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.email ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-primary-500 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`}
                        placeholder="you@example.com"
                    />
                    {fieldErrors.email && (
                        <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            {fieldErrors.email}
                        </p>
                    )}
                </div>

                <div>
                    <label
                        htmlFor="password"
                        className="block text-sm font-medium text-gray-700 mb-1"
                    >
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.password ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-primary-500 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`}
                        placeholder="At least 6 characters"
                    />
                    {fieldErrors.password && (
                        <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            {fieldErrors.password}
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        I am a...
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {(
                            [
                                { id: "student" as const, label: "Student", caption: "Learn" },
                                { id: "teacher" as const, label: "Teacher", caption: "Teach" },
                                { id: "institute" as const, label: "Institute", caption: "Run one" },
                            ] as Array<{ id: RoleChoice; label: string; caption: string }>
                        ).map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => setRole(opt.id)}
                                className={`flex flex-col items-center gap-0.5 rounded-lg border px-3 py-3 text-sm font-medium transition-all ${
                                    role === opt.id
                                        ? "border-primary-500 bg-primary-50 text-primary-700"
                                        : "border-gray-300 text-gray-700 hover:border-gray-400"
                                }`}
                            >
                                <span>{opt.label}</span>
                                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                                    {opt.caption}
                                </span>
                            </button>
                        ))}
                    </div>
                    {role === "institute" && (
                        <p className="mt-2 text-xs text-gray-500">
                            You&apos;ll set up your institute right after signup — name, contact, invite code.
                        </p>
                    )}
                </div>

                <div className="flex items-start gap-2">
                    <input
                        id="terms"
                        type="checkbox"
                        required
                        className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="terms" className="text-sm text-gray-600">
                        I agree to the{" "}
                        <Link
                            href="/terms"
                            className="text-primary-600 hover:text-primary-700"
                        >
                            Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                            href="/privacy"
                            className="text-primary-600 hover:text-primary-700"
                        >
                            Privacy Policy
                        </Link>
                    </label>
                </div>

                <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    isLoading={loading}
                >
                    Create Account
                </Button>
            </form>

            <div className="mt-6 text-center">
                <p className="text-gray-600">
                    Already have an account?{" "}
                    <Link
                        href="/login"
                        className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </Card>
    );
}
