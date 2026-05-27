"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { Flame } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import Heatmap, { HeatmapLegend } from "@/components/practice/Heatmap";

type Recommended = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    title: string;
    difficulty: "easy" | "medium" | "hard";
    primaryPattern: string;
};

type PatternStat = {
    pattern: string;
    label: string;
    solved: number;
    wrong: number;
    total: number;
    attempted: number;
    accuracyPct: number;
    coveragePct: number;
    strength: number;
    weakness: number;
};
type Activity = { id: string; title: string; slug: string; kind: string; verdict: string; language: string; at: string };

type Dashboard = {
    stats: {
        solved: number;
        attempted: number;
        dueCount: number;
        streak: number;
        longestStreak: number;
        overallMastery: number;
        totalProblems: number;
        totalSubmissions: number;
        acceptanceRate: number;
        activeDays: number;
        submissionsToday: number;
        patternsTouched: number;
    };
    difficulty: { easy: number; medium: number; hard: number };
    kind: { dsa: number; sql: number };
    heatmap: { date: string; count: number }[];
    heatmapDays: number;
    weakest: PatternStat[];
    strongest: PatternStat[];
    recentActivity: Activity[];
    recommended: Recommended[];
};

function diffChip(d: string) {
    if (d === "easy") return "text-emerald-700 bg-emerald-50";
    if (d === "medium") return "text-amber-700 bg-amber-50";
    return "text-rose-700 bg-rose-50";
}

function verdictDot(v: string) {
    if (v === "accepted") return "bg-emerald-500";
    if (v === "pending") return "bg-slate-400";
    return "bg-rose-500";
}
function timeAgo(iso: string) {
    const diff = Date.now() - Date.parse(iso);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

// ── Skeleton loading ──
function Sk({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}
function SkRows({ n = 6 }: { n?: number }) {
    return (
        <div className="space-y-2.5">
            {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Sk className="h-3 w-4" />
                    <Sk className="h-3 flex-1" />
                    <Sk className="h-4 w-12 rounded-full" />
                </div>
            ))}
        </div>
    );
}
function DashboardSkeleton() {
    return (
        <>
            {/* Stat strip */}
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <Sk className="h-8 w-14" />
                        <Sk className="mt-2 h-3 w-20" />
                    </Card>
                ))}
            </div>
            {/* Problems (left) + content (right) */}
            <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
                <Card className="p-5">
                    <Sk className="h-5 w-24" />
                    <div className="mt-4"><SkRows n={8} /></div>
                </Card>
                <div className="space-y-6">
                    <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                        <Card className="p-6"><Sk className="h-5 w-32" /><Sk className="mt-4 h-24 w-full" /></Card>
                        <Card className="flex flex-col items-center p-6">
                            <Sk className="h-16 w-16 rounded-full" />
                            <Sk className="mt-3 h-8 w-10" />
                            <Sk className="mt-3 h-8 w-full rounded-xl" />
                        </Card>
                    </div>
                    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                        <Card className="p-6"><Sk className="h-5 w-40" /><div className="mt-4"><SkRows n={5} /></div></Card>
                        <Card className="p-6">
                            <Sk className="h-5 w-28" />
                            <div className="mt-4 space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-10 w-full rounded-xl" />)}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}

type ProblemRow = { id: string; slug: string; kind: string; title: string; difficulty: string; primaryPattern: string; problemNumber: number | null };

// Page size for the dashboard's left "Problems" panel. Small enough that the
// panel doesn't dominate the page; large enough that the user gets a real
// sense of the catalog without scrolling. Server-side paginated so we
// never ship more than this in one request.
const HUB_PAGE_SIZE = 15;

export default function PracticeHubPage() {
    const { firebaseUser, isAuthenticated, loading } = useAuthContext();
    const [data, setData] = useState<Dashboard | null>(null);
    const [busy, setBusy] = useState(true);
    const [problems, setProblems] = useState<ProblemRow[]>([]);
    const [problemsLoading, setProblemsLoading] = useState(true);
    const [problemPage, setProblemPage] = useState(1);
    const [problemTotalPages, setProblemTotalPages] = useState(1);
    const [problemTotal, setProblemTotal] = useState(0);

    useEffect(() => {
        if (loading) return;
        if (!firebaseUser) {
            setBusy(false);
            return;
        }
        teacherFetch(firebaseUser, "/api/practice/dashboard")
            .then((r) => r.json())
            .then((d) => setData(d?.stats ? d : null))
            .catch(() => setData(null))
            .finally(() => setBusy(false));
    }, [firebaseUser, loading]);

    // Paginated problem list — server returns problemNumber-sorted slices so
    // the dashboard never holds 1000+ rows in memory.
    useEffect(() => {
        setProblemsLoading(true);
        fetch(`/api/practice/problems?page=${problemPage}&pageSize=${HUB_PAGE_SIZE}`)
            .then((r) => r.json())
            .then((d) => {
                setProblems(Array.isArray(d.items) ? d.items : []);
                setProblemTotalPages(d.totalPages || 1);
                setProblemTotal(d.total || 0);
            })
            .catch(() => setProblems([]))
            .finally(() => setProblemsLoading(false));
    }, [problemPage]);

    return (
        <main className="bg-slate-50 min-h-screen">
            {/* Hero / pitch */}
            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 text-white">
                <div className="container-page py-12 sm:py-16">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-300">Practice</p>
                    <h1 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl">
                        Solve DSA & SQL — and actually <span className="text-primary-300">remember</span> it.
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                        Grinding 300 problems doesn&apos;t work if you forget them by interview day. We fix that
                        with three things most practice platforms don&apos;t give you:
                    </p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        {[
                            { t: "Revision Radar", d: "Spaced repetition resurfaces problems right before you'd forget them." },
                            { t: "Pattern Lens", d: "Classify the pattern before the editorial. Train recognition, not memorisation." },
                            { t: "Mentor Rescue", d: "Stuck? A real mentor sees your failing tests and nudges you — not a generic editorial." },
                        ].map((f) => (
                            <div key={f.t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                                <p className="font-semibold text-primary-200">{f.t}</p>
                                <p className="mt-1 text-sm text-slate-300">{f.d}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-7 flex flex-wrap gap-3">
                        <Link href="/practice/problems">
                            <Button size="lg">Start solving</Button>
                        </Link>
                        <Link href="/practice/sheets">
                            <Button variant="outline" size="lg" className="!border-white/40 !bg-transparent !text-white hover:!bg-white/10 hover:!text-white">
                                Browse sheets
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <div className="container-page py-10 space-y-8">
                {/* Signed-in dashboard */}
                {!loading && !isAuthenticated && (
                    <Card className="p-6 text-center">
                        <p className="text-slate-600">
                            <Link href="/login?redirect=/practice" className="font-semibold text-primary-700 hover:underline">
                                Sign in
                            </Link>{" "}
                            to track mastery, get spaced-repetition revisions, and personalised recommendations.
                        </p>
                    </Card>
                )}

                {isAuthenticated && busy && <DashboardSkeleton />}

                {isAuthenticated && !busy && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                            {[
                                { label: "Solved", value: data?.stats.solved ?? 0, tone: "text-emerald-600" },
                                { label: "Day streak", value: data?.stats.streak ?? 0, tone: "text-amber-600" },
                                { label: "Acceptance", value: `${data?.stats.acceptanceRate ?? 0}%`, tone: "text-sky-600" },
                                { label: "Due for revision", value: data?.stats.dueCount ?? 0, tone: "text-rose-600", href: "/practice/revision" },
                                { label: "Overall mastery", value: `${data?.stats.overallMastery ?? 0}%`, tone: "text-primary-700", href: "/practice/mastery" },
                                { label: "In progress", value: data?.stats.attempted ?? 0, tone: "text-slate-700" },
                            ].map((s) => {
                                const inner = (
                                    <Card className="p-5">
                                        <p className={`text-3xl font-bold ${s.tone}`}>{busy ? "…" : s.value}</p>
                                        <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{s.label}</p>
                                    </Card>
                                );
                                return s.href ? (
                                    <Link key={s.label} href={s.href}>{inner}</Link>
                                ) : (
                                    <div key={s.label}>{inner}</div>
                                );
                            })}
                        </div>

                        {/* ── Problems (fixed left column) + everything else (right) ── */}
                        <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
                          {/* LEFT — Problems list, paginated server-side, sticky on desktop */}
                          <Card className="p-5 lg:sticky lg:top-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-slate-900">Problems</h2>
                                    <Link href="/practice/problems" className="text-sm text-primary-700 hover:underline">
                                        View all →
                                    </Link>
                                </div>
                                <div className="mt-3 divide-y divide-slate-100">
                                    {problemsLoading ? (
                                        <div className="py-1"><SkRows n={8} /></div>
                                    ) : problems.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-slate-400">No problems yet.</p>
                                    ) : (
                                        problems.map((p) => (
                                            <Link
                                                key={p.id}
                                                href={`/practice/problems/${p.slug}`}
                                                className="flex items-center gap-2.5 py-2.5 hover:bg-slate-50"
                                            >
                                                <span className="w-7 text-right font-mono text-[11px] text-slate-400">
                                                    {p.problemNumber != null ? `#${p.problemNumber}` : "—"}
                                                </span>
                                                <span className="flex-1 truncate text-sm font-medium text-slate-800">{p.title}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${diffChip(p.difficulty)}`}>{p.difficulty}</span>
                                            </Link>
                                        ))
                                    )}
                                </div>
                                {/* Pagination footer — visible only when there's more than one page. */}
                                {problemTotalPages > 1 && (
                                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                                        <button
                                            type="button"
                                            onClick={() => setProblemPage((p) => Math.max(1, p - 1))}
                                            disabled={problemPage <= 1 || problemsLoading}
                                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            ← Prev
                                        </button>
                                        <span className="text-[11px] text-slate-500">
                                            Page <span className="font-semibold text-slate-700">{problemPage}</span> of {problemTotalPages}
                                            <span className="ml-1 text-slate-400">· {problemTotal} total</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setProblemPage((p) => Math.min(problemTotalPages, p + 1))}
                                            disabled={problemPage >= problemTotalPages || problemsLoading}
                                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Next →
                                        </button>
                                    </div>
                                )}
                            </Card>

                          {/* RIGHT — analytics + feeds restructured around Problems */}
                          <div className="space-y-6">
                        {/* Activity heatmap + streak — the distinctive bit */}
                        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                            <Card className="p-6">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-lg font-semibold text-slate-900">Practice activity</h2>
                                    <span className="text-xs text-slate-500">
                                        {data?.stats.activeDays ?? 0} active days · {data?.stats.totalSubmissions ?? 0} submissions
                                    </span>
                                </div>
                                <div className="mt-4">
                                    {data?.heatmap && <Heatmap data={data.heatmap} />}
                                </div>
                                <div className="mt-3">
                                    <HeatmapLegend />
                                </div>
                            </Card>

                            {/* Streak flame */}
                            <Card className="flex flex-col items-center justify-center p-6 text-center">
                                <div className="relative flex h-20 w-20 items-center justify-center">
                                    <Flame
                                        className="practice-flame h-14 w-14 text-amber-500"
                                        strokeWidth={1.75}
                                        fill="currentColor"
                                        aria-hidden
                                    />
                                </div>
                                <p className="mt-2 text-4xl font-bold text-amber-600">{data?.stats.streak ?? 0}</p>
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">day streak</p>
                                <div className="mt-3 w-full rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                    Longest streak <span className="font-semibold text-slate-800">{data?.stats.longestStreak ?? 0} days</span>
                                </div>
                                <p className="mt-2 text-xs text-slate-400">
                                    {(data?.stats.submissionsToday ?? 0) > 0
                                        ? "You've practiced today — keep it alive!"
                                        : "Solve one problem today to extend your streak."}
                                </p>
                            </Card>
                        </div>

                        {/* Revision nudge (full width) */}
                        {(data?.stats.dueCount ?? 0) > 0 && (
                            <Card intent="warning" className="p-5 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-amber-800">
                                        {data?.stats.dueCount} problem{data?.stats.dueCount === 1 ? "" : "s"} due for revision
                                    </p>
                                    <p className="text-sm text-amber-700/80">
                                        Review them today to lock them into long-term memory.
                                    </p>
                                </div>
                                <Link href="/practice/revision">
                                    <Button variant="primary">Start revision</Button>
                                </Link>
                            </Card>
                        )}

                        {/* ── Analytics + feed ── */}
                        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr] xl:items-start">
                            {/* Main column */}
                            <div className="space-y-6">
                                {/* Recommended next */}
                                {data?.recommended && data.recommended.length > 0 && (
                                    <Card className="p-6">
                                        <h2 className="text-lg font-semibold text-slate-900">Recommended for you</h2>
                                        <p className="text-sm text-slate-500">
                                            Picked to target your weakest patterns at the right difficulty.
                                        </p>
                                        <div className="mt-4 space-y-2">
                                            {data.recommended.map((p) => (
                                                <Link
                                                    key={p.id}
                                                    href={`/practice/problems/${p.slug}`}
                                                    className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:border-primary-300"
                                                >
                                                    <span className="font-medium text-slate-900">{p.title}</span>
                                                    <span className="flex items-center gap-2">
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400">{p.kind}</span>
                                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffChip(p.difficulty)}`}>
                                                            {p.difficulty}
                                                        </span>
                                                    </span>
                                                </Link>
                                            ))}
                                        </div>
                                    </Card>
                                )}

                                {/* Recent activity */}
                                <Card className="p-6">
                                    <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
                                    {data?.recentActivity && data.recentActivity.length > 0 ? (
                                        <div className="mt-3 space-y-1">
                                            {data.recentActivity.map((a) => (
                                                <Link
                                                    key={a.id}
                                                    href={a.slug ? `/practice/problems/${a.slug}` : "/practice/problems"}
                                                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                                                >
                                                    <span className={`h-2 w-2 shrink-0 rounded-full ${verdictDot(a.verdict)}`} />
                                                    <span className="flex-1 truncate text-sm text-slate-700">{a.title}</span>
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-400">{a.language || a.kind}</span>
                                                    <span className="text-xs text-slate-400">{timeAgo(a.at)}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="mt-3 text-sm text-slate-500">No submissions yet — solve your first problem to see it here.</p>
                                    )}
                                </Card>
                            </div>

                            {/* Side column */}
                            <div className="space-y-6">
                                {/* Focus areas — percentage-driven weakness */}
                                {data?.weakest && data.weakest.length > 0 && (
                                    <Card className="p-6">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-semibold text-slate-900">Focus areas</h2>
                                            <Link href="/practice/mastery" className="text-sm text-primary-700 hover:underline">
                                                Mastery map →
                                            </Link>
                                        </div>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Ranked by accuracy &amp; coverage — lowest first.
                                        </p>
                                        <div className="mt-4 space-y-3">
                                            {data.weakest.map((w) => {
                                                const tone =
                                                    w.strength < 40 ? "bg-rose-500" : w.strength < 70 ? "bg-amber-500" : "bg-emerald-500";
                                                return (
                                                    <Link
                                                        key={w.pattern}
                                                        href={`/practice/problems?pattern=${encodeURIComponent(w.pattern)}`}
                                                        className="block rounded-xl border border-slate-200 p-3 hover:border-primary-300"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <p className="font-medium text-slate-900">{w.label}</p>
                                                            <span className="text-xs font-semibold text-slate-500">{w.strength}%</span>
                                                        </div>
                                                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                            <div className={`h-full rounded-full ${tone}`} style={{ width: `${w.strength}%` }} />
                                                        </div>
                                                        <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                                                            <span>{w.solved}/{w.total} solved</span>
                                                            <span>· {w.accuracyPct}% accuracy</span>
                                                            {w.wrong > 0 && <span className="text-rose-600">· {w.wrong} unsolved</span>}
                                                        </p>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                        {data?.strongest && data.strongest.length > 0 && (
                                            <div className="mt-5 border-t border-slate-100 pt-4">
                                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Strongest</p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {data.strongest.map((s) => (
                                                        <Link
                                                            key={s.pattern}
                                                            href={`/practice/problems?pattern=${encodeURIComponent(s.pattern)}`}
                                                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 hover:bg-emerald-100"
                                                        >
                                                            {s.label}
                                                            <span className="text-emerald-500">{s.strength}%</span>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                )}

                                {/* Difficulty breakdown */}
                                <Card className="p-6">
                                    <h2 className="text-lg font-semibold text-slate-900">Solved by difficulty</h2>
                                    {(() => {
                                        const d = data?.difficulty ?? { easy: 0, medium: 0, hard: 0 };
                                        const rows = [
                                            { label: "Easy", val: d.easy, bar: "bg-emerald-500", text: "text-emerald-600" },
                                            { label: "Medium", val: d.medium, bar: "bg-amber-500", text: "text-amber-600" },
                                            { label: "Hard", val: d.hard, bar: "bg-rose-500", text: "text-rose-600" },
                                        ];
                                        const max = Math.max(1, ...rows.map((r) => r.val));
                                        return (
                                            <div className="mt-4 space-y-3">
                                                {rows.map((r) => (
                                                    <div key={r.label}>
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-slate-600">{r.label}</span>
                                                            <span className={`font-semibold ${r.text}`}>{r.val}</span>
                                                        </div>
                                                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                            <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${(r.val / max) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-slate-500">
                                                    <span>DSA <span className="font-semibold text-slate-800">{data?.kind.dsa ?? 0}</span></span>
                                                    <span>SQL <span className="font-semibold text-slate-800">{data?.kind.sql ?? 0}</span></span>
                                                    <span>Patterns <span className="font-semibold text-slate-800">{data?.stats.patternsTouched ?? 0}</span></span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </Card>
                            </div>
                        </div>
                          </div>{/* end right column */}
                        </div>{/* end Problems + content grid */}
                    </>
                )}

                {/* Always-visible entry points */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <Link href="/practice/problems?kind=dsa">
                        <Card className="p-6 h-full hover:border-primary-300">
                            <h3 className="font-semibold text-slate-900">DSA Problems</h3>
                            <p className="mt-1 text-sm text-slate-500">Arrays to DP — 24 patterns, judged in 4 languages.</p>
                        </Card>
                    </Link>
                    <Link href="/practice/problems?kind=sql">
                        <Card className="p-6 h-full hover:border-primary-300">
                            <h3 className="font-semibold text-slate-900">SQL Problems</h3>
                            <p className="mt-1 text-sm text-slate-500">Joins to window functions, run against real schemas.</p>
                        </Card>
                    </Link>
                    <Link href="/practice/sheets">
                        <Card className="p-6 h-full hover:border-primary-300">
                            <h3 className="font-semibold text-slate-900">Curated Sheets</h3>
                            <p className="mt-1 text-sm text-slate-500">Structured, ordered paths that take you from fundamentals to interview-ready.</p>
                        </Card>
                    </Link>
                </div>
            </div>
        </main>
    );
}
