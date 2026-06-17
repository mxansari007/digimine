"use client";

/**
 * Resume editor workspace layout (desktop):
 *   - a fixed-height region that fits the viewport; the FORM scrolls internally
 *     so the page itself doesn't scroll and the preview is ALWAYS fully visible.
 *     (We deliberately don't use position: sticky — the dashboard shell's
 *     `overflow-y-auto` wrapper makes the window the real scroller, which breaks
 *     sticky. Internal scrolling is robust regardless of the shell.)
 *   - a draggable divider resizes the two sides; neither collapses past a min.
 *     As the preview narrows, the A4 page ZOOMS OUT to fit (never clipped).
 *   - the available height is measured live (viewport − workspace top), and the
 *     resize grip sits at the divider's centre — which, because the workspace is
 *     viewport-height, is always in view.
 *
 * On small screens it stacks (preview above the form) and the page scrolls.
 */
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_W = 794; // fixed A4 page width (96dpi) the resume renders at
const MIN_FORM = 340;
const MIN_PREVIEW = 380;
const STORAGE_KEY = "resumeEditorLeftPx";

interface Props {
    left: React.ReactNode;
    rightTop: React.ReactNode;
    resume: React.ReactNode;
}

export default function EditorWorkspace({ left, rightTop, resume }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const leftPxRef = useRef(540);

    const [isLg, setIsLg] = useState(false);
    const [leftPx, setLeftPxState] = useState(540);
    const [zoom, setZoom] = useState(1);
    const [availH, setAvailH] = useState<number | null>(null);

    const setLeftPx = useCallback((px: number) => {
        leftPxRef.current = px;
        setLeftPxState(px);
    }, []);

    const clampLeft = useCallback((px: number) => {
        const cw = containerRef.current?.clientWidth ?? 1200;
        return Math.max(MIN_FORM, Math.min(px, cw - MIN_PREVIEW - 16));
    }, []);

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1024px)");
        const sync = () => setIsLg(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);

    useEffect(() => {
        const saved = Number(localStorage.getItem(STORAGE_KEY));
        if (saved && saved >= MIN_FORM) setLeftPx(saved);
    }, [setLeftPx]);

    // Fit the workspace to the remaining viewport height (so the form scrolls
    // inside it, not the page). Measured live → robust to whatever sits above.
    useEffect(() => {
        if (!isLg) {
            setAvailH(null);
            return;
        }
        const measure = () => {
            const top = containerRef.current?.getBoundingClientRect().top ?? 0;
            // leave room for the dashboard shell's bottom padding so the page
            // itself doesn't get a sliver of scroll.
            setAvailH(Math.max(440, Math.round(window.innerHeight - top - 40)));
        };
        measure();
        const id = window.setTimeout(measure, 60); // re-measure after fonts/layout settle
        window.addEventListener("resize", measure);
        return () => {
            window.clearTimeout(id);
            window.removeEventListener("resize", measure);
        };
    }, [isLg]);

    useEffect(() => {
        const onResize = () => setLeftPx(clampLeft(leftPxRef.current));
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [clampLeft, setLeftPx]);

    // Zoom the A4 page so its full width fits the (possibly narrow) preview pane.
    useEffect(() => {
        const el = areaRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const measure = () => {
            const avail = el.clientWidth - 26;
            const s = Math.min(1, Math.max(0.4, avail / PAGE_W));
            setZoom((z) => (Math.abs(z - s) > 0.005 ? s : z));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [isLg]);

    const onPointerDown = (e: React.PointerEvent) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setLeftPx(clampLeft(e.clientX - rect.left));
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        localStorage.setItem(STORAGE_KEY, String(Math.round(leftPxRef.current)));
    };

    const zoomStyle = { zoom } as unknown as React.CSSProperties;

    const previewInner = (full: boolean) => (
        <div className={full ? "flex h-full min-w-0 flex-1 flex-col pl-1" : "flex flex-col"}>
            <div className="max-h-[45%] shrink-0 overflow-y-auto">{rightTop}</div>
            <div
                ref={areaRef}
                className={`mt-3 min-h-0 overflow-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800/50 ${
                    full ? "flex-1" : "h-[70vh]"
                }`}
            >
                <div style={zoomStyle}>
                    <div style={{ width: PAGE_W, margin: "0 auto" }}>{resume}</div>
                </div>
            </div>
        </div>
    );

    // Stacked layout for small screens (the page scrolls normally).
    if (!isLg) {
        return (
            <div className="space-y-4">
                {previewInner(false)}
                <div>{left}</div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex" style={{ height: availH ?? undefined }}>
            {/* Form — scrolls internally */}
            <div style={{ width: leftPx }} className="h-full shrink-0 overflow-y-auto pr-2">
                {left}
            </div>

            {/* Drag handle — centred in the viewport-height workspace, always visible */}
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize editor and preview"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="group relative w-4 shrink-0 cursor-col-resize touch-none"
                title="Drag to resize"
            >
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200 transition group-hover:bg-primary-400 dark:bg-slate-700" />
                <div className="absolute left-1/2 top-1/2 flex h-12 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white shadow-soft transition group-hover:border-primary-400 dark:border-slate-600 dark:bg-slate-800">
                    <svg
                        className="h-4 w-4 text-slate-400 transition group-hover:text-primary-500"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden
                    >
                        <circle cx="6" cy="4" r="1" />
                        <circle cx="10" cy="4" r="1" />
                        <circle cx="6" cy="8" r="1" />
                        <circle cx="10" cy="8" r="1" />
                        <circle cx="6" cy="12" r="1" />
                        <circle cx="10" cy="12" r="1" />
                    </svg>
                </div>
            </div>

            {previewInner(true)}
        </div>
    );
}
