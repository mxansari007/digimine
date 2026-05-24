"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, FormattedContent } from "@digimine/ui";
import { patternMeta, type CodeLanguage } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { useAttemptGate } from "@/hooks/useAttemptGate";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { Paywall } from "@/components/common/Paywall";
import PracticeCommunity from "@/components/practice/PracticeCommunity";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Sample = { input: string; expectedOutput: string; explanation: string | null };
type Hint = { id: string; order: number; text: string };

type Problem = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    problemNumber: number | null;
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
    editorialAccess: "free" | "premium";
    hints: Hint[];
    tags: string[];
    access: "free" | "login" | "premium";
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

function difficultyPill(d: string) {
    const map: Record<string, string> = {
        easy: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
        medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
        hard: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
    };
    return map[d] || "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/20";
}

const LANG_LABEL: Record<string, string> = {
    python: "Python",
    javascript: "JavaScript",
    cpp: "C++",
    java: "Java",
    sql: "SQL",
};

// ── Local persistence (per-problem drafts + layout prefs) ──
const draftKey = (slug: string, lang: string) => `practice:draft:${slug}:${lang}`;
const langKey = (slug: string) => `practice:lang:${slug}`;
const MAX_KEY = "practice:layout:maximized";
const LEFT_KEY = "practice:layout:leftPane";
const EDITOR_KEY = "practice:layout:editorPane";

function lsGet(key: string): string | null {
    try {
        return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}
function lsSet(key: string, value: string) {
    try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, value);
    } catch {
        /* quota / private mode — ignore */
    }
}
function lsRemove(key: string) {
    try {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
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
    const { firebaseUser, isAuthenticated, loading: authLoading } = useAuthContext();
    const { isPremium, ready: entitlementsReady } = useEntitlements();
    // Role-less signed-in users get bounced to /role-select first. Anonymous
    // users are unaffected here (existing "Sign in" CTAs handle that branch).
    useAttemptGate();

    const [problem, setProblem] = useState<Problem | null>(null);
    const [progress, setProgress] = useState<Progress>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [language, setLanguage] = useState<CodeLanguage | "sql">("python");
    const [code, setCode] = useState("");
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<JudgeResult | null>(null);
    // Track whether the editor has been seeded so refreshes don't clobber typed code.
    const editorSeededRef = useRef(false);
    // Celebration overlay shown on a fresh accepted submit.
    const [celebrate, setCelebrate] = useState(false);
    const [celebrateOut, setCelebrateOut] = useState(false);
    const celebrateTimer = useRef<number | null>(null);

    const dismissCelebrate = useCallback(() => {
        if (celebrateTimer.current) {
            window.clearTimeout(celebrateTimer.current);
            celebrateTimer.current = null;
        }
        setCelebrateOut(true);
        window.setTimeout(() => {
            setCelebrate(false);
            setCelebrateOut(false);
        }, 550);
    }, []);

    const fireCelebrate = useCallback(() => {
        if (celebrateTimer.current) window.clearTimeout(celebrateTimer.current);
        setCelebrateOut(false);
        setCelebrate(true);
        // Auto-dismiss after a while if the user doesn't click.
        celebrateTimer.current = window.setTimeout(() => dismissCelebrate(), 5000);
    }, [dismissCelebrate]);

    useEffect(() => () => {
        if (celebrateTimer.current) window.clearTimeout(celebrateTimer.current);
    }, []);

    // Pattern Lens
    const [lensChoice, setLensChoice] = useState<string>("");
    const [lensResult, setLensResult] = useState<{ correct: boolean; correctPattern: string } | null>(null);
    const [showEditorial, setShowEditorial] = useState(false);

    // Hints
    const [revealedHints, setRevealedHints] = useState(0);

    // Left-panel tabs
    const [tab, setTab] = useState<"desc" | "hints" | "editorial" | "companies" | "solutions" | "discussion">("desc");
    // Right-panel console
    const [resetTick, setResetTick] = useState(0);

    // Layout: resizable panes + maximize
    const [maximized, setMaximized] = useState(false);
    const [leftPaneSize, setLeftPaneSize] = useState(50); // % width of the problem pane (lg+)
    const [editorPaneSize, setEditorPaneSize] = useState(64); // % height of editor within the right column
    const [isLgUp, setIsLgUp] = useState(false);
    const horizSplitRef = useRef<HTMLDivElement>(null);
    const rightColRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1024px)");
        const update = () => setIsLgUp(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);

    // Restore persisted layout prefs once on mount (in an effect to avoid
    // SSR/hydration mismatches).
    useEffect(() => {
        if (lsGet(MAX_KEY) === "1") setMaximized(true);
        const lp = Number(lsGet(LEFT_KEY));
        if (lp >= 28 && lp <= 72) setLeftPaneSize(lp);
        const ep = Number(lsGet(EDITOR_KEY));
        if (ep >= 20 && ep <= 88) setEditorPaneSize(ep);
    }, []);

    // Persist layout prefs.
    useEffect(() => { lsSet(MAX_KEY, maximized ? "1" : "0"); }, [maximized]);
    useEffect(() => { lsSet(LEFT_KEY, String(Math.round(leftPaneSize))); }, [leftPaneSize]);
    useEffect(() => { lsSet(EDITOR_KEY, String(Math.round(editorPaneSize))); }, [editorPaneSize]);

    // Esc exits maximize; lock body scroll while maximized.
    useEffect(() => {
        if (!maximized) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMaximized(false);
        };
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [maximized]);

    // Drag the vertical divider between the problem pane and the editor column.
    const startHorizDrag = (e: React.PointerEvent) => {
        const c = horizSplitRef.current;
        if (!c) return;
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        const onMove = (ev: PointerEvent) => {
            const pct = ((ev.clientX - rect.left) / rect.width) * 100;
            setLeftPaneSize(Math.min(72, Math.max(28, pct)));
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    };

    // Drag the horizontal divider between the editor and the console.
    const startVertDrag = (e: React.PointerEvent) => {
        const c = rightColRef.current;
        if (!c) return;
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        const onMove = (ev: PointerEvent) => {
            const pct = ((ev.clientY - rect.top) / rect.height) * 100;
            setEditorPaneSize(Math.min(88, Math.max(20, pct)));
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
    };

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
            // Initialise the editor only once, restoring any saved draft so
            // re-fetches (after auth resolves / after a submit) and reloads
            // never clobber the user's language choice or typed code.
            if (!editorSeededRef.current) {
                editorSeededRef.current = true;
                if (data.problem.kind === "sql") {
                    setLanguage("sql");
                    setCode(lsGet(draftKey(slug, "sql")) ?? "-- Write your query\n");
                } else {
                    const langs: CodeLanguage[] = data.problem.languages || ["python"];
                    const savedLang = lsGet(langKey(slug)) as CodeLanguage | null;
                    const lang = savedLang && langs.includes(savedLang) ? savedLang : langs.includes("python") ? "python" : langs[0];
                    setLanguage(lang);
                    const starter = (data.problem.starters || []).find((s: any) => s.language === lang);
                    setCode(lsGet(draftKey(slug, lang)) ?? starter?.code ?? "");
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [slug, firebaseUser]);

    // Wait for Firebase auth to resolve before the first fetch — otherwise a
    // hard reload fires an unauthenticated request and progress comes back null.
    useEffect(() => {
        if (authLoading) return;
        load();
    }, [load, authLoading]);

    // Persist code edits per (problem, language).
    const onCodeChange = (v: string | undefined) => {
        const next = v || "";
        setCode(next);
        lsSet(draftKey(slug, language), next);
    };

    const onLanguageChange = (lang: CodeLanguage) => {
        setLanguage(lang);
        lsSet(langKey(slug), lang);
        // Restore this language's saved draft, else fall back to the starter.
        const starter = problem?.starters.find((s) => s.language === lang);
        setCode(lsGet(draftKey(slug, lang)) ?? starter?.code ?? "");
        setResetTick((t) => t + 1);
    };

    const resetCode = () => {
        if (!problem) return;
        lsRemove(draftKey(slug, language));
        if (problem.kind === "sql") {
            setCode("-- Write your query\n");
        } else {
            const starter = problem.starters.find((s) => s.language === language);
            setCode(starter?.code || "");
        }
        setResetTick((t) => t + 1);
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
                if (data.accepted) {
                    setMaximized(false);
                    fireCelebrate();
                }
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

    if (loading)
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" />
                    Loading problem…
                </div>
            </div>
        );
    if (error || !problem)
        return (
            <div className="container-page py-16 text-center">
                <p className="text-rose-700">{error || "Problem not found"}</p>
                <Link href="/practice/problems" className="mt-2 inline-block text-primary-700 hover:underline">← Back to problems</Link>
            </div>
        );

    const solved = progress?.status === "solved";
    const visibleResults = result?.results.filter((r) => !r.isHidden) ?? [];
    const hiddenCount = result?.results.filter((r) => r.isHidden).length ?? 0;
    const passRatio = result && result.totalCount ? result.passedCount / result.totalCount : 0;

    // Page-level paywall for premium-locked problems. We still render the
    // header so the URL is recognisable and SEO crawlers (which also bypass
    // the entitlement fetch) see the title, then swap the workspace for an
    // upgrade card. Wait for entitlements to resolve so we don't flash the
    // paywall to legitimate premium users on the first paint. Uses the
    // strict `isPremium` check (sourced from `isPaid`) so admin-flagged
    // premium content stays gated even when enforcement is still off.
    const problemLocked =
        problem.access === "premium" && entitlementsReady && !isPremium;
    const editorialLocked =
        problem.editorialAccess === "premium" && entitlementsReady && !isPremium;

    return (
        <main className="min-h-screen bg-slate-100">
            {/* Workspace top bar */}
            <div className="border-b border-slate-200 bg-white">
                <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/practice/problems"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                            ← Problems
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="font-display text-lg font-bold leading-tight text-slate-900">
                                    {problem.problemNumber != null && (
                                        <span className="mr-1 font-mono text-base text-slate-400">#{problem.problemNumber}</span>
                                    )}
                                    {problem.title}
                                </h1>
                                {solved && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                        ✓ Solved
                                    </span>
                                )}
                                {problem.access === "premium" && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200">
                                        ★ Premium
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${difficultyPill(problem.difficulty)}`}>
                                    {problem.difficulty}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/15">
                                    {patternMeta(problem.primaryPattern as any)?.label || problem.primaryPattern}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    {problem.kind}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div ref={horizSplitRef} className="container-page flex flex-col items-stretch gap-3 py-5 lg:flex-row lg:gap-0">
                {/* ───────────── Left: problem panel ───────────── */}
                <div
                    className={`flex h-auto min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-9.5rem)] lg:min-h-[32rem] ${maximized ? "lg:hidden" : ""}`}
                    style={isLgUp && !maximized ? { width: `${leftPaneSize}%`, flexBasis: `${leftPaneSize}%`, flexShrink: 0 } : undefined}
                >
                    {/* Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {([
                            ["desc", "Description"],
                            ["hints", problem.hints.length ? `Hints (${problem.hints.length})` : "Hints"],
                            ["editorial", editorialLocked ? "★ Editorial" : "Editorial"],
                            ["companies", problem.tags.length ? `Companies (${problem.tags.length})` : "Companies"],
                            ["solutions", "Solutions"],
                            ["discussion", "Discuss"],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={`relative shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition ${
                                    tab === key ? "text-primary-700" : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                {label}
                                {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-600" />}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                        {/* Revision banner (always shown when due) */}
                        {solved && progress?.dueAt && (
                            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
                                <span className="font-semibold">Revision Radar:</span> next review on{" "}
                                {new Date(progress.dueAt).toLocaleDateString("en-IN")} (in {progress.intervalDays} day
                                {progress.intervalDays === 1 ? "" : "s"}).
                            </div>
                        )}

                        {tab === "desc" && (
                            <>
                                {/* Statement — for premium-locked problems we wrap it in a
                                    relative container so the fade overlay can hang off its
                                    bottom edge, then immediately render the lock card. */}
                                {problemLocked ? (
                                    <div className="relative">
                                        <FormattedContent html={problem.statementHtml} className="prose-sm" />
                                        {/* Soft fade out from the statement's bottom into the
                                            lock card below. Pointer-events disabled so the
                                            statement text above stays selectable. */}
                                        <div
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-white/80 to-white"
                                        />
                                    </div>
                                ) : (
                                    <FormattedContent html={problem.statementHtml} className="prose-sm" />
                                )}

                                {/* Lock card right after the statement. */}
                                {problemLocked && (
                                    <div className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 shadow-md">
                                        <div className="p-6 text-center">
                                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-200">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-amber-700">
                                                    <rect x="5" y="11" width="14" height="9" rx="2" />
                                                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                                                </svg>
                                            </div>
                                            <h3 className="mt-3 font-display text-lg font-bold text-slate-900">
                                                Subscribe to unlock this problem
                                            </h3>
                                            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                                                Unlock the constraints, examples, hints, full editorial walkthrough, and code execution with priority judging.
                                            </p>
                                            <Link href={`/membership?redirect=/practice/problems/${slug}`}>
                                                <Button variant="primary" size="lg" className="mt-4">
                                                    View Premium plans →
                                                </Button>
                                            </Link>
                                            <p className="mt-3 text-[11px] text-slate-500">
                                                One subscription unlocks every premium problem, mock test, quiz, course &amp; editorial.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {problem.constraintsHtml && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Constraints</p>
                                        <FormattedContent html={problem.constraintsHtml} className="mt-1 text-sm" />
                                    </div>
                                )}

                                {/* SQL schema */}
                                {problem.kind === "sql" && problem.sql && (
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Schema</p>
                                        <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">{problem.sql.schemaSql}</pre>
                                    </div>
                                )}

                                {/* Examples — the server caps these at 2 for premium-locked
                                    problems so the user gets a real read of the spec before
                                    the paywall kicks in. */}
                                {problem.samples.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Examples</p>
                                        {problem.samples.map((s, i) => (
                                            <div key={i} className="overflow-hidden rounded-xl border border-slate-200">
                                                <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                                                    Example {i + 1}
                                                </div>
                                                <div className="space-y-2 p-3 text-sm">
                                                    <div>
                                                        <span className="text-xs font-medium text-slate-500">Input</span>
                                                        <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-2 font-mono text-xs">{s.input}</pre>
                                                    </div>
                                                    <div>
                                                        <span className="text-xs font-medium text-slate-500">Output</span>
                                                        <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-2 font-mono text-xs">{s.expectedOutput}</pre>
                                                    </div>
                                                    {s.explanation && <p className="text-xs text-slate-500">{s.explanation}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Pattern Lens — USP. Hidden when locked. */}
                                {!problemLocked && (
                                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                                    <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
                                        <span>🔍</span> Pattern Lens
                                    </p>
                                    <p className="mt-0.5 text-xs text-violet-700/80">
                                        Before the editorial — which pattern is this? Recognising patterns is the real interview skill.
                                    </p>
                                    {!lensResult ? (
                                        <div className="mt-3 space-y-1.5">
                                            {lensChoices.map((p) => (
                                                <label
                                                    key={p}
                                                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                                        lensChoice === p
                                                            ? "border-violet-400 bg-white"
                                                            : "border-transparent bg-white/60 hover:bg-white"
                                                    }`}
                                                >
                                                    <input type="radio" name="lens" value={p} checked={lensChoice === p} onChange={() => setLensChoice(p)} className="accent-violet-600" />
                                                    <span>{patternMeta(p as any)?.label || p}</span>
                                                </label>
                                            ))}
                                            <Button variant="outline" size="sm" disabled={!lensChoice || !isAuthenticated} onClick={answerLens} className="mt-1">
                                                {isAuthenticated ? "Check my guess" : "Sign in to use Pattern Lens"}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className={`mt-3 rounded-lg border p-3 text-sm ${lensResult.correct ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                                            {lensResult.correct ? "✓ Spot on — " : "✗ Not quite — it's "}
                                            <strong>{patternMeta(lensResult.correctPattern as any)?.label}</strong>. This counts toward your pattern-recognition score on the Mastery Map.
                                        </div>
                                    )}
                                </div>
                                )}
                            </>
                        )}

                        {tab === "hints" && (
                            <div className="space-y-2">
                                {problemLocked ? (
                                    <Paywall
                                        title="Hints are Premium"
                                        reason="Subscribe to unlock the staged hints for this problem — plus the editorial walkthrough and code execution."
                                    />
                                ) : problem.hints.length === 0 ? (
                                    <p className="text-sm text-slate-500">No hints for this problem — try the Pattern Lens or a mentor rescue.</p>
                                ) : (
                                    <>
                                        {problem.hints.slice(0, revealedHints).map((h, i) => (
                                            <div key={h.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                                <span className="font-semibold">Hint {i + 1}.</span> {h.text}
                                            </div>
                                        ))}
                                        {revealedHints < problem.hints.length ? (
                                            <Button variant="outline" size="sm" onClick={() => setRevealedHints((n) => n + 1)}>
                                                Reveal hint {revealedHints + 1} of {problem.hints.length}
                                            </Button>
                                        ) : (
                                            <p className="text-xs text-slate-400">All hints revealed.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {tab === "editorial" && (
                            <div>
                                {!problem.editorialHtml ? (
                                    <p className="text-sm text-slate-500">No editorial published yet.</p>
                                ) : editorialLocked ? (
                                    <Paywall
                                        title="Editorial is Premium"
                                        reason="The full solution walkthrough — approach, complexity, edge cases — is part of Premium. Hints above are free, give them a try first."
                                        perks={[
                                            "Detailed approach + complexity analysis for every problem",
                                            "Reference solutions in Python, JavaScript, C++ and Java",
                                            "Unlock all premium problems, mock tests, quizzes & courses",
                                            "Priority code execution — your submissions skip the queue",
                                        ]}
                                    />
                                ) : !showEditorial ? (
                                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                                        <p className="text-sm text-slate-500">Try the Pattern Lens first — then reveal the full solution walkthrough.</p>
                                        <Button variant="primary" size="sm" onClick={() => setShowEditorial(true)} className="mt-3">
                                            Reveal editorial
                                        </Button>
                                    </div>
                                ) : (
                                    <FormattedContent html={problem.editorialHtml} className="prose-sm" />
                                )}
                            </div>
                        )}

                        {tab === "companies" && (
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                    Asked at
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    Companies known to ask this question in interviews. Crowd-sourced from candidates &amp; mentors.
                                </p>
                                {problem.tags.length === 0 ? (
                                    <p className="mt-4 text-sm text-slate-500">
                                        No company tags yet for this problem.
                                    </p>
                                ) : (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {problem.tags.map((t) => (
                                            <span
                                                key={t}
                                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium capitalize text-slate-700 shadow-sm"
                                            >
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === "solutions" && (
                            <PracticeCommunity
                                mode="solutions"
                                problemId={problem.id}
                                slug={problem.slug}
                                firebaseUser={firebaseUser}
                                isAuthenticated={isAuthenticated}
                            />
                        )}

                        {tab === "discussion" && (
                            <PracticeCommunity
                                mode="discussion"
                                problemId={problem.id}
                                slug={problem.slug}
                                firebaseUser={firebaseUser}
                                isAuthenticated={isAuthenticated}
                            />
                        )}
                    </div>

                    {/* Mentor rescue footer */}
                    <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3">
                        {rescueDone ? (
                            <p className="text-sm text-emerald-700">{rescueDone}</p>
                        ) : !rescueOpen ? (
                            <button
                                onClick={() => (isAuthenticated ? setRescueOpen(true) : router.push(`/login?redirect=/practice/problems/${slug}`))}
                                className="text-sm font-medium text-primary-700 hover:underline"
                            >
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
                    </div>
                </div>

                {/* Horizontal resize handle (lg+, not maximized) */}
                {isLgUp && !maximized && (
                    <div
                        onPointerDown={startHorizDrag}
                        className="group hidden w-3 shrink-0 cursor-col-resize items-center justify-center lg:flex"
                        title="Drag to resize"
                    >
                        <span className="h-12 w-1 rounded-full bg-slate-300 transition group-hover:bg-primary-400" />
                    </div>
                )}

                {/* ───────────── Right: editor + console ───────────── */}
                <div
                    ref={rightColRef}
                    className={
                        maximized
                            ? "fixed inset-0 z-[60] flex flex-col gap-0 bg-slate-100 p-3"
                            : "flex h-[78vh] min-h-[26rem] flex-1 flex-col gap-0 lg:h-[calc(100vh-9.5rem)] lg:min-h-[32rem]"
                    }
                    style={isLgUp && !maximized ? { width: `${100 - leftPaneSize}%` } : undefined}
                >
                    {/* Editor */}
                    <div
                        className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#1e1e1e] shadow-sm"
                        style={{ flexBasis: `${editorPaneSize}%`, flexGrow: 0, flexShrink: 1 }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                            {problem.kind === "dsa" ? (
                                <div className="relative">
                                    <select
                                        className="appearance-none rounded-lg border border-white/15 bg-white/5 py-1.5 pl-3 pr-8 text-sm font-medium text-slate-200 outline-none focus:border-primary-400"
                                        value={language}
                                        onChange={(e) => onLanguageChange(e.target.value as CodeLanguage)}
                                    >
                                        {problem.languages.map((l) => (
                                            <option key={l} value={l} className="text-slate-900">{LANG_LABEL[l] || l}</option>
                                        ))}
                                    </select>
                                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">▾</span>
                                </div>
                            ) : (
                                <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200">SQL</span>
                            )}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={resetCode}
                                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                                    title="Reset to starter code"
                                >
                                    ↺ Reset
                                </button>
                                <button
                                    onClick={() => setMaximized((m) => !m)}
                                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                                    title={maximized ? "Exit fullscreen (Esc)" : "Maximize editor"}
                                    aria-label={maximized ? "Exit fullscreen" : "Maximize editor"}
                                >
                                    {maximized ? "⤡ Minimize" : "⤢ Maximize"}
                                </button>
                                {problemLocked ? (
                                    <Link href={`/membership?redirect=/practice/problems/${slug}`}>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            title="Subscribe to unlock Run & Submit"
                                            className="!bg-amber-500 hover:!bg-amber-600"
                                        >
                                            🔒 Subscribe to run
                                        </Button>
                                    </Link>
                                ) : (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => submit("run")} isLoading={running} className="!border-white/20 !bg-white/5 !text-slate-100 hover:!bg-white/10">
                                            Run
                                        </Button>
                                        <Button variant="primary" size="sm" onClick={() => submit("submit")} isLoading={running}>
                                            Submit
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="relative min-h-0 flex-1">
                            <MonacoEditor
                                key={`${language}-${resetTick}-${problemLocked ? "locked" : "open"}`}
                                height="100%"
                                language={MONACO_LANG[language] || "plaintext"}
                                theme="vs-dark"
                                value={
                                    problemLocked
                                        ? "// 🔒 This is a Premium problem.\n//\n// Subscribe to unlock the starter code,\n// run your solution, and submit for judging.\n//\n// → /membership\n"
                                        : code
                                }
                                onChange={problemLocked ? undefined : onCodeChange}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    padding: { top: 12 },
                                    readOnly: problemLocked,
                                    domReadOnly: problemLocked,
                                }}
                            />
                            {/* Subtle locked overlay so it's obvious the editor is read-only. */}
                            {problemLocked && (
                                <div className="pointer-events-none absolute bottom-3 right-4 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-md">
                                    🔒 Locked
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Vertical resize handle (editor | console) */}
                    <div
                        onPointerDown={startVertDrag}
                        className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center"
                        title="Drag to resize"
                    >
                        <span className="h-1 w-12 rounded-full bg-slate-300 transition group-hover:bg-primary-400" />
                    </div>

                    {/* Console / results */}
                    <div
                        className="flex min-h-[5rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                        style={{ flexBasis: `${100 - editorPaneSize}%`, flexGrow: 1, flexShrink: 1 }}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                            <p className="text-sm font-semibold text-slate-700">Console</p>
                            {result && (
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                        <span
                                            className={`block h-full rounded-full ${result.accepted ? "bg-emerald-500" : "bg-rose-500"}`}
                                            style={{ width: `${Math.round(passRatio * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-slate-500">
                                        {result.passedCount}/{result.totalCount}{result.runtimeMs ? ` · ${result.runtimeMs}ms` : ""}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3">
                            {running && !result ? (
                                <p className="flex items-center gap-2 text-sm text-slate-500">
                                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" />
                                    Running your code…
                                </p>
                            ) : !result ? (
                                <p className="text-sm text-slate-400">Run your code to see sample results here. Submit to run against all hidden tests.</p>
                            ) : (
                                <>
                                    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${verdictTone(result.verdict)}`}>
                                        <span>{result.accepted ? "✓" : result.verdict === "pending" ? "⏳" : "✕"}</span>
                                        {verdictLabel(result.verdict)}
                                    </div>
                                    {result.accepted && result.grade != null && (
                                        <p className="mt-2 text-xs text-emerald-700">
                                            Scheduled into Revision Radar (recall grade {result.grade}/5) — we&apos;ll bring it back before you forget.
                                        </p>
                                    )}
                                    <div className="mt-3 space-y-2">
                                        {visibleResults.map((r) => (
                                            <div key={r.index} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs">
                                                <p className={`font-semibold ${r.passed ? "text-emerald-700" : "text-rose-700"}`}>
                                                    {r.passed ? "✓" : "✕"} Test {r.index + 1}: {r.passed ? "passed" : "failed"}
                                                </p>
                                                {!r.passed && (
                                                    <div className="mt-1.5 grid gap-1.5">
                                                        {r.input != null && (
                                                            <div>
                                                                <span className="text-slate-400">Input</span>
                                                                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-slate-700">{String(r.input).slice(0, 600)}</pre>
                                                            </div>
                                                        )}
                                                        {r.expectedOutput != null && (
                                                            <div>
                                                                <span className="text-slate-400">Expected</span>
                                                                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-emerald-700">{String(r.expectedOutput).slice(0, 600)}</pre>
                                                            </div>
                                                        )}
                                                        {r.actualOutput != null && (
                                                            <div>
                                                                <span className="text-slate-400">Your output</span>
                                                                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-rose-700">{String(r.actualOutput).slice(0, 600)}</pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {hiddenCount > 0 && (
                                            <p className="text-xs text-slate-400">+ {hiddenCount} hidden test{hiddenCount === 1 ? "" : "s"} evaluated</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ───────────── Success celebration ───────────── */}
            {celebrate && (
                <div
                    role="button"
                    tabIndex={0}
                    onClick={dismissCelebrate}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === "Escape") dismissCelebrate(); }}
                    className={`fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-slate-900/30 backdrop-blur-[2px] ${celebrateOut ? "practice-fade-out" : "practice-fade-in"}`}
                >
                    {/* Confetti */}
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        {Array.from({ length: 70 }).map((_, i) => {
                            const colors = ["#22c55e", "#06b6d4", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#ef4444", "#14b8a6"];
                            const left = Math.random() * 100;
                            const delay = Math.random() * 0.9;
                            const duration = 2.4 + Math.random() * 1.8;
                            const size = 6 + Math.random() * 9;
                            const round = i % 4 === 0;
                            const sway = i % 2 === 0 ? "practice-confetti" : "practice-confetti-sway";
                            return (
                                <span
                                    key={i}
                                    className={`${sway} absolute top-[-10%] ${round ? "rounded-full" : "rounded-sm"}`}
                                    style={{
                                        left: `${left}%`,
                                        width: size,
                                        height: round ? size : size * 1.6,
                                        background: colors[i % colors.length],
                                        animationDelay: `${delay}s`,
                                        animationDuration: `${duration}s`,
                                    }}
                                />
                            );
                        })}
                    </div>

                    {/* Badge */}
                    <div className={`relative rounded-3xl border border-emerald-200 bg-white/95 px-10 py-8 text-center shadow-2xl ${celebrateOut ? "practice-badge-out" : "practice-pop"}`}>
                        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
                            <span className="practice-ring absolute inset-0 rounded-full bg-emerald-400/40" />
                            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                                <svg viewBox="0 0 24 24" className="practice-check h-9 w-9 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6 9 17l-5-5" />
                                </svg>
                            </span>
                        </div>
                        <p className="mt-4 font-display text-2xl font-bold text-slate-900">Accepted! 🎉</p>
                        <p className="mt-1 text-sm text-slate-500">
                            {result?.passedCount}/{result?.totalCount} tests passed
                            {result?.grade != null ? " · scheduled for revision" : ""}
                        </p>
                        <p className="mt-4 text-xs text-slate-400">Click anywhere to continue</p>
                    </div>
                </div>
            )}
        </main>
    );
}
