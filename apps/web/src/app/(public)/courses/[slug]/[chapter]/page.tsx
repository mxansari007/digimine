"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { getCourseBySlug, getCourseChapters, getCourseEnrollment } from "@/lib/firestore/courses";
import { chapterSlug, subtopicSlug } from "@/components/courses/chapter";
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
                        <p className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Chapters</p>
                        <ol className="mt-3 space-y-0.5">
                            {chapters.map((c, i) => {
                                const active = i === currentIndex;
                                return (
                                    <li key={c.id}>
                                        <Link
                                            href={`/courses/${course.slug}/${chapterSlug(c)}`}
                                            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-[13px] transition ${
                                                active
                                                    ? "bg-primary-50 font-semibold text-primary-800 dark:bg-primary-500/10 dark:text-primary-200"
                                                    : "font-medium text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${active ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                                {i + 1}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block leading-snug">{c.title}</span>
                                                <span className="mt-0.5 block text-[11px] font-medium text-slate-400">
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
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-600">
                            Chapter {currentIndex + 1} of {chapters.length}
                        </p>
                        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{current.title}</h1>
                        {current.description && <p className="mt-3 max-w-3xl text-base leading-7 text-slate-500">{current.description}</p>}

                        <div className="mt-8 space-y-3">
                            {(current.subtopics || []).length > 0 ? (
                                (current.subtopics || []).map((subtopic, i) => (
                                    <Link
                                        key={subtopic.id}
                                        href={`/courses/${course.slug}/${chapterSlug(current)}/${subtopicSlug(subtopic)}`}
                                        className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition hover:border-primary-300 hover:bg-primary-50/30 dark:hover:bg-primary-500/5"
                                    >
                                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 group-hover:bg-primary-100 group-hover:text-primary-700 dark:group-hover:bg-primary-500/15 dark:group-hover:text-primary-300">
                                            {i + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-[15px] font-semibold leading-snug text-slate-800 group-hover:text-slate-950">{subtopic.title}</h3>
                                            {subtopic.summary && <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{subtopic.summary}</p>}
                                        </div>
                                        <svg className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-primary-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4L10.6 10 7.3 6.7a1 1 0 010-1.4z" clipRule="evenodd" /></svg>
                                    </Link>
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
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">← Previous</p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 group-hover:text-primary-800">{prev.title}</p>
                            </Link>
                        ) : (
                            <div />
                        )}
                        {next ? (
                            <Link
                                href={`/courses/${course.slug}/${chapterSlug(next)}`}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Next →</p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 group-hover:text-primary-800">{next.title}</p>
                            </Link>
                        ) : (
                            <Link
                                href={`/courses/${course.slug}`}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Finish →</p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 group-hover:text-primary-800">Back to course overview</p>
                            </Link>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
