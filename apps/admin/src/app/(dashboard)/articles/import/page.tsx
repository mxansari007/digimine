"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createArticle } from "@/lib/firestore/articles";
import { downloadArticleTemplate, parseArticleMarkdown } from "@/lib/import/markdownArticles";

type FileStatus = "pending" | "parsing" | "creating" | "success" | "error";

interface FileRow {
    id: string;
    name: string;
    sizeKb: number;
    status: FileStatus;
    /** Created article id when status === "success". */
    articleId?: string;
    /** Parsed slug for the success link. */
    slug?: string;
    error?: string;
    warnings: string[];
}

function statusChipFor(status: FileStatus) {
    switch (status) {
        case "success":
            return "chip-success";
        case "creating":
        case "parsing":
            return "chip-info";
        case "error":
            return "chip-error";
        case "pending":
        default:
            return "chip-neutral";
    }
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
        reader.readAsText(file);
    });
}

export default function ImportArticlesPage() {
    const { firebaseUser, user } = useAdminAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [rows, setRows] = useState<FileRow[]>([]);
    const [running, setRunning] = useState(false);
    const [dragging, setDragging] = useState(false);

    const resetSelection = () => {
        setRows([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const acceptFiles = useCallback((files: FileList | File[]) => {
        const list: FileRow[] = [];
        Array.from(files).forEach((file) => {
            const ok = file.name.toLowerCase().endsWith(".md") || file.type === "text/markdown";
            list.push({
                id: `${file.name}-${file.size}-${file.lastModified}-${list.length}`,
                name: file.name,
                sizeKb: Math.round(file.size / 102.4) / 10,
                status: ok ? "pending" : "error",
                error: ok ? undefined : "Skipped — only .md files are accepted.",
                warnings: [],
            });
        });
        setRows(list);
    }, []);

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length) acceptFiles(e.target.files);
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) acceptFiles(e.dataTransfer.files);
    };

    const runImport = useCallback(async () => {
        if (!firebaseUser) {
            alert("Sign in required");
            return;
        }
        const queue = rows.filter((r) => r.status === "pending");
        if (!queue.length) return;
        setRunning(true);

        // Resolve File objects from the input element by file name.
        const fileMap = new Map<string, File>();
        const filesInInput = fileInputRef.current?.files;
        if (filesInInput) {
            Array.from(filesInInput).forEach((f) => fileMap.set(f.name, f));
        }

        for (const row of queue) {
            const file = fileMap.get(row.name);
            if (!file) {
                setRows((prev) =>
                    prev.map((r) =>
                        r.id === row.id
                            ? { ...r, status: "error", error: "File reference lost — re-select to retry." }
                            : r
                    )
                );
                continue;
            }

            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "parsing" } : r)));
            let text = "";
            try {
                text = await readFileAsText(file);
            } catch (err: any) {
                setRows((prev) =>
                    prev.map((r) =>
                        r.id === row.id
                            ? { ...r, status: "error", error: err?.message || "Could not read file." }
                            : r
                    )
                );
                continue;
            }

            const parsed = parseArticleMarkdown(text);
            if (!parsed.ok) {
                setRows((prev) =>
                    prev.map((r) =>
                        r.id === row.id
                            ? {
                                  ...r,
                                  status: "error",
                                  error: parsed.errors.join(" • "),
                                  warnings: parsed.warnings,
                              }
                            : r
                    )
                );
                continue;
            }

            setRows((prev) =>
                prev.map((r) =>
                    r.id === row.id ? { ...r, status: "creating", warnings: parsed.warnings } : r
                )
            );
            try {
                const id = await createArticle(parsed.input, {
                    userId: firebaseUser.uid,
                    name: user?.displayName || firebaseUser.email || "Admin",
                    avatarUrl: user?.photoURL || firebaseUser.photoURL || null,
                });
                setRows((prev) =>
                    prev.map((r) =>
                        r.id === row.id
                            ? {
                                  ...r,
                                  status: "success",
                                  articleId: id,
                                  slug: parsed.input.slug,
                              }
                            : r
                    )
                );
            } catch (err: any) {
                setRows((prev) =>
                    prev.map((r) =>
                        r.id === row.id
                            ? { ...r, status: "error", error: err?.message || "Failed to create article." }
                            : r
                    )
                );
            }
        }

        setRunning(false);
    }, [firebaseUser, user, rows]);

    const counts = rows.reduce(
        (acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        },
        { pending: 0, parsing: 0, creating: 0, success: 0, error: 0 } as Record<FileStatus, number>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/articles" className="text-xs text-slate-500 hover:text-slate-900">
                        ← All articles
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">Import articles</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Drop a single Markdown file or a folder of them. Each file becomes one article — drafts stay
                        drafts, published stays published.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => downloadArticleTemplate()}>
                        Download template
                    </Button>
                    <Link href="/articles">
                        <Button variant="ghost">Done</Button>
                    </Link>
                </div>
            </div>

            <Card
                className={`p-8 text-center transition-colors ${
                    dragging ? "border-primary-400 bg-primary-50" : ""
                }`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
            >
                <div className="mx-auto max-w-md">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                            />
                        </svg>
                    </div>
                    <h2 className="mt-4 text-base font-semibold text-slate-900">
                        Drop .md files here or click to pick
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Each file must start with a YAML <code>---</code> frontmatter block. Use the template to get the
                        shape right.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                            Choose files
                        </Button>
                        <Button variant="ghost" onClick={resetSelection} disabled={running || rows.length === 0}>
                            Clear
                        </Button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".md,text/markdown,text/plain"
                        multiple
                        className="hidden"
                        onChange={onFileInputChange}
                    />
                </div>
            </Card>

            {rows.length > 0 && (
                <Card className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-600">
                            {rows.length} file{rows.length === 1 ? "" : "s"} selected ·{" "}
                            <span className="text-emerald-700">{counts.success || 0} ok</span> ·{" "}
                            <span className="text-rose-700">{counts.error || 0} failed</span> ·{" "}
                            <span className="text-slate-500">{counts.pending || 0} queued</span>
                        </div>
                        <Button
                            variant="primary"
                            onClick={runImport}
                            isLoading={running}
                            disabled={running || counts.pending === 0}
                        >
                            {counts.pending === 0 ? "Nothing left to import" : `Import ${counts.pending}`}
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {rows.map((r) => (
                            <div
                                key={r.id}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={statusChipFor(r.status)}>{r.status}</span>
                                        <span className="font-mono text-xs text-slate-700 truncate">{r.name}</span>
                                        <span className="text-[10px] text-slate-400">{r.sizeKb} KB</span>
                                    </div>
                                    {r.error && (
                                        <p className="mt-1 text-xs text-rose-700 break-words">{r.error}</p>
                                    )}
                                    {r.warnings.length > 0 && (
                                        <ul className="mt-1 list-disc pl-4 text-xs text-amber-700">
                                            {r.warnings.map((w, i) => (
                                                <li key={i}>{w}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                {r.status === "success" && r.articleId && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <Link
                                            href={`/articles/${r.articleId}/edit`}
                                            className="text-primary-700 hover:underline"
                                        >
                                            Open in editor →
                                        </Link>
                                        {r.slug && (
                                            <a
                                                href={`/articles/${r.slug}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-slate-500 hover:text-slate-900"
                                            >
                                                View ↗
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Card className="p-5 text-sm text-slate-600 space-y-2">
                <h2 className="text-sm font-semibold text-slate-900">Format quick reference</h2>
                <ol className="list-decimal space-y-1 pl-5">
                    <li>
                        Every file begins with a <code>---</code> frontmatter block and ends the frontmatter with another{" "}
                        <code>---</code>.
                    </li>
                    <li>
                        <code>title</code> and <code>category</code> are required. Categories: tech-news, tutorial,
                        subject-topic, guide, case-study, announcement, opinion, exam-update, career.
                    </li>
                    <li>
                        <code>tags</code> and <code>seo.keywords</code> accept either inline JSON
                        (<code>{`["physics", "neet"]`}</code>) or a YAML-style dash list (
                        <code>{`- "physics"`}</code> on each line, indented under the key). Pick whichever feels natural.
                    </li>
                    <li>
                        Nested objects (<code>author</code>, <code>seo</code>) use 2-space indentation with{" "}
                        <code>key: value</code> pairs.
                    </li>
                    <li>
                        Body is standard Markdown — converted to HTML at import time. Headings, lists, code blocks,
                        quotes, images, links, bold, italic, inline code all supported.
                    </li>
                </ol>
                <p className="text-xs text-slate-500">
                    Tip: Hit <em>Download template</em> above for a ready-to-fill example.
                </p>
            </Card>
        </div>
    );
}
