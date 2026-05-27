"use client";

/**
 * Authoring form for a practice sheet. Used by /practice/sheets/create AND
 * /practice/sheets/[id]/edit. Emits a `CreatePracticeSheetInput` the helper
 * functions accept directly.
 *
 * Sections are the heart of the form. Each section is a card with:
 *   - Title (always wins as the section heading on the public page).
 *   - Optional `topicSlug` — links the section header to the topic's
 *     umbrella page on the public site.
 *   - Optional summary line.
 *   - Problem slugs as a comma- (or newline-) separated text input. Order
 *     of the list is the order on the public page.
 *
 * Reorder sections with up/down arrows — drag-and-drop is heavier to wire
 * for a v1 and add/move-by-1 covers 95% of editorial workflows.
 */

import { useState } from "react";
import {
    type CreatePracticeSheetInput,
    type PracticeKind,
    type PracticeSheet,
    type PracticeSheetDifficulty,
    type PracticeSheetSection,
    type PracticeStatus,
} from "@digimine/types";
import { Button, Card } from "@digimine/ui";
import { X } from "lucide-react";
import { ImageInput } from "@/components/common/ImageInput";

interface Props {
    initial?: PracticeSheet;
    submitting: boolean;
    onSubmit: (input: CreatePracticeSheetInput) => Promise<void> | void;
}

function csvToArray(csv: string): string[] {
    return csv
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

// Internal editing shape — `problemSlugs` is held as the raw CSV string for
// stable cursor behavior while typing. We convert to array on submit.
type EditableSection = {
    topicSlug: string;
    title: string;
    summary: string;
    problemSlugsCsv: string;
};

function toEditable(s: PracticeSheetSection): EditableSection {
    return {
        topicSlug: s.topicSlug || "",
        title: s.title,
        summary: s.summary || "",
        problemSlugsCsv: s.problemSlugs.join(", "),
    };
}

function newSection(): EditableSection {
    return { topicSlug: "", title: "", summary: "", problemSlugsCsv: "" };
}

export function PracticeSheetForm({ initial, submitting, onSubmit }: Props) {
    const [title, setTitle] = useState(initial?.title || "");
    const [slug, setSlug] = useState(initial?.slug || "");
    const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
    const [kind, setKind] = useState<PracticeKind | "mixed">(initial?.kind || "dsa");
    const [description, setDescription] = useState(initial?.description || "");
    const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl || "");
    const [difficulty, setDifficulty] = useState<PracticeSheetDifficulty | "">(
        initial?.difficulty ?? ""
    );
    const [estimatedHours, setEstimatedHours] = useState<string>(
        initial?.estimatedHours != null ? String(initial.estimatedHours) : ""
    );
    const [tagsCsv, setTagsCsv] = useState((initial?.tags || []).join(", "));
    const [isOfficial, setIsOfficial] = useState(Boolean(initial?.isOfficial));
    const [isFeatured, setIsFeatured] = useState(Boolean(initial?.isFeatured));
    const [status, setStatus] = useState<PracticeStatus>(initial?.status || "draft");

    const [sections, setSections] = useState<EditableSection[]>(
        initial?.sections?.length ? initial.sections.map(toEditable) : [newSection()]
    );

    const [seoTitle, setSeoTitle] = useState(initial?.seo?.metaTitle || "");
    const [seoDesc, setSeoDesc] = useState(initial?.seo?.metaDescription || "");
    const [seoOg, setSeoOg] = useState(initial?.seo?.ogImageUrl || "");
    const [seoNoIndex, setSeoNoIndex] = useState(Boolean(initial?.seo?.noIndex));

    const updateSection = (i: number, patch: Partial<EditableSection>) => {
        setSections((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    };
    const addSection = () => setSections((cur) => [...cur, newSection()]);
    const removeSection = (i: number) =>
        setSections((cur) => (cur.length === 1 ? cur : cur.filter((_, idx) => idx !== i)));
    const moveSection = (i: number, dir: -1 | 1) => {
        setSections((cur) => {
            const j = i + dir;
            if (j < 0 || j >= cur.length) return cur;
            const next = [...cur];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    };

    const totalProblems = sections.reduce(
        (sum, s) => sum + csvToArray(s.problemSlugsCsv).length,
        0
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({
            slug: slug.trim() || undefined,
            title: title.trim(),
            kind,
            subtitle: subtitle.trim() || null,
            description: description.trim(),
            coverImageUrl: coverImageUrl.trim() || null,
            difficulty: difficulty || null,
            estimatedHours: estimatedHours ? Number(estimatedHours) : null,
            tags: csvToArray(tagsCsv),
            isOfficial,
            isFeatured,
            status,
            sections: sections.map((s) => ({
                topicSlug: s.topicSlug.trim() || null,
                title: s.title.trim() || "Untitled section",
                summary: s.summary.trim() || null,
                problemSlugs: csvToArray(s.problemSlugsCsv),
            })),
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
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                    Basics
                </h2>
                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Title
                        </label>
                        <input
                            required
                            className="field w-full"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="TCS NQT 30-day plan"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Kind
                        </label>
                        <select
                            className="field w-full"
                            value={kind}
                            onChange={(e) =>
                                setKind(e.target.value as PracticeKind | "mixed")
                            }
                        >
                            <option value="dsa">DSA</option>
                            <option value="sql">SQL</option>
                            <option value="mixed">Mixed (DSA + SQL)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Slug{" "}
                        <span className="font-normal text-slate-400">
                            (auto from title if blank)
                        </span>
                    </label>
                    <input
                        className="field w-full font-mono text-xs"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="tcs-nqt-30-day-plan"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Subtitle{" "}
                        <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                        className="field w-full"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="From zero to placement-ready in 4 weeks"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Description
                    </label>
                    <textarea
                        className="field w-full min-h-[80px]"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Day-by-day journey covering arrays, hashing, two-pointers, sliding window, and DP — built on real TCS NQT papers from the last 4 years."
                    />
                </div>

                <ImageInput
                    label="Cover image"
                    value={coverImageUrl}
                    onChange={setCoverImageUrl}
                    path={`practice/sheets/${slug || "draft"}/cover`}
                    idealSize="1600×900 (16:9)"
                    aspectRatio="16/9"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Difficulty
                        </label>
                        <select
                            className="field w-full"
                            value={difficulty}
                            onChange={(e) =>
                                setDifficulty(
                                    e.target.value as PracticeSheetDifficulty | ""
                                )
                            }
                        >
                            <option value="">— Not specified —</option>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Estimated hours{" "}
                            <span className="font-normal text-slate-400">
                                (rendered as ≈X hrs)
                            </span>
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            className="field w-full"
                            value={estimatedHours}
                            onChange={(e) => setEstimatedHours(e.target.value)}
                            placeholder="40"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Tags
                    </label>
                    <input
                        className="field w-full"
                        value={tagsCsv}
                        onChange={(e) => setTagsCsv(e.target.value)}
                        placeholder="tcs, nqt, placement, dsa"
                    />
                </div>
            </Card>

            {/* SECTIONS */}
            <Card className="space-y-4 p-5">
                <div className="flex items-baseline justify-between">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                            Sections
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                            Each section is one stage of the journey. Reference a topic so the
                            section heading deep-links to the umbrella page; or leave the topic
                            field blank for an ad-hoc grouping.
                        </p>
                    </div>
                    <span className="text-xs text-slate-500">
                        {sections.length} section{sections.length === 1 ? "" : "s"} ·{" "}
                        {totalProblems} problem{totalProblems === 1 ? "" : "s"}
                    </span>
                </div>

                <div className="space-y-3">
                    {sections.map((section, i) => {
                        const slugs = csvToArray(section.problemSlugsCsv);
                        return (
                            <div
                                key={i}
                                className="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
                            >
                                <div className="mb-3 flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        Section {i + 1} · {slugs.length} problem
                                        {slugs.length === 1 ? "" : "s"}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveSection(i, -1)}
                                            disabled={i === 0}
                                            aria-label="Move section up"
                                            className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveSection(i, 1)}
                                            disabled={i === sections.length - 1}
                                            aria-label="Move section down"
                                            className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeSection(i)}
                                            disabled={sections.length === 1}
                                            aria-label="Remove section"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                                        >
                                            <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                                    <div>
                                        <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                                            Section title
                                        </label>
                                        <input
                                            className="field w-full"
                                            value={section.title}
                                            onChange={(e) =>
                                                updateSection(i, { title: e.target.value })
                                            }
                                            placeholder="Week 1 — Foundations"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                                            Topic slug{" "}
                                            <span className="font-normal text-slate-400">
                                                (optional)
                                            </span>
                                        </label>
                                        <input
                                            className="field w-full font-mono text-xs"
                                            value={section.topicSlug}
                                            onChange={(e) =>
                                                updateSection(i, {
                                                    topicSlug: e.target.value,
                                                })
                                            }
                                            placeholder="two-pointers"
                                        />
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                                        Summary{" "}
                                        <span className="font-normal text-slate-400">
                                            (1 line)
                                        </span>
                                    </label>
                                    <input
                                        className="field w-full"
                                        value={section.summary}
                                        onChange={(e) =>
                                            updateSection(i, { summary: e.target.value })
                                        }
                                        placeholder="Build mental models for the most-asked patterns."
                                    />
                                </div>

                                <div className="mt-3">
                                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                                        Problem slugs{" "}
                                        <span className="font-normal text-slate-400">
                                            (comma- or newline-separated, in order)
                                        </span>
                                    </label>
                                    <textarea
                                        className="field w-full min-h-[80px] font-mono text-xs"
                                        value={section.problemSlugsCsv}
                                        onChange={(e) =>
                                            updateSection(i, {
                                                problemSlugsCsv: e.target.value,
                                            })
                                        }
                                        placeholder={"two-sum\nthree-sum\ncontainer-with-most-water"}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <Button type="button" variant="outline" onClick={addSection}>
                    + Add section
                </Button>
            </Card>

            <Card className="space-y-4 p-5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">SEO</h2>
                <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Meta title{" "}
                        <span className="font-normal text-slate-400">
                            (defaults to sheet title)
                        </span>
                    </label>
                    <input
                        className="field w-full"
                        value={seoTitle}
                        onChange={(e) => setSeoTitle(e.target.value)}
                        placeholder="TCS NQT 30-day plan — full DSA + SQL practice sheet"
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
                    />
                </div>
                <ImageInput
                    label="Open Graph image"
                    hint="Defaults to the cover image when blank."
                    value={seoOg}
                    onChange={setSeoOg}
                    path={`practice/sheets/${slug || "draft"}/og`}
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
                <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                            type="checkbox"
                            checked={isOfficial}
                            onChange={(e) => setIsOfficial(e.target.checked)}
                        />
                        Official sheet
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                            type="checkbox"
                            checked={isFeatured}
                            onChange={(e) => setIsFeatured(e.target.checked)}
                        />
                        Feature on Practice hub
                    </label>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Status
                        </label>
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
                    {initial ? "Save changes" : "Create sheet"}
                </Button>
            </Card>
        </form>
    );
}
