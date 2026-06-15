"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { JobOpening } from "@digimine/types";
import { useAuthContext } from "@/contexts/AuthContext";
import JobPanel from "@/components/jobs/JobPanel";
import { SOURCE_META, sourceLabel } from "@/components/jobs/sourceMeta";

// Leaflet touches `window`, so the map is client-only.
const JobMap = dynamic(() => import("@/components/jobs/JobMap"), {
    ssr: false,
    loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div>,
});

type View = "map" | "list";
const TYPE_FILTERS = [
    { key: "all", label: "All roles" },
    { key: "full_time", label: "Full-time" },
    { key: "internship", label: "Internship" },
    { key: "contract", label: "Contract" },
];
// "Posted within" — value is the max age in days ("all" = any time).
const POSTED_OPTIONS = [
    { key: "all", label: "Any time" },
    { key: "1", label: "Past 24 hours" },
    { key: "3", label: "Past 3 days" },
    { key: "7", label: "Past week" },
    { key: "30", label: "Past month" },
];
export default function StudentJobsPage() {
    const { firebaseUser } = useAuthContext();
    const [jobs, setJobs] = useState<JobOpening[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [hidden, setHidden] = useState<Set<string>>(() => new Set());
    const [remoteOnly, setRemoteOnly] = useState(false);
    const [postedWithin, setPostedWithin] = useState("all");
    const [view, setView] = useState<View>("map");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError(null);
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/student/jobs`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Failed to load openings.");
            setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        } catch (e: any) {
            setError(e?.message || "Couldn't load job openings.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const sources = useMemo(() => Array.from(new Set(jobs.map((j) => j.source))), [jobs]);
    const sourceCounts = useMemo(() => {
        const m: Record<string, number> = {};
        for (const j of jobs) m[j.source] = (m[j.source] || 0) + 1;
        return m;
    }, [jobs]);
    const toggleSource = (s: string) =>
        setHidden((prev) => {
            const n = new Set(prev);
            if (n.has(s)) n.delete(s);
            else n.add(s);
            return n;
        });

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        const cutoff = postedWithin === "all" ? 0 : Date.now() - Number(postedWithin) * 86_400_000;
        return jobs.filter((j) => {
            if (remoteOnly && !j.remote) return false;
            if (cutoff) {
                const t = j.postedAt ? new Date(j.postedAt).getTime() : NaN;
                if (!Number.isFinite(t) || t < cutoff) return false;
            }
            if (typeFilter !== "all" && !(j.type || "").toLowerCase().includes(typeFilter)) return false;
            if (hidden.has(j.source)) return false;
            if (q) {
                const hay = `${j.title} ${j.company} ${j.location.city || ""} ${j.location.raw || ""} ${j.tags.join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [jobs, query, typeFilter, hidden, remoteOnly, postedWithin]);

    const stats = useMemo(() => {
        const cities = new Set<string>();
        let remote = 0;
        let mapped = 0;
        for (const j of filtered) {
            if (j.location.city) cities.add(j.location.city);
            if (j.remote) remote++;
            if (j.location.lat != null) mapped++;
        }
        return { total: filtered.length, cities: cities.size, remote, mapped };
    }, [filtered]);

    const selected = useMemo(() => filtered.find((j) => j.id === selectedId) || null, [filtered, selectedId]);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-semibold tracking-tight text-token-foreground">Job Intelligence</h1>
                <p className="mt-1 text-sm text-token-muted">
                    Live openings plotted by where they&apos;re hiring — from us and the open job web.
                </p>
            </div>

            {/* Dark intel console */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220] text-slate-200 shadow-soft-xl">
                {/* Header: stats + view toggle */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Stat value={stats.total} label="openings" accent />
                        <Stat value={stats.cities} label="cities" />
                        <Stat value={stats.remote} label="remote" />
                        <Stat value={stats.mapped} label="on map" />
                    </div>
                    <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
                        {(["map", "list"] as View[]).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`rounded-md px-3 py-1 font-medium capitalize transition ${
                                    view === v ? "bg-teal-500 text-slate-950" : "text-slate-300 hover:text-white"
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
                    <div className="relative grow sm:grow-0">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search role, company, city…"
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none sm:w-72"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {TYPE_FILTERS.map((t) => (
                            <Chip key={t.key} active={typeFilter === t.key} onClick={() => setTypeFilter(t.key)}>
                                {t.label}
                            </Chip>
                        ))}
                        <Chip active={remoteOnly} onClick={() => setRemoteOnly((v) => !v)}>
                            Remote only
                        </Chip>
                        <select
                            value={postedWithin}
                            onChange={(e) => setPostedWithin(e.target.value)}
                            aria-label="Date posted"
                            className={`rounded-full border px-3 py-1 text-xs font-medium focus:outline-none ${
                                postedWithin === "all"
                                    ? "border-white/10 bg-white/5 text-slate-300"
                                    : "border-teal-400/40 bg-teal-500/15 text-teal-200"
                            }`}
                        >
                            {POSTED_OPTIONS.map((o) => (
                                <option key={o.key} value={o.key} className="bg-slate-900 text-white">
                                    {o.key === "all" ? o.label : `Posted: ${o.label}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    {sources.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                            <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                Layers
                            </span>
                            {sources.map((s) => {
                                const on = !hidden.has(s);
                                return (
                                    <button
                                        key={s}
                                        onClick={() => toggleSource(s)}
                                        title={`${on ? "Hide" : "Show"} ${sourceLabel(s)}`}
                                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                            on ? "bg-white/10 text-white" : "bg-white/5 text-slate-500"
                                        }`}
                                    >
                                        <span
                                            className="h-2.5 w-2.5 rounded-full"
                                            style={{ background: on ? SOURCE_META[s]?.color ?? "#2dd4bf" : "#475569" }}
                                        />
                                        {sourceLabel(s)}
                                        <span className="tabular-nums text-slate-400">{sourceCounts[s] ?? 0}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Body */}
                {loading ? (
                    <div className="grid h-[60vh] place-items-center text-sm text-slate-500">Loading openings…</div>
                ) : error ? (
                    <div className="grid h-[60vh] place-items-center gap-3 text-center">
                        <p className="text-sm text-slate-400">{error}</p>
                        <button onClick={load} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
                            Try again
                        </button>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="grid h-[60vh] place-items-center gap-2 px-6 text-center">
                        <p className="text-base font-semibold text-white">No openings yet</p>
                        <p className="max-w-sm text-sm text-slate-400">
                            Openings sourced from the open job web (and posted by us) will appear here on the map.
                        </p>
                    </div>
                ) : view === "map" ? (
                    <div className="relative flex h-[72vh] min-h-[520px]">
                        <div className="relative flex-1">
                            <JobMap jobs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
                        </div>
                        {/* Entity rail (md+) */}
                        <aside className="hidden w-[360px] shrink-0 border-l border-white/10 md:flex md:flex-col">
                            {selected ? (
                                <JobPanel job={selected} onClose={() => setSelectedId(null)} />
                            ) : (
                                <RailList jobs={filtered} onSelect={setSelectedId} />
                            )}
                        </aside>
                        {/* Mobile selected overlay */}
                        {selected && (
                            <div className="absolute inset-y-0 right-0 z-[500] w-full max-w-sm border-l border-white/10 bg-[#0b1220] md:hidden">
                                <JobPanel job={selected} onClose={() => setSelectedId(null)} />
                            </div>
                        )}
                    </div>
                ) : (
                    <ListView jobs={filtered} />
                )}
            </div>
        </div>
    );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
    return (
        <div className="flex items-baseline gap-1.5 rounded-lg bg-white/5 px-2.5 py-1">
            <span className={`text-base font-bold tabular-nums ${accent ? "text-teal-300" : "text-white"}`}>{value}</span>
            <span className="text-[11px] text-slate-400">{label}</span>
        </div>
    );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active ? "bg-teal-500 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
        >
            {children}
        </button>
    );
}

function locLabel(j: JobOpening) {
    return j.location.city || j.location.raw || (j.remote ? "Remote" : "—");
}

function RailList({ jobs, onSelect }: { jobs: JobOpening[]; onSelect: (id: string) => void }) {
    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {jobs.length} openings · select one
            </div>
            <div className="flex-1 overflow-y-auto">
                {jobs.map((j) => (
                    <button
                        key={j.id}
                        onClick={() => onSelect(j.id)}
                        className="block w-full border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5"
                    >
                        <div className="truncate text-sm font-medium text-white">{j.title}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-400">
                            {j.company} · {locLabel(j)}
                            {j.remote ? " · Remote" : ""}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ListView({ jobs }: { jobs: JobOpening[] }) {
    return (
        <div className="grid max-h-[72vh] grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.map((j) => (
                <div key={j.id} className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-300/80">{j.company}</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold text-white">{j.title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                        {locLabel(j)}
                        {j.remote ? " · Remote" : ""}
                        {j.type ? ` · ${j.type.replace(/_/g, " ")}` : ""}
                    </div>
                    <a
                        href={j.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex w-fit items-center gap-1 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400"
                    >
                        Apply →
                    </a>
                </div>
            ))}
        </div>
    );
}
