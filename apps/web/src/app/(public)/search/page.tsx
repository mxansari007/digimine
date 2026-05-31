"use client";

/**
 * Full-page search results — landed on from the header dropdown's "See all
 * results" link, or from /not-found's search box. Hits the same `/api/search`
 * proxy as the header. Supports filtering by type via tabs.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@digimine/ui";

type Hit = {
    id: string;
    type: "article" | "problem" | "test" | "quiz" | "contest" | "course" | "product";
    title: string;
    description: string;
    url: string;
    category?: string;
    isFree?: boolean;
    _formatted?: { title?: string; description?: string };
};

const TYPE_LABEL: Record<Hit["type"], string> = {
    article: "Articles",
    problem: "Problems",
    test: "Test series",
    quiz: "Quizzes",
    contest: "Contests",
    course: "Courses",
    product: "Resources",
};

const TYPES: Hit["type"][] = [
    "article",
    "problem",
    "test",
    "quiz",
    "contest",
    "course",
    "product",
];

const TYPE_ACCENT: Record<Hit["type"], string> = {
    article: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    problem: "bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300",
    test: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    quiz: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    contest: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
    course: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
    product: "bg-slate-100 text-slate-700",
};

export default function SearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialQ = searchParams.get("q") || "";
    const initialType = (searchParams.get("type") || "") as Hit["type"] | "";

    const [q, setQ] = useState(initialQ);
    const [type, setType] = useState<Hit["type"] | "">(
        TYPES.includes(initialType as Hit["type"]) ? (initialType as Hit["type"]) : ""
    );
    const [hits, setHits] = useState<Hit[]>([]);
    const [loading, setLoading] = useState(false);
    const [unavailable, setUnavailable] = useState(false);

    // Keep URL in sync so refreshes / back-button preserve state.
    useEffect(() => {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (type) params.set("type", type);
        const next = params.toString();
        const url = next ? `/search?${next}` : "/search";
        router.replace(url, { scroll: false });
    }, [q, type, router]);

    useEffect(() => {
        const term = q.trim();
        if (!term) {
            setHits([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setUnavailable(false);
        (async () => {
            try {
                const params = new URLSearchParams({ q: term, limit: "20" });
                if (type) params.set("type", type);
                const res = await fetch(`/api/search?${params.toString()}`);
                if (res.status === 503) {
                    if (!cancelled) {
                        setUnavailable(true);
                        setHits([]);
                    }
                    return;
                }
                const data = (await res.json()) as { hits: Hit[] };
                if (!cancelled) setHits(Array.isArray(data.hits) ? data.hits : []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [q, type]);

    const counts = useMemo(() => {
        const map: Partial<Record<Hit["type"], number>> = {};
        for (const h of hits) map[h.type] = (map[h.type] || 0) + 1;
        return map;
    }, [hits]);

    return (
        <main className="bg-slate-50">
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-10">
                    <h1 className="font-display text-3xl font-bold text-slate-900">Search</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Across articles, problems, tests, quizzes, contests, courses, and resources.
                    </p>
                    <div className="relative mt-6 max-w-2xl">
                        <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                        >
                            <circle cx="11" cy="11" r="7" />
                            <path d="M21 21l-4.3-4.3" />
                        </svg>
                        <input
                            type="search"
                            value={q}
                            autoFocus
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search for anything…"
                            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                        />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            onClick={() => setType("")}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                type === ""
                                    ? "bg-[#0f172a] text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                            All {hits.length > 0 && `· ${hits.length}`}
                        </button>
                        {TYPES.map((t) => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    type === t
                                        ? "bg-[#0f172a] text-white"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                            >
                                {TYPE_LABEL[t]}
                                {counts[t] !== undefined && ` · ${counts[t]}`}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="container-page py-10">
                {unavailable ? (
                    <Card className="p-10 text-center">
                        <p className="text-sm text-slate-500">
                            Search is starting up — try again in a few seconds.
                        </p>
                    </Card>
                ) : !q.trim() ? (
                    <Card className="p-10 text-center text-sm text-slate-500">
                        Type something above to search.
                    </Card>
                ) : loading && hits.length === 0 ? (
                    <Card className="p-10 text-center text-sm text-slate-400">Searching…</Card>
                ) : hits.length === 0 ? (
                    <Card className="p-10 text-center">
                        <p className="text-slate-600">
                            No matches for{" "}
                            <span className="font-semibold text-slate-900">
                                &ldquo;{q.trim()}&rdquo;
                            </span>
                            .
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                            Try a shorter query or remove a filter.
                        </p>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {hits.map((h) => (
                            <Link key={h.id} href={h.url} className="block">
                                <Card className="flex items-start gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                                    <span
                                        className={`mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                            TYPE_ACCENT[h.type]
                                        }`}
                                    >
                                        {TYPE_LABEL[h.type].replace(/s$/, "")}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h3
                                            className="text-base font-semibold text-slate-900 [&_mark]:bg-amber-100 dark:[&_mark]:bg-amber-500/15 [&_mark]:px-0.5 [&_mark]:text-slate-900"
                                            // eslint-disable-next-line react/no-danger
                                            dangerouslySetInnerHTML={{
                                                __html: h._formatted?.title || h.title,
                                            }}
                                        />
                                        {h.description && (
                                            <p
                                                className="mt-1 text-sm text-slate-600 [&_mark]:bg-amber-100 dark:[&_mark]:bg-amber-500/15 [&_mark]:px-0.5 [&_mark]:text-slate-700"
                                                // eslint-disable-next-line react/no-danger
                                                dangerouslySetInnerHTML={{
                                                    __html:
                                                        h._formatted?.description ||
                                                        h.description,
                                                }}
                                            />
                                        )}
                                    </div>
                                    {h.isFree && (
                                        <span className="mt-0.5 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                            Free
                                        </span>
                                    )}
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
