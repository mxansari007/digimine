"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { Star } from "lucide-react";
import { ALL_PATTERNS, patternMeta } from "@digimine/types";
import { LoadMoreButton } from "@/components/common";
import { useVisibleSlice } from "@/hooks/useVisibleSlice";

export type Row = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    problemNumber: number | null;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    primaryPattern: string;
    tags: string[];
    totalSolved: number;
    access: "free" | "login" | "premium";
};

function diffChip(d: string) {
    if (d === "easy") return "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10";
    if (d === "medium") return "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10";
    return "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10";
}

/**
 * Client-side filtering UI. Seeded with `items` from the server, so the
 * initial (SSR) render already contains every problem row — crawlers index
 * the full catalog, and filtering happens in the browser without a refetch.
 */
export default function ProblemsBrowser({
    items,
    initialKind = "all",
    initialPattern = "all",
}: {
    items: Row[];
    initialKind?: string;
    initialPattern?: string;
}) {
    const [kind, setKind] = useState(initialKind);
    const [pattern, setPattern] = useState(initialPattern);
    const [difficulty, setDifficulty] = useState("all");
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        let list = items;
        if (kind !== "all") list = list.filter((p) => p.kind === kind);
        if (pattern !== "all") list = list.filter((p) => p.primaryPattern === pattern);
        if (difficulty !== "all") list = list.filter((p) => p.difficulty === difficulty);
        const q = search.trim().toLowerCase();
        if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
        return list;
    }, [items, kind, pattern, difficulty, search]);

    const patternOptions = useMemo(() => {
        if (kind === "sql") return ALL_PATTERNS.filter((p) => p.kind === "sql");
        if (kind === "dsa") return ALL_PATTERNS.filter((p) => p.kind === "dsa");
        return ALL_PATTERNS;
    }, [kind]);

    const { visible, hasMore, remaining, loadMore } = useVisibleSlice(filtered, 25);

    return (
        <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                    className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 sm:w-auto sm:min-w-[200px]"
                    placeholder="Search problems…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search problems"
                />
                <select className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:flex-none" value={kind} onChange={(e) => { setKind(e.target.value); setPattern("all"); }} aria-label="Filter by type">
                    <option value="all">All types</option>
                    <option value="dsa">DSA</option>
                    <option value="sql">SQL</option>
                </select>
                <select className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:flex-none" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Filter by difficulty">
                    <option value="all">All difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                </select>
                <select className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-[220px] sm:flex-none" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Filter by pattern">
                    <option value="all">All patterns</option>
                    {patternOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </select>
            </div>

            <div className="mt-6">
                {filtered.length === 0 ? (
                    <Card className="p-12 text-center text-sm text-slate-500">No problems match these filters.</Card>
                ) : (
                    <>
                    <p className="mb-3 text-xs text-slate-500">
                        Showing <span className="font-semibold text-slate-700">{visible.length}</span> of {filtered.length} problem{filtered.length === 1 ? "" : "s"}
                    </p>
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
                                {visible.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            {p.problemNumber != null && (
                                                <span className="mr-1 font-mono text-xs text-slate-400">#{p.problemNumber}</span>
                                            )}
                                            <Link href={`/practice/problems/${p.slug}`} className="font-medium text-slate-900 hover:text-primary-700">
                                                {p.title}
                                            </Link>
                                            <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">{p.kind}</span>
                                            {p.access === "premium" && (
                                                <span
                                                    title="Premium problem"
                                                    className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-200 dark:ring-amber-500/25"
                                                >
                                                    <Star className="h-2.5 w-2.5 fill-current" strokeWidth={0} aria-hidden />
                                                    Premium
                                                </span>
                                            )}
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
                    <LoadMoreButton
                        hasMore={hasMore}
                        remaining={remaining}
                        onLoadMore={loadMore}
                        label="Load more problems"
                    />
                    </>
                )}
            </div>
        </>
    );
}
