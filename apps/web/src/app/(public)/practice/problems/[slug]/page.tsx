"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, FormattedContent } from "@digimine/ui";
import { patternMeta, type CodeLanguage } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Sample = { input: string; expectedOutput: string; explanation: string | null };
type Hint = { id: string; order: number; text: string };

type Problem = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    title: string;
    statementHtml: string;
    difficulty: string;
    primaryPattern: string;
    patternChoices: string[];
    languages: CodeLanguage[];
    starters: { language: CodeLanguage; code: string }[];
    samples: Sample[];
    constraintsHtml: string | null;
    sql: { schemaSql: string; orderMatters: boolean } | null;
    editorialHtml: string | null;
    hints: Hint[];
};

type Progress = {
    status: string;
    recognitionAnswered: boolean;
    recognitionCorrect: boolean;
    intervalDays: number;
    dueAt: string | null;
} | null;

type JudgeResult = {
    verdict: string;
    passedCount: number;
    totalCount: number;
    runtimeMs: number;
    accepted: boolean;
    grade: number | null;
    results: Array<{ index: number; passed: boolean; isHidden: boolean; input?: string; expectedOutput?: string; actualOutput?: string }>;
    submissionId?: string;
};

const MONACO_LANG: Record<string, string> = {
    python: "python",
    javascript: "javascript",
    cpp: "cpp",
    java: "java",
    sql: "sql",
};

function verdictTone(v: string) {
    if (v === "accepted") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (v === "pending") return "text-slate-700 bg-slate-50 border-slate-200";
    return "text-rose-700 bg-rose-50 border-rose-200";
}

function verdictLabel(v: string) {
    return (
        {
            accepted: "Accepted",
            wrong_answer: "Wrong Answer",
            runtime_error: "Runtime Error",
            compile_error: "Compile Error",
            time_limit_exceeded: "Time Limit Exceeded",
            pending: "Pending",
        } as Record<string, string>
    )[v] || v;
}

export default function SolveProblemPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    const { firebaseUser, isAuthenticated } = useAuthContext();

    const [problem, setProblem] = useState<Problem | null>(null);
    const [progress, setProgress] = useState<Progress>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [language, setLanguage] = useState<CodeLanguage | "sql">("python");
    const [code, setCode] = useState("");
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<JudgeResult | null>(null);

    // Pattern Lens
    const [lensChoice, setLensChoice] = useState<string>("");
    const [lensResult, setLensResult] = useState<{ correct: boolean; correctPattern: string } | null>(null);
    const [showEditorial, setShowEditorial] = useState(false);

    // Hints
    const [revealedHints, setRevealedHints] = useState(0);

    // Rescue
    const [rescueOpen, setRescueOpen] = useState(false);
    const [rescueMsg, setRescueMsg] = useState("");
    const [rescueDone, setRescueDone] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = firebaseUser
                ? await teacherFetch(firebaseUser, `/api/practice/problems/${encodeURIComponent(slug)}`)
                : await fetch(`/api/practice/problems/${encodeURIComponent(slug)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setProblem(data.problem);
            setProgress(data.progress || null);
            // Initialise editor.
            if (data.problem.kind === "sql") {
                setLanguage("sql");
                setCode("-- Write your query\n");
            } else {
                const langs: CodeLanguage[] = data.problem.languages || ["python"];
                const lang = langs.includes("python") ? "python" : langs[0];
                setLanguage(lang);
                const starter = (data.problem.starters || []).find((s: any) => s.language === lang);
                setCode(starter?.code || "");
            }
        } catch (err: any) {
            setError(err.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [slug, firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const onLanguageChange = (lang: CodeLanguage) => {
        setLanguage(lang);
        const starter = problem?.starters.find((s) => s.language === lang);
        setCode(starter?.code || "");
    };

    const submit = async (mode: "run" | "submit") => {
        if (!isAuthenticated || !firebaseUser) {
            router.push(`/login?redirect=/practice/problems/${slug}`);
            return;
        }
        if (!problem) return;
        setRunning(true);
        setResult(null);
        try {
            const res = await teacherFetch(firebaseUser, "/api/practice/submit", {
                method: "POST",
                body: JSON.stringify({ problemId: problem.id, mode, language, code }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setResult(data);
            if (mode === "submit") {
                // Refresh progress so the revision banner shows.
                load();
            }
        } catch (err: any) {
            setResult({ verdict: "runtime_error", passedCount: 0, totalCount: 0, runtimeMs: 0, accepted: false, grade: null, results: [{ index: 0, passed: false, isHidden: false, actualOutput: err.message }] });
        } finally {
            setRunning(false);
        }
    };

    const answerLens = async () => {
        if (!firebaseUser || !problem || !lensChoice) return;
        try {
            const res = await teacherFetch(firebaseUser, "/api/practice/recognition", {
                method: "POST",
                body: JSON.stringify({ problemId: problem.id, chosenPattern: lensChoice }),
            });
            const data = await res.json();
            if (res.ok) setLensResult({ correct: data.correct, correctPattern: data.correctPattern });
        } catch {
            /* ignore */
        }
    };

    const sendRescue = async () => {
        if (!firebaseUser || !problem) return;
        try {
            const res = await teacherFetch(firebaseUser, "/api/practice/rescue", {
                method: "POST",
                body: JSON.stringify({ problemId: problem.id, message: rescueMsg, submissionId: result?.submissionId || null }),
            });
            const data = await res.json();
            if (res.ok) {
                setRescueDone(`Sent to ${data.routedTo}. You'll get a hint soon.`);
                setRescueOpen(false);
                setRescueMsg("");
            }
        } catch {
            /* ignore */
        }
    };

    const lensChoices = useMemo(() => problem?.patternChoices?.length ? problem.patternChoices : (problem ? [problem.primaryPattern] : []), [problem]);

    if (loading) return <div className="container-page py-16 text-center text-sm text-slate-500">Loading problem…</div>;
    if (error || !problem)
        return (
            <div className="container-page py-16 text-center">
                <p className="text-rose-700">{error || "Problem not found"}</p>
                <Link href="/practice/problems" className="mt-2 inline-block text-primary-700 hover:underline">← Back to problems</Link>
            </div>
        );

    const solved = progress?.status === "solved";

    return (
        <main className="bg-slate-50 min-h-screen">
            <div className="container-page py-6 grid gap-6 lg:grid-cols-2">
                {/* Left: statement */}
                <div className="space-y-5">
                    <div>
                        <Link href="/practice/problems" className="text-xs text-slate-500 hover:text-slate-900">← Problems</Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h1 className="font-display text-2xl font-bold text-slate-900">{problem.title}</h1>
                            {solved && <span className="chip-success text-xs">Solved</span>}
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">
                            {problem.kind} · {problem.difficulty} · {patternMeta(problem.primaryPattern as any)?.label}
                        </p>
                    </div>

                    {/* Revision banner */}
                    {solved && progress?.dueAt && (
                        <Card intent="info" className="p-3 text-xs">
                            Next revision scheduled for {new Date(progress.dueAt).toLocaleDateString("en-IN")} (in
                            {" "}{progress.intervalDays} day{progress.intervalDays === 1 ? "" : "s"}). We&apos;ll resurface it in your Revision Radar.
                        </Card>
                    )}

                    <Card className="p-5">
                        <FormattedContent html={problem.statementHtml} />
                        {problem.constraintsHtml && (
                            <div className="mt-4 border-t border-slate-100 pt-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Constraints</p>
                                <FormattedContent html={problem.constraintsHtml} className="mt-1 text-sm" />
                            </div>
                        )}
                    </Card>

                    {/* SQL schema */}
                    {problem.kind === "sql" && problem.sql && (
                        <Card className="p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Schema</p>
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{problem.sql.schemaSql}</pre>
                        </Card>
                    )}

                    {/* Samples */}
                    {problem.samples.length > 0 && (
                        <Card className="p-5 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Examples</p>
                            {problem.samples.map((s, i) => (
                                <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                                    <p className="text-slate-500">Input</p>
                                    <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{s.input}</pre>
                                    <p className="mt-2 text-slate-500">Output</p>
                                    <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{s.expectedOutput}</pre>
                                    {s.explanation && <p className="mt-2 text-xs text-slate-500">{s.explanation}</p>}
                                </div>
                            ))}
                        </Card>
                    )}

                    {/* Pattern Lens — USP */}
                    <Card className="p-5">
                        <p className="text-sm font-semibold text-slate-900">🔍 Pattern Lens</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                            Before you peek at the editorial — which pattern is this? Recognising patterns is the real interview skill.
                        </p>
                        {!lensResult ? (
                            <div className="mt-3 space-y-2">
                                {lensChoices.map((p) => (
                                    <label key={p} className="flex items-center gap-2 text-sm">
                                        <input type="radio" name="lens" value={p} checked={lensChoice === p} onChange={() => setLensChoice(p)} />
                                        <span>{patternMeta(p as any)?.label || p}</span>
                                    </label>
                                ))}
                                <Button variant="outline" size="sm" disabled={!lensChoice || !isAuthenticated} onClick={answerLens}>
                                    {isAuthenticated ? "Check my guess" : "Sign in to use Pattern Lens"}
                                </Button>
                            </div>
                        ) : (
                            <div className={`mt-3 rounded-lg border p-3 text-sm ${lensResult.correct ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                                {lensResult.correct ? "✓ Spot on — " : "✗ Not quite — it's "}
                                <strong>{patternMeta(lensResult.correctPattern as any)?.label}</strong>.
                                {" "}This counts toward your pattern-recognition score on the Mastery Map.
                            </div>
                        )}
                    </Card>

                    {/* Hints */}
                    {problem.hints.length > 0 && (
                        <Card className="p-5">
                            <p className="text-sm font-semibold text-slate-900">Hints</p>
                            <div className="mt-2 space-y-2">
                                {problem.hints.slice(0, revealedHints).map((h) => (
                                    <div key={h.id} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{h.text}</div>
                                ))}
                                {revealedHints < problem.hints.length && (
                                    <Button variant="ghost" size="sm" onClick={() => setRevealedHints((n) => n + 1)}>
                                        Reveal hint {revealedHints + 1} of {problem.hints.length}
                                    </Button>
                                )}
                            </div>
                        </Card>
                    )}

                    {/* Editorial (gated behind a click so Pattern Lens stays meaningful) */}
                    {problem.editorialHtml && (
                        <Card className="p-5">
                            {!showEditorial ? (
                                <Button variant="outline" size="sm" onClick={() => setShowEditorial(true)}>
                                    Show editorial
                                </Button>
                            ) : (
                                <>
                                    <p className="text-sm font-semibold text-slate-900 mb-2">Editorial</p>
                                    <FormattedContent html={problem.editorialHtml} className="text-sm" />
                                </>
                            )}
                        </Card>
                    )}
                </div>

                {/* Right: editor + run */}
                <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                    <Card className="overflow-hidden p-0">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                            {problem.kind === "dsa" ? (
                                <select
                                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                    value={language}
                                    onChange={(e) => onLanguageChange(e.target.value as CodeLanguage)}
                                >
                                    {problem.languages.map((l) => (
                                        <option key={l} value={l}>{l}</option>
                                    ))}
                                </select>
                            ) : (
                                <span className="text-sm font-medium text-slate-600">SQL</span>
                            )}
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => submit("run")} isLoading={running}>
                                    Run
                                </Button>
                                <Button variant="primary" size="sm" onClick={() => submit("submit")} isLoading={running}>
                                    Submit
                                </Button>
                            </div>
                        </div>
                        <MonacoEditor
                            height="420px"
                            language={MONACO_LANG[language] || "plaintext"}
                            theme="vs-dark"
                            value={code}
                            onChange={(v) => setCode(v || "")}
                            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
                        />
                    </Card>

                    {/* Result */}
                    {result && (
                        <Card className={`p-4 border ${verdictTone(result.verdict)}`}>
                            <div className="flex items-center justify-between">
                                <p className="font-semibold">{verdictLabel(result.verdict)}</p>
                                <p className="text-sm">
                                    {result.passedCount}/{result.totalCount} tests
                                    {result.runtimeMs ? ` · ${result.runtimeMs}ms` : ""}
                                </p>
                            </div>
                            {result.accepted && result.grade != null && (
                                <p className="mt-1 text-xs">
                                    Scheduled into Revision Radar (recall grade {result.grade}/5). We&apos;ll bring it back before you forget.
                                </p>
                            )}
                            <div className="mt-3 space-y-2">
                                {result.results.filter((r) => !r.isHidden).map((r) => (
                                    <div key={r.index} className="rounded border border-current/20 bg-white/60 p-2 text-xs">
                                        <p className={r.passed ? "text-emerald-700" : "text-rose-700"}>
                                            Test {r.index + 1}: {r.passed ? "passed" : "failed"}
                                        </p>
                                        {!r.passed && r.actualOutput && (
                                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-700">{String(r.actualOutput).slice(0, 600)}</pre>
                                        )}
                                    </div>
                                ))}
                                {result.results.some((r) => r.isHidden) && (
                                    <p className="text-xs opacity-70">+ hidden tests evaluated</p>
                                )}
                            </div>
                        </Card>
                    )}

                    {/* Mentor Rescue — USP */}
                    <Card className="p-4">
                        {rescueDone ? (
                            <p className="text-sm text-emerald-700">{rescueDone}</p>
                        ) : !rescueOpen ? (
                            <button onClick={() => (isAuthenticated ? setRescueOpen(true) : router.push(`/login?redirect=/practice/problems/${slug}`))} className="text-sm font-medium text-primary-700 hover:underline">
                                🆘 Stuck? Ask a mentor for a targeted hint
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-slate-900">What have you tried?</p>
                                <p className="text-xs text-slate-500">Your latest failing submission is attached automatically so the mentor sees exactly where you&apos;re stuck.</p>
                                <textarea
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    rows={3}
                                    value={rescueMsg}
                                    onChange={(e) => setRescueMsg(e.target.value)}
                                    placeholder="I tried a hashmap but my output is off for duplicates…"
                                />
                                <div className="flex gap-2">
                                    <Button variant="primary" size="sm" onClick={sendRescue} disabled={!rescueMsg.trim()}>Send</Button>
                                    <Button variant="ghost" size="sm" onClick={() => setRescueOpen(false)}>Cancel</Button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </main>
    );
}
