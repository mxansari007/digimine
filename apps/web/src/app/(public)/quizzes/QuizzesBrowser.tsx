"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@digimine/ui";
import { BookOpenIcon, ClockIcon, LockIcon, SearchIcon, TargetIcon } from "@/components/icons/AppIcons";
import type { QuizItem } from "@/lib/server/catalog";
import { LoadMoreButton } from "@/components/common";
import { useVisibleSlice } from "@/hooks/useVisibleSlice";

type AccessFilter = "all" | "free" | "course_only";

/**
 * Client-side search / category / access filter for the quiz catalog, seeded
 * with `quizzes` fetched on the server — so the SSR HTML already lists every
 * quiz card + link (crawlable) and filtering is instant in the browser.
 */
export default function QuizzesBrowser({ quizzes }: { quizzes: QuizItem[] }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");

    const categories = useMemo(() => {
        const values = quizzes.map((quiz) => quiz.category?.trim()).filter(Boolean) as string[];
        return ["all", ...Array.from(new Set(values))];
    }, [quizzes]);

    const filteredQuizzes = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return quizzes.filter((quiz) => {
            const matchesSearch =
                !q ||
                quiz.title.toLowerCase().includes(q) ||
                quiz.shortDescription.toLowerCase().includes(q) ||
                quiz.category.toLowerCase().includes(q) ||
                quiz.tags.some((tag) => tag.toLowerCase().includes(q));
            const matchesCategory = categoryFilter === "all" || quiz.category === categoryFilter;
            const matchesAccess = accessFilter === "all" || quiz.accessType === accessFilter;
            return matchesSearch && matchesCategory && matchesAccess;
        });
    }, [accessFilter, categoryFilter, quizzes, searchQuery]);

    const { visible, hasMore, remaining, loadMore } = useVisibleSlice(filteredQuizzes, 12);

    return (
        <>
            <div className="surface-panel mb-8 p-4 lg:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search quizzes by topic, company, or skill"
                            aria-label="Search quizzes"
                            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-semibold outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton active={accessFilter === "all"} onClick={() => setAccessFilter("all")}>All</FilterButton>
                        <FilterButton active={accessFilter === "free"} onClick={() => setAccessFilter("free")}>Free</FilterButton>
                        <FilterButton active={accessFilter === "course_only"} onClick={() => setAccessFilter("course_only")}>Course</FilterButton>
                    </div>
                </div>

                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {categories.map((category) => (
                        <button
                            key={category}
                            type="button"
                            onClick={() => setCategoryFilter(category)}
                            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                                categoryFilter === category
                                    ? "border-slate-950 bg-slate-950 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                            }`}
                        >
                            {category === "all" ? "All topics" : category}
                        </button>
                    ))}
                </div>
            </div>

            {filteredQuizzes.length === 0 ? (
                <div className="surface-panel p-12 text-center">
                    <h2 className="text-2xl font-black text-slate-950">No quizzes found</h2>
                    <p className="mt-2 text-slate-500">Try another search or reset your filters.</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map((quiz) => (
                            <QuizCard key={quiz.id} quiz={quiz} />
                        ))}
                    </div>
                    <LoadMoreButton
                        hasMore={hasMore}
                        remaining={remaining}
                        onLoadMore={loadMore}
                        label="Load more quizzes"
                    />
                </>
            )}
        </>
    );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
                active ? "border-primary-500 bg-primary-50 text-primary-700" : "border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50"
            }`}
        >
            {children}
        </button>
    );
}

function QuizCard({ quiz }: { quiz: QuizItem }) {
    return (
        <Link href={`/quizzes/${quiz.slug}`} className="group block h-full">
            <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(15,23,42,0.14)]">
                <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                    {quiz.thumbnailURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={quiz.thumbnailURL} alt={quiz.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.28),transparent_30%),linear-gradient(135deg,#020617,#0f172a_55%,#164e63)] text-white">
                            <TargetIcon className="h-14 w-14 text-primary-100" />
                        </div>
                    )}
                    <div className="absolute left-4 top-4 flex gap-2">
                        <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-black text-slate-950 shadow-sm">{quiz.category || "General"}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-sm ${quiz.accessType === "free" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {quiz.accessType === "free" ? <BookOpenIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
                            {quiz.accessType === "free" ? "Free" : "Course"}
                        </span>
                    </div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-black text-primary-700">
                            <TargetIcon className="h-3.5 w-3.5" />
                            {quiz.totalQuestions || 0} questions
                        </span>
                        {quiz.timeLimitMinutes ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                                <ClockIcon className="h-3.5 w-3.5" />
                                {quiz.timeLimitMinutes} mins
                            </span>
                        ) : null}
                    </div>
                    <h2 className="text-xl font-black text-slate-950">{quiz.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{quiz.shortDescription}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        {quiz.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">{tag}</span>
                        ))}
                    </div>
                    <Button className="mt-auto w-full translate-y-2 opacity-95 transition group-hover:translate-y-0 group-hover:opacity-100" variant="primary">
                        Open Quiz
                    </Button>
                </div>
            </article>
        </Link>
    );
}
