"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createSheet } from "@/lib/firestore/practiceSheets";
import { downloadSheetTemplate, parseSheetsJson } from "@/lib/import/practiceSheets";

type Created = { id: string; title: string; slug: string };

export default function ImportSheetsPage() {
    const { firebaseUser } = useAdminAuth();
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [text, setText] = useState("");
    const [errors, setErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [parsedCount, setParsedCount] = useState<number | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ created: Created[]; failed: string[] } | null>(null);

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setText(typeof reader.result === "string" ? reader.result : "");
            setResult(null);
        };
        reader.readAsText(file);
    };

    const validate = () => {
        const parsed = parseSheetsJson(text);
        setErrors(parsed.errors);
        setWarnings(parsed.warnings);
        setParsedCount(parsed.sheets.length);
        return parsed;
    };

    const runImport = async () => {
        if (!firebaseUser) {
            alert("Sign in required");
            return;
        }
        const parsed = validate();
        if (!parsed.ok || parsed.sheets.length === 0) return;
        setRunning(true);
        const created: Created[] = [];
        const failed: string[] = [];
        for (const s of parsed.sheets) {
            try {
                const id = await createSheet(s, firebaseUser.uid);
                created.push({ id, title: s.title, slug: s.slug || id });
            } catch (e) {
                failed.push(
                    `${s.title}: ${e instanceof Error ? e.message : "create failed"}`
                );
            }
        }
        setResult({ created, failed });
        setRunning(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link
                        href="/practice/sheets"
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        ← All sheets
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">
                        Bulk import sheets
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Upload a JSON file (or paste below). Each entry becomes one sheet with all
                        its sections.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => downloadSheetTemplate()}>
                        Download template
                    </Button>
                    <Link href="/practice/sheets">
                        <Button variant="ghost">Done</Button>
                    </Link>
                </div>
            </div>

            <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                        Choose JSON file
                    </Button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={onFile}
                    />
                    <span className="text-xs text-slate-400">or paste below</span>
                </div>
                <textarea
                    className="field font-mono text-xs"
                    rows={12}
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        setResult(null);
                    }}
                    placeholder='{ "sheets": [ ... ] }'
                />
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={validate} disabled={!text.trim()}>
                        Validate
                    </Button>
                    <Button
                        variant="primary"
                        onClick={runImport}
                        isLoading={running}
                        disabled={!text.trim()}
                    >
                        Import
                    </Button>
                    {parsedCount != null && (
                        <span className="text-sm text-slate-500">
                            {parsedCount} valid sheet(s) parsed
                        </span>
                    )}
                </div>
                {errors.length > 0 && (
                    <ul className="list-disc pl-5 text-sm text-rose-700">
                        {errors.map((e, i) => (
                            <li key={i}>{e}</li>
                        ))}
                    </ul>
                )}
                {warnings.length > 0 && (
                    <ul className="list-disc pl-5 text-sm text-amber-700">
                        {warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                )}
            </Card>

            {result && (
                <Card className="space-y-2 p-5">
                    <p className="text-sm font-semibold text-emerald-700">
                        Imported {result.created.length} sheet(s).
                    </p>
                    <div className="space-y-1">
                        {result.created.map((c) => (
                            <div
                                key={c.id}
                                className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm"
                            >
                                <span>{c.title}</span>
                                <Link
                                    href={`/practice/sheets/${c.id}/edit`}
                                    className="text-xs text-primary-700 hover:underline"
                                >
                                    Open →
                                </Link>
                            </div>
                        ))}
                    </div>
                    {result.failed.length > 0 && (
                        <ul className="list-disc pl-5 text-sm text-rose-700">
                            {result.failed.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    )}
                </Card>
            )}

            <Card className="space-y-2 p-5 text-sm text-slate-600">
                <h2 className="text-sm font-semibold text-slate-900">Format</h2>
                <ul className="list-disc space-y-1 pl-5">
                    <li>
                        A JSON array, or <code>{`{ "sheets": [...] }`}</code>.
                    </li>
                    <li>
                        Required: <code>title</code>, <code>kind</code> (dsa|sql|mixed).
                    </li>
                    <li>
                        <code>sections[]</code> is the modern shape — each section has{" "}
                        <code>title</code>, an optional <code>topicSlug</code> (links the header to
                        the topic page), <code>summary</code>, and an ordered{" "}
                        <code>problemSlugs[]</code>.
                    </li>
                    <li>
                        Shortcut: a top-level <code>problemSlugs[]</code> creates a single-section
                        sheet automatically.
                    </li>
                    <li>
                        Referenced problem slugs that don&apos;t exist (or are unpublished) are
                        silently dropped on the public page — sheets never break.
                    </li>
                </ul>
                <p className="text-xs text-slate-500">
                    Hit <em>Download template</em> for a ready-to-edit example.
                </p>
            </Card>
        </div>
    );
}
