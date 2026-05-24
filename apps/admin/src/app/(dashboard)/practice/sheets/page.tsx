"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import type { PracticeSheet } from "@digimine/types";
import { deleteSheet, listSheets } from "@/lib/firestore/practiceSheets";
import { downloadSheetTemplate } from "@/lib/import/practiceSheets";

function statusChip(s: string) {
    if (s === "published") return "chip-success";
    if (s === "archived") return "chip-neutral";
    return "chip-warning";
}

export default function AdminPracticeSheetsPage() {
    const [items, setItems] = useState<PracticeSheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [kind, setKind] = useState<"all" | "dsa" | "sql" | "mixed">("all");
    const [status, setStatus] = useState<"all" | PracticeSheet["status"]>("all");
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await listSheets({ kind, status, limit: 200 }));
        } finally {
            setLoading(false);
        }
    }, [kind, status]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (s) =>
                s.title.toLowerCase().includes(q) ||
                (s.subtitle || "").toLowerCase().includes(q) ||
                s.tags.some((tag) => tag.toLowerCase().includes(q))
        );
    }, [items, search]);

    const remove = async (s: PracticeSheet) => {
        if (!confirm(`Delete sheet "${s.title}"? This cannot be undone.`)) return;
        setBusyId(s.id);
        try {
            await deleteSheet(s.id);
            await load();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">
                        ← Practice
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">Sheets</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Sequential journeys — sections of topics + ordered problems. Students
                        progress section by section.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => downloadSheetTemplate()}
                        title="Download practice-sheets-template.json"
                    >
                        ⬇ Template
                    </Button>
                    <Link href="/practice/sheets/import">
                        <Button variant="outline">Bulk import (JSON)</Button>
                    </Link>
                    <Link href="/practice/sheets/create">
                        <Button variant="primary">+ New sheet</Button>
                    </Link>
                </div>
            </div>

            <Card className="flex flex-wrap items-center gap-3 p-4">
                <input
                    className="field flex-1 min-w-[220px]"
                    placeholder="Search title, subtitle, or tag…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className="field max-w-[140px]"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                    <option value="all">All kinds</option>
                    <option value="dsa">DSA</option>
                    <option value="sql">SQL</option>
                    <option value="mixed">Mixed</option>
                </select>
                <select
                    className="field max-w-[160px]"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                </select>
            </Card>

            {loading ? (
                <Card className="p-12 text-center text-sm text-slate-500">Loading…</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="mb-3 text-slate-500">No sheets yet.</p>
                    <Link href="/practice/sheets/create">
                        <Button variant="primary">Create your first sheet</Button>
                    </Link>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map((s) => {
                        const totalProblems = s.sections.reduce(
                            (sum, sec) => sum + sec.problemSlugs.length,
                            0
                        );
                        return (
                            <Card
                                key={s.id}
                                className="flex flex-wrap items-center justify-between gap-3 p-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="chip-neutral text-[10px]">
                                            {s.kind}
                                        </span>
                                        <span className={`${statusChip(s.status)} text-[10px]`}>
                                            {s.status}
                                        </span>
                                        {s.isOfficial && (
                                            <span className="chip-info text-[10px]">
                                                Official
                                            </span>
                                        )}
                                        {s.isFeatured && (
                                            <span className="chip-info text-[10px]">
                                                Featured
                                            </span>
                                        )}
                                        {s.difficulty && (
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400">
                                                {s.difficulty}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="mt-1 truncate font-semibold text-slate-900">
                                        {s.title}
                                    </h3>
                                    {s.subtitle && (
                                        <p className="line-clamp-1 text-xs text-slate-500">
                                            {s.subtitle}
                                        </p>
                                    )}
                                    <p className="mt-1 text-[11px] text-slate-400 font-mono">
                                        /practice/sheets/{s.slug} · {s.sections.length}{" "}
                                        section{s.sections.length === 1 ? "" : "s"} ·{" "}
                                        {totalProblems} problem
                                        {totalProblems === 1 ? "" : "s"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link href={`/practice/sheets/${s.id}/edit`}>
                                        <Button variant="outline" size="sm">
                                            Edit
                                        </Button>
                                    </Link>
                                    {s.status === "published" && (
                                        <a
                                            href={`/practice/sheets/${s.slug}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-primary-700 hover:underline"
                                        >
                                            View ↗
                                        </a>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        isLoading={busyId === s.id}
                                        className="!text-rose-600"
                                        onClick={() => remove(s)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
