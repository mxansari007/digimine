import type { ElementType } from "react";

export interface FormattedContentProps {
    html?: string | null;
    className?: string;
    size?: "sm" | "base" | "lg";
    as?: "div" | "span";
}

const BLOCKED_TAGS = ["script", "style", "object", "embed", "form"];

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getAttribute(attrs: string, name: string): string {
    const doubleQuoted = attrs.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
    if (doubleQuoted?.[1]) return doubleQuoted[1];

    const singleQuoted = attrs.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, "i"));
    if (singleQuoted?.[1]) return singleQuoted[1];

    const unquoted = attrs.match(new RegExp(`\\s${name}\\s*=\\s*([^\\s>]+)`, "i"));
    return unquoted?.[1] || "";
}

function getYouTubeVideoId(url: string): string | null {
    const trimmed = url.trim();
    const patterns = [
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/i,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i,
        /youtu\.be\/([a-zA-Z0-9_-]+)/i,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

function sanitizeIframe(attrs: string): string {
    const src = getAttribute(attrs, "src");
    const videoId = getYouTubeVideoId(src);
    if (!videoId) return "";

    const title = getAttribute(attrs, "title") || "Embedded YouTube video";
    return `<iframe src="https://www.youtube.com/embed/${escapeHtml(videoId)}" title="${escapeHtml(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}

export function stripFormattedContent(value?: string | null): string {
    if (!value) return "";
    return value
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#039;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeFormattedHtml(value?: string | null): string {
    const raw = (value || "").trim();
    if (!raw) return "";

    const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(raw);
    if (!hasHtmlTag) {
        return escapeHtml(raw).replace(/\n/g, "<br />");
    }

    let safe = raw;
    BLOCKED_TAGS.forEach((tag) => {
        safe = safe.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
        safe = safe.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
    });

    safe = safe
        .replace(/<iframe\b([^>]*)>[\s\S]*?<\/iframe>/gi, (_match, attrs) => sanitizeIframe(attrs))
        .replace(/<iframe\b([^>]*)\/?>/gi, (_match, attrs) => sanitizeIframe(attrs));

    safe = safe
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
        .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
        .replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/gi, " $1=\"#\"")
        .replace(/\s(href|src)\s*=\s*'javascript:[^']*'/gi, " $1=\"#\"")
        .replace(/\s(href|src)\s*=\s*"data:text\/html[^"]*"/gi, " $1=\"#\"")
        .replace(/\s(href|src)\s*=\s*'data:text\/html[^']*'/gi, " $1=\"#\"");

    return safe;
}

const formattedContentCss = `
.formatted-content {
    color: inherit;
    line-height: 1.7;
    overflow-wrap: anywhere;
}
.formatted-content-sm { font-size: 0.875rem; }
.formatted-content-base { font-size: 1rem; }
.formatted-content-lg { font-size: 1.125rem; }
@media (min-width: 640px) {
    .formatted-content-lg { font-size: 1.25rem; }
}
.formatted-content > :first-child { margin-top: 0; }
.formatted-content > :last-child { margin-bottom: 0; }
.formatted-content p { margin: 0.65rem 0; }
.formatted-content h1,
.formatted-content h2,
.formatted-content h3 {
    color: #111827;
    font-weight: 800;
    line-height: 1.25;
    margin: 1rem 0 0.45rem;
}
.formatted-content h1 { font-size: 1.5em; }
.formatted-content h2 { font-size: 1.25em; }
.formatted-content h3 { font-size: 1.1em; }
.formatted-content ul,
.formatted-content ol {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
}
.formatted-content ul { list-style: disc; }
.formatted-content ol { list-style: decimal; }
.formatted-content li { margin: 0.25rem 0; }
.formatted-content blockquote {
    border-left: 4px solid #c7d2fe;
    color: #4b5563;
    margin: 0.9rem 0;
    padding: 0.35rem 0 0.35rem 1rem;
    background: #eef2ff;
    border-radius: 0 0.5rem 0.5rem 0;
}
.formatted-content pre {
    background: #111827;
    color: #f9fafb;
    border-radius: 0.75rem;
    margin: 0.9rem 0;
    overflow-x: auto;
    padding: 0.9rem 1rem;
}
.formatted-content code {
    background: #eef2ff;
    color: #3730a3;
    border-radius: 0.35rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 0.9em;
    padding: 0.12rem 0.35rem;
}
.formatted-content pre code {
    background: transparent;
    color: inherit;
    padding: 0;
}
.formatted-content table {
    border-collapse: collapse;
    margin: 0.9rem 0;
    min-width: 100%;
}
.formatted-content th,
.formatted-content td {
    border: 1px solid #d1d5db;
    padding: 0.45rem 0.6rem;
    text-align: left;
}
.formatted-content th {
    background: #f3f4f6;
    color: #111827;
    font-weight: 700;
}
.formatted-content a {
    color: #4f46e5;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
}
.formatted-content img {
    border-radius: 0.75rem;
    display: block;
    height: auto;
    margin: 0.9rem 0;
    max-width: 100%;
}
.formatted-content figure.media-card {
    border: 1px solid #e2e8f0;
    border-radius: 1rem;
    background: #ffffff;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
    clear: none;
    max-width: min(100%, 34rem);
    margin: 1rem 0;
    overflow: hidden;
}
.formatted-content figure.media-card.media-align-left {
    float: left;
    margin: 0.35rem 1rem 0.75rem 0;
}
.formatted-content figure.media-card.media-align-right {
    float: right;
    margin: 0.35rem 0 0.75rem 1rem;
}
.formatted-content figure.media-card.media-align-center {
    clear: both;
    float: none;
    margin-left: auto;
    margin-right: auto;
}
.formatted-content figure.media-card.media-size-sm {
    max-width: min(100%, 16rem);
}
.formatted-content figure.media-card.media-size-md {
    max-width: min(100%, 24rem);
}
.formatted-content figure.media-card.media-size-lg {
    max-width: min(100%, 34rem);
}
.formatted-content figure.media-card.media-size-full {
    clear: both;
    max-width: 100%;
    width: 100%;
}
.formatted-content figure.media-card.media-corners-sharp {
    border-radius: 0;
}
.formatted-content figure.media-card.media-frame-plain {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
}
.formatted-content figure.media-card img {
    border-radius: 0;
    margin: 0;
    width: 100%;
}
.formatted-content figure.media-card.media-corners-sharp img,
.formatted-content figure.media-card.media-corners-sharp iframe {
    border-radius: 0;
}
.formatted-content figure.media-card figcaption {
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    color: #64748b;
    font-size: 0.82em;
    font-weight: 600;
    padding: 0.55rem 0.75rem;
}
.formatted-content figure.media-card.media-frame-plain figcaption {
    background: transparent;
    border-top-color: transparent;
    padding-left: 0;
    padding-right: 0;
}
.formatted-content figure.media-card-video {
    background: #020617;
    border-color: #0f172a;
}
.formatted-content figure.media-card-video iframe {
    aspect-ratio: 16 / 9;
    border: 0;
    display: block;
    width: 100%;
}
.formatted-content figure.media-card-video figcaption {
    background: #0f172a;
    border-top-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
}
.formatted-content iframe {
    max-width: 100%;
}
.formatted-content:not(span)::after {
    clear: both;
    content: "";
    display: block;
}
.formatted-content mark {
    background: #fef3c7;
    border-radius: 0.25rem;
    padding: 0 0.2rem;
}
.formatted-content hr {
    border: 0;
    border-top: 1px solid #e5e7eb;
    margin: 1rem 0;
}

/* ── Dark mode (Tokyo Night) ──────────────────────────────────────────────
   The web app toggles a .dark class on <html>; admin has no dark mode so these
   rules stay inert there. Tokens (--foreground / --surface / --border-token /
   --c-slate-*) are defined in the web app's globals. Without this block, the
   hardcoded light colours above (headings, blockquotes, tables, code, media
   cards) render dark-on-dark or glare on the dark article surface. */
.dark .formatted-content h1,
.dark .formatted-content h2,
.dark .formatted-content h3 { color: rgb(var(--foreground)); }
.dark .formatted-content blockquote {
    border-left-color: rgb(129 140 248 / 0.85);
    background: rgb(99 102 241 / 0.14);
    color: rgb(var(--c-slate-700));
}
.dark .formatted-content code {
    background: rgb(129 140 248 / 0.16);
    color: rgb(199 210 254);
}
.dark .formatted-content th,
.dark .formatted-content td { border-color: rgb(var(--border-token)); }
.dark .formatted-content th {
    background: rgb(var(--surface-muted));
    color: rgb(var(--foreground));
}
.dark .formatted-content a { color: rgb(129 140 248); }
.dark .formatted-content figure.media-card {
    border-color: rgb(var(--border-token));
    background: rgb(var(--surface));
    box-shadow: none;
}
.dark .formatted-content figure.media-card figcaption {
    background: rgb(var(--surface-muted));
    border-top-color: rgb(var(--border-token));
    color: rgb(var(--muted-foreground));
}
.dark .formatted-content mark {
    background: rgb(245 158 11 / 0.28);
    color: rgb(var(--foreground));
}
.dark .formatted-content hr { border-top-color: rgb(var(--border-token)); }
`;

export function FormattedContent({
    html,
    className = "",
    size = "base",
    as = "div",
}: FormattedContentProps) {
    const content = normalizeFormattedHtml(html);
    if (!content) return null;

    const Component = as as ElementType;

    return (
        <>
            <Component
                className={`formatted-content formatted-content-${size} ${className}`.trim()}
                dangerouslySetInnerHTML={{ __html: content }}
            />
            {/* Static CSS — React in dev mode flags text-content mismatch on
                <style> children during hydration even when server and client
                emit byte-identical strings (it's the documented React 18
                quirk for inline styles). suppressHydrationWarning is the
                supported escape hatch and is safe because the CSS literally
                cannot differ between renders — it's a constant. */}
            <style
                suppressHydrationWarning
                dangerouslySetInnerHTML={{ __html: formattedContentCss }}
            />
        </>
    );
}
