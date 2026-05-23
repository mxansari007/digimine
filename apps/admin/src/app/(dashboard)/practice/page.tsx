"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { patternMeta, type PracticeProblem } from "@digimine/types";
import { deleteProblem, listProblems } from "@/lib/firestore/practiceProblems";
import { downloadProblemTemplate } from "@/lib/import/practiceProblems";

function statusChip(s: string) {
    if (s === "published") return "chip-success";
    if (s === "archived") return "chip-neutral";
    return "chip-warning";
}

export default function AdminPracticePage() {
    const [items, setItems] = useState<PracticeProblem[]>([]);
    const [loading, setLoading] = useState(true);
    const [kind, setKind] = useState<"all" | "dsa" | "sql">("all");
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await listProblems({ kind, limit: 500 }));
        } finally {
            setLoading(false);
        }
    }, [kind]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
    }, [items, search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Practice problems</h1>
                    <p className="mt-1 text-sm text-slate-500">DSA &amp; SQL problems shown to everyone on the public Practice hub.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => downloadProblemTemplate()} title="Download practice-problems-template.json">
                        ⬇ Template
                    </Button>
                    <Link href="/practice/import"><Button variant="outline">Bulk import (JSON)</Button></Link>
                    <Link href="/practice/create"><Button variant="primary">+ New problem</Button></Link>
                </div>
            </div>

            <Card className="p-4 flex flex-wrap items-center gap-3">
                <input className="field flex-1 min-w-[220px]" placeholder="Search title or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className="field max-w-[140px]" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                    <option value="all">All types</option>
                    <option value="dsa">DSA</option>
                    <option value="sql">SQL</option>
                </select>
            </Card>

            {loading ? (
                <Card className="p-12 text-center text-sm text-slate-500">Loading…</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-slate-500 mb-3">No problems yet.</p>
                    <div className="inline-flex gap-2">
                        <Link href="/practice/create"><Button variant="primary">Create one</Button></Link>
                        <Link href="/practice/import"><Button variant="outline">Bulk import</Button></Link>
                    </div>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map((p) => (
                        <Card key={p.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="chip-neutral text-[10px]">{p.kind}</span>
                                    <span className={`${statusChip(p.status)} text-[10px]`}>{p.status}</span>
                                    {p.access !== "free" && <span className="chip-info text-[10px]">{p.access}</span>}
                                    {p.isFeatured && <span className="chip-info text-[10px]">Featured</span>}
                                    <span className="text-xs text-slate-400">{patternMeta(p.primaryPattern as any)?.label} · {p.difficulty}</span>
                                </div>
                                <h3 className="mt-1 font-semibold text-slate-900 truncate">{p.title}</h3>
                                <p className="text-[11px] font-mono text-slate-400">/practice/problems/{p.slug} · {p.testCases.length} tests · {p.totalSolved} solved</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link href={`/practice/${p.id}/edit`}><Button variant="outline" size="sm">Edit</Button></Link>
                                <Button variant="ghost" size="sm" className="!text-rose-600" onClick={async () => { if (confirm(`Delete "${p.title}"?`)) { await deleteProblem(p.id); load(); } }}>Delete</Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
