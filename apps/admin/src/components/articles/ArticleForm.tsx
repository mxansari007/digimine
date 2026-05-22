"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@digimine/ui";
import {
    ARTICLE_CATEGORIES,
    DEFAULT_ARTICLE_SEO,
    computeReadingMeta,
    deriveArticleExcerpt,
    slugifyArticleTitle,
    type Article,
    type ArticleCategory,
    type ArticleSeo,
    type ArticleStatus,
    type ArticleStructuredDataType,
    type CreateArticleInput,
} from "@digimine/types";
import { RichTextEditor } from "@/components/common/RichTextEditor";

export type ArticleFormSubmit = (input: CreateArticleInput) => Promise<void> | void;

interface ArticleFormProps {
    article?: Article | null;
    submitting?: boolean;
    onSubmit: ArticleFormSubmit;
    onDelete?: () => Promise<void> | void;
    showStatusControl?: boolean;
}

const STRUCTURED_DATA_OPTIONS: { id: ArticleStructuredDataType; label: string; hint: string }[] = [
    { id: "Article", label: "Article", hint: "Default — generic editorial." },
    { id: "BlogPosting", label: "Blog Post", hint: "Personal voice, opinion pieces." },
    { id: "NewsArticle", label: "News Article", hint: "Time-sensitive news / updates." },
    { id: "TechArticle", label: "Tech Article", hint: "Engineering or product technical content." },
    { id: "HowTo", label: "How-To", hint: "Step-by-step instructions." },
];

function Field({
    label,
    hint,
    required,
    children,
}: {
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label} {required && <span className="text-rose-500">*</span>}
            </span>
            <div className="mt-1.5">{children}</div>
            {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </label>
    );
}

export function ArticleForm({
    article,
    submitting,
    onSubmit,
    onDelete,
    showStatusControl = true,
}: ArticleFormProps) {
    const [title, setTitle] = useState(article?.title || "");
    const [subtitle, setSubtitle] = useState(article?.subtitle || "");
    const [slug, setSlug] = useState(article?.slug || "");
    const [slugTouched, setSlugTouched] = useState(Boolean(article?.slug));
    const [category, setCategory] = useState<ArticleCategory>(article?.category || "guide");
    const [subject, setSubject] = useState(article?.subject || "");
    const [tagsInput, setTagsInput] = useState((article?.tags || []).join(", "));
    const [body, setBody] = useState(article?.body || "");
    const [excerpt, setExcerpt] = useState(article?.excerpt || "");
    const [coverImageUrl, setCoverImageUrl] = useState(article?.coverImageUrl || "");
    const [coverCaption, setCoverCaption] = useState(article?.coverCaption || "");
    const [isFeatured, setIsFeatured] = useState(Boolean(article?.isFeatured));
    const [status, setStatus] = useState<ArticleStatus>(article?.status || "draft");
    const [scheduledFor, setScheduledFor] = useState(
        article?.scheduledFor ? new Date(article.scheduledFor).toISOString().slice(0, 16) : ""
    );

    // SEO
    const baseSeo = article?.seo || DEFAULT_ARTICLE_SEO;
    const [metaTitle, setMetaTitle] = useState(baseSeo.metaTitle || "");
    const [metaDescription, setMetaDescription] = useState(baseSeo.metaDescription || "");
    const [canonicalUrl, setCanonicalUrl] = useState(baseSeo.canonicalUrl || "");
    const [ogImageUrl, setOgImageUrl] = useState(baseSeo.ogImageUrl || "");
    const [focusKeyword, setFocusKeyword] = useState(baseSeo.focusKeyword || "");
    const [keywordsInput, setKeywordsInput] = useState((baseSeo.keywords || []).join(", "));
    const [twitterCard, setTwitterCard] = useState(baseSeo.twitterCard || "summary_large_image");
    const [structuredDataType, setStructuredDataType] = useState<ArticleStructuredDataType>(
        baseSeo.structuredDataType || "Article"
    );
    const [noIndex, setNoIndex] = useState(Boolean(baseSeo.noIndex));
    const [socialTitle, setSocialTitle] = useState(baseSeo.socialTitle || "");
    const [socialDescription, setSocialDescription] = useState(baseSeo.socialDescription || "");

    // Author overrides (defaults to admin's user identity at write time)
    const [authorName, setAuthorName] = useState(article?.author?.name || "");
    const [authorBio, setAuthorBio] = useState(article?.author?.bio || "");
    const [authorTwitter, setAuthorTwitter] = useState(article?.author?.twitter || "");
    const [authorLinkedin, setAuthorLinkedin] = useState(article?.author?.linkedin || "");

    // Derived
    const reading = useMemo(() => computeReadingMeta(body), [body]);
    const derivedExcerpt = useMemo(() => deriveArticleExcerpt(body), [body]);
    const effectiveExcerpt = excerpt.trim() || derivedExcerpt;
    const metaTitleEffective = metaTitle.trim() || title.trim();
    const metaDescriptionEffective = metaDescription.trim() || effectiveExcerpt;
    const titleLen = metaTitleEffective.length;
    const descLen = metaDescriptionEffective.length;

    // Auto-keep the slug in sync with the title until the editor edits it.
    useEffect(() => {
        if (!slugTouched) setSlug(slugifyArticleTitle(title));
    }, [title, slugTouched]);

    const tags = useMemo(
        () =>
            tagsInput
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
        [tagsInput]
    );
    const keywords = useMemo(
        () =>
            keywordsInput
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
        [keywordsInput]
    );

    const handleSubmit = async (nextStatus?: ArticleStatus) => {
        if (!title.trim()) {
            alert("Title is required");
            return;
        }
        const seo: ArticleSeo = {
            metaTitle: metaTitle.trim(),
            metaDescription: metaDescription.trim(),
            canonicalUrl: canonicalUrl.trim() || null,
            ogImageUrl: ogImageUrl.trim() || null,
            focusKeyword: focusKeyword.trim() || null,
            keywords,
            twitterCard,
            structuredDataType,
            noIndex,
            socialTitle: socialTitle.trim() || null,
            socialDescription: socialDescription.trim() || null,
        };
        const payload: CreateArticleInput = {
            title: title.trim(),
            slug: slug.trim() || undefined,
            subtitle: subtitle.trim() || undefined,
            excerpt: excerpt.trim() || undefined,
            body,
            coverImageUrl: coverImageUrl.trim() || null,
            coverCaption: coverCaption.trim() || null,
            category,
            subject: subject.trim() || null,
            tags,
            status: nextStatus || status,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            isFeatured,
            seo,
            author: {
                name: authorName.trim() || undefined,
                bio: authorBio.trim() || undefined,
                twitter: authorTwitter.trim() || undefined,
                linkedin: authorLinkedin.trim() || undefined,
            },
        };
        await onSubmit(payload);
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
                <Card className="p-6 space-y-5">
                    <Field label="Title" required>
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-semibold focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="A clear, specific headline"
                            maxLength={140}
                        />
                    </Field>
                    <Field label="Subtitle" hint="Optional dek shown under the title">
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="One sentence the reader sees first"
                            maxLength={200}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                        <Field label="Slug" hint="URL becomes /articles/{slug}">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={slug}
                                onChange={(e) => {
                                    setSlugTouched(true);
                                    setSlug(slugifyArticleTitle(e.target.value));
                                }}
                            />
                        </Field>
                        <Field label="Reading time" hint="Auto-computed from body">
                            <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                {reading.readingMinutes} min · {reading.wordCount.toLocaleString("en-IN")} words
                            </div>
                        </Field>
                    </div>
                </Card>

                <Card className="p-6 space-y-3">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-sm font-semibold text-slate-700">Body</h2>
                        <span className="text-xs text-slate-400">
                            Headings, lists, quotes, code, images, embeds — all supported
                        </span>
                    </div>
                    <RichTextEditor
                        value={body}
                        onChange={setBody}
                        placeholder="Open with a strong hook, then break the article into H2 sections."
                        minHeight={420}
                        enableMedia
                        mediaUploadPath="articles"
                    />
                </Card>

                <Card className="p-6 space-y-4">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-sm font-semibold text-slate-700">Search engine optimisation</h2>
                        <span className="text-xs text-slate-400">Affects Google, Bing, social shares</span>
                    </div>
                    <Field
                        label="Meta title"
                        hint={`${titleLen}/60 — Google clips around 60 characters. Falls back to the article title.`}
                    >
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={metaTitle}
                            onChange={(e) => setMetaTitle(e.target.value)}
                            placeholder={title || "Same as title if blank"}
                            maxLength={70}
                        />
                    </Field>
                    <Field
                        label="Meta description"
                        hint={`${descLen}/160 — Google clips around 160 characters. Falls back to the excerpt.`}
                    >
                        <textarea
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            rows={3}
                            value={metaDescription}
                            onChange={(e) => setMetaDescription(e.target.value)}
                            placeholder={effectiveExcerpt}
                            maxLength={180}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Focus keyword" hint="Primary keyword you're targeting">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={focusKeyword}
                                onChange={(e) => setFocusKeyword(e.target.value)}
                                placeholder="e.g. NEET physics rotational motion"
                            />
                        </Field>
                        <Field label="Keywords" hint="Comma-separated; emitted as meta keywords">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={keywordsInput}
                                onChange={(e) => setKeywordsInput(e.target.value)}
                                placeholder="trig, identities, formulas"
                            />
                        </Field>
                    </div>
                    <Field label="Canonical URL" hint="Leave blank to use /articles/{slug}">
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={canonicalUrl}
                            onChange={(e) => setCanonicalUrl(e.target.value)}
                            placeholder={`https://digimine.com/articles/${slug || "your-slug"}`}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Social share image (og:image)" hint="Falls back to cover image">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={ogImageUrl}
                                onChange={(e) => setOgImageUrl(e.target.value)}
                                placeholder="https://… (1200×630 recommended)"
                            />
                        </Field>
                        <Field label="Twitter card">
                            <select
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={twitterCard}
                                onChange={(e) => setTwitterCard(e.target.value as any)}
                            >
                                <option value="summary_large_image">Large image</option>
                                <option value="summary">Summary</option>
                            </select>
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Social title (og:title)" hint="Overrides meta title on social shares">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={socialTitle}
                                onChange={(e) => setSocialTitle(e.target.value)}
                            />
                        </Field>
                        <Field label="Social description (og:description)">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={socialDescription}
                                onChange={(e) => setSocialDescription(e.target.value)}
                            />
                        </Field>
                    </div>
                    <Field
                        label="Schema.org type"
                        hint={
                            STRUCTURED_DATA_OPTIONS.find((s) => s.id === structuredDataType)?.hint ||
                            "Used in JSON-LD structured data."
                        }
                    >
                        <select
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={structuredDataType}
                            onChange={(e) => setStructuredDataType(e.target.value as ArticleStructuredDataType)}
                        >
                            {STRUCTURED_DATA_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={noIndex}
                            onChange={(e) => setNoIndex(e.target.checked)}
                        />
                        <span>
                            <span className="font-medium">Don&apos;t index this article</span>
                            <span className="block text-xs text-slate-400">
                                Adds <code>noindex,nofollow</code> robots tag. Use for WIP / private posts.
                            </span>
                        </span>
                    </label>
                </Card>

                <Card className="p-6 space-y-4">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-sm font-semibold text-slate-700">Author byline</h2>
                        <span className="text-xs text-slate-400">Shown under the title</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Display name">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={authorName}
                                onChange={(e) => setAuthorName(e.target.value)}
                                placeholder="Defaults to your admin name"
                            />
                        </Field>
                        <Field label="Twitter handle">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={authorTwitter}
                                onChange={(e) => setAuthorTwitter(e.target.value)}
                                placeholder="@digimine"
                            />
                        </Field>
                    </div>
                    <Field label="Short bio" hint="2–3 lines about the author">
                        <textarea
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            rows={2}
                            value={authorBio}
                            onChange={(e) => setAuthorBio(e.target.value)}
                        />
                    </Field>
                    <Field label="LinkedIn URL">
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={authorLinkedin}
                            onChange={(e) => setAuthorLinkedin(e.target.value)}
                            placeholder="https://linkedin.com/in/…"
                        />
                    </Field>
                </Card>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                <Card className="p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-slate-700">Publishing</h2>

                    {showStatusControl && (
                        <Field label="Status">
                            <select
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={status}
                                onChange={(e) => setStatus(e.target.value as ArticleStatus)}
                            >
                                <option value="draft">Draft</option>
                                <option value="scheduled">Scheduled</option>
                                <option value="published">Published</option>
                                <option value="archived">Archived</option>
                            </select>
                        </Field>
                    )}

                    {status === "scheduled" && (
                        <Field label="Scheduled for" hint="Publishes automatically when reached (cron required)">
                            <input
                                type="datetime-local"
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={scheduledFor}
                                onChange={(e) => setScheduledFor(e.target.value)}
                            />
                        </Field>
                    )}

                    <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={isFeatured}
                            onChange={(e) => setIsFeatured(e.target.checked)}
                        />
                        <span>
                            <span className="font-medium">Feature on homepage</span>
                            <span className="block text-xs text-slate-400">
                                Surfaces in the featured rail on /articles.
                            </span>
                        </span>
                    </label>

                    <div className="flex flex-col gap-2 pt-2">
                        <Button variant="primary" onClick={() => handleSubmit("published")} isLoading={submitting}>
                            Publish now
                        </Button>
                        <Button variant="outline" onClick={() => handleSubmit("draft")} isLoading={submitting}>
                            Save as draft
                        </Button>
                        {onDelete && article && (
                            <Button variant="ghost" onClick={() => onDelete()} className="!text-rose-600">
                                Delete article
                            </Button>
                        )}
                    </div>
                </Card>

                <Card className="p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-slate-700">Taxonomy</h2>
                    <Field label="Category" required>
                        <select
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={category}
                            onChange={(e) => setCategory(e.target.value as ArticleCategory)}
                        >
                            {ARTICLE_CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {category === "subject-topic" && (
                        <Field label="Subject" hint="e.g. Maths, Physics, History">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </Field>
                    )}
                    <Field label="Tags" hint="Comma-separated">
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="neet, mock-tests, study-plan"
                        />
                    </Field>
                </Card>

                <Card className="p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-slate-700">Cover image</h2>
                    <Field label="Cover image URL" hint="Used at the top of the article and as fallback og:image">
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={coverImageUrl}
                            onChange={(e) => setCoverImageUrl(e.target.value)}
                            placeholder="https://…"
                        />
                    </Field>
                    {coverImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={coverImageUrl}
                            alt="Cover preview"
                            className="w-full rounded-lg border border-slate-200 object-cover"
                            style={{ maxHeight: 180 }}
                        />
                    )}
                    <Field label="Caption">
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            value={coverCaption}
                            onChange={(e) => setCoverCaption(e.target.value)}
                            placeholder="Photo credit or context"
                        />
                    </Field>
                </Card>

                <Card className="p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-700">Excerpt</h2>
                    <Field label="Card excerpt" hint="Defaults to the first 200 chars of the body">
                        <textarea
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            rows={3}
                            value={excerpt}
                            onChange={(e) => setExcerpt(e.target.value)}
                            placeholder={derivedExcerpt || "Auto-generated from the body"}
                            maxLength={300}
                        />
                    </Field>
                </Card>
            </aside>
        </div>
    );
}
