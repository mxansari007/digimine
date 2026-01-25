"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { signUp, signInWithGoogle } from "@/lib/firebase/auth";
import { isValidEmail } from "@digimine/utils";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { User } from "@digimine/types";

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const prefillEmail = searchParams.get("email") || "";

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState(prefillEmail);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validation
        if (!isValidEmail(email)) {
            setError("Please enter a valid email address");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
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
                role: "customer",
                purchasedProducts: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await setDoc(doc(db, "users", credential.user.uid), newUser);

            router.push("/dashboard");
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to create account";
            setError(errorMessage);
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
                    role: "customer",
                    purchasedProducts: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await setDoc(userRef, newUser);
            }

            router.push("/dashboard");
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
                            onChange={(e) => setFirstName(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                            placeholder="John"
                        />
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
                            onChange={(e) => setLastName(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                            placeholder="Doe"
                        />
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
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        placeholder="you@example.com"
                    />
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
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        placeholder="At least 6 characters"
                    />
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
