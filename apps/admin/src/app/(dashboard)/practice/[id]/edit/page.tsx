"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { PracticeProblem } from "@digimine/types";
import { PracticeProblemForm } from "@/components/practice/PracticeProblemForm";
import { deleteProblem, getProblem, updateProblem } from "@/lib/firestore/practiceProblems";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function EditProblemPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { firebaseUser } = useAdminAuth();
    const [problem, setProblem] = useState<PracticeProblem | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getProblem(id)
            .then((p) => {
                if (cancelled) return;
                if (!p) { router.push("/practice"); return; }
                setProblem(p);
            })
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [id, router]);

    if (loading) {
        return <div className="flex items-center justify-center py-24"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>;
    }
    if (!problem) return null;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">← All problems</Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">Edit problem</h1>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">/practice/problems/{problem.slug}</p>
                </div>
                {problem.status === "published" && (
                    <a href={`/practice/problems/${problem.slug}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-700 hover:underline">View live →</a>
                )}
            </div>
            {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
            <PracticeProblemForm
                problem={problem}
                submitting={saving}
                onSubmit={async (input) => {
                    if (!firebaseUser) { setError("Sign in required"); return; }
                    setSaving(true);
                    setError(null);
                    setMsg(null);
                    try {
                        await updateProblem(id, input, firebaseUser.uid);
                        const fresh = await getProblem(id);
                        if (fresh) setProblem(fresh);
                        setMsg("Saved.");
                    } catch (e: any) {
                        setError(e.message || "Failed to save");
                    } finally {
                        setSaving(false);
                    }
                }}
                onDelete={async () => {
                    if (!confirm(`Delete "${problem.title}"?`)) return;
                    await deleteProblem(id);
                    router.push("/practice");
                }}
            />
        </div>
    );
}
