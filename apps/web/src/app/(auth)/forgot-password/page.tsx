"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { isValidEmail } from "@digimine/utils";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({});
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});
        setSuccess(false);

        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            setFieldErrors({ email: "Please enter a valid email address" });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to send reset email");
            }

            setSuccess(true);
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error ? err.message : "Failed to send reset email";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card padding="lg" className="w-full max-w-md">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                        className="w-8 h-8 text-primary-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                    </svg>
                </div>
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    Forgot Password?
                </h1>
                <p className="text-gray-600">
                    No worries, we&apos;ll send you reset instructions.
                </p>
            </div>

            {success ? (
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-8 h-8 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>
                    <h2 className="font-display text-xl font-semibold text-gray-900 mb-2">
                        Check Your Email
                    </h2>
                    <p className="text-gray-600 mb-6">
                        We&apos;ve sent a password reset link to{" "}
                        <span className="font-medium">{email}</span>
                    </p>
                    <Link href="/login">
                        <Button variant="primary" size="lg" className="w-full">
                            Back to Sign In
                        </Button>
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

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
                                if (fieldErrors.email) setFieldErrors({});
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

                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        isLoading={loading}
                    >
                        Send Reset Link
                    </Button>
                </form>
            )}

            {!success && (
                <div className="mt-6 text-center">
                    <Link
                        href="/login"
                        className="text-gray-600 hover:text-gray-900 inline-flex items-center gap-2"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                            />
                        </svg>
                        Back to Sign In
                    </Link>
                </div>
            )}
        </Card>
    );
}
