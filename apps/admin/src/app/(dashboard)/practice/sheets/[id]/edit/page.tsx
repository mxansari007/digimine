"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@digimine/ui";
import type { PracticeSheet } from "@digimine/types";
import { PracticeSheetForm } from "@/components/practice/PracticeSheetForm";
import { deleteSheet, getSheet, updateSheet } from "@/lib/firestore/practiceSheets";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function EditPracticeSheetPage() {
    const params = useParams();
    const router = useRouter();
    const { firebaseUser } = useAdminAuth();
    const id = String(params?.id || "");

    const [sheet, setSheet] = useState<PracticeSheet | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const s = await getSheet(id);
                if (!cancelled) setSheet(s);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const remove = async () => {
        if (!sheet) return;
        if (!confirm(`Delete sheet "${sheet.title}"? This cannot be undone.`)) return;
        setSaving(true);
        try {
            await deleteSheet(id);
            router.push("/practice/sheets");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete");
            setSaving(false);
        }
    };

    if (loading) {
        return <p className="text-sm text-slate-500">Loading…</p>;
    }
    if (!sheet) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-rose-700">Sheet not found.</p>
                <Link href="/practice/sheets">
                    <Button variant="outline">Back to all sheets</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <Link
                        href="/practice/sheets"
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        ← All sheets
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">{sheet.title}</h1>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                        /practice/sheets/{sheet.slug}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {sheet.status === "published" && (
                        <a
                            href={`/practice/sheets/${sheet.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary-700 hover:underline"
                        >
                            View live ↗
                        </a>
                    )}
                    <Button
                        variant="ghost"
                        className="!text-rose-600"
                        onClick={remove}
                        isLoading={saving}
                    >
                        Delete
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            <PracticeSheetForm
                initial={sheet}
                submitting={saving}
                onSubmit={async (input) => {
                    if (!firebaseUser) {
                        setError("Sign in required");
                        return;
                    }
                    setSaving(true);
                    setError(null);
                    try {
                        await updateSheet(id, input, firebaseUser.uid);
                        const fresh = await getSheet(id);
                        if (fresh) setSheet(fresh);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to save");
                    } finally {
                        setSaving(false);
                    }
                }}
            />
        </div>
    );
}
