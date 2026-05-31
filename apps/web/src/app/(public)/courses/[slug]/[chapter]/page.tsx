"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { getCourseBySlug, getCourseChapters, getCourseEnrollment } from "@/lib/firestore/courses";
import { chapterSlug, CourseSubtopic } from "@/components/courses/chapter";
import type { Course, CourseNoteChapter } from "@digimine/types";

export default function CourseChapterPage({ params }: { params: { slug: string; chapter: string } }) {
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const [course, setCourse] = useState<Course | null>(null);
    const [chapters, setChapters] = useState<CourseNoteChapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        // Wait until auth is resolved so paid-course enrollment checks are accurate.
        if (authLoading) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                const courseData = await getCourseBySlug(params.slug);
                if (cancelled) return;
                if (!courseData) {
                    router.replace("/courses");
                    return;
                }
                setCourse(courseData);

                // Gate exactly like the overview: free → open; paid → enrolled only.
                let canRead = courseData.accessType === "free";
                if (!canRead && firebaseUser) {
                    const enrollment = await getCourseEnrollment(firebaseUser.uid, courseData.id);
                    canRead = enrollment?.status === "active";
                }
                if (cancelled) return;
                if (!canRead) {
                    // Bounce locked users back to the overview where they can enrol/buy.
                    setDenied(true);
                    router.replace(`/courses/${params.slug}`);
                    return;
                }

                const notes = await getCourseChapters(courseData.id);
                if (cancelled) return;
                setChapters(notes);
                if (!notes.some((c) => chapterSlug(c) === params.chapter)) setNotFound(true);
            } catch (err) {
                console.error("Error loading chapter:", err);
                if (!cancelled) router.replace(`/courses/${params.slug}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [authLoading, firebaseUser, params.slug, params.chapter, router]);

    const currentIndex = useMemo(
        () => chapters.findIndex((c) => chapterSlug(c) === params.chapter),
        [chapters, params.chapter]
    );
    const current = currentIndex >= 0 ? chapters[currentIndex] : null;
    const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

    if (loading || denied) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    if (notFound || !current || !course) {
        return (
            <div className="container-page py-20 text-center">
                <h1 className="text-2xl font-black text-slate-950">Chapter not found</h1>
                <p className="mt-2 text-slate-500">This chapter doesn’t exist in the course.</p>
                <Link
                    href={`/courses/${params.slug}`}
                    className="mt-6 inline-flex rounded-xl bg-[#020617] px-5 py-3 text-sm font-bold text-white hover:bg-[#1e293b]"
                >
                    Back to course
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Breadcrumb */}
            <div className="border-b border-slate-200 bg-white">
                <nav className="container-page flex flex-wrap items-center gap-2 py-4 text-sm text-slate-500">
                    <Link href="/courses" className="hover:text-primary-700">Courses</Link>
                    <span className="text-slate-300">/</span>
                    <Link href={`/courses/${course.slug}`} className="max-w-[40ch] truncate hover:text-primary-700">{course.title}</Link>
                    <span className="text-slate-300">/</span>
                    <span className="font-semibold text-slate-700">{current.title}</span>
                </nav>
            </div>

            <div className="container-page grid gap-8 py-10 lg:grid-cols-[280px_minmax(0,1fr)]">
                {/* Sidebar: chapter table of contents */}
                <aside className="lg:sticky lg:top-24 lg:self-start">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <p className="px-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">Chapters</p>
                        <ol className="mt-3 space-y-1">
                            {chapters.map((c, i) => {
                                const active = i === currentIndex;
                                return (
                                    <li key={c.id}>
                                        <Link
                                            href={`/courses/${course.slug}/${chapterSlug(c)}`}
                                            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                                                active
                                                    ? "bg-primary-50 font-bold text-primary-800 dark:bg-primary-500/10 dark:text-primary-200"
                                                    : "text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${active ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                                {i + 1}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block leading-snug">{c.title}</span>
                                                <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">
                                                    {(c.subtopics || []).length} subtopics
                                                </span>
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </aside>

                {/* Main: the chapter's content */}
                <main className="min-w-0">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-10">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-600">
                            Chapter {currentIndex + 1} of {chapters.length}
                        </p>
                        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{current.title}</h1>
                        {current.description && <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-600">{current.description}</p>}

                        <div className="mt-8">
                            {(current.subtopics || []).length > 0 ? (
                                (current.subtopics || []).map((subtopic, i) => (
                                    <CourseSubtopic key={subtopic.id} subtopic={subtopic} index={i} />
                                ))
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                                    Notes for this chapter are being prepared.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Prev / Next navigation */}
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {prev ? (
                            <Link
                                href={`/courses/${course.slug}/${chapterSlug(prev)}`}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">← Previous</p>
                                <p className="mt-1 font-bold text-slate-950 group-hover:text-primary-800">{prev.title}</p>
                            </Link>
                        ) : (
                            <div />
                        )}
                        {next ? (
                            <Link
                                href={`/courses/${course.slug}/${chapterSlug(next)}`}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Next →</p>
                                <p className="mt-1 font-bold text-slate-950 group-hover:text-primary-800">{next.title}</p>
                            </Link>
                        ) : (
                            <Link
                                href={`/courses/${course.slug}`}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Finish →</p>
                                <p className="mt-1 font-bold text-slate-950 group-hover:text-primary-800">Back to course overview</p>
                            </Link>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
