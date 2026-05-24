"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { patternMeta, type PracticeTopic } from "@digimine/types";
import { deleteTopic, listTopics } from "@/lib/firestore/practiceTopics";
import { downloadTopicTemplate } from "@/lib/import/practiceTopics";

function statusChip(s: string) {
    if (s === "published") return "chip-success";
    if (s === "archived") return "chip-neutral";
    return "chip-warning";
}

export default function AdminPracticeTopicsPage() {
    const [items, setItems] = useState<PracticeTopic[]>([]);
    const [loading, setLoading] = useState(true);
    const [kind, setKind] = useState<"all" | "dsa" | "sql">("all");
    const [status, setStatus] = useState<"all" | PracticeTopic["status"]>("all");
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await listTopics({ kind, status, limit: 200 }));
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
            (t) =>
                t.title.toLowerCase().includes(q) ||
                t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
                t.pattern.toLowerCase().includes(q)
        );
    }, [items, search]);

    const remove = async (t: PracticeTopic) => {
        if (!confirm(`Delete topic "${t.title}"? This is not reversible.`)) return;
        setBusyId(t.id);
        try {
            await deleteTopic(t.id);
            await load();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link
                        href="/practice"
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        ← Practice
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">Topics</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Umbrella pages per pattern. Backlinks point here, problems auto-collect by
                        pattern, and sheets reference them as sections.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => downloadTopicTemplate()}
                        title="Download practice-topics-template.json"
                    >
                        ⬇ Template
                    </Button>
                    <Link href="/practice/topics/import">
                        <Button variant="outline">Bulk import (JSON)</Button>
                    </Link>
                    <Link href="/practice/topics/create">
                        <Button variant="primary">+ New topic</Button>
                    </Link>
                </div>
            </div>

            <Card className="p-4 flex flex-wrap items-center gap-3">
                <input
                    className="field flex-1 min-w-[220px]"
                    placeholder="Search title, pattern, or tag…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className="field max-w-[140px]"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                    <option value="all">All types</option>
                    <option value="dsa">DSA</option>
                    <option value="sql">SQL</option>
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
                    <p className="mb-3 text-slate-500">No topics yet.</p>
                    <Link href="/practice/topics/create">
                        <Button variant="primary">Create your first topic</Button>
                    </Link>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map((t) => (
                        <Card
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-4"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="chip-neutral text-[10px]">{t.kind}</span>
                                    <span className={`${statusChip(t.status)} text-[10px]`}>
                                        {t.status}
                                    </span>
                                    {t.isFeatured && (
                                        <span className="chip-info text-[10px]">Featured</span>
                                    )}
                                    {t.seo?.noIndex && (
                                        <span className="chip-warning text-[10px]">noindex</span>
                                    )}
                                    <span className="text-xs text-slate-400">
                                        {patternMeta(t.pattern)?.label || t.pattern}
                                    </span>
                                </div>
                                <h3 className="mt-1 truncate font-semibold text-slate-900">
                                    {t.title}
                                </h3>
                                {t.summary && (
                                    <p className="line-clamp-1 text-xs text-slate-500">
                                        {t.summary}
                                    </p>
                                )}
                                <p className="mt-1 text-[11px] text-slate-400 font-mono">
                                    /practice/topics/{t.slug}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link href={`/practice/topics/${t.id}/edit`}>
                                    <Button variant="outline" size="sm">
                                        Edit
                                    </Button>
                                </Link>
                                {t.status === "published" && (
                                    <a
                                        href={`/practice/topics/${t.slug}`}
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
                                    isLoading={busyId === t.id}
                                    className="!text-rose-600"
                                    onClick={() => remove(t)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
