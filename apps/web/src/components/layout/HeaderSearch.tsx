"use client";

/**
 * Header search — a compact icon trigger that opens a centered modal
 * with an instant-search input + dropdown. Pattern matches what users
 * expect from Algolia DocSearch, Linear's command bar, etc.
 *
 *  - Click the magnifier icon, or press `/` / Cmd-K / Ctrl-K anywhere on
 *    the page, to open the modal. Escape or click-outside closes it.
 *  - Input auto-focuses on open and clears on close.
 *  - 220ms debounce + in-flight abort so we don't fire a request per keystroke.
 *  - Keyboard: ↑/↓ to move, Enter to open the highlighted result (or jump
 *    to /search if nothing's highlighted), Escape to close.
 *  - Server proxy at `/api/search` keeps the Meilisearch master key off
 *    the browser; this component never sees credentials.
 *  - Renders silently when search is unconfigured (503) so launching
 *    without Meilisearch doesn't break the header.
 *  - Body scroll is locked while the modal is open.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    article: "Article",
    problem: "Problem",
    test: "Test series",
    quiz: "Quiz",
    contest: "Contest",
    course: "Course",
    product: "Resource",
};

const TYPE_ACCENT: Record<Hit["type"], string> = {
    article: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    problem: "bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300",
    test: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    quiz: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    contest: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
    course: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
    product: "bg-slate-100 text-slate-700",
};

const QUICK_LINKS: { label: string; href: string }[] = [
    { label: "Articles", href: "/articles" },
    { label: "Practice", href: "/practice" },
    { label: "Mock tests", href: "/tests" },
    { label: "Contests", href: "/contests" },
];

export default function HeaderSearch() {
    const [open, setOpen] = useState(false);

    // Global hotkeys: `/` and Cmd-K / Ctrl-K open the modal from anywhere.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Cmd/Ctrl + K — universal "open search" shortcut.
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen(true);
                return;
            }
            // "/" focuses search, but only when the user isn't in another input.
            if (e.key === "/") {
                const tgt = e.target as HTMLElement | null;
                const tag = tgt?.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tgt?.isContentEditable) return;
                e.preventDefault();
                setOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <>
            {/* Compact pure-icon trigger that expands with a label + kbd hint
                only on very wide viewports. Saves substantial horizontal room
                in the header next to the dropdowns. */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Search"
                title="Search (/ or ⌘K)"
                className="group inline-flex items-center gap-2 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 xl:border xl:border-slate-200 xl:bg-white xl:px-3"
            >
                <SearchIcon className="h-4 w-4" />
                <span className="hidden text-xs font-medium xl:inline">Search</span>
                <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 group-hover:border-primary-200 dark:group-hover:border-primary-500/25 group-hover:bg-white xl:inline-block">
                    /
                </kbd>
            </button>
            {open && <SearchModal onClose={() => setOpen(false)} />}
        </>
    );
}

function SearchModal({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [hits, setHits] = useState<Hit[]>([]);
    const [active, setActive] = useState(0);
    const [mounted, setMounted] = useState(false);

    // Wait for client mount before creating the portal (Next SSR).
    useEffect(() => {
        setMounted(true);
    }, []);

    // Autofocus + body scroll lock while the modal is open.
    useEffect(() => {
        inputRef.current?.focus();
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    // Escape closes (Enter / arrows are handled on the input).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Debounced fetch.
    useEffect(() => {
        const term = q.trim();
        if (!term) {
            setHits([]);
            setLoading(false);
            abortRef.current?.abort();
            return;
        }
        setLoading(true);
        const handle = setTimeout(async () => {
            abortRef.current?.abort();
            const ctl = new AbortController();
            abortRef.current = ctl;
            try {
                const res = await fetch(
                    `/api/search?q=${encodeURIComponent(term)}&limit=10`,
                    { signal: ctl.signal }
                );
                if (!res.ok) {
                    setHits([]);
                    setLoading(false);
                    return;
                }
                const data = (await res.json()) as { hits: Hit[] };
                setHits(Array.isArray(data.hits) ? data.hits : []);
                setActive(0);
            } catch (e) {
                if ((e as { name?: string })?.name !== "AbortError") setHits([]);
            } finally {
                setLoading(false);
            }
        }, 220);
        return () => clearTimeout(handle);
    }, [q]);

    const trimmed = useMemo(() => q.trim(), [q]);

    const goTo = useCallback(
        (url: string) => {
            onClose();
            router.push(url);
        },
        [onClose, router]
    );

    const onSubmit = useCallback(() => {
        if (!trimmed) return;
        const target = hits[active];
        goTo(target ? target.url : `/search?q=${encodeURIComponent(trimmed)}`);
    }, [trimmed, hits, active, goTo]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh] sm:pt-[15vh]"
        >
            {/* Backdrop */}
            <button
                type="button"
                aria-label="Close search"
                onClick={onClose}
                className="search-fade-in absolute inset-0 -z-10 bg-black/50 backdrop-blur-sm transition-opacity"
            />

            {/* Modal */}
            <div className="search-pop-in w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10">
                {/* Input row */}
                <div className="flex items-center gap-3 border-b border-slate-100 px-4">
                    <SearchIcon className="h-5 w-5 shrink-0 text-slate-400" />
                    <input
                        ref={inputRef}
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Search articles, problems, tests, quizzes…"
                        className="flex-1 bg-transparent py-4 text-base text-slate-900 caret-primary-500 outline-none placeholder:text-slate-400"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500 sm:inline-block">
                        Esc
                    </kbd>
                </div>

                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {!trimmed ? (
                        <div className="px-4 py-6">
                            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                                Jump to
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {QUICK_LINKS.map((l) => (
                                    <button
                                        key={l.href}
                                        onClick={() => goTo(l.href)}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:border-primary-300 dark:hover:border-primary-500/25 hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300"
                                    >
                                        {l.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-6 text-center text-xs text-slate-400">
                                Start typing to search the catalog.
                            </p>
                        </div>
                    ) : loading && hits.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-slate-400">
                            Searching…
                        </div>
                    ) : hits.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <p className="text-sm text-slate-600">
                                No matches for{" "}
                                <span className="font-semibold text-slate-900">
                                    &ldquo;{trimmed}&rdquo;
                                </span>
                                .
                            </p>
                            <p className="mt-2 text-xs text-slate-400">
                                Try a shorter query or check spelling.
                            </p>
                        </div>
                    ) : (
                        <ul className="py-2">
                            {hits.map((h, i) => {
                                const isActive = i === active;
                                return (
                                    <li key={h.id}>
                                        <Link
                                            href={h.url}
                                            onClick={onClose}
                                            onMouseEnter={() => setActive(i)}
                                            className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                                                isActive ? "bg-primary-50 dark:bg-primary-500/10" : "hover:bg-slate-50"
                                            }`}
                                        >
                                            <span
                                                className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                    TYPE_ACCENT[h.type]
                                                }`}
                                            >
                                                {TYPE_LABEL[h.type]}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className="truncate text-sm font-semibold text-slate-900 [&_mark]:bg-amber-100 dark:[&_mark]:bg-amber-500/15 [&_mark]:px-0.5 [&_mark]:text-slate-900"
                                                    // eslint-disable-next-line react/no-danger
                                                    dangerouslySetInnerHTML={{
                                                        __html: h._formatted?.title || h.title,
                                                    }}
                                                />
                                                {h.description && (
                                                    <p
                                                        className="mt-0.5 line-clamp-1 text-xs text-slate-500 [&_mark]:bg-amber-100 dark:[&_mark]:bg-amber-500/15 [&_mark]:px-0.5 [&_mark]:text-slate-700"
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
                                                <span className="mt-0.5 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                                    Free
                                                </span>
                                            )}
                                            <span
                                                aria-hidden
                                                className={`mt-1 shrink-0 text-slate-400 transition-transform ${
                                                    isActive ? "translate-x-0.5 text-primary-600" : ""
                                                }`}
                                            >
                                                ↵
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                                ↑↓
                            </kbd>
                            navigate
                        </span>
                        <span className="hidden items-center gap-1 sm:flex">
                            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                                ↵
                            </kbd>
                            open
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                                esc
                            </kbd>
                            close
                        </span>
                    </div>
                    {trimmed && (
                        <Link
                            href={`/search?q=${encodeURIComponent(trimmed)}`}
                            onClick={onClose}
                            className="font-semibold text-primary-700 hover:underline"
                        >
                            See all results →
                        </Link>
                    )}
                </div>
            </div>

        </div>,
        document.body
    );
}

function SearchIcon({ className = "" }: { className?: string }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
        </svg>
    );
}
