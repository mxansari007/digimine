"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getPublishedCourses } from "@/lib/firestore/courses";
import type { Course } from "@digimine/types";

export default function CoursesPage() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [accessFilter, setAccessFilter] = useState<"all" | "free" | "enrollment_required">("all");

    useEffect(() => {
        getPublishedCourses()
            .then(setCourses)
            .catch((error) => console.error("Error loading courses:", error))
            .finally(() => setLoading(false));
    }, []);

    const filteredCourses = useMemo(() => {
        const q = query.toLowerCase();
        return courses.filter((course) => {
            const matchesAccess = accessFilter === "all" || course.accessType === accessFilter;
            const matchesQuery =
                course.title.toLowerCase().includes(q) ||
                course.shortDescription.toLowerCase().includes(q) ||
                (course.category || "").toLowerCase().includes(q) ||
                course.tags.some((tag) => tag.toLowerCase().includes(q));
            return matchesAccess && matchesQuery;
        });
    }, [accessFilter, courses, query]);

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="border-b border-slate-200 bg-white py-16">
                <div className="container-page">
                    <div className="max-w-3xl">
                        <p className="text-sm font-black uppercase tracking-[0.16em] text-primary-600">Study material</p>
                        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                            Courses, notes, quizzes, and exam prep paths
                        </h1>
                        <p className="mt-4 text-lg leading-8 text-slate-600">
                            Learn through chapter-wise notes, diagrams, embedded videos, attached test series, and topic quizzes.
                        </p>
                    </div>

                    <div className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr_220px]">
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search Computer Networks, OS, DBMS, DSA..."
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        />
                        <select
                            value={accessFilter}
                            onChange={(event) => setAccessFilter(event.target.value as typeof accessFilter)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                        >
                            <option value="all">All access</option>
                            <option value="free">Free courses</option>
                            <option value="enrollment_required">Enrollment courses</option>
                        </select>
                    </div>
                </div>
            </section>

            <section className="container-page py-12">
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
                    </div>
                ) : filteredCourses.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
                        <h2 className="text-xl font-bold text-slate-950">No courses found</h2>
                        <p className="mt-2 text-slate-500">Try another topic or access filter.</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {filteredCourses.map((course) => (
                            <Link
                                key={course.id}
                                href={`/courses/${course.slug}`}
                                className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
                            >
                                <div className="relative h-44 bg-slate-100">
                                    {course.thumbnailURL ? (
                                        <Image src={course.thumbnailURL} alt={course.title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 to-primary-900 text-white">
                                            <span className="text-5xl font-black">{course.title.slice(0, 1).toUpperCase()}</span>
                                        </div>
                                    )}
                                    <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-900 shadow-sm backdrop-blur">
                                        {course.accessType === "free" ? "Free" : `₹${course.price || 0}`}
                                    </span>
                                </div>
                                <div className="p-5">
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">
                                            {course.category || "Course"}
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600">
                                            {course.difficulty}
                                        </span>
                                        {course.accessType === "enrollment_required" && (
                                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                                                Paid enrollment
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="line-clamp-2 text-xl font-black text-slate-950">{course.title}</h2>
                                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{course.shortDescription}</p>
                                    <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                                        <div className="rounded-xl bg-slate-50 px-2 py-2">
                                            <p className="font-black text-slate-950">{course.notesSummary?.chapterCount || 0}</p>
                                            <p>Chapters</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-2 py-2">
                                            <p className="font-black text-slate-950">{course.notesSummary?.subtopicCount || 0}</p>
                                            <p>Topics</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-2 py-2">
                                            <p className="font-black text-slate-950">{course.linkedTestSeriesIds?.length || 0}</p>
                                            <p>Tests</p>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
