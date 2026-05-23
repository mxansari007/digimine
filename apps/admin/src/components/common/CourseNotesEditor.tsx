"use client";

import { RichTextEditor } from "@/components/common/RichTextEditor";
import { GalleryUpload } from "@/components/common/GalleryUpload";
import { downloadChapterTemplate, downloadSubtopicTemplate } from "@/lib/import/courseTemplates";
import type { CourseNoteChapter, CourseNoteSubtopic, CourseNoteVideo } from "@digimine/types";

interface CourseNotesEditorProps {
    chapters: CourseNoteChapter[];
    onChange: (chapters: CourseNoteChapter[]) => void;
    uploadPath?: string;
}

function makeId(prefix: string): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseYouTubeVideoId(url: string): string | null {
    const trimmed = url.trim();
    const patterns = [
        /youtube\.com\/watch\?v=([^&]+)/i,
        /youtube\.com\/embed\/([^?&/]+)/i,
        /youtube\.com\/shorts\/([^?&/]+)/i,
        /youtu\.be\/([^?&/]+)/i,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

function createChapter(): CourseNoteChapter {
    return {
        id: makeId("chapter"),
        title: "New Chapter",
        description: "",
        subtopics: [],
    };
}

function createSubtopic(): CourseNoteSubtopic {
    return {
        id: makeId("subtopic"),
        title: "New Subtopic",
        summary: "",
        contentHtml: "",
        imageUrls: [],
        videos: [],
    };
}

export function CourseNotesEditor({
    chapters,
    onChange,
    uploadPath = "products/course-notes",
}: CourseNotesEditorProps) {
    const updateChapter = (chapterId: string, patch: Partial<CourseNoteChapter>) => {
        onChange(chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, ...patch } : chapter)));
    };

    const removeChapter = (chapterId: string) => {
        if (!confirm("Remove this chapter and all of its subtopics?")) return;
        onChange(chapters.filter((chapter) => chapter.id !== chapterId));
    };

    const moveChapter = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= chapters.length) return;
        const next = [...chapters];
        const [removed] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, removed);
        onChange(next);
    };

    const addSubtopic = (chapterId: string) => {
        onChange(
            chapters.map((chapter) =>
                chapter.id === chapterId
                    ? { ...chapter, subtopics: [...(chapter.subtopics || []), createSubtopic()] }
                    : chapter
            )
        );
    };

    const updateSubtopic = (
        chapterId: string,
        subtopicId: string,
        patch: Partial<CourseNoteSubtopic>
    ) => {
        onChange(
            chapters.map((chapter) =>
                chapter.id === chapterId
                    ? {
                        ...chapter,
                        subtopics: (chapter.subtopics || []).map((subtopic) =>
                            subtopic.id === subtopicId ? { ...subtopic, ...patch } : subtopic
                        ),
                    }
                    : chapter
            )
        );
    };

    const removeSubtopic = (chapterId: string, subtopicId: string) => {
        if (!confirm("Remove this subtopic?")) return;
        onChange(
            chapters.map((chapter) =>
                chapter.id === chapterId
                    ? {
                        ...chapter,
                        subtopics: (chapter.subtopics || []).filter((subtopic) => subtopic.id !== subtopicId),
                    }
                    : chapter
            )
        );
    };

    const addYouTubeVideo = (chapterId: string, subtopic: CourseNoteSubtopic) => {
        const url = window.prompt("Paste a YouTube URL");
        if (!url) return;

        const videoId = parseYouTubeVideoId(url);
        if (!videoId) {
            alert("Please paste a valid YouTube URL.");
            return;
        }

        const title = window.prompt("Video title", "Related explanation") || "Related explanation";
        const video: CourseNoteVideo = {
            id: makeId("video"),
            title,
            url,
            provider: "youtube",
            videoId,
        };

        updateSubtopic(chapterId, subtopic.id, {
            videos: [...(subtopic.videos || []), video],
        });
    };

    const removeVideo = (chapterId: string, subtopic: CourseNoteSubtopic, videoId: string) => {
        updateSubtopic(chapterId, subtopic.id, {
            videos: (subtopic.videos || []).filter((video) => video.id !== videoId),
        });
    };

    const chapterCount = chapters.length;
    const subtopicCount = chapters.reduce((total, chapter) => total + (chapter.subtopics?.length || 0), 0);

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-bold text-slate-900">Course notes structure</p>
                    <p className="text-xs text-slate-500">
                        {chapterCount} chapter{chapterCount === 1 ? "" : "s"} · {subtopicCount} subtopic{subtopicCount === 1 ? "" : "s"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => downloadChapterTemplate()}
                        title="Download course-chapter-template.json"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                        ⬇ Chapter template
                    </button>
                    <button
                        type="button"
                        onClick={() => onChange([...chapters, createChapter()])}
                        className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-700"
                    >
                        Add Chapter
                    </button>
                </div>
            </div>

            {chapters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <p className="font-bold text-slate-900">No notes yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                        Add chapters for subjects like Computer Networks, DBMS, Operating Systems, or DSA.
                    </p>
                </div>
            ) : (
                chapters.map((chapter, chapterIndex) => (
                    <details key={chapter.id} className="group rounded-2xl border border-slate-200 bg-white shadow-sm" open>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-primary-600">
                                    Chapter {chapterIndex + 1}
                                </p>
                                <p className="truncate text-lg font-bold text-slate-950">{chapter.title || "Untitled chapter"}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        moveChapter(chapterIndex, chapterIndex - 1);
                                    }}
                                    disabled={chapterIndex === 0}
                                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                                >
                                    Up
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        moveChapter(chapterIndex, chapterIndex + 1);
                                    }}
                                    disabled={chapterIndex === chapters.length - 1}
                                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                                >
                                    Down
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        removeChapter(chapter.id);
                                    }}
                                    className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                                >
                                    Remove
                                </button>
                            </div>
                        </summary>

                        <div className="space-y-5 p-4">
                            <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Chapter title</label>
                                    <input
                                        type="text"
                                        value={chapter.title}
                                        onChange={(event) => updateChapter(chapter.id, { title: event.target.value })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                        placeholder="Computer Networks"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Chapter description</label>
                                    <input
                                        type="text"
                                        value={chapter.description || ""}
                                        onChange={(event) => updateChapter(chapter.id, { description: event.target.value })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                        placeholder="OSI model, TCP/IP, routing, DNS, congestion control..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                {(chapter.subtopics || []).map((subtopic, subtopicIndex) => (
                                    <div key={subtopic.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                                                    Subtopic {subtopicIndex + 1}
                                                </p>
                                                <input
                                                    type="text"
                                                    value={subtopic.title}
                                                    onChange={(event) => updateSubtopic(chapter.id, subtopic.id, { title: event.target.value })}
                                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                                    placeholder="TCP three-way handshake"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeSubtopic(chapter.id, subtopic.id)}
                                                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        <label className="mb-1 block text-sm font-semibold text-slate-700">Short summary</label>
                                        <input
                                            type="text"
                                            value={subtopic.summary || ""}
                                            onChange={(event) => updateSubtopic(chapter.id, subtopic.id, { summary: event.target.value })}
                                            className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                            placeholder="One-line explanation shown in the notes outline"
                                        />

                                        <RichTextEditor
                                            label="Notes"
                                            value={subtopic.contentHtml}
                                            onChange={(contentHtml) => updateSubtopic(chapter.id, subtopic.id, { contentHtml })}
                                            placeholder="Write detailed notes, formulas, tables, examples, and technical explanations..."
                                            helperText="Use headings, tables, formulas, code blocks, inline image uploads, and YouTube videos directly between paragraphs."
                                            minHeight={220}
                                            mediaUploadPath={`${uploadPath}/${chapter.id}/${subtopic.id}/inline`}
                                        />

                                        <div className="mt-5 grid gap-5 lg:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                                <GalleryUpload
                                                    label="Images and diagrams"
                                                    path={`${uploadPath}/${chapter.id}/${subtopic.id}`}
                                                    images={subtopic.imageUrls || []}
                                                    onImagesChange={(imageUrls) => updateSubtopic(chapter.id, subtopic.id, { imageUrls })}
                                                    maxImages={12}
                                                />
                                            </div>

                                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">YouTube videos</p>
                                                        <p className="text-xs text-slate-500">Embed lectures, explanations, or problem walkthroughs.</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => addYouTubeVideo(chapter.id, subtopic)}
                                                        className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"
                                                    >
                                                        Add Video
                                                    </button>
                                                </div>

                                                {(subtopic.videos || []).length === 0 ? (
                                                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                                                        No videos embedded yet.
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {(subtopic.videos || []).map((video) => (
                                                            <div key={video.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                                                                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                                                                        <path d="M8 5v14l11-7z" />
                                                                    </svg>
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="truncate text-sm font-bold text-slate-900">{video.title}</p>
                                                                    <p className="truncate text-xs text-slate-500">{video.url}</p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeVideo(chapter.id, subtopic, video.id)}
                                                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
                                            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                                SEO overrides
                                                <span className="ml-2 text-xs font-normal text-slate-400">
                                                    Optional — controls how this subtopic appears in search & shares
                                                </span>
                                            </summary>
                                            <div className="space-y-3 border-t border-slate-100 p-4">
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <label className="block">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta title</span>
                                                        <input
                                                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                            value={subtopic.seo?.metaTitle || ""}
                                                            onChange={(e) =>
                                                                updateSubtopic(chapter.id, subtopic.id, {
                                                                    seo: { ...(subtopic.seo || {}), metaTitle: e.target.value },
                                                                })
                                                            }
                                                            placeholder={subtopic.title}
                                                            maxLength={70}
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Focus keyword</span>
                                                        <input
                                                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                            value={subtopic.seo?.focusKeyword || ""}
                                                            onChange={(e) =>
                                                                updateSubtopic(chapter.id, subtopic.id, {
                                                                    seo: { ...(subtopic.seo || {}), focusKeyword: e.target.value },
                                                                })
                                                            }
                                                            placeholder="Primary keyword for this topic"
                                                        />
                                                    </label>
                                                </div>
                                                <label className="block">
                                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta description</span>
                                                    <textarea
                                                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                        rows={2}
                                                        value={subtopic.seo?.metaDescription || ""}
                                                        onChange={(e) =>
                                                            updateSubtopic(chapter.id, subtopic.id, {
                                                                seo: { ...(subtopic.seo || {}), metaDescription: e.target.value },
                                                            })
                                                        }
                                                        placeholder={subtopic.summary || "Defaults to the summary line"}
                                                        maxLength={180}
                                                    />
                                                </label>
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <label className="block">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Keywords</span>
                                                        <input
                                                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                            value={(subtopic.seo?.keywords || []).join(", ")}
                                                            onChange={(e) =>
                                                                updateSubtopic(chapter.id, subtopic.id, {
                                                                    seo: {
                                                                        ...(subtopic.seo || {}),
                                                                        keywords: e.target.value
                                                                            .split(",")
                                                                            .map((s) => s.trim())
                                                                            .filter(Boolean),
                                                                    },
                                                                })
                                                            }
                                                            placeholder="trig, identities"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schema.org type</span>
                                                        <select
                                                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                            value={subtopic.seo?.structuredDataType || "Article"}
                                                            onChange={(e) =>
                                                                updateSubtopic(chapter.id, subtopic.id, {
                                                                    seo: { ...(subtopic.seo || {}), structuredDataType: e.target.value as any },
                                                                })
                                                            }
                                                        >
                                                            <option value="Article">Article</option>
                                                            <option value="TechArticle">Tech Article</option>
                                                            <option value="HowTo">How-To</option>
                                                            <option value="BlogPosting">Blog Post</option>
                                                            <option value="NewsArticle">News Article</option>
                                                        </select>
                                                    </label>
                                                </div>
                                                <label className="flex items-start gap-2 text-sm text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-0.5"
                                                        checked={Boolean(subtopic.seo?.noIndex)}
                                                        onChange={(e) =>
                                                            updateSubtopic(chapter.id, subtopic.id, {
                                                                seo: { ...(subtopic.seo || {}), noIndex: e.target.checked },
                                                            })
                                                        }
                                                    />
                                                    <span>
                                                        <span className="font-medium">Don&apos;t index this subtopic</span>
                                                        <span className="block text-xs text-slate-400">
                                                            Use for drafts or sensitive content.
                                                        </span>
                                                    </span>
                                                </label>
                                            </div>
                                        </details>
                                    </div>
                                ))}

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => addSubtopic(chapter.id)}
                                        className="flex-1 rounded-2xl border border-dashed border-primary-300 bg-primary-50 px-4 py-3 text-sm font-bold text-primary-700 hover:bg-primary-100"
                                    >
                                        Add Subtopic
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => downloadSubtopicTemplate()}
                                        title="Download course-subtopic-template.json"
                                        className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        ⬇ Template
                                    </button>
                                </div>
                            </div>
                        </div>
                    </details>
                ))
            )}
        </div>
    );
}
