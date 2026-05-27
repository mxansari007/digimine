"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { signIn, signInWithGoogle } from "@/lib/firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { User } from "@digimine/types";
import { resumeOnboardingPath, roleHomePath, ROLE_SELECT_PATH } from "@/lib/auth/redirects";
import type { OnboardingStep } from "@digimine/types";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState(searchParams.get("email") || "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const resume = searchParams.get("resume") === "1";

    const getRedirectPath = async (uid: string): Promise<string> => {
        const intendedRedirect = searchParams.get("redirect");
        try {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
                const data = userSnap.data();
                const role = data.role ?? null;
                const onboardingStep = (data.onboardingStep ?? null) as
                    | OnboardingStep
                    | null;

                // Mid-onboarding takes priority over both the committed role
                // and any ?redirect= — a half-onboarded teacher/institute
                // should never land on a dashboard before finishing the
                // wizard. `onboardingStep === "complete"` falls through to
                // the normal redirect.
                const resume = resumeOnboardingPath(onboardingStep);
                if (resume) return resume;

                if (role) {
                    // Has a committed role — honor an explicit redirect if the
                    // caller asked for one, else send them to their home.
                    return intendedRedirect || roleHomePath(role);
                }
                // Orphan: signed in, no role, no onboarding step (fresh
                // Google sign-in, or a flow created before this field
                // existed). Funnel through role-select and thread the
                // intended landing via `?next=`.
                const next = intendedRedirect || "/dashboard";
                return `${ROLE_SELECT_PATH}?next=${encodeURIComponent(next)}`;
            }
        } catch {
            return ROLE_SELECT_PATH;
        }
        // No profile doc at all → force role selection.
        return ROLE_SELECT_PATH;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});

        const errors: { email?: string; password?: string } = {};
        if (!email || !/\S+@\S+\.\S+/.test(email)) errors.email = "Please enter a valid email address";
        if (!password) errors.password = "Please enter your password";
        else if (password.length < 6) errors.password = "Password must be at least 6 characters";
        if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

        setLoading(true);
        try {
            const cred = await signIn(email, password);
            router.push(await getRedirectPath(cred.user.uid));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to sign in");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError("");
        setGoogleLoading(true);
        try {
            const credential = await signInWithGoogle();
            const userRef = doc(db, "users", credential.user.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                const nameParts = credential.user.displayName?.split(" ") || [];
                // First-time Google sign-in: leave role unset so the user is
                // forced through /role-select before reaching a dashboard.
                const newUser: User = {
                    id: credential.user.uid,
                    email: credential.user.email || "",
                    displayName: credential.user.displayName,
                    firstName: nameParts[0] || null,
                    lastName: nameParts.slice(1).join(" ") || null,
                    phoneNumber: null,
                    photoURL: credential.user.photoURL,
                    role: null,
                    purchasedProducts: [],
                    purchasedTests: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await setDoc(userRef, newUser);
            }
            router.push(await getRedirectPath(credential.user.uid));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to sign in with Google");
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <Card padding="lg" className="w-full max-w-md">
            <div className="text-center mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">Welcome Back</h1>
                <p className="text-gray-600">Sign in to access your account</p>
            </div>

            {resume && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Sign in to continue your onboarding.
                </div>
            )}

            <Button type="button" variant="outline" size="lg" className="w-full mb-6 flex items-center justify-center gap-2" onClick={handleGoogleSignIn} isLoading={googleLoading}>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
            </Button>

            <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center text-sm"><span className="px-4 bg-white text-gray-500">Or sign in with email</span></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined }); }} className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.email ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-primary-500 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`} placeholder="you@example.com" />
                    {fieldErrors.email && <p className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p>}
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1"><label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label><Link href="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">Forgot password?</Link></div>
                    <input id="password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined }); }} className={`w-full px-4 py-3 rounded-lg border ${fieldErrors.password ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:border-primary-500 focus:ring-primary-200"} focus:ring-2 outline-none transition-all`} placeholder="••••••••" />
                    {fieldErrors.password && <p className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>}
                </div>
                <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={loading}>Sign In</Button>
            </form>

            <div className="mt-6 text-center">
                <p className="text-gray-600">Don&apos;t have an account?{" "}<Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium">Sign up</Link></p>
            </div>
        </Card>
    );
}
