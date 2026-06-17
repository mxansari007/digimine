"use client";

/**
 * On-page "start a new resume" gallery (Microsoft-Word style). A horizontal
 * scroll strip so it always stays ONE row — adding more templates never pushes
 * the "Your resumes" section down. Fully data-driven: it renders whatever
 * templates it's given (built-ins + admin-created), each as a real scaled-down
 * live preview. Hover pops ONE large, readable zoom preview, portaled to
 * <body> and clamped to the viewport so edge cards are never cut off.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    DEFAULT_RESUME_TEMPLATE,
    RESUME_FONTS,
    RESUME_TEMPLATE_FAMILIES,
    resumeTemplateFamily,
    SAMPLE_RESUME_DATA,
    type ResumeTemplateSpec,
} from "@digimine/types";

const THUMB_FONT = RESUME_FONTS[0];
// Representative two-tone palette for thumbnails so layouts that use a second
// accent (bands, icons) read clearly instead of looking monochrome.
const THUMB_ACCENT = "#0f766e";
const THUMB_ACCENT2 = "#1f2937";
import ResumePreview from "@/components/resume/ResumePreview";

interface Props {
    busy: boolean;
    templates: ResumeTemplateSpec[];
    onCreate: (templateId: string, withSample: boolean) => void;
}

const CARD =
    "group flex w-[190px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-soft disabled:cursor-default disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900";

const PAGE_W = 794;
const THUMB_SCALE = 0.24;
const ZOOM_W = 320;
const ZOOM_SCALE = ZOOM_W / PAGE_W;
const ZOOM_H = Math.round(ZOOM_W * 1.414);
const PANEL_W = ZOOM_W + 16;
const PANEL_H = ZOOM_H + 44;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ArrowBtn = ({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) => (
    <button
        type="button"
        aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
        onClick={onClick}
        className={`absolute top-[95px] z-10 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-soft transition hover:bg-slate-50 group-hover/strip:opacity-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${
            dir === "left" ? "-left-3" : "-right-3"
        }`}
    >
        {dir === "left" ? "‹" : "›"}
    </button>
);

export default function TemplateGallery({ busy, templates, onCreate }: Props) {
    const [mounted, setMounted] = useState(false);
    const [active, setActive] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ left: 0, top: 0 });
    const [family, setFamily] = useState<string>("All");
    const stripRef = useRef<HTMLDivElement>(null);

    useEffect(() => setMounted(true), []);

    const families = RESUME_TEMPLATE_FAMILIES.filter((f) => templates.some((t) => resumeTemplateFamily(t) === f));
    const shownTemplates = family === "All" ? templates : templates.filter((t) => resumeTemplateFamily(t) === family);

    const onEnter = (id: string, el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const left = clamp(r.left + r.width / 2 - PANEL_W / 2, 8, window.innerWidth - PANEL_W - 8);
        const top = clamp(r.top + r.height / 2 - PANEL_H / 2, 8, window.innerHeight - PANEL_H - 8);
        setActive(id);
        setPos({ left, top });
        setVisible(true);
    };

    const scroll = (dir: -1 | 1) => {
        stripRef.current?.scrollBy({ left: dir * 440, behavior: "smooth" });
        setVisible(false);
    };

    const shown = (active && templates.find((t) => t.id === active)) || templates[0];

    const zoomPanel = shown ? (
        <div
            aria-hidden
            className="pointer-events-none fixed z-[60] transition duration-200 ease-out"
            style={{
                left: pos.left,
                top: pos.top,
                opacity: visible ? 1 : 0,
                transform: `scale(${visible ? 1 : 0.96})`,
                transformOrigin: "center",
            }}
        >
            <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                <div className="relative overflow-hidden rounded-md bg-white" style={{ width: ZOOM_W, height: ZOOM_H }}>
                    <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${ZOOM_SCALE})`, width: PAGE_W }}>
                        <ResumePreview data={SAMPLE_RESUME_DATA} spec={shown} accent={THUMB_ACCENT} accent2={THUMB_ACCENT2} font={THUMB_FONT} fontScale={1} />
                    </div>
                </div>
                <div className="px-1 pb-0.5 pt-1.5 text-center text-xs font-medium text-slate-700 dark:text-slate-200">
                    {shown.label}
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
                {(["All", ...families] as string[]).map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => {
                            setFamily(f);
                            setVisible(false);
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            family === f
                                ? "border-primary-500 bg-primary-600 text-white"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>
            <div className="group/strip relative">
                <ArrowBtn dir="left" onClick={() => scroll(-1)} />
                <ArrowBtn dir="right" onClick={() => scroll(1)} />

            <div
                ref={stripRef}
                className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-3 [scrollbar-color:theme(colors.slate.300)_transparent] [scrollbar-width:thin]"
            >
                {/* Blank */}
                <button type="button" disabled={busy} onClick={() => onCreate(DEFAULT_RESUME_TEMPLATE, false)} className={CARD}>
                    <div className="grid h-[200px] place-items-center border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="text-center text-slate-400">
                            <div className="mx-auto mb-1 grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-slate-300 text-xl dark:border-slate-600">
                                +
                            </div>
                            <div className="text-xs font-medium">Blank</div>
                        </div>
                    </div>
                    <div className="p-2.5">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Blank document</div>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">Start from scratch</p>
                    </div>
                </button>

                {/* Templates */}
                {shownTemplates.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        disabled={busy}
                        onClick={() => onCreate(t.id, true)}
                        onMouseEnter={(e) => onEnter(t.id, e.currentTarget)}
                        onMouseLeave={() => setVisible(false)}
                        className={CARD}
                    >
                        <div className="relative h-[200px] overflow-hidden border-b border-slate-100 bg-slate-100 dark:border-slate-800">
                            <div
                                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                                style={{ transform: `scale(${THUMB_SCALE})`, width: PAGE_W }}
                            >
                                <ResumePreview data={SAMPLE_RESUME_DATA} spec={t} accent={THUMB_ACCENT} accent2={THUMB_ACCENT2} font={THUMB_FONT} fontScale={1} />
                            </div>
                            <span className="absolute bottom-2 right-2 rounded-md bg-primary-600 px-2 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                                Use →
                            </span>
                        </div>
                        <div className="p-2.5">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.label}</div>
                            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{t.blurb}</p>
                        </div>
                    </button>
                ))}
            </div>

                {mounted ? createPortal(zoomPanel, document.body) : null}
            </div>
        </div>
    );
}
