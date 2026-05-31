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
    return (ch.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Full rendering for a single subtopic: rich-text notes, diagram images and
 * embedded videos. Shared by the chapter reader page.
 */
export function CourseSubtopic({ subtopic, index }: { subtopic: CourseNoteSubtopic; index: number }) {
    return (
        <article className="scroll-mt-24 border-t border-slate-100 py-8 first:border-t-0 first:pt-0" id={subtopic.id}>
            <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Subtopic {index + 1}</p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{subtopic.title}</h3>
                {subtopic.summary && <p className="mt-1 text-sm text-slate-500">{subtopic.summary}</p>}
            </div>

            {subtopic.contentHtml && <FormattedContent html={subtopic.contentHtml} size="base" className="text-slate-700" />}

            {(subtopic.imageUrls || []).length > 0 && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
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
        </article>
    );
}
