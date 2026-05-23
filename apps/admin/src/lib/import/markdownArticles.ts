/**
 * Markdown import for articles.
 *
 * Format:
 *   - File begins with YAML-light frontmatter wrapped in `---`.
 *   - Body is standard Markdown, converted to HTML on import.
 *
 * Frontmatter parser is purpose-built (no js-yaml dependency). It
 * supports the subset we actually need:
 *   - Scalar values: strings, booleans, numbers
 *   - JSON arrays:   tags: ["a", "b"]
 *   - JSON objects (inline or 2-space-indented multi-line) for `author`
 *     and `seo` nested blocks.
 *
 * The MD → HTML converter is the same — purpose-built and small.
 * Articles authored in the rich editor remain HTML; imports are normalised
 * to HTML so both paths land in the same `body` field.
 */
import {
    ARTICLE_CATEGORIES,
    DEFAULT_ARTICLE_SEO,
    deriveArticleExcerpt,
    type ArticleCategory,
    type ArticleSeo,
    type ArticleStatus,
    type ArticleStructuredDataType,
    type CreateArticleInput,
} from "@digimine/types";

const VALID_CATEGORIES = new Set<ArticleCategory>(ARTICLE_CATEGORIES.map((c) => c.id));
const VALID_STATUSES: ReadonlySet<ArticleStatus> = new Set(["draft", "scheduled", "published", "archived"]);
const VALID_STRUCTURED_TYPES: ReadonlySet<ArticleStructuredDataType> = new Set([
    "Article",
    "BlogPosting",
    "NewsArticle",
    "TechArticle",
    "HowTo",
]);

// ─────────────────────────────────────────────────────────────────────
// Frontmatter parsing
// ─────────────────────────────────────────────────────────────────────

type FrontmatterValue = string | number | boolean | null | FrontmatterValue[] | { [k: string]: FrontmatterValue };

interface FrontmatterParseResult {
    data: Record<string, FrontmatterValue>;
    errors: string[];
}

function stripQuotes(raw: string): string {
    const trimmed = raw.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function tryParseJson<T>(raw: string): T | undefined {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}

/**
 * Parse a single scalar/inline value. Supports JSON arrays + objects when
 * the value starts with `[` or `{`; booleans / numbers when they match
 * exactly; everything else falls back to a string.
 */
function parseScalar(raw: string): FrontmatterValue {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed === "null") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        const parsed = tryParseJson<FrontmatterValue>(trimmed);
        if (parsed !== undefined) return parsed;
    }
    return stripQuotes(trimmed);
}

/**
 * Parse a multi-line nested object block, eg:
 *
 *   author:
 *     name: "X"
 *     bio: "Y"
 *
 * Returns the parsed object and the index of the first line that is
 * NOT part of the nested block.
 */
function parseNestedObject(
    lines: string[],
    start: number,
    indent: number,
    errors: string[]
): { value: Record<string, FrontmatterValue>; nextIndex: number } {
    const value: Record<string, FrontmatterValue> = {};
    let i = start;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i += 1;
            continue;
        }
        const leadingSpaces = line.length - line.trimStart().length;
        if (leadingSpaces < indent) break;
        if (leadingSpaces > indent) {
            errors.push(`Unexpected indent at line ${i + 1}`);
            i += 1;
            continue;
        }
        const inner = line.slice(indent);
        const colon = inner.indexOf(":");
        if (colon < 0) {
            errors.push(`Missing ':' at line ${i + 1}`);
            i += 1;
            continue;
        }
        const key = inner.slice(0, colon).trim();
        const rest = inner.slice(colon + 1).trim();
        if (!rest) {
            // Could be a deeper nested block — recurse one level.
            const child = parseNestedObject(lines, i + 1, indent + 2, errors);
            value[key] = child.value;
            i = child.nextIndex;
            continue;
        }
        value[key] = parseScalar(rest);
        i += 1;
    }
    return { value, nextIndex: i };
}

function parseFrontmatter(text: string): FrontmatterParseResult {
    const errors: string[] = [];
    const data: Record<string, FrontmatterValue> = {};
    const lines = text.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i += 1;
            continue;
        }
        // Comment lines (yaml-style) are ignored.
        if (line.trim().startsWith("#")) {
            i += 1;
            continue;
        }
        const leadingSpaces = line.length - line.trimStart().length;
        if (leadingSpaces > 0) {
            errors.push(`Unexpected indent at top level on line ${i + 1}`);
            i += 1;
            continue;
        }
        const colon = line.indexOf(":");
        if (colon < 0) {
            errors.push(`Missing ':' on line ${i + 1}`);
            i += 1;
            continue;
        }
        const key = line.slice(0, colon).trim();
        const rest = line.slice(colon + 1).trim();
        if (!rest) {
            const child = parseNestedObject(lines, i + 1, 2, errors);
            data[key] = child.value;
            i = child.nextIndex;
            continue;
        }
        data[key] = parseScalar(rest);
        i += 1;
    }
    return { data, errors };
}

// ─────────────────────────────────────────────────────────────────────
// Markdown → HTML
// ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function applyInline(text: string): string {
    // 1. Inline code first — protect from other replacements with placeholders.
    const codePlaceholders: string[] = [];
    let safe = text.replace(/`([^`]+)`/g, (_, code: string) => {
        codePlaceholders.push(`<code>${escapeHtml(code)}</code>`);
        return `CODE${codePlaceholders.length - 1}`;
    });

    safe = escapeHtml(safe);

    // Images: ![alt](url)
    safe = safe.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]+)&quot;)?\)/g, (_, alt, url, title) => {
        const t = title ? ` title="${title}"` : "";
        return `<img src="${url}" alt="${alt}"${t} />`;
    });
    // Links: [text](url)
    safe = safe.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
    // Bold: **text** / __text__
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // Italic: *text* / _text_ (avoid eating ** by lookaround)
    safe = safe.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    safe = safe.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

    // Restore inline code.
    safe = safe.replace(/CODE(\d+)/g, (_, idx) => codePlaceholders[Number(idx)] || "");
    return safe;
}

function markdownToHtml(md: string): string {
    if (!md) return "";
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];
    let i = 0;
    let listType: "ul" | "ol" | null = null;
    let inBlockquote = false;
    let paragraph: string[] = [];

    const flushParagraph = () => {
        if (!paragraph.length) return;
        const text = paragraph.join(" ").trim();
        if (text) out.push(`<p>${applyInline(text)}</p>`);
        paragraph = [];
    };
    const closeList = () => {
        if (listType) {
            out.push(`</${listType}>`);
            listType = null;
        }
    };
    const closeBlockquote = () => {
        if (inBlockquote) {
            out.push("</blockquote>");
            inBlockquote = false;
        }
    };

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code block ```lang ... ```
        const fence = /^```(\w*)\s*$/.exec(line);
        if (fence) {
            flushParagraph();
            closeList();
            closeBlockquote();
            const lang = fence[1] || "";
            const buf: string[] = [];
            i += 1;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                buf.push(lines[i]);
                i += 1;
            }
            i += 1; // consume closing fence
            const classAttr = lang ? ` class="language-${lang}"` : "";
            out.push(`<pre><code${classAttr}>${escapeHtml(buf.join("\n"))}</code></pre>`);
            continue;
        }

        // Blank line — paragraph / list / blockquote boundary
        if (!line.trim()) {
            flushParagraph();
            closeList();
            closeBlockquote();
            i += 1;
            continue;
        }

        // Heading
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading) {
            flushParagraph();
            closeList();
            closeBlockquote();
            const level = heading[1].length;
            out.push(`<h${level}>${applyInline(heading[2].trim())}</h${level}>`);
            i += 1;
            continue;
        }

        // Horizontal rule
        if (/^(\*\*\*|---|___)\s*$/.test(line)) {
            flushParagraph();
            closeList();
            closeBlockquote();
            out.push("<hr />");
            i += 1;
            continue;
        }

        // Blockquote
        const bq = /^>\s?(.*)$/.exec(line);
        if (bq) {
            flushParagraph();
            closeList();
            if (!inBlockquote) {
                out.push("<blockquote>");
                inBlockquote = true;
            }
            out.push(`<p>${applyInline(bq[1])}</p>`);
            i += 1;
            continue;
        }

        // Unordered list
        const ul = /^\s*[-*+]\s+(.+)$/.exec(line);
        if (ul) {
            flushParagraph();
            closeBlockquote();
            if (listType !== "ul") {
                closeList();
                out.push("<ul>");
                listType = "ul";
            }
            out.push(`<li>${applyInline(ul[1])}</li>`);
            i += 1;
            continue;
        }

        // Ordered list
        const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
        if (ol) {
            flushParagraph();
            closeBlockquote();
            if (listType !== "ol") {
                closeList();
                out.push("<ol>");
                listType = "ol";
            }
            out.push(`<li>${applyInline(ol[1])}</li>`);
            i += 1;
            continue;
        }

        // Regular paragraph line
        paragraph.push(line.trim());
        i += 1;
    }
    flushParagraph();
    closeList();
    closeBlockquote();

    return out.join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export interface ArticleParseSuccess {
    ok: true;
    input: CreateArticleInput;
    warnings: string[];
}

export interface ArticleParseFailure {
    ok: false;
    errors: string[];
    warnings: string[];
}

export type ArticleParseResult = ArticleParseSuccess | ArticleParseFailure;

function ensureString(v: FrontmatterValue | undefined): string | undefined {
    if (v == null) return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return undefined;
}

function ensureStringArray(v: FrontmatterValue | undefined): string[] | undefined {
    if (v == null) return undefined;
    if (typeof v === "string") {
        return v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (Array.isArray(v)) return v.map((item) => String(item).trim()).filter(Boolean);
    return undefined;
}

function ensureObject(v: FrontmatterValue | undefined): Record<string, FrontmatterValue> | undefined {
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, FrontmatterValue>;
    return undefined;
}

/**
 * Parse a single article markdown file (frontmatter + body) into a
 * CreateArticleInput. Returns a structured result so callers can show
 * per-file errors in the import UI.
 */
export function parseArticleMarkdown(source: string): ArticleParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const trimmed = source.replace(/^\uFEFF/, "");

    // Detect frontmatter — accept either leading or first non-empty line.
    const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
    if (!match) {
        return {
            ok: false,
            errors: ["Missing frontmatter — file must begin with `---` block. Use the template as a starting point."],
            warnings,
        };
    }
    const frontmatterText = match[1];
    const body = trimmed.slice(match[0].length).trimStart();

    const { data, errors: fmErrors } = parseFrontmatter(frontmatterText);
    errors.push(...fmErrors);

    const title = ensureString(data.title)?.trim();
    if (!title) {
        errors.push("`title` is required in frontmatter.");
    }

    const categoryRaw = ensureString(data.category)?.trim();
    const category = categoryRaw && VALID_CATEGORIES.has(categoryRaw as ArticleCategory) ? (categoryRaw as ArticleCategory) : null;
    if (!category) {
        errors.push(
            `\`category\` is required and must be one of: ${Array.from(VALID_CATEGORIES).join(", ")}`
        );
    }

    if (errors.length || !title || !category) {
        return { ok: false, errors, warnings };
    }

    const statusRaw = ensureString(data.status)?.trim();
    let status: ArticleStatus = "draft";
    if (statusRaw) {
        if (VALID_STATUSES.has(statusRaw as ArticleStatus)) {
            status = statusRaw as ArticleStatus;
        } else {
            warnings.push(`Unknown status "${statusRaw}" — falling back to draft.`);
        }
    }

    // Convert MD body → HTML so the editor / public renderer see the
    // same shape as articles authored inline.
    const html = markdownToHtml(body);

    // SEO
    const seoData = ensureObject(data.seo) || {};
    const seo: Partial<ArticleSeo> = { ...DEFAULT_ARTICLE_SEO };
    const seoMetaTitle = ensureString(seoData.metaTitle);
    if (seoMetaTitle !== undefined) seo.metaTitle = seoMetaTitle;
    const seoMetaDesc = ensureString(seoData.metaDescription);
    if (seoMetaDesc !== undefined) seo.metaDescription = seoMetaDesc;
    const canonical = ensureString(seoData.canonicalUrl);
    if (canonical !== undefined) seo.canonicalUrl = canonical || null;
    const ogImage = ensureString(seoData.ogImageUrl);
    if (ogImage !== undefined) seo.ogImageUrl = ogImage || null;
    const focus = ensureString(seoData.focusKeyword);
    if (focus !== undefined) seo.focusKeyword = focus || null;
    const keywords = ensureStringArray(seoData.keywords);
    if (keywords !== undefined) seo.keywords = keywords;
    const twCard = ensureString(seoData.twitterCard);
    if (twCard === "summary" || twCard === "summary_large_image") seo.twitterCard = twCard;
    const structured = ensureString(seoData.structuredDataType);
    if (structured && VALID_STRUCTURED_TYPES.has(structured as ArticleStructuredDataType)) {
        seo.structuredDataType = structured as ArticleStructuredDataType;
    } else if (structured) {
        warnings.push(`Unknown structuredDataType "${structured}" — falling back to "Article".`);
    }
    if (seoData.noIndex !== undefined) seo.noIndex = Boolean(seoData.noIndex);
    const socialTitle = ensureString(seoData.socialTitle);
    if (socialTitle !== undefined) seo.socialTitle = socialTitle || null;
    const socialDesc = ensureString(seoData.socialDescription);
    if (socialDesc !== undefined) seo.socialDescription = socialDesc || null;

    // Author
    const authorData = ensureObject(data.author) || {};
    const author = {
        name: ensureString(authorData.name) || undefined,
        bio: ensureString(authorData.bio) || undefined,
        twitter: ensureString(authorData.twitter) || undefined,
        linkedin: ensureString(authorData.linkedin) || undefined,
        avatarUrl: ensureString(authorData.avatarUrl) || undefined,
    };

    const subjectRaw = ensureString(data.subject)?.trim();
    if (subjectRaw && category !== "subject-topic") {
        warnings.push(`\`subject\` is only used when category is "subject-topic" — ignoring.`);
    }

    const input: CreateArticleInput = {
        title,
        slug: ensureString(data.slug)?.trim() || undefined,
        subtitle: ensureString(data.subtitle)?.trim() || undefined,
        excerpt: ensureString(data.excerpt)?.trim() || deriveArticleExcerpt(html),
        body: html,
        coverImageUrl: ensureString(data.coverImageUrl)?.trim() || null,
        coverCaption: ensureString(data.coverCaption)?.trim() || null,
        category,
        subject: category === "subject-topic" ? subjectRaw || null : null,
        tags: ensureStringArray(data.tags) || [],
        status,
        scheduledFor: undefined,
        isFeatured: Boolean(data.isFeatured),
        seo,
        author,
    };

    if (status === "scheduled") {
        const sched = ensureString(data.scheduledFor)?.trim();
        if (sched) {
            const date = new Date(sched);
            if (Number.isNaN(date.getTime())) {
                warnings.push(`scheduledFor "${sched}" is not a valid date — leaving unscheduled.`);
            } else {
                (input as any).scheduledFor = date;
            }
        } else {
            warnings.push("status is `scheduled` but `scheduledFor` is missing — falling back to draft.");
            input.status = "draft";
        }
    }

    return { ok: true, input, warnings };
}

// ─────────────────────────────────────────────────────────────────────
// Template
// ─────────────────────────────────────────────────────────────────────

export const ARTICLE_MARKDOWN_TEMPLATE = `---
# ─── REQUIRED ─────────────────────────────────────────────────────
title: "Your article title here"
category: "tutorial"   # tech-news | tutorial | subject-topic | guide | case-study | announcement | opinion | exam-update | career

# ─── OPTIONAL ─────────────────────────────────────────────────────
subtitle: "An optional dek shown under the title"
slug: ""                              # auto-generated from title when blank
subject: ""                           # only used when category is subject-topic (e.g. "Physics")
tags: ["beginner", "neet"]
status: "draft"                       # draft | scheduled | published | archived
scheduledFor: ""                      # ISO date when status=scheduled, e.g. 2026-06-01T09:00:00Z
isFeatured: false
coverImageUrl: ""
coverCaption: ""
excerpt: ""                           # auto-derived from body when blank

author:
  name: ""                            # falls back to your admin name when blank
  bio: ""
  twitter: ""                         # without @
  linkedin: ""

seo:
  metaTitle: ""                       # 50–60 chars; falls back to title
  metaDescription: ""                 # 150–160 chars; falls back to excerpt
  canonicalUrl: ""                    # blank uses /articles/{slug}
  ogImageUrl: ""                      # blank uses coverImageUrl
  focusKeyword: ""
  keywords: []
  twitterCard: "summary_large_image"  # summary | summary_large_image
  structuredDataType: "Article"       # Article | BlogPosting | NewsArticle | TechArticle | HowTo
  noIndex: false
  socialTitle: ""
  socialDescription: ""
---

# Your Article Title

Open with a strong hook — one sentence that earns the next paragraph.

## What you'll learn

- Bullet a
- Bullet b
- Bullet c

## Body

Use **bold**, *italic*, and \`inline code\` to add texture. Standard Markdown
links work: [PlacementRanker](https://placementranker.com).

\`\`\`python
def hello():
    print("Code blocks are preserved with syntax-class hints.")
\`\`\`

> Block quotes work too. Use them for callouts, citations, and asides.

### Sub-sections

You can go up to six heading levels. Keep it shallow when you can.

1. Numbered lists work
2. As do unordered ones (-, *, +)
3. And mixed paragraphs in between.

![Alt text for the image](https://example.com/diagram.png)

## Wrapping up

End with a clear takeaway so the reader knows what to do next.
`;

export function downloadArticleTemplate(filename = "article-template.md") {
    if (typeof window === "undefined") return;
    const blob = new Blob([ARTICLE_MARKDOWN_TEMPLATE], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Re-export the MD→HTML helper so other tooling can convert ad-hoc.
export { markdownToHtml };
