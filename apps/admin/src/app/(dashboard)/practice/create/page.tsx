"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import { PracticeProblemForm } from "@/components/practice/PracticeProblemForm";
import { createProblem } from "@/lib/firestore/practiceProblems";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function CreateProblemPage() {
    const router = useRouter();
    const { firebaseUser } = useAdminAuth();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">← All problems</Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">New problem</h1>
                </div>
                <Link href="/practice"><Button variant="ghost">Cancel</Button></Link>
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <PracticeProblemForm
                submitting={saving}
                onSubmit={async (input) => {
                    if (!firebaseUser) { setError("Sign in required"); return; }
                    setSaving(true);
                    setError(null);
                    try {
                        const id = await createProblem(input, firebaseUser.uid);
                        router.push(`/practice/${id}/edit`);
                    } catch (e: any) {
                        setError(e.message || "Failed to create");
                    } finally {
                        setSaving(false);
                    }
                }}
            />
        </div>
    );
}
