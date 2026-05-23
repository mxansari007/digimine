/**
 * Downloadable JSON templates for course content. Three flavours so admins
 * can author at the granularity that fits — a whole course end-to-end, a
 * single chapter to append to an existing course, or a single subtopic to
 * drop into a chapter. Shapes mirror the Course / CourseNoteChapter /
 * CourseNoteSubtopic types in @digimine/types.
 *
 * Body fields (`description`, `contentHtml`) take HTML strings so they paste
 * straight into the TipTap editor without conversion. Keep examples small
 * and obviously placeholder.
 */

// ─────────────────────────────────────────────────────────────────────
// Full course skeleton — course metadata + chapters[] + subtopics[]
// ─────────────────────────────────────────────────────────────────────
export const COURSE_JSON_TEMPLATE = JSON.stringify(
    {
        title: "Full-Stack Web Development Bootcamp",
        slug: "full-stack-web-development-bootcamp",
        description: "<p>A comprehensive course covering HTML, CSS, JavaScript, React, Node.js and databases — with real projects throughout.</p>",
        shortDescription: "Learn full-stack development from scratch with hands-on projects.",
        thumbnailURL: "",
        status: "draft",
        accessType: "enrollment_required",
        price: 999,
        compareAtPrice: 2999,
        category: "Web Development",
        tags: ["web", "react", "node", "javascript"],
        difficulty: "beginner",
        estimatedHours: 40,
        linkedTestSeriesIds: [],
        linkedQuizzes: [],
        chapters: [
            {
                title: "Chapter 1: Introduction to Web Development",
                description: "Get started with the fundamentals of the web.",
                order: 1,
                subtopics: [
                    {
                        title: "How the Web Works",
                        summary: "An overview of clients, servers, and the request/response cycle.",
                        contentHtml:
                            "<p>The web is built on a <strong>client-server architecture</strong>.</p>" +
                            "<h2>Key concepts</h2>" +
                            "<ul><li>HTTP / HTTPS</li><li>DNS</li><li>Browsers and servers</li></ul>" +
                            "<h2>HTTP status codes at a glance</h2>" +
                            "<table class=\"md-table\">" +
                            "<thead><tr><th>Range</th><th>Meaning</th><th data-align=\"right\">Examples</th></tr></thead>" +
                            "<tbody>" +
                            "<tr><td>2xx</td><td>Success</td><td data-align=\"right\">200, 201, 204</td></tr>" +
                            "<tr><td>3xx</td><td>Redirect</td><td data-align=\"right\">301, 302, 304</td></tr>" +
                            "<tr><td>4xx</td><td>Client error</td><td data-align=\"right\">400, 401, 404</td></tr>" +
                            "<tr><td>5xx</td><td>Server error</td><td data-align=\"right\">500, 502, 503</td></tr>" +
                            "</tbody></table>" +
                            "<blockquote>Tip: the contentHtml field accepts any HTML — tables, callouts, figures, embeds.</blockquote>",
                        imageUrls: [],
                        videos: [],
                        order: 1,
                        seo: {
                            metaTitle: "",
                            metaDescription: "",
                            focusKeyword: "",
                            keywords: [],
                        },
                    },
                    {
                        title: "Setting Up Your Development Environment",
                        summary: "Install the tools you'll need to write code.",
                        contentHtml: "<p>You'll need a code editor (VS Code), a modern browser, and Node.js installed.</p>",
                        imageUrls: [],
                        videos: [
                            {
                                title: "VS Code Setup Walkthrough",
                                url: "https://www.youtube.com/watch?v=REPLACE_WITH_ID",
                                provider: "youtube",
                                videoId: "REPLACE_WITH_ID",
                            },
                        ],
                        order: 2,
                    },
                ],
            },
            {
                title: "Chapter 2: HTML & CSS Foundations",
                description: "Structure and style your first web pages.",
                order: 2,
                subtopics: [],
            },
        ],
    },
    null,
    2
);

// ─────────────────────────────────────────────────────────────────────
// Single chapter — append to an existing course
// ─────────────────────────────────────────────────────────────────────
export const COURSE_CHAPTER_JSON_TEMPLATE = JSON.stringify(
    {
        title: "Chapter 5: React Hooks Deep Dive",
        description: "Master useState, useEffect, useMemo, useCallback, and custom hooks.",
        order: 5,
        subtopics: [
            {
                title: "useState Patterns",
                summary: "Common patterns and pitfalls when managing component state.",
                contentHtml: "<p>useState is the most fundamental React hook…</p>",
                imageUrls: [],
                videos: [],
                order: 1,
            },
            {
                title: "useEffect: Side Effects in React",
                summary: "When and how to use the effect hook correctly.",
                contentHtml:
                    "<p>Effects run after render — use the dependency array carefully.</p>" +
                    "<h3>Cheatsheet</h3>" +
                    "<table class=\"md-table\">" +
                    "<thead><tr><th>Dependency array</th><th>When effect runs</th></tr></thead>" +
                    "<tbody>" +
                    "<tr><td><code>[]</code></td><td>Once, on mount</td></tr>" +
                    "<tr><td><code>[a, b]</code></td><td>When <code>a</code> or <code>b</code> changes</td></tr>" +
                    "<tr><td>omitted</td><td>Every render (usually a bug)</td></tr>" +
                    "</tbody></table>",
                imageUrls: [],
                videos: [],
                order: 2,
            },
        ],
    },
    null,
    2
);

// ─────────────────────────────────────────────────────────────────────
// Single subtopic — append to an existing chapter
// ─────────────────────────────────────────────────────────────────────
export const COURSE_SUBTOPIC_JSON_TEMPLATE = JSON.stringify(
    {
        title: "Custom Hooks: Encapsulating Stateful Logic",
        summary: "Learn how to extract reusable logic into custom hooks.",
        contentHtml:
            "<p>Custom hooks are JavaScript functions whose names start with <code>use</code> and that may call other hooks.</p>" +
            "<h2>When to extract a hook</h2>" +
            "<table class=\"md-table\">" +
            "<thead><tr><th>Pattern</th><th>Good custom hook?</th></tr></thead>" +
            "<tbody>" +
            "<tr><td>Sharing stateful logic across 2+ components</td><td data-align=\"center\">✅</td></tr>" +
            "<tr><td>Wrapping a browser API (matchMedia, localStorage)</td><td data-align=\"center\">✅</td></tr>" +
            "<tr><td>One-off logic in a single component</td><td data-align=\"center\">❌</td></tr>" +
            "</tbody></table>" +
            "<h2>Example: useLocalStorage</h2>" +
            "<pre><code>function useLocalStorage(key, initial) { /* … */ }</code></pre>" +
            "<blockquote>HTML reminder: this field is HTML — use any tags you need (tables, figures, callouts).</blockquote>",
        imageUrls: [],
        videos: [
            {
                title: "Custom Hooks Tutorial",
                url: "https://www.youtube.com/watch?v=REPLACE_WITH_ID",
                provider: "youtube",
                videoId: "REPLACE_WITH_ID",
            },
        ],
        order: 1,
        seo: {
            metaTitle: "Custom React Hooks Tutorial",
            metaDescription: "Learn to write and use custom hooks in React to share stateful logic across components.",
            focusKeyword: "custom react hooks",
            keywords: ["react", "hooks", "tutorial"],
            structuredDataType: "TechArticle",
        },
    },
    null,
    2
);

// ─────────────────────────────────────────────────────────────────────
// Downloaders (browser-only)
// ─────────────────────────────────────────────────────────────────────
function downloadJson(json: string, filename: string) {
    if (typeof window === "undefined") return;
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadCourseTemplate(filename = "course-template.json") {
    downloadJson(COURSE_JSON_TEMPLATE, filename);
}
export function downloadChapterTemplate(filename = "course-chapter-template.json") {
    downloadJson(COURSE_CHAPTER_JSON_TEMPLATE, filename);
}
export function downloadSubtopicTemplate(filename = "course-subtopic-template.json") {
    downloadJson(COURSE_SUBTOPIC_JSON_TEMPLATE, filename);
}
