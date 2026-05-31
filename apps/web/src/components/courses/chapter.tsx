"use client";

import { FormattedContent } from "@digimine/ui";
import type { CourseNoteSubtopic } from "@digimine/types";

/**
 * Derive a clean, stable URL slug for a chapter. Chapter ids are written as
 * `ch-<slugified-title>` (see scripts/fix-course-chapters.ts), so we strip the
 * `ch-` prefix to get readable URLs like
 *   /courses/operating-systems/introduction-to-operating-systems
 * Falls back to slugifying the title for any legacy/id-less chapter.
 */
export function chapterSlug(ch: { id?: string; title?: string }): string {
    if (ch.id && ch.id.startsWith("ch-")) return ch.id.slice(3);
    return slugify(ch.title || "");
}

/**
 * URL slug for a subtopic — slugified title (subtopic ids are opaque like
 * `<chapterId>-st3`, which makes ugly URLs). Curated course outlines don't have
 * duplicate subtopic titles within a chapter, so this stays unique per chapter.
 */
export function subtopicSlug(s: { id?: string; title?: string }): string {
    return slugify(s.title || "") || (s.id || "");
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * The body of a single subtopic — rich-text notes, diagram images and embedded
 * videos, WITHOUT a header. Used standalone on the subtopic page (which renders
 * its own page-level heading).
 */
export function SubtopicBody({ subtopic }: { subtopic: CourseNoteSubtopic }) {
    return (
        <>
            {subtopic.contentHtml && <FormattedContent html={subtopic.contentHtml} size="base" className="text-slate-700" />}

            {(subtopic.imageUrls || []).length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {subtopic.imageUrls.map((url, imageIndex) => (
                        <a
                            key={`${url}-${imageIndex}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`${subtopic.title} diagram ${imageIndex + 1}`} className="h-56 w-full object-contain" />
                        </a>
                    ))}
                </div>
            )}

            {(subtopic.videos || []).length > 0 && (
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {subtopic.videos.map((video) => (
                        <div key={video.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-[#020617] shadow-sm">
                            <div className="aspect-video">
                                <iframe
                                    src={`https://www.youtube.com/embed/${video.videoId}`}
                                    title={video.title}
                                    className="h-full w-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            </div>
                            <div className="border-t border-white/10 px-4 py-3">
                                <p className="truncate text-sm font-bold text-white">{video.title}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
