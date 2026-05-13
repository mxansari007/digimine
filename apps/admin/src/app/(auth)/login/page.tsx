"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAdmin } from "@/lib/firebase/auth";
import { Button, Card } from "@digimine/ui";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
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
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20 border border-primary-400/50 mb-4">
                        <span className="text-white font-display font-bold text-2xl leading-none">D</span>
                    </div>
                    <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Digimine Admin</h1>
                    <p className="text-slate-500 mt-2">Secure access for portal management</p>
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
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-all outline-none"
                                placeholder="admin@digimine.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-all outline-none"
                                placeholder="••••••••"
                            />
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
