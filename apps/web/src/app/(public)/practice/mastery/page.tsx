"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type PatternRow = {
    pattern: string;
    kind: "dsa" | "sql";
    label: string;
    blurb: string;
    masteryScore: number;
    level: string;
    attempted: number;
    solved: number;
    recognitionCorrect: number;
    recognitionTotal: number;
};

const LEVEL_COLOR: Record<string, string> = {
    mastered: "bg-emerald-500",
    proficient: "bg-primary-500",
    learning: "bg-amber-500",
    novice: "bg-slate-300",
};

export default function MasteryPage() {
    const { firebaseUser, isAuthenticated, loading } = useAuthContext();
    const [patterns, setPatterns] = useState<PatternRow[]>([]);
    const [overall, setOverall] = useState(0);
    const [busy, setBusy] = useState(true);

    useEffect(() => {
        if (loading) return;
        if (!firebaseUser) {
            setBusy(false);
            return;
        }
        teacherFetch(firebaseUser, "/api/practice/mastery")
            .then((r) => r.json())
            .then((d) => {
                setPatterns(Array.isArray(d.patterns) ? d.patterns : []);
                setOverall(d.overall ?? 0);
            })
            .catch(() => setPatterns([]))
            .finally(() => setBusy(false));
    }, [firebaseUser, loading]);

    const dsa = useMemo(() => patterns.filter((p) => p.kind === "dsa").sort((a, b) => a.masteryScore - b.masteryScore), [patterns]);
    const sql = useMemo(() => patterns.filter((p) => p.kind === "sql").sort((a, b) => a.masteryScore - b.masteryScore), [patterns]);

    const renderGroup = (title: string, rows: PatternRow[]) => (
        <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rows.map((p) => (
                    <Link
                        key={p.pattern}
                        href={`/practice/problems?pattern=${encodeURIComponent(p.pattern)}`}
                        className="rounded-xl border border-slate-200 p-4 hover:border-primary-300"
                    >
                        <div className="flex items-center justify-between">
                            <p className="font-medium text-slate-900">{p.label}</p>
                            <span className="text-xs uppercase tracking-wider text-slate-400">{p.level}</span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full ${LEVEL_COLOR[p.level] || "bg-slate-300"}`} style={{ width: `${p.masteryScore}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            {p.masteryScore}% · {p.solved} solved
                            {p.recognitionTotal > 0 && ` · pattern recall ${Math.round((p.recognitionCorrect / p.recognitionTotal) * 100)}%`}
                        </p>
                    </Link>
                ))}
            </div>
        </Card>
    );

    return (
        <main className="bg-slate-50 min-h-screen">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-8">
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">← Practice hub</Link>
                    <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h1 className="font-display text-2xl font-bold text-slate-900">Mastery Map</h1>
                            <p className="mt-1 text-sm text-slate-500">
                                Every core pattern, scored. Blends solve rate, first-try cleanliness, difficulty coverage,
                                pattern recognition, and recency — so it decays if you stop practising.
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-bold text-primary-700">{busy ? "…" : `${overall}%`}</p>
                            <p className="text-xs uppercase tracking-wider text-slate-500">Overall</p>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container-page py-8 space-y-6">
                {!loading && !isAuthenticated ? (
                    <Card className="p-12 text-center">
                        <Link href="/login?redirect=/practice/mastery" className="font-semibold text-primary-700 hover:underline">Sign in</Link>{" "}
                        to see your mastery map.
                    </Card>
                ) : busy ? (
                    <Card className="p-12 text-center text-sm text-slate-500">Loading…</Card>
                ) : (
                    <>
                        {renderGroup("DSA Patterns", dsa)}
                        {renderGroup("SQL Patterns", sql)}
                    </>
                )}
            </div>
        </main>
    );
}
