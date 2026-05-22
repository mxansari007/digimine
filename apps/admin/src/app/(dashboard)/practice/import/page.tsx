"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { bulkCreateProblems } from "@/lib/firestore/practiceProblems";
import { downloadProblemTemplate, parseProblemsJson } from "@/lib/import/practiceProblems";

export default function ImportProblemsPage() {
    const { firebaseUser } = useAdminAuth();
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [text, setText] = useState("");
    const [errors, setErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [parsedCount, setParsedCount] = useState<number | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ created: { id: string; title: string; slug: string }[]; errors: string[] } | null>(null);

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
        const parsed = parseProblemsJson(text);
        setErrors(parsed.errors);
        setWarnings(parsed.warnings);
        setParsedCount(parsed.problems.length);
        return parsed;
    };

    const runImport = async () => {
        if (!firebaseUser) { alert("Sign in required"); return; }
        const parsed = validate();
        if (!parsed.ok || parsed.problems.length === 0) return;
        setRunning(true);
        try {
            const res = await bulkCreateProblems(parsed.problems, firebaseUser.uid);
            setResult(res);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/practice" className="text-xs text-slate-500 hover:text-slate-900">← All problems</Link>
                    <h1 className="mt-1 text-2xl font-bold text-slate-900">Bulk import problems</h1>
                    <p className="mt-1 text-sm text-slate-500">Upload a JSON file (or paste below). Each entry becomes one problem.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => downloadProblemTemplate()}>Download template</Button>
                    <Link href="/practice"><Button variant="ghost">Done</Button></Link>
                </div>
            </div>

            <Card className="p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose JSON file</Button>
                    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
                    <span className="text-xs text-slate-400">or paste below</span>
                </div>
                <textarea className="field font-mono text-xs" rows={12} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder='{ "problems": [ ... ] }' />
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={validate} disabled={!text.trim()}>Validate</Button>
                    <Button variant="primary" onClick={runImport} isLoading={running} disabled={!text.trim()}>Import</Button>
                    {parsedCount != null && <span className="text-sm text-slate-500">{parsedCount} valid problem(s) parsed</span>}
                </div>
                {errors.length > 0 && (
                    <ul className="list-disc pl-5 text-sm text-rose-700">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                )}
                {warnings.length > 0 && (
                    <ul className="list-disc pl-5 text-sm text-amber-700">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                )}
            </Card>

            {result && (
                <Card className="p-5 space-y-2">
                    <p className="text-sm font-semibold text-emerald-700">Imported {result.created.length} problem(s).</p>
                    <div className="space-y-1">
                        {result.created.map((c) => (
                            <div key={c.id} className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm">
                                <span>{c.title}</span>
                                <Link href={`/practice/${c.id}/edit`} className="text-xs text-primary-700 hover:underline">Open →</Link>
                            </div>
                        ))}
                    </div>
                    {result.errors.length > 0 && (
                        <ul className="list-disc pl-5 text-sm text-rose-700">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    )}
                </Card>
            )}

            <Card className="p-5 text-sm text-slate-600 space-y-2">
                <h2 className="text-sm font-semibold text-slate-900">Format</h2>
                <ul className="list-disc space-y-1 pl-5">
                    <li>A JSON array, or <code>{`{ "problems": [...] }`}</code>.</li>
                    <li>Each problem needs <code>title</code>, <code>kind</code> (dsa|sql), <code>difficulty</code>, <code>primaryPattern</code>.</li>
                    <li>DSA: include <code>testCases</code> (set <code>isHidden</code> per case) and <code>starters</code>.</li>
                    <li>SQL: include <code>sql.schemaSql</code>, <code>sql.expectedColumns</code>, <code>sql.expectedRows</code>.</li>
                    <li><code>hints</code> can be plain strings or objects. <code>statementHtml</code> is HTML.</li>
                </ul>
                <p className="text-xs text-slate-500">Hit <em>Download template</em> for a ready-to-edit example.</p>
            </Card>
        </div>
    );
}
