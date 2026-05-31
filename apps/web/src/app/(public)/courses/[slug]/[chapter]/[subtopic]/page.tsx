"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { getCourseBySlug, getCourseChapters, getCourseEnrollment } from "@/lib/firestore/courses";
import { chapterSlug, subtopicSlug, SubtopicBody } from "@/components/courses/chapter";
import type { Course, CourseNoteChapter, CourseNoteSubtopic } from "@digimine/types";

export default function CourseSubtopicPage({
    params,
}: {
    params: { slug: string; chapter: string; subtopic: string };
}) {
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const [course, setCourse] = useState<Course | null>(null);
    const [chapters, setChapters] = useState<CourseNoteChapter[]>([]);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [missing, setMissing] = useState(false);

    useEffect(() => {
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

                let canRead = courseData.accessType === "free";
                if (!canRead && firebaseUser) {
                    const enrollment = await getCourseEnrollment(firebaseUser.uid, courseData.id);
                    canRead = enrollment?.status === "active";
                }
                if (cancelled) return;
                if (!canRead) {
                    setDenied(true);
                    router.replace(`/courses/${params.slug}`);
                    return;
                }

                const notes = await getCourseChapters(courseData.id);
                if (cancelled) return;
                setChapters(notes);
                const ch = notes.find((c) => chapterSlug(c) === params.chapter);
                const sub = ch?.subtopics?.find((s) => subtopicSlug(s) === params.subtopic);
                if (!ch || !sub) setMissing(true);
            } catch (err) {
                console.error("Error loading subtopic:", err);
                if (!cancelled) router.replace(`/courses/${params.slug}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [authLoading, firebaseUser, params.slug, params.chapter, params.subtopic, router]);

    const chapter = useMemo(
        () => chapters.find((c) => chapterSlug(c) === params.chapter) || null,
        [chapters, params.chapter]
    );
    const subtopic: CourseNoteSubtopic | null = useMemo(
        () => chapter?.subtopics?.find((s) => subtopicSlug(s) === params.subtopic) || null,
        [chapter, params.subtopic]
    );

    // Flatten every subtopic across the whole course for continuous prev/next
    // reading that flows across chapter boundaries.
    const flat = useMemo(
        () => chapters.flatMap((c) => (c.subtopics || []).map((s) => ({ ch: c, s }))),
        [chapters]
    );
    const pos = useMemo(
        () => flat.findIndex(({ ch, s }) => chapterSlug(ch) === params.chapter && subtopicSlug(s) === params.subtopic),
        [flat, params.chapter, params.subtopic]
    );
    const prev = pos > 0 ? flat[pos - 1] : null;
    const next = pos >= 0 && pos < flat.length - 1 ? flat[pos + 1] : null;
    const subIndex = chapter ? (chapter.subtopics || []).findIndex((s) => s === subtopic) : -1;

    if (loading || denied) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    if (missing || !course || !chapter || !subtopic) {
        return (
            <div className="container-page py-20 text-center">
                <h1 className="text-2xl font-black text-slate-950">Topic not found</h1>
                <p className="mt-2 text-slate-500">This topic doesn’t exist in the course.</p>
                <Link
                    href={`/courses/${params.slug}/${params.chapter}`}
                    className="mt-6 inline-flex rounded-xl bg-[#020617] px-5 py-3 text-sm font-bold text-white hover:bg-[#1e293b]"
                >
                    Back to chapter
                </Link>
            </div>
        );
    }

    const subUrl = (chSlug: string, sSlug: string) => `/courses/${course.slug}/${chSlug}/${sSlug}`;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Breadcrumb */}
            <div className="border-b border-slate-200 bg-white">
                <nav className="container-page flex flex-wrap items-center gap-2 py-4 text-sm text-slate-500">
                    <Link href="/courses" className="hover:text-primary-700">Courses</Link>
                    <span className="text-slate-300">/</span>
                    <Link href={`/courses/${course.slug}`} className="max-w-[24ch] truncate hover:text-primary-700">{course.title}</Link>
                    <span className="text-slate-300">/</span>
                    <Link href={`/courses/${course.slug}/${chapterSlug(chapter)}`} className="max-w-[24ch] truncate hover:text-primary-700">{chapter.title}</Link>
                    <span className="text-slate-300">/</span>
                    <span className="font-semibold text-slate-700">{subtopic.title}</span>
                </nav>
            </div>

            <div className="container-page grid gap-8 py-10 lg:grid-cols-[280px_minmax(0,1fr)]">
                {/* Sidebar: this chapter's subtopics */}
                <aside className="lg:sticky lg:top-24 lg:self-start">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <Link
                            href={`/courses/${course.slug}/${chapterSlug(chapter)}`}
                            className="flex items-center gap-2 px-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400 hover:text-primary-700"
                        >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12.7 14.7a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4l4-4a1 1 0 011.4 1.4L9.4 10l3.3 3.3a1 1 0 010 1.4z" clipRule="evenodd" /></svg>
                            {chapter.title}
                        </Link>
                        <ol className="mt-3 space-y-1">
                            {(chapter.subtopics || []).map((s, i) => {
                                const active = i === subIndex;
                                return (
                                    <li key={s.id}>
                                        <Link
                                            href={subUrl(chapterSlug(chapter), subtopicSlug(s))}
                                            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                                                active
                                                    ? "bg-primary-50 font-bold text-primary-800 dark:bg-primary-500/10 dark:text-primary-200"
                                                    : "text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${active ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                                {i + 1}
                                            </span>
                                            <span className="min-w-0 leading-snug">{s.title}</span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </aside>

                {/* Main: subtopic content */}
                <main className="min-w-0">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-10">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-600">
                            {chapter.title} · Topic {subIndex + 1} of {(chapter.subtopics || []).length}
                        </p>
                        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{subtopic.title}</h1>
                        {subtopic.summary && <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-600">{subtopic.summary}</p>}

                        <div className="mt-8">
                            {subtopic.contentHtml || (subtopic.imageUrls || []).length || (subtopic.videos || []).length ? (
                                <SubtopicBody subtopic={subtopic} />
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                                    Notes for this topic are being prepared.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Prev / Next subtopic (flows across chapters) */}
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {prev ? (
                            <Link
                                href={subUrl(chapterSlug(prev.ch), subtopicSlug(prev.s))}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">← Previous</p>
                                <p className="mt-1 font-bold text-slate-950 group-hover:text-primary-800">{prev.s.title}</p>
                                {chapterSlug(prev.ch) !== chapterSlug(chapter) && (
                                    <p className="mt-0.5 text-xs text-slate-400">{prev.ch.title}</p>
                                )}
                            </Link>
                        ) : (
                            <div />
                        )}
                        {next ? (
                            <Link
                                href={subUrl(chapterSlug(next.ch), subtopicSlug(next.s))}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                            >
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Next →</p>
                                <p className="mt-1 font-bold text-slate-950 group-hover:text-primary-800">{next.s.title}</p>
                                {chapterSlug(next.ch) !== chapterSlug(chapter) && (
                                    <p className="mt-0.5 text-xs text-slate-400">{next.ch.title}</p>
                                )}
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
