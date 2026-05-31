"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Skeleton, SkeletonList } from "@digimine/ui";
import { Flame } from "lucide-react";
import Heatmap, { HeatmapLegend } from "@/components/practice/Heatmap";

type Stats = {
    solved: number; easy: number; medium: number; hard: number;
    currentStreak: number; longestStreak: number; solutionsPosted: number; discussionsStarted: number;
};
type Profile = { userId: string; name: string; avatarUrl: string | null; bio: string | null; joinedAt: string | null; stats: Stats };
type Post = { id: string; title: string; problemSlug: string; upvotes: number; createdAt: string };

export default function PublicProfilePage() {
    const params = useParams();
    const uid = params.uid as string;
    const [profile, setProfile] = useState<Profile | null>(null);
    const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
    const [solutions, setSolutions] = useState<Post[]>([]);
    const [discussions, setDiscussions] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/practice/profile/${encodeURIComponent(uid)}`)
            .then((r) => r.json())
            .then((d) => {
                if (d.error) { setError(d.error); return; }
                setProfile(d.profile);
                setHeatmap(d.heatmap || []);
                setSolutions(d.solutions || []);
                setDiscussions(d.discussions || []);
            })
            .catch(() => setError("Failed to load profile"))
            .finally(() => setLoading(false));
    }, [uid]);

    if (loading)
        return (
            <main className="min-h-screen bg-slate-50">
                <section className="border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950">
                    <div className="container-page flex flex-wrap items-center gap-5 py-10">
                        <Skeleton circle className="h-20 w-20 bg-white/20" />
                        <div className="space-y-2">
                            <Skeleton className="h-7 w-48 bg-white/20" />
                            <Skeleton className="h-3 w-64 bg-white/10" />
                        </div>
                    </div>
                </section>
                <div className="container-page space-y-8 py-10">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Card key={i} className="p-5">
                                <Skeleton className="h-8 w-14" />
                                <Skeleton className="mt-2 h-3 w-20" />
                            </Card>
                        ))}
                    </div>
                    <Card className="p-6">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-4 h-24 w-full" />
                    </Card>
                    <div className="grid gap-6 lg:grid-cols-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <Card key={i} className="p-6">
                                <Skeleton className="h-5 w-44" />
                                <div className="mt-4"><SkeletonList rows={4} /></div>
                            </Card>
                        ))}
                    </div>
                </div>
            </main>
        );
    if (error || !profile)
        return (
            <div className="container-page py-16 text-center">
                <p className="text-rose-700">{error || "Profile not found"}</p>
                <Link href="/practice" className="mt-2 inline-block text-primary-700 hover:underline">← Practice hub</Link>
            </div>
        );

    const s = profile.stats;
    const joined = profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : null;

    return (
        <main className="min-h-screen bg-slate-50">
            {/* Header */}
            <section className="on-dark border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 text-white">
                <div className="container-page flex flex-wrap items-center gap-5 py-10">
                    {profile.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/20" />
                    ) : (
                        <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-500/30 text-3xl font-bold text-white ring-2 ring-white/20">
                            {profile.name.slice(0, 1).toUpperCase()}
                        </span>
                    )}
                    <div>
                        <h1 className="font-display text-3xl font-bold text-white">{profile.name}</h1>
                        {profile.bio && <p className="mt-1 max-w-xl text-sm text-slate-300">{profile.bio}</p>}
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            {joined && <>Joined {joined} · </>}
                            <Flame
                                className="h-3.5 w-3.5 text-amber-500"
                                strokeWidth={1.75}
                                fill="currentColor"
                                aria-hidden
                            />
                            {s.currentStreak}-day streak (best {s.longestStreak})
                        </p>
                    </div>
                </div>
            </section>

            <div className="container-page space-y-8 py-10">
                {/* Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        { label: "Solved", value: s.solved, tone: "text-emerald-600" },
                        { label: "Solutions posted", value: s.solutionsPosted, tone: "text-primary-700" },
                        { label: "Discussions", value: s.discussionsStarted, tone: "text-sky-600" },
                        { label: "Longest streak", value: `${s.longestStreak}d`, tone: "text-amber-600" },
                    ].map((c) => (
                        <Card key={c.label} className="p-5">
                            <p className={`text-3xl font-bold ${c.tone}`}>{c.value}</p>
                            <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{c.label}</p>
                        </Card>
                    ))}
                </div>

                {/* Activity heatmap */}
                {heatmap.length > 0 && (
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Practice activity</h2>
                        <div className="mt-4">
                            <Heatmap data={heatmap} />
                        </div>
                        <div className="mt-3">
                            <HeatmapLegend />
                        </div>
                    </Card>
                )}

                {/* Difficulty */}
                <Card className="p-6">
                    <h2 className="text-lg font-semibold text-slate-900">Solved by difficulty</h2>
                    <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                        {[
                            { label: "Easy", val: s.easy, tone: "text-emerald-600" },
                            { label: "Medium", val: s.medium, tone: "text-amber-600" },
                            { label: "Hard", val: s.hard, tone: "text-rose-600" },
                        ].map((d) => (
                            <div key={d.label} className="rounded-xl border border-slate-200 p-4">
                                <p className={`text-2xl font-bold ${d.tone}`}>{d.val}</p>
                                <p className="text-xs text-slate-500">{d.label}</p>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Posts */}
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Published solutions</h2>
                        {solutions.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">No solutions yet.</p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {solutions.map((p) => (
                                    <Link key={p.id} href={`/practice/problems/${p.problemSlug}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:border-primary-300">
                                        <span className="truncate text-sm text-slate-700">{p.title}</span>
                                        <span className="text-xs text-slate-400">▲ {p.upvotes}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Discussions started</h2>
                        {discussions.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">No discussions yet.</p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {discussions.map((p) => (
                                    <Link key={p.id} href={`/practice/problems/${p.problemSlug}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:border-primary-300">
                                        <span className="truncate text-sm text-slate-700">{p.title}</span>
                                        <span className="text-xs text-slate-400">▲ {p.upvotes}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </main>
    );
}
