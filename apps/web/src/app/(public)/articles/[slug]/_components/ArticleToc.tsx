"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Table of contents sidebar for an article.
 *
 *  - Reads h2 elements out of `#article-body` after mount (h3 sub-headings
 *    intentionally omitted — the rail stays scannable on long articles).
 *  - Assigns a slugified `id` to any heading that doesn't already have one
 *    (the markdown→HTML parser doesn't emit ids).
 *  - Renders a sticky list of anchor links. Clicking scrolls smoothly to the
 *    section; an IntersectionObserver highlights the section currently in view.
 *
 * No SSR — runs client-side only, so existing articles work without re-import.
 */

type Heading = { id: string; text: string };

function slugify(s: string): string {
    return s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 80);
}

export default function ArticleToc({ bodyId = "article-body" }: { bodyId?: string }) {
    const [headings, setHeadings] = useState<Heading[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // Collect headings + assign IDs on mount.
    useEffect(() => {
        const body = document.getElementById(bodyId);
        if (!body) return;

        const nodes = Array.from(body.querySelectorAll<HTMLElement>("h2"));
        const usedIds = new Set<string>();
        const collected: Heading[] = [];

        for (const el of nodes) {
            const text = (el.textContent || "").trim();
            if (!text) continue;

            let id = el.id || slugify(text) || `h-${collected.length}`;
            // Disambiguate collisions: same heading text twice in one article.
            let suffix = 2;
            while (usedIds.has(id)) {
                id = `${slugify(text)}-${suffix++}`;
            }
            usedIds.add(id);
            el.id = id;

            // Scroll offset margin so the heading doesn't hide behind the sticky header.
            el.style.scrollMarginTop = "5rem";

            collected.push({ id, text });
        }

        setHeadings(collected);
    }, [bodyId]);

    // Highlight the section currently in view.
    useEffect(() => {
        if (headings.length === 0) return;
        observerRef.current?.disconnect();

        const obs = new IntersectionObserver(
            (entries) => {
                // Pick the topmost intersecting entry as "active".
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) {
                    setActiveId(visible[0].target.id);
                }
            },
            { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
        );

        for (const h of headings) {
            const el = document.getElementById(h.id);
            if (el) obs.observe(el);
        }
        observerRef.current = obs;
        return () => obs.disconnect();
    }, [headings]);

    if (headings.length === 0) return null;

    return (
        <nav aria-label="Table of contents" className="text-sm">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                On this page
            </p>
            <ul className="space-y-1.5">
                {headings.map((h) => {
                    const isActive = h.id === activeId;
                    return (
                        <li key={h.id}>
                            <a
                                href={`#${h.id}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    const el = document.getElementById(h.id);
                                    if (el) {
                                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                                        history.replaceState(null, "", `#${h.id}`);
                                    }
                                }}
                                className={`block rounded-md border-l-2 py-1 pl-3 pr-2 transition ${
                                    isActive
                                        ? "border-primary-600 bg-primary-50/60 dark:bg-primary-500/10 font-semibold text-primary-700 dark:text-primary-300"
                                        : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                                {h.text}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
