"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Search input on the 404 page. Routes to `/articles?q=<query>` because the
 * articles index already supports a `q` filter. Cheap, no API dependency, and
 * gives a 404'd user a fast way back to relevant content.
 */
export default function NotFoundSearch({ className = "" }: { className?: string }) {
    const router = useRouter();
    const [q, setQ] = useState("");

    return (
        <form
            className={`mx-auto flex w-full max-w-xl items-center gap-2 ${className}`}
            onSubmit={(e) => {
                e.preventDefault();
                const trimmed = q.trim();
                router.push(trimmed ? `/articles?q=${encodeURIComponent(trimmed)}` : "/articles");
            }}
        >
            <div className="relative flex-1">
                <svg
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                    type="search"
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search articles, topics, companies…"
                    className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    aria-label="Search the site"
                />
            </div>
            <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
                Search
            </button>
        </form>
    );
}
