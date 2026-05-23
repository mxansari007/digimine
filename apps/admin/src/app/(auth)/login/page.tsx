"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAdmin } from "@/lib/firebase/auth";
import { Button, Card } from "@digimine/ui";
import { Logo } from "@/components/common/Logo";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});

        const errors: { email?: string; password?: string } = {};
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            errors.email = "Please enter a valid admin email address";
        }
        if (!password) {
            errors.password = "Please enter your password";
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        setLoading(true);

        try {
            await signInAdmin(email, password);
            router.push("/");
        } catch (err: any) {
            setError(
                err.message?.includes("auth/")
                    ? "Invalid email or password."
                    : err.message
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 bg-grid-pattern px-4 relative z-0">
            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-8 flex flex-col items-center">
                    <div className="mb-4">
                        <Logo variant="dark" iconSize={40} />
                    </div>
                    <p className="text-slate-500 mt-1">Secure access for portal management</p>
                </div>

                <Card padding="lg">
                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                                }}
                                className={`w-full px-4 py-2 rounded-lg border ${fieldErrors.email ? "border-red-500 focus:ring-red-200 focus:border-red-500" : "border-gray-300 focus:ring-primary-200 focus:border-primary-500"} transition-all outline-none`}
                                placeholder="admin@placementranker.com"
                            />
                            {fieldErrors.email && (
                                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {fieldErrors.email}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                                }}
                                className={`w-full px-4 py-2 rounded-lg border ${fieldErrors.password ? "border-red-500 focus:ring-red-200 focus:border-red-500" : "border-gray-300 focus:ring-primary-200 focus:border-primary-500"} transition-all outline-none`}
                                placeholder="••••••••"
                            />
                            {fieldErrors.password && (
                                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {fieldErrors.password}
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full"
                            isLoading={loading}
                        >
                            Sign In to Dashboard
                        </Button>
                    </form>
                </Card>
            </div>
        </div>
    );
}
