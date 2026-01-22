"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { signUp } from "@/lib/firebase/auth";
import { isValidEmail, isStrongPassword } from "@digimine/utils";

export default function RegisterPage() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validation
        if (!isValidEmail(email)) {
            setError("Please enter a valid email address");
            return;
        }

        if (!isStrongPassword(password)) {
            setError(
                "Password must be at least 8 characters with uppercase, lowercase, and number"
            );
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);

        try {
            await signUp(email, password, name);
            router.push("/dashboard");
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error ? err.message : "Failed to create account";
            setError(errorMessage);
        } finally {
            setLoading(false);
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

            <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div>
                    <label
                        htmlFor="name"
                        className="block text-sm font-medium text-gray-700 mb-1"
                    >
                        Full Name
                    </label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        placeholder="John Doe"
                    />
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
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        placeholder="••••••••"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        Min 8 characters, with uppercase, lowercase, and number
                    </p>
                </div>

                <div>
                    <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-gray-700 mb-1"
                    >
                        Confirm Password
                    </label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                        placeholder="••••••••"
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
