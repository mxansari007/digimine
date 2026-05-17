"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@digimine/ui";
import { BookOpenIcon, ClockIcon, LockIcon, SearchIcon, TargetIcon } from "@/components/icons/AppIcons";
import { getPublishedQuizzes } from "@/lib/firestore/quizzes";
import type { Quiz, QuizAccessType } from "@digimine/types";

type AccessFilter = "all" | QuizAccessType;

export default function QuizzesPage() {
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");

    useEffect(() => {
        getPublishedQuizzes()
            .then(setQuizzes)
            .catch((error) => console.error("Failed to load quizzes:", error))
            .finally(() => setLoading(false));
    }, []);

    const categories = useMemo(() => {
        const values = quizzes
            .map((quiz) => quiz.category?.trim())
            .filter(Boolean) as string[];
        return ["all", ...Array.from(new Set(values))];
    }, [quizzes]);

    const filteredQuizzes = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return quizzes.filter((quiz) => {
            const matchesSearch = !q ||
                quiz.title.toLowerCase().includes(q) ||
                (quiz.shortDescription || "").toLowerCase().includes(q) ||
                (quiz.category || "").toLowerCase().includes(q) ||
                quiz.tags.some((tag) => tag.toLowerCase().includes(q));
            const matchesCategory = categoryFilter === "all" || quiz.category === categoryFilter;
            const matchesAccess = accessFilter === "all" || quiz.accessType === accessFilter;
            return matchesSearch && matchesCategory && matchesAccess;
        });
    }, [accessFilter, categoryFilter, quizzes, searchQuery]);

    const totalQuestions = quizzes.reduce((total, quiz) => total + (quiz.totalQuestions || 0), 0);
    const freeCount = quizzes.filter((quiz) => quiz.accessType === "free").length;
    const courseQuizCount = quizzes.filter((quiz) => quiz.accessType === "course_only").length;

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="relative overflow-hidden bg-slate-950 text-white">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
                <div className="container-page relative grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-20">
                    <div>
                        <span className="inline-flex rounded-full border border-primary-300/20 bg-primary-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-primary-100">
                            Topic practice engine
                        </span>
                        <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
                            Quick quizzes for every study session.
                        </h1>
                        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                            Practice concepts, formulas, code outputs, aptitude tricks, and course checkpoints without starting a full mock test.
                        </p>
                        <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                            <HeroStat label="Quizzes" value={quizzes.length} />
                            <HeroStat label="Questions" value={totalQuestions} />
                            <HeroStat label="Free" value={freeCount} />
                            <HeroStat label="Course" value={courseQuizCount} />
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur">
                        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-200">Today&apos;s practice</p>
                                    <h2 className="mt-2 text-2xl font-black text-white">Pick a drill</h2>
                                </div>
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-400/15 text-primary-100">
                                    <TargetIcon className="h-6 w-6" />
                                </div>
                            </div>
                            <div className="mt-6 space-y-3">
                                {[
                                    ["Concept recall", "Short memory checks"],
                                    ["Code output", "Trace snippets faster"],
                                    ["Course checkpoints", "Locked with course access"],
                                ].map(([title, detail]) => (
                                    <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
                                        <p className="font-black text-white">{title}</p>
                                        <p className="text-sm text-slate-400">{detail}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="container-page py-10">
                <div className="surface-panel mb-8 p-4 lg:p-5">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="relative">
                            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search quizzes by topic, company, or skill"
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

                {loading ? (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="h-80 animate-pulse rounded-3xl bg-white shadow-sm" />
                        ))}
                    </div>
                ) : filteredQuizzes.length === 0 ? (
                    <div className="surface-panel p-12 text-center">
                        <h2 className="text-2xl font-black text-slate-950">No quizzes found</h2>
                        <p className="mt-2 text-slate-500">Try another search or reset your filters.</p>
                    </div>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {filteredQuizzes.map((quiz) => (
                            <QuizCard key={quiz.id} quiz={quiz} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4">
            <p className="text-2xl font-black text-white">{value}</p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    );
}

function FilterButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
                active
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:bg-primary-50"
            }`}
        >
            {children}
        </button>
    );
}

function QuizCard({ quiz }: { quiz: Quiz }) {
    return (
        <Link href={`/quizzes/${quiz.slug}`} className="group block h-full">
            <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(15,23,42,0.14)]">
                <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                    {quiz.thumbnailURL ? (
                        <img src={quiz.thumbnailURL} alt={quiz.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.28),transparent_30%),linear-gradient(135deg,#020617,#0f172a_55%,#164e63)] text-white">
                            <TargetIcon className="h-14 w-14 text-primary-100" />
                        </div>
                    )}
                    <div className="absolute left-4 top-4 flex gap-2">
                        <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-black text-slate-950 shadow-sm">
                            {quiz.category || "General"}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-sm ${
                            quiz.accessType === "free" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}>
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
                            <span key={tag} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">
                                {tag}
                            </span>
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
