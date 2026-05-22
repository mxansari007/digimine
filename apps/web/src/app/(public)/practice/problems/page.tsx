"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@digimine/ui";
import { ALL_PATTERNS, patternMeta } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Row = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    title: string;
    difficulty: "easy" | "medium" | "hard";
    primaryPattern: string;
    tags: string[];
    totalSolved: number;
};

function diffChip(d: string) {
    if (d === "easy") return "text-emerald-700 bg-emerald-50";
    if (d === "medium") return "text-amber-700 bg-amber-50";
    return "text-rose-700 bg-rose-50";
}

function ProblemsInner() {
    const sp = useSearchParams();
    const { firebaseUser } = useAuthContext();
    const [items, setItems] = useState<Row[]>([]);
    const [statusByProblem, setStatusByProblem] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    const [kind, setKind] = useState<string>(sp?.get("kind") || "all");
    const [pattern, setPattern] = useState<string>(sp?.get("pattern") || "all");
    const [difficulty, setDifficulty] = useState<string>("all");
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (kind !== "all") params.set("kind", kind);
            if (pattern !== "all") params.set("pattern", pattern);
            const res = await fetch(`/api/practice/problems?${params.toString()}`);
            const data = await res.json();
            setItems(Array.isArray(data.items) ? data.items : []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [kind, pattern]);

    useEffect(() => {
        load();
    }, [load]);

    // Pull the user's solved/attempted statuses (best-effort).
    useEffect(() => {
        if (!firebaseUser) return;
        teacherFetch(firebaseUser, "/api/practice/dashboard")
            .then((r) => r.json())
            .then(() => {})
            .catch(() => {});
    }, [firebaseUser]);

    const filtered = useMemo(() => {
        let list = items;
        if (difficulty !== "all") list = list.filter((p) => p.difficulty === difficulty);
        const q = search.trim().toLowerCase();
        if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
        return list;
    }, [items, difficulty, search]);

    const patternOptions = useMemo(() => {
        if (kind === "sql") return ALL_PATTERNS.filter((p) => p.kind === "sql");
        if (kind === "dsa") return ALL_PATTERNS.filter((p) => p.kind === "dsa");
        return ALL_PATTERNS;
    }, [kind]);

    return (
        <main className="bg-slate-50 min-h-screen">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-8">
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">
                        ← Practice hub
                    </Link>
                    <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">Problems</h1>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input
                            className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            placeholder="Search problems…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={kind} onChange={(e) => { setKind(e.target.value); setPattern("all"); }}>
                            <option value="all">All types</option>
                            <option value="dsa">DSA</option>
                            <option value="sql">SQL</option>
                        </select>
                        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                            <option value="all">All difficulty</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm max-w-[220px]" value={pattern} onChange={(e) => setPattern(e.target.value)}>
                            <option value="all">All patterns</option>
                            {patternOptions.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            <div className="container-page py-8">
                {loading ? (
                    <Card className="p-12 text-center text-sm text-slate-500">Loading problems…</Card>
                ) : filtered.length === 0 ? (
                    <Card className="p-12 text-center text-sm text-slate-500">
                        No problems yet for this filter. (Admins: seed via <code className="text-xs">POST /api/admin/practice/problems</code>.)
                    </Card>
                ) : (
                    <Card className="overflow-hidden p-0">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Title</th>
                                    <th className="px-4 py-3 text-left">Pattern</th>
                                    <th className="px-4 py-3 text-left">Difficulty</th>
                                    <th className="px-4 py-3 text-right">Solved by</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <Link href={`/practice/problems/${p.slug}`} className="font-medium text-slate-900 hover:text-primary-700">
                                                {p.title}
                                            </Link>
                                            <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">{p.kind}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{patternMeta(p.primaryPattern as any)?.label || p.primaryPattern}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffChip(p.difficulty)}`}>{p.difficulty}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-500">{p.totalSolved.toLocaleString("en-IN")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>
                )}
            </div>
        </main>
    );
}

export default function PracticeProblemsPage() {
    return (
        <Suspense fallback={<div className="container-page py-12 text-sm text-slate-500">Loading…</div>}>
            <ProblemsInner />
        </Suspense>
    );
}
