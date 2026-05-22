/**
 * Articles — the long-form content system that powers the public
 * /articles surface and the in-course chapter "article" view.
 *
 * Two writer roles:
 *   - Platform admins (super_admin / admin) author standalone articles
 *     in the admin app.
 *   - The same shape backs course-chapter articles when an admin wants
 *     a rich written piece attached to a course subtopic.
 *
 * Articles are HTML strings (produced by the shared `RichTextEditor`),
 * rendered through `FormattedContent` on read paths.
 */

export type ArticleStatus = "draft" | "scheduled" | "published" | "archived";

export type ArticleCategory =
    | "tech-news"
    | "tutorial"
    | "subject-topic"
    | "guide"
    | "case-study"
    | "announcement"
    | "opinion"
    | "exam-update"
    | "career";

export const ARTICLE_CATEGORIES: { id: ArticleCategory; label: string; description: string }[] = [
    {
        id: "tech-news",
        label: "Tech News",
        description: "Industry news, launches, and product updates.",
    },
    {
        id: "tutorial",
        label: "Tutorial",
        description: "Step-by-step walkthroughs for a specific skill.",
    },
    {
        id: "subject-topic",
        label: "Subject Topic",
        description: "Deep-dive on a single academic topic (algebra, kinematics, …).",
    },
    {
        id: "guide",
        label: "Guide",
        description: "Comprehensive coverage of a broader area.",
    },
    {
        id: "case-study",
        label: "Case Study",
        description: "Real-world example or postmortem.",
    },
    {
        id: "announcement",
        label: "Announcement",
        description: "Platform / product announcements.",
    },
    {
        id: "opinion",
        label: "Opinion",
        description: "Editorial or analysis.",
    },
    {
        id: "exam-update",
        label: "Exam Update",
        description: "Notification, schedule, or syllabus update.",
    },
    {
        id: "career",
        label: "Career",
        description: "Placements, prep, and career-path content.",
    },
];

/**
 * Choice of JSON-LD type emitted on the public article page. Maps loosely
 * to schema.org variants — picking the right one helps search engines
 * surface the right rich result.
 */
export type ArticleStructuredDataType =
    | "Article"
    | "BlogPosting"
    | "NewsArticle"
    | "TechArticle"
    | "HowTo";

export interface ArticleSeo {
    /** <title>. Falls back to article.title when blank. */
    metaTitle: string;
    /** <meta name="description">. 150–160 chars recommended. */
    metaDescription: string;
    /** Canonical URL — auto-defaults to `/articles/{slug}` server-side. */
    canonicalUrl: string | null;
    /** OG / Twitter share image. Falls back to coverImageUrl when blank. */
    ogImageUrl: string | null;
    /** Focus keyword + secondary keywords (also emitted as <meta name="keywords">). */
    focusKeyword: string | null;
    keywords: string[];
    /** twitter:card flavour. */
    twitterCard: "summary" | "summary_large_image";
    /** schema.org type used in JSON-LD payload. */
    structuredDataType: ArticleStructuredDataType;
    /** Suppress indexing for sensitive / WIP / time-bound pages. */
    noIndex: boolean;
    /** Optional override for og:title, og:description (use article title/meta otherwise). */
    socialTitle: string | null;
    socialDescription: string | null;
}

export const DEFAULT_ARTICLE_SEO: ArticleSeo = {
    metaTitle: "",
    metaDescription: "",
    canonicalUrl: null,
    ogImageUrl: null,
    focusKeyword: null,
    keywords: [],
    twitterCard: "summary_large_image",
    structuredDataType: "Article",
    noIndex: false,
    socialTitle: null,
    socialDescription: null,
};

export interface ArticleAuthor {
    userId: string;
    name: string;
    avatarUrl: string | null;
    bio: string | null;
    twitter: string | null;
    linkedin: string | null;
}

/**
 * Reading-time estimate the editor computes (and stores) so we don't
 * recalculate on every public read.
 */
export interface ArticleReadingMeta {
    /** Total words in the stripped body. */
    wordCount: number;
    /** Estimated reading minutes (200 wpm). */
    readingMinutes: number;
}

export interface Article {
    id: string;
    slug: string;
    title: string;
    /** Optional subtitle / dek shown under the title. */
    subtitle: string | null;
    /** Plain-text excerpt for cards (auto-derived when blank). */
    excerpt: string;
    /** Rich HTML body produced by RichTextEditor. */
    body: string;
    coverImageUrl: string | null;
    /** Caption rendered under the cover image. */
    coverCaption: string | null;
    category: ArticleCategory;
    /** Optional subject taxonomy when category is subject-topic (e.g. "Maths", "Physics"). */
    subject: string | null;
    tags: string[];
    status: ArticleStatus;
    /** When `status==="published"`, the time the post first went live. */
    publishedAt: Date | null;
    /** Scheduled publish time (for status==="scheduled"). */
    scheduledFor: Date | null;
    author: ArticleAuthor;
    reading: ArticleReadingMeta;
    seo: ArticleSeo;
    /** Surface this on the homepage / featured rail. */
    isFeatured: boolean;
    /** Per-article view counter (eventually consistent). */
    viewCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateArticleInput {
    title: string;
    slug?: string;
    subtitle?: string;
    excerpt?: string;
    body?: string;
    coverImageUrl?: string | null;
    coverCaption?: string | null;
    category: ArticleCategory;
    subject?: string | null;
    tags?: string[];
    status?: ArticleStatus;
    scheduledFor?: Date | null;
    isFeatured?: boolean;
    seo?: Partial<ArticleSeo>;
    author?: Partial<ArticleAuthor>;
}

export type UpdateArticleInput = Partial<CreateArticleInput>;

// ────────────────────────────────────────────────────────────────────
// Helpers shared across server + client
// ────────────────────────────────────────────────────────────────────

/**
 * Slugify a title — keeps the same rule as the institute slug helper so
 * URLs across the product stay consistent.
 */
export function slugifyArticleTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 80);
}

/**
 * Strip HTML tags from a body for excerpt / word-count calculations.
 * Mirrors what `stripFormattedContent()` does in @digimine/ui, but is
 * dependency-free so it can run server-side without pulling React.
 */
export function stripArticleHtml(html: string): string {
    if (!html) return "";
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<\/?[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export function computeReadingMeta(body: string): ArticleReadingMeta {
    const text = stripArticleHtml(body);
    if (!text) return { wordCount: 0, readingMinutes: 1 };
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
        wordCount: words,
        readingMinutes: Math.max(1, Math.round(words / 200)),
    };
}

export function deriveArticleExcerpt(body: string, max = 200): string {
    const text = stripArticleHtml(body);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
}
