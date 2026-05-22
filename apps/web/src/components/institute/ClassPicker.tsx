"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { teacherFetch } from "@/lib/api/teacherFetch";

type ClassRow = {
    id: string;
    name: string;
    teacherName?: string;
};

/**
 * Multi-select picker for the institute's own classes. Used when the admin
 * is authoring a quiz / test / contest that should target one or more
 * batches.
 */
export function ClassPicker({
    firebaseUser,
    instituteId,
    selected,
    onChange,
}: {
    firebaseUser: User | null;
    instituteId: string;
    selected: string[];
    onChange: (ids: string[]) => void;
}) {
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser || !instituteId) return;
        setLoading(true);
        setError("");
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/classes`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setClasses(data.classes || []);
        } catch (err: any) {
            setError(err.message || "Failed to load classes.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, instituteId]);

    useEffect(() => {
        load();
    }, [load]);

    const toggle = (id: string) => {
        if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
        else onChange([...selected, id]);
    };

    if (loading) return <p className="text-xs text-slate-500">Loading classes…</p>;
    if (error) return <p className="text-xs text-rose-700">{error}</p>;
    if (classes.length === 0)
        return (
            <p className="text-xs text-slate-500">
                You don&apos;t have any classes yet. Create one from the Classes page first.
            </p>
        );

    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {classes.map((c) => {
                const active = selected.includes(c.id);
                return (
                    <button
                        type="button"
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            active
                                ? "border-primary-400 bg-primary-50 text-primary-900"
                                : "border-slate-200 bg-white text-slate-700 hover:border-primary-200 hover:bg-primary-50/40"
                        }`}
                    >
                        <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                                active ? "border-primary-600 bg-primary-600 text-white" : "border-slate-300"
                            }`}
                            aria-hidden="true"
                        >
                            {active && (
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate font-semibold">{c.name}</span>
                            {c.teacherName && (
                                <span className="block truncate text-[10px] text-slate-500">
                                    {c.teacherName}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
