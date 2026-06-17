"use client";

/**
 * Read-only resume view for phones — users build resumes on desktop, but can
 * preview + download here. Scales the A4 page (794px) to fit the screen width.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ResumeData, ResumeFont, ResumeTemplateSpec } from "@digimine/types";
import ResumePreview from "./ResumePreview";

const PAGE_W = 794;

interface Props {
    data: ResumeData;
    spec: ResumeTemplateSpec;
    accent: string;
    accent2: string;
    font: ResumeFont;
    fontScale: number;
    marginScale: number;
}

export default function MobileResumeView(props: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(0.45);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const measure = () => {
            const w = el.clientWidth - 4;
            if (w > 40) setZoom(Math.min(1, Math.max(0.3, w / PAGE_W)));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-800/50"
        >
            <div style={{ zoom } as unknown as CSSProperties}>
                <div style={{ width: PAGE_W, margin: "0 auto" }}>
                    <ResumePreview {...props} mode="document" />
                </div>
            </div>
        </div>
    );
}
