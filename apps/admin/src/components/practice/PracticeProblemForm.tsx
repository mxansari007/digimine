"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import { X } from "lucide-react";
import {
    DSA_PATTERNS,
    SQL_PATTERNS,
    type CodeLanguage,
    type CreatePracticeProblemInput,
    type PracticeProblem,
} from "@digimine/types";
import { RichTextEditor } from "@/components/common/RichTextEditor";

const ALL_LANGS: CodeLanguage[] = ["python", "javascript", "cpp", "java"];

type TestCaseDraft = { id: string; input: string; expectedOutput: string; isHidden: boolean; explanation: string };
type HintDraft = { id: string; text: string };

function rid(p: string) {
    return `${p}-${Math.random().toString(36).slice(2, 8)}`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <div className="mt-1.5">{children}</div>
            {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </label>
    );
}

export function PracticeProblemForm({
    problem,
    submitting,
    onSubmit,
    onDelete,
}: {
    problem?: PracticeProblem | null;
    submitting?: boolean;
    onSubmit: (input: CreatePracticeProblemInput) => void | Promise<void>;
    onDelete?: () => void | Promise<void>;
}) {
    const [kind, setKind] = useState<"dsa" | "sql">(problem?.kind || "dsa");
    const [title, setTitle] = useState(problem?.title || "");
    const [slug, setSlug] = useState(problem?.slug || "");
    // Held as a string so the input never goes blank-but-zero while typing.
    // Convert back to number-or-null on submit.
    const [problemNumberInput, setProblemNumberInput] = useState<string>(
        problem?.problemNumber != null ? String(problem.problemNumber) : ""
    );
    const [difficulty, setDifficulty] = useState(problem?.difficulty || "easy");
    const [primaryPattern, setPrimaryPattern] = useState(problem?.primaryPattern || "arrays-hashing");
    const [tagsInput, setTagsInput] = useState((problem?.tags || []).join(", "));
    const [statementHtml, setStatementHtml] = useState(problem?.statementHtml || "");
    const [constraintsHtml, setConstraintsHtml] = useState(problem?.constraintsHtml || "");
    const [editorialHtml, setEditorialHtml] = useState(problem?.editorialHtml || "");
    const [editorialAccess, setEditorialAccess] = useState(problem?.editorialAccess || "free");
    const [status, setStatus] = useState(problem?.status || "draft");
    const [access, setAccess] = useState(problem?.access || "free");
    const [isFeatured, setIsFeatured] = useState(Boolean(problem?.isFeatured));

    const [languages, setLanguages] = useState<CodeLanguage[]>(problem?.languages || ["python", "javascript", "cpp", "java"]);
    const [starters, setStarters] = useState<Record<string, string>>(() => {
        const o: Record<string, string> = {};
        (problem?.starters || []).forEach((s) => (o[s.language] = s.code));
        return o;
    });

    const [testCases, setTestCases] = useState<TestCaseDraft[]>(
        () =>
            (problem?.testCases || []).map((t) => ({
                id: t.id || rid("tc"),
                input: t.input || "",
                expectedOutput: t.expectedOutput || "",
                isHidden: Boolean(t.isHidden),
                explanation: t.explanation || "",
            })) || []
    );

    const [hints, setHints] = useState<HintDraft[]>(
        () => (problem?.hints || []).map((h) => ({ id: h.id || rid("hint"), text: h.text })) || []
    );

    const [patternChoicesInput, setPatternChoicesInput] = useState(
        (problem?.patternChoices || []).join(",")
    );

    // SQL fields
    const [schemaSql, setSchemaSql] = useState(problem?.sql?.schemaSql || "");
    const [solutionSql, setSolutionSql] = useState(problem?.sql?.solutionSql || "");
    const [orderMatters, setOrderMatters] = useState(Boolean(problem?.sql?.orderMatters));
    const [expectedColumns, setExpectedColumns] = useState((problem?.sql?.expectedColumns || []).join(", "));
    const [expectedRowsJson, setExpectedRowsJson] = useState(
        JSON.stringify(problem?.sql?.expectedRows || [], null, 0)
    );

    const patternOptions = useMemo(() => (kind === "sql" ? SQL_PATTERNS : DSA_PATTERNS), [kind]);

    const handleSubmit = async () => {
        if (!title.trim()) {
            alert("Title is required");
            return;
        }
        const tags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
        const patternChoices = patternChoicesInput.split(",").map((s) => s.trim()).filter(Boolean) as any[];

        const parsedNum = problemNumberInput.trim();
        const problemNumber: number | null =
            parsedNum === "" ? null : Number.isFinite(Number(parsedNum)) ? Number(parsedNum) : null;

        const input: CreatePracticeProblemInput = {
            kind,
            title: title.trim(),
            slug: slug.trim() || undefined,
            problemNumber,
            difficulty: difficulty as any,
            primaryPattern: primaryPattern as any,
            tags,
            patternChoices: patternChoices.length ? patternChoices : [primaryPattern as any],
            statementHtml,
            constraintsHtml: constraintsHtml.trim() || null,
            editorialHtml: editorialHtml.trim() || null,
            editorialAccess: editorialAccess as any,
            status: status as any,
            access: access as any,
            isFeatured,
            hints: hints.filter((h) => h.text.trim()).map((h, i) => ({ id: h.id, order: i, text: h.text.trim() })),
        };

        if (kind === "dsa") {
            input.languages = languages;
            input.starters = languages.map((l) => ({ language: l, code: starters[l] || "" }));
            input.testCases = testCases
                .filter((t) => t.input !== undefined && t.expectedOutput !== undefined)
                .map((t) => {
                    // Firestore rejects `undefined` even inside nested objects,
                    // so omit `explanation` when blank instead of setting it
                    // to `undefined`.
                    const tc: any = {
                        id: t.id,
                        input: t.input,
                        expectedOutput: t.expectedOutput,
                        isHidden: t.isHidden,
                    };
                    if (t.explanation && t.explanation.trim()) {
                        tc.explanation = t.explanation.trim();
                    }
                    return tc;
                });
            input.sql = null;
        } else {
            let expectedRows: any[] = [];
            try {
                expectedRows = JSON.parse(expectedRowsJson || "[]");
            } catch {
                alert("Expected rows must be valid JSON (array of arrays).");
                return;
            }
            input.sql = {
                schemaSql,
                solutionSql,
                orderMatters,
                expectedColumns: expectedColumns.split(",").map((s) => s.trim()).filter(Boolean),
                expectedRows,
            };
            input.languages = [];
            input.starters = [];
            input.testCases = [];
        }

        await onSubmit(input);
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
                <Card className="p-6 space-y-4">
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setKind("dsa")}
                            className={`rounded-lg px-4 py-2 text-sm font-medium ${kind === "dsa" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-700"}`}
                        >
                            DSA
                        </button>
                        <button
                            type="button"
                            onClick={() => setKind("sql")}
                            className={`rounded-lg px-4 py-2 text-sm font-medium ${kind === "sql" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-700"}`}
                        >
                            SQL
                        </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                        <Field label="# Number" hint="LeetCode-style ID">
                            <input
                                className="field text-lg font-semibold"
                                type="number"
                                min="1"
                                value={problemNumberInput}
                                onChange={(e) => setProblemNumberInput(e.target.value)}
                                placeholder="42"
                            />
                        </Field>
                        <Field label="Title">
                            <input className="field text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two Sum" />
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Slug" hint="Blank = auto from title"><input className="field font-mono" value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
                        <Field label="Difficulty">
                            <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                            </select>
                        </Field>
                        <Field label="Primary pattern">
                            <select className="field" value={primaryPattern} onChange={(e) => setPrimaryPattern(e.target.value as any)}>
                                {patternOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Tags" hint="Comma-separated"><input className="field" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="neetcode-150, google" /></Field>
                    </div>
                    <Field label="Pattern Lens choices" hint="Comma-separated pattern ids offered as quiz options (incl. the correct one)">
                        <input className="field font-mono text-xs" value={patternChoicesInput} onChange={(e) => setPatternChoicesInput(e.target.value)} placeholder="arrays-hashing, two-pointers, sliding-window" />
                    </Field>
                </Card>

                <Card className="p-6 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">Problem statement</p>
                    <RichTextEditor value={statementHtml} onChange={setStatementHtml} minHeight={220} mediaUploadPath="practice/statements" placeholder="Describe the problem, with examples." />
                </Card>

                <Card className="p-6 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">Constraints (optional)</p>
                    <RichTextEditor value={constraintsHtml} onChange={setConstraintsHtml} minHeight={120} mediaUploadPath="practice/constraints" placeholder="1 ≤ n ≤ 10^5 …" />
                </Card>

                {kind === "dsa" ? (
                    <>
                        <Card className="p-6 space-y-4">
                            <p className="text-sm font-semibold text-slate-700">Languages &amp; starter code</p>
                            <div className="flex flex-wrap gap-3">
                                {ALL_LANGS.map((l) => (
                                    <label key={l} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={languages.includes(l)}
                                            onChange={(e) =>
                                                setLanguages((prev) => (e.target.checked ? [...prev, l] : prev.filter((x) => x !== l)))
                                            }
                                        />
                                        {l}
                                    </label>
                                ))}
                            </div>
                            {languages.map((l) => (
                                <Field key={l} label={`${l} starter`}>
                                    <textarea
                                        className="field font-mono text-xs"
                                        rows={4}
                                        value={starters[l] || ""}
                                        onChange={(e) => setStarters((p) => ({ ...p, [l]: e.target.value }))}
                                        placeholder={`# ${l} starter code`}
                                    />
                                </Field>
                            ))}
                        </Card>

                        <Card className="p-6 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-slate-700">Test cases</p>
                                <Button variant="outline" size="sm" onClick={() => setTestCases((p) => [...p, { id: rid("tc"), input: "", expectedOutput: "", isHidden: p.length >= 2, explanation: "" }])}>
                                    + Add test
                                </Button>
                            </div>
                            <p className="text-xs text-slate-400">Visible tests show as examples to students; hidden tests run on submit only. Output is compared as normalised stdout.</p>
                            {testCases.length === 0 && <p className="text-sm text-slate-400">No test cases yet.</p>}
                            {testCases.map((tc, i) => (
                                <div key={tc.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500">Test {i + 1}</span>
                                        <div className="flex items-center gap-3">
                                            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={tc.isHidden} onChange={(e) => setTestCases((p) => p.map((x) => x.id === tc.id ? { ...x, isHidden: e.target.checked } : x))} /> Hidden</label>
                                            <button className="text-xs text-rose-600" onClick={() => setTestCases((p) => p.filter((x) => x.id !== tc.id))}>Remove</button>
                                        </div>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <textarea className="field font-mono text-xs" rows={3} placeholder="stdin input" value={tc.input} onChange={(e) => setTestCases((p) => p.map((x) => x.id === tc.id ? { ...x, input: e.target.value } : x))} />
                                        <textarea className="field font-mono text-xs" rows={3} placeholder="expected stdout" value={tc.expectedOutput} onChange={(e) => setTestCases((p) => p.map((x) => x.id === tc.id ? { ...x, expectedOutput: e.target.value } : x))} />
                                    </div>
                                </div>
                            ))}
                        </Card>
                    </>
                ) : (
                    <Card className="p-6 space-y-4">
                        <p className="text-sm font-semibold text-slate-700">SQL setup</p>
                        <Field label="Schema SQL (DDL + seed INSERTs)">
                            <textarea className="field font-mono text-xs" rows={6} value={schemaSql} onChange={(e) => setSchemaSql(e.target.value)} placeholder={"CREATE TABLE users (id INT, name TEXT);\nINSERT INTO users VALUES (1, 'A');"} />
                        </Field>
                        <Field label="Reference solution query">
                            <textarea className="field font-mono text-xs" rows={3} value={solutionSql} onChange={(e) => setSolutionSql(e.target.value)} placeholder="SELECT name FROM users;" />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Expected columns" hint="Comma-separated"><input className="field" value={expectedColumns} onChange={(e) => setExpectedColumns(e.target.value)} placeholder="name" /></Field>
                            <Field label="Order matters?">
                                <label className="flex items-center gap-2 text-sm pt-2"><input type="checkbox" checked={orderMatters} onChange={(e) => setOrderMatters(e.target.checked)} /> Compare row order</label>
                            </Field>
                        </div>
                        <Field label="Expected rows (JSON array of arrays)" hint='e.g. [["A"],["B"]]'>
                            <textarea className="field font-mono text-xs" rows={4} value={expectedRowsJson} onChange={(e) => setExpectedRowsJson(e.target.value)} />
                        </Field>
                    </Card>
                )}

                <Card className="p-6 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">Hints (progressive)</p>
                        <Button variant="outline" size="sm" onClick={() => setHints((p) => [...p, { id: rid("hint"), text: "" }])}>+ Add hint</Button>
                    </div>
                    {hints.map((h, i) => (
                        <div key={h.id} className="flex gap-2">
                            <span className="pt-2 text-xs text-slate-400">{i + 1}</span>
                            <input className="field" value={h.text} onChange={(e) => setHints((p) => p.map((x) => x.id === h.id ? { ...x, text: e.target.value } : x))} placeholder="Gentle nudge…" />
                            <button
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50"
                                onClick={() => setHints((p) => p.filter((x) => x.id !== h.id))}
                                aria-label="Remove hint"
                            >
                                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                            </button>
                        </div>
                    ))}
                </Card>

                <Card className="p-6 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-700">Editorial (optional)</p>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                            Visibility
                            <select
                                className="field !py-1 !text-xs"
                                value={editorialAccess}
                                onChange={(e) => setEditorialAccess(e.target.value as "free" | "premium")}
                            >
                                <option value="free">Free for everyone</option>
                                <option value="premium">Premium only</option>
                            </select>
                        </label>
                    </div>
                    <RichTextEditor value={editorialHtml} onChange={setEditorialHtml} minHeight={160} mediaUploadPath="practice/editorial" placeholder="Approach, complexity, walkthrough." />
                </Card>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                <Card className="p-5 space-y-4">
                    <p className="text-sm font-semibold text-slate-700">Publishing</p>
                    <Field label="Status">
                        <select className="field" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                        </select>
                    </Field>
                    <Field label="Access">
                        <select className="field" value={access} onChange={(e) => setAccess(e.target.value as any)}>
                            <option value="free">Free</option>
                            <option value="login">Login required</option>
                            <option value="premium">Premium</option>
                        </select>
                    </Field>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} /> Featured</label>
                    <div className="flex flex-col gap-2 pt-2">
                        <Button variant="primary" onClick={handleSubmit} isLoading={submitting}>Save problem</Button>
                        {onDelete && problem && (
                            <Button variant="ghost" className="!text-rose-600" onClick={onDelete}>Delete</Button>
                        )}
                    </div>
                </Card>
            </aside>
        </div>
    );
}
