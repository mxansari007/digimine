"use client";

/**
 * Authoring form for a practice topic. Used by both /practice/topics/create
 * and /practice/topics/[id]/edit. The shape it emits is `CreatePracticeTopicInput`
 * which both `createTopic` and `updateTopic` accept directly.
 *
 *  - Pattern picker filters by selected kind (DSA shows DSA patterns only).
 *  - Rich-text fields use the shared RichTextEditor (TipTap) for intro
 *    and mental-model HTML.
 *  - Tag-style slug pickers (prerequisites, related, pinned problems) are
 *    free-form chip inputs — comma- or Enter-separated. We don't validate
 *    that the referenced slug exists at save time, so the topic stays
 *    saveable even if a related topic is renamed later (the public page
 *    silently drops missing references on render).
 */

import { useEffect, useState } from "react";
import {
    ALL_PATTERNS,
    DEFAULT_PRACTICE_TOPIC_SEO,
    type CreatePracticeTopicInput,
    type PracticeKind,
    type PracticePattern,
    type PracticeStatus,
    type PracticeTopic,
} from "@digimine/types";
import { Button, Card } from "@digimine/ui";
import { ImageInput } from "@/components/common/ImageInput";
import { RichTextEditor } from "@/components/common/RichTextEditor";

interface Props {
    initial?: PracticeTopic;
    submitting: boolean;
    onSubmit: (input: CreatePracticeTopicInput) => Promise<void> | void;
}

function csvToArray(csv: string): string[] {
    return csv
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function PracticeTopicForm({ initial, submitting, onSubmit }: Props) {
    const [kind, setKind] = useState<PracticeKind>(initial?.kind || "dsa");
    const [pattern, setPattern] = useState<PracticePattern>(
        initial?.pattern || "arrays-hashing"
    );
    const [title, setTitle] = useState(initial?.title || "");
    const [slug, setSlug] = useState(initial?.slug || "");
    const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
    const [summary, setSummary] = useState(initial?.summary || "");
    const [introHtml, setIntroHtml] = useState(initial?.introHtml || "");
    const [mentalModelHtml, setMentalModelHtml] = useState(initial?.mentalModelHtml || "");
    const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl || "");
    const [warmupQuizSlug, setWarmupQuizSlug] = useState(initial?.warmupQuizSlug || "");
    const [prereqCsv, setPrereqCsv] = useState((initial?.prerequisiteTopicSlugs || []).join(", "));
    const [relatedCsv, setRelatedCsv] = useState((initial?.relatedTopicSlugs || []).join(", "));
    const [pinnedCsv, setPinnedCsv] = useState((initial?.pinnedProblemSlugs || []).join(", "));
    const [tagsCsv, setTagsCsv] = useState((initial?.tags || []).join(", "));
    const [isFeatured, setIsFeatured] = useState(Boolean(initial?.isFeatured));
    const [status, setStatus] = useState<PracticeStatus>(initial?.status || "draft");

    const [seoTitle, setSeoTitle] = useState(initial?.seo?.metaTitle || "");
    const [seoDesc, setSeoDesc] = useState(initial?.seo?.metaDescription || "");
    const [seoOg, setSeoOg] = useState(initial?.seo?.ogImageUrl || "");
    const [seoNoIndex, setSeoNoIndex] = useState(Boolean(initial?.seo?.noIndex));

    // Reset pattern when kind switches — DSA patterns aren't valid for SQL.
    const patternOptions = ALL_PATTERNS.filter((p) => p.kind === kind);
    useEffect(() => {
        if (!patternOptions.some((p) => p.id === pattern)) {
            setPattern(patternOptions[0]?.id || "arrays-hashing");
        }
    }, [kind, pattern, patternOptions]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({
            slug: slug.trim() || undefined,
            title: title.trim(),
            kind,
            pattern,
            subtitle: subtitle.trim() || null,
            summary: summary.trim(),
            introHtml,
            mentalModelHtml,
            coverImageUrl: coverImageUrl.trim() || null,
            warmupQuizSlug: warmupQuizSlug.trim() || null,
            prerequisiteTopicSlugs: csvToArray(prereqCsv),
            relatedTopicSlugs: csvToArray(relatedCsv),
            pinnedProblemSlugs: csvToArray(pinnedCsv),
            tags: csvToArray(tagsCsv),
            isFeatured,
            status,
            seo: {
                metaTitle: seoTitle.trim() || null,
                metaDescription: seoDesc.trim() || null,
                ogImageUrl: seoOg.trim() || null,
                noIndex: seoNoIndex,
            },
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <Card className="space-y-4 p-5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Basics</h2>
                <div className="grid gap-4 sm:grid-cols-[1fr_140px_180px]">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">Title</label>
                        <input
                            required
                            className="field w-full"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Two pointers"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">Kind</label>
                        <select
                            className="field w-full"
                            value={kind}
                            onChange={(e) => setKind(e.target.value as PracticeKind)}
                        >
                            <option value="dsa">DSA</option>
                            <option value="sql">SQL</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">Pattern</label>
                        <select
                            required
                            className="field w-full"
                            value={pattern}
                            onChange={(e) => setPattern(e.target.value as PracticePattern)}
                        >
                            {patternOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Slug <span className="font-normal text-slate-400">(auto from title if blank)</span>
                    </label>
                    <input
                        className="field w-full font-mono text-xs"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="two-pointers"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Subtitle <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                        className="field w-full"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="The fastest way to traverse sorted arrays"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Summary <span className="font-normal text-slate-400">(shown in lists + page header)</span>
                    </label>
                    <textarea
                        className="field w-full min-h-[60px]"
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        placeholder="Use two indices that move toward each other to solve array problems in O(n) instead of O(n²)."
                    />
                </div>

                <ImageInput
                    label="Cover image"
                    value={coverImageUrl}
                    onChange={setCoverImageUrl}
                    path={`practice/topics/${slug || "draft"}/cover`}
                    idealSize="1600×900 (16:9)"
                    aspectRatio="16/9"
                />
            </Card>

            <Card className="space-y-3 p-5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Intro</h2>
                <p className="text-xs text-slate-500">
                    What is this pattern? When does it apply? Keep it short — 2–4 paragraphs is ideal.
                </p>
                <RichTextEditor
                    value={introHtml}
                    onChange={setIntroHtml}
                    mediaUploadPath={`practice/topics/${slug || "draft"}/intro`}
                    placeholder="Two pointers is a technique where…"
                />
            </Card>

            <Card className="space-y-3 p-5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                    Mental model &amp; traps
                </h2>
                <p className="text-xs text-slate-500">
                    Diagrams, when-to-use checklist, common mistakes. Anchor everything visually if
                    you can.
                </p>
                <RichTextEditor
                    value={mentalModelHtml}
                    onChange={setMentalModelHtml}
                    mediaUploadPath={`practice/topics/${slug || "draft"}/mental-model`}
                    placeholder="Recognize the pattern when you see…"
                />
            </Card>

            <Card className="space-y-4 p-5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                    Cross-references
                </h2>
                <p className="text-xs text-slate-500">Comma- or newline-separated lists of slugs.</p>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Prerequisite topic slugs
                    </label>
                    <input
                        className="field w-full font-mono text-xs"
                        value={prereqCsv}
                        onChange={(e) => setPrereqCsv(e.target.value)}
                        placeholder="arrays-hashing, binary-search"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Related topic slugs
                    </label>
                    <input
                        className="field w-full font-mono text-xs"
                        value={relatedCsv}
                        onChange={(e) => setRelatedCsv(e.target.value)}
                        placeholder="sliding-window, fast-slow-pointers"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Pinned problem slugs{" "}
                        <span className="font-normal text-slate-400">
                            (always appear first, in this order)
                        </span>
                    </label>
                    <input
                        className="field w-full font-mono text-xs"
                        value={pinnedCsv}
                        onChange={(e) => setPinnedCsv(e.target.value)}
                        placeholder="two-sum, three-sum, container-with-most-water"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Warm-up quiz slug{" "}
                        <span className="font-normal text-slate-400">
                            (5-min concept quiz, optional)
                        </span>
                    </label>
                    <input
                        className="field w-full font-mono text-xs"
                        value={warmupQuizSlug}
                        onChange={(e) => setWarmupQuizSlug(e.target.value)}
                        placeholder="two-pointers-concept-quiz"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Tags</label>
                    <input
                        className="field w-full"
                        value={tagsCsv}
                        onChange={(e) => setTagsCsv(e.target.value)}
                        placeholder="arrays, pointers, optimization"
                    />
                </div>
            </Card>

            <Card className="space-y-4 p-5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">SEO</h2>
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Meta title <span className="font-normal text-slate-400">(defaults to topic title)</span>
                    </label>
                    <input
                        className="field w-full"
                        value={seoTitle}
                        onChange={(e) => setSeoTitle(e.target.value)}
                        placeholder="Two Pointers Pattern — DSA Practice Problems"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Meta description
                    </label>
                    <textarea
                        className="field w-full min-h-[60px]"
                        value={seoDesc}
                        onChange={(e) => setSeoDesc(e.target.value)}
                        placeholder="Learn the two-pointer technique with worked examples and 24 hand-picked practice problems."
                    />
                </div>
                <ImageInput
                    label="Open Graph image"
                    hint="Defaults to the cover image when blank."
                    value={seoOg}
                    onChange={setSeoOg}
                    path={`practice/topics/${slug || "draft"}/og`}
                    idealSize="1200×630"
                    aspectRatio="1200/630"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                        type="checkbox"
                        checked={seoNoIndex}
                        onChange={(e) => setSeoNoIndex(e.target.checked)}
                    />
                    Hide from search engines (noindex)
                </label>
            </Card>

            <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                            type="checkbox"
                            checked={isFeatured}
                            onChange={(e) => setIsFeatured(e.target.checked)}
                        />
                        Feature on Practice hub
                    </label>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">Status</label>
                        <select
                            className="field"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as PracticeStatus)}
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                        </select>
                    </div>
                </div>
                <Button type="submit" variant="primary" isLoading={submitting}>
                    {initial ? "Save changes" : "Create topic"}
                </Button>
            </Card>

            <p className="text-[10px] text-slate-400">
                Default SEO falls back to the topic title + summary when blank. Cover image is used
                as the OG image fallback. See{" "}
                <code className="font-mono">DEFAULT_PRACTICE_TOPIC_SEO</code> in @digimine/types for
                the full default shape ({Object.keys(DEFAULT_PRACTICE_TOPIC_SEO).length} keys).
            </p>
        </form>
    );
}
