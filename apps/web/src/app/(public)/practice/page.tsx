"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

type Recommended = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    title: string;
    difficulty: "easy" | "medium" | "hard";
    primaryPattern: string;
};

type Dashboard = {
    stats: {
        solved: number;
        attempted: number;
        dueCount: number;
        streak: number;
        overallMastery: number;
        totalProblems: number;
    };
    weakest: { pattern: string; label: string; masteryScore: number }[];
    recommended: Recommended[];
};

function diffChip(d: string) {
    if (d === "easy") return "text-emerald-700 bg-emerald-50";
    if (d === "medium") return "text-amber-700 bg-amber-50";
    return "text-rose-700 bg-rose-50";
}

export default function PracticeHubPage() {
    const { firebaseUser, isAuthenticated, loading } = useAuthContext();
    const [data, setData] = useState<Dashboard | null>(null);
    const [busy, setBusy] = useState(true);

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

    return (
        <main className="bg-slate-50 min-h-screen">
            {/* Hero / pitch */}
            <section className="border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 text-white">
                <div className="container-page py-12 sm:py-16">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-300">Practice</p>
                    <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl">
                        Solve DSA & SQL — and actually <span className="text-primary-300">remember</span> it.
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                        Grinding 300 problems doesn&apos;t work if you forget them by interview day. We fix that with
                        three things LeetCode, GFG and TUF don&apos;t give you:
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
                            <Button variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10">
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

                {isAuthenticated && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                            {[
                                { label: "Solved", value: data?.stats.solved ?? 0, tone: "text-emerald-600" },
                                { label: "Day streak", value: data?.stats.streak ?? 0, tone: "text-amber-600" },
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

                        {/* Revision nudge */}
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

                        {/* Weakest patterns */}
                        {data?.weakest && data.weakest.length > 0 && (
                            <Card className="p-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-slate-900">Your weakest patterns</h2>
                                    <Link href="/practice/mastery" className="text-sm text-primary-700 hover:underline">
                                        Full mastery map →
                                    </Link>
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                    {data.weakest.map((w) => (
                                        <Link
                                            key={w.pattern}
                                            href={`/practice/problems?pattern=${encodeURIComponent(w.pattern)}`}
                                            className="rounded-xl border border-slate-200 p-4 hover:border-primary-300"
                                        >
                                            <p className="font-medium text-slate-900">{w.label}</p>
                                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div className="h-full bg-rose-500" style={{ width: `${w.masteryScore}%` }} />
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">{w.masteryScore}% mastery</p>
                                        </Link>
                                    ))}
                                </div>
                            </Card>
                        )}

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
                                                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                                                    {p.kind}
                                                </span>
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffChip(p.difficulty)}`}>
                                                    {p.difficulty}
                                                </span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </Card>
                        )}
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
                            <p className="mt-1 text-sm text-slate-500">Structured paths — the good part of GFG/TUF, kept.</p>
                        </Card>
                    </Link>
                </div>
            </div>
        </main>
    );
}
