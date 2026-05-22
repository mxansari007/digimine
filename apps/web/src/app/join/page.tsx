"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";

export default function JoinPage() {
    const router = useRouter();
    const [code, setCode] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) {
            setError("Please enter an invite code.");
            return;
        }
        router.push(`/join/${trimmed}`);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center py-12 px-4">
            <Card className="max-w-md w-full p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Join a Classroom</h1>
                <p className="text-gray-500 mb-6">Enter the invite code shared by your teacher.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => { setCode(e.target.value); setError(""); }}
                            placeholder="e.g. ABC123"
                            className="w-full px-4 py-3 text-center text-lg font-mono tracking-widest uppercase border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            autoFocus
                        />
                        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                    </div>
                    <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" size="lg">
                        Find Classroom
                    </Button>
                </form>

                <div className="mt-6 pt-6 border-t">
                    <Link href="/dashboard" className="text-sm text-gray-500 hover:text-indigo-600">
                        ← Back to Dashboard
                    </Link>
                </div>
            </Card>
        </div>
    );
}
