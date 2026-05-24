"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { patternMeta, type PracticeProblem } from "@digimine/types";
import {
    bulkDeleteProblems,
    deleteProblem,
    listProblems,
    swapProblemNumbers,
} from "@/lib/firestore/practiceProblems";
import { downloadProblemTemplate } from "@/lib/import/practiceProblems";
import { BulkActionsBar } from "@/components/common/BulkActionsBar";
import { handleSelectClick, useBulkSelection } from "@/hooks/useBulkSelection";

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
    const [swapping, setSwapping] = useState<string | null>(null);
    // ── Pagination state ───────────────────────────────────────────────
    // The list is fetched in full from Firestore (capped at 2000 so we cover
    // the planned 1000-problem catalog with headroom), then paginated and
    // searched client-side. Searching while paginated jumps back to page 1.
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const sel = useBulkSelection<string>();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await listProblems({ kind, limit: 2000 }));
        } finally {
            setLoading(false);
        }
    }, [kind]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Display order: problems with a `problemNumber` first (ascending), then
     * everything without a number (sorted by createdAt desc, server-side).
     * This is the order the bulk-select "range" interpretation uses.
     */
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const matched = !q
            ? items
            : items.filter(
                  (p) =>
                      p.title.toLowerCase().includes(q) ||
                      p.tags.some((t) => t.toLowerCase().includes(q))
              );
        return [...matched].sort((a, b) => {
            const an = a.problemNumber ?? Infinity;
            const bn = b.problemNumber ?? Infinity;
            if (an !== bn) return an - bn;
            // Both null (or equal) → fall back to title for deterministic order.
            return a.title.localeCompare(b.title);
        });
    }, [items, search]);

    // Pagination is applied AFTER filter + sort so search results paginate
    // sensibly. `visibleIds` covers only the current page — that's what the
    // bulk-select range interpretation should respect (shift-clicking should
    // select within the visible page, not across pages).
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = (safePage - 1) * pageSize;
    const pageItems = useMemo(
        () => filtered.slice(pageStart, pageStart + pageSize),
        [filtered, pageStart, pageSize]
    );
    const visibleIds = useMemo(() => pageItems.map((p) => p.id), [pageItems]);

    // Jump to page 1 whenever the filter/search/page-size changes so the
    // user isn't stuck on an empty page 9 after typing a query that
    // narrows results to one page.
    useEffect(() => {
        setPage(1);
    }, [search, kind, pageSize]);

    const swap = async (i: number, dir: -1 | 1) => {
        const a = filtered[i];
        const b = filtered[i + dir];
        if (!a || !b) return;
        if (a.problemNumber == null || b.problemNumber == null) {
            alert(
                "Both problems need a #Number before they can be swapped. Edit each to assign one."
            );
            return;
        }
        setSwapping(a.id);
        try {
            await swapProblemNumbers(a.id, b.id);
            await load();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Swap failed");
        } finally {
            setSwapping(null);
        }
    };

    const bulkDelete = async () => {
        const ids = sel.ids;
        if (ids.length === 0) return;
        const res = await bulkDeleteProblems(ids);
        sel.clear();
        await load();
        if (res.failed.length > 0) {
            alert(
                `Deleted ${res.ok}. Failed ${res.failed.length} (see console).`
            );
            console.error("Bulk delete failures:", res.failed);
        }
    };

    const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => sel.isSelected(id));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Practice problems</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        DSA &amp; SQL problems shown on the public Practice hub.{" "}
                        <span className="text-slate-400">
                            Tip: Cmd/Ctrl+click a row to toggle, Shift+click to range-select.
                        </span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => downloadProblemTemplate()}
                        title="Download practice-problems-template.json"
                    >
                        ⬇ Template
                    </Button>
                    <Link href="/practice/import">
                        <Button variant="outline">Bulk import (JSON)</Button>
                    </Link>
                    <Link href="/practice/create">
                        <Button variant="primary">+ New problem</Button>
                    </Link>
                </div>
            </div>

            <Card className="flex flex-wrap items-center gap-3 p-4">
                <input
                    className="field flex-1 min-w-[220px]"
                    placeholder="Search title or tag…"
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
                    className="field max-w-[110px]"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    title="Items per page"
                >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                    <option value={200}>200 / page</option>
                </select>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) =>
                            e.target.checked ? sel.selectAll(visibleIds) : sel.clear()
                        }
                    />
                    Select page ({pageItems.length}) · {filtered.length} total
                </label>
            </Card>

            <BulkActionsBar
                count={sel.count}
                onClear={sel.clear}
                onDelete={bulkDelete}
                label="problem"
            />

            {loading ? (
                <Card className="p-12 text-center text-sm text-slate-500">Loading…</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="mb-3 text-slate-500">No problems yet.</p>
                    <div className="inline-flex gap-2">
                        <Link href="/practice/create">
                            <Button variant="primary">Create one</Button>
                        </Link>
                        <Link href="/practice/import">
                            <Button variant="outline">Bulk import</Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <div className="space-y-2">
                    {pageItems.map((p, pageIdx) => {
                        const selected = sel.isSelected(p.id);
                        // Absolute index in `filtered` — needed so the up/down
                        // arrows can swap across page boundaries correctly.
                        const i = pageStart + pageIdx;
                        return (
                            <Card
                                key={p.id}
                                onClick={(e) =>
                                    handleSelectClick(e, p.id, visibleIds, sel)
                                }
                                className={`flex flex-wrap items-center justify-between gap-3 p-4 transition-colors ${
                                    selected
                                        ? "!border-primary-300 !bg-primary-50/40"
                                        : ""
                                }`}
                            >
                                {/* Checkbox + reorder column */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => sel.toggle(p.id)}
                                        aria-label={`Select ${p.title}`}
                                    />
                                    <div className="flex flex-col">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                swap(i, -1);
                                            }}
                                            disabled={i === 0 || swapping === p.id}
                                            aria-label="Move up (swap #Number with previous)"
                                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                swap(i, 1);
                                            }}
                                            disabled={
                                                i === filtered.length - 1 || swapping === p.id
                                            }
                                            aria-label="Move down (swap #Number with next)"
                                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="chip-neutral text-[10px]">{p.kind}</span>
                                        <span className={`${statusChip(p.status)} text-[10px]`}>
                                            {p.status}
                                        </span>
                                        {p.access !== "free" && (
                                            <span className="chip-info text-[10px]">{p.access}</span>
                                        )}
                                        {p.isFeatured && (
                                            <span className="chip-info text-[10px]">Featured</span>
                                        )}
                                        <span className="text-xs text-slate-400">
                                            {patternMeta(p.primaryPattern as never)?.label} ·{" "}
                                            {p.difficulty}
                                        </span>
                                    </div>
                                    <h3 className="mt-1 truncate font-semibold text-slate-900">
                                        {p.problemNumber != null && (
                                            <span className="mr-1 font-mono text-xs text-slate-400">
                                                #{p.problemNumber}
                                            </span>
                                        )}
                                        {p.title}
                                    </h3>
                                    <p className="font-mono text-[11px] text-slate-400">
                                        /practice/problems/{p.slug} · {p.testCases.length} tests ·{" "}
                                        {p.totalSolved} solved
                                    </p>
                                </div>

                                <div
                                    className="flex items-center gap-2"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Link href={`/practice/${p.id}/edit`}>
                                        <Button variant="outline" size="sm">
                                            Edit
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="!text-rose-600"
                                        onClick={async () => {
                                            if (confirm(`Delete "${p.title}"?`)) {
                                                await deleteProblem(p.id);
                                                sel.clear();
                                                load();
                                            }
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}

                    {/* Pagination footer */}
                    {totalPages > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <span className="text-xs text-slate-500">
                                Showing <span className="font-semibold text-slate-700">{pageStart + 1}</span>–
                                <span className="font-semibold text-slate-700">{pageStart + pageItems.length}</span> of{" "}
                                <span className="font-semibold text-slate-700">{filtered.length}</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(1)}
                                    disabled={safePage <= 1}
                                >
                                    « First
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                >
                                    ← Prev
                                </Button>
                                <span className="px-2 text-sm font-medium text-slate-700">
                                    Page {safePage} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={safePage >= totalPages}
                                >
                                    Next →
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage(totalPages)}
                                    disabled={safePage >= totalPages}
                                >
                                    Last »
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
