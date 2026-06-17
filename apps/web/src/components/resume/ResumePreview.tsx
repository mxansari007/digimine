"use client";

/**
 * Live on-screen resume preview — renders the EXACT same HTML the PDF uses
 * (resumeBodyHtml) so it's WYSIWYG, with the chosen font + size + accent.
 *
 * When `editable`, the text fields are contentEditable: edits commit to the
 * data on blur (and Enter). The HTML is set IMPERATIVELY (not via React) so an
 * inline edit never clobbers the caret — React only re-renders the markup when
 * the data changes from OUTSIDE (the form, template, font…), not from the
 * preview's own edits.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ResumeData, ResumeFont, ResumeTemplateSpec } from "@digimine/types";
import { PAGE_W_PX, PT_TO_PX, resumeBodyHtml } from "@/lib/resume/html";
import { getByPath } from "@/lib/resume/path";
import { serializeInline } from "@/lib/resume/richtext";
import { clearFormatTargetIf, notifyFormat, setFormatTarget, type Align, type FormatTarget } from "@/lib/resume/formatBus";

interface Props {
    data: ResumeData;
    spec: ResumeTemplateSpec;
    accent: string;
    accent2?: string;
    font: ResumeFont;
    fontScale: number;
    /** Page-margin multiplier (default 1). */
    marginScale?: number;
    mode?: "page" | "document";
    editable?: boolean;
    onInlineEdit?: (path: string, value: string) => void;
    /** Fired with the data-path of the field being hovered/edited (null when
     *  none) so the form pane can scroll to + highlight the matching section. */
    onFieldActivate?: (path: string | null) => void;
}

const EDIT_STYLE =
    "<style>[data-rz-edit]{border-radius:3px;transition:background .12s;cursor:text;}[data-rz-edit]:hover{background:rgba(99,102,241,.09);box-shadow:0 0 0 1px rgba(99,102,241,.35);}[data-rz-edit]:focus{outline:none;background:rgba(99,102,241,.07);box-shadow:0 0 0 2px rgba(99,102,241,.55);}</style>";

const loadedFonts = new Set<string>();

// Fields where inline bold/italic/underline is allowed (long-form text).
const FMT_FIELD = (path: string) =>
    path === "summary" || /\.bullets\.\d+$/.test(path) || /\.details\.\d+$/.test(path);

export default function ResumePreview({
    data,
    spec,
    accent,
    accent2,
    font,
    fontScale,
    marginScale = 1,
    mode = "page",
    editable = false,
    onInlineEdit,
    onFieldActivate,
}: Props) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const dataRef = useRef(data);
    const onEditRef = useRef(onInlineEdit);
    const onActivateRef = useRef(onFieldActivate);
    const skipSync = useRef(false);
    const [pageBreaks, setPageBreaks] = useState<number[]>([]);

    dataRef.current = data;
    onEditRef.current = onInlineEdit;
    onActivateRef.current = onFieldActivate;

    // Load the chosen webfont (so preview === PDF typeface). Inter is also the
    // app default; others are loaded on demand.
    useEffect(() => {
        if (typeof document === "undefined" || !font.google || loadedFonts.has(font.id)) return;
        loadedFonts.add(font.id);
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
        document.head.appendChild(link);
    }, [font.id, font.google]);

    const has =
        data.contact.fullName ||
        data.summary ||
        data.experience.length ||
        data.projects.length ||
        data.education.length ||
        data.skills.length;

    // Imperatively (re)render the markup — but skip the render that our own
    // inline edit triggers (the DOM already has it; re-setting would drop caret).
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        if (skipSync.current) {
            skipSync.current = false;
            return;
        }
        el.innerHTML = has
            ? (editable ? EDIT_STYLE : "") +
              resumeBodyHtml(data, spec, { accent, accent2, fontStack: font.stack, fontScale, editable })
            : '<div style="display:grid;place-items:center;min-height:380px;text-align:center;color:#94a3b8;font-size:14px;">Your resume preview appears here as you type.</div>';
    }, [data, spec, accent, accent2, font.stack, fontScale, editable, has]);

    // Commit inline edits on blur / Enter, and drive the shared FormatToolbar for
    // whichever formattable field is focused (align handled in place).
    useEffect(() => {
        const el = contentRef.current;
        if (!el || !editable) return;
        let lastNode: HTMLElement | null = null;

        const api: FormatTarget = {
            align: (a: Align) => {
                const node = lastNode;
                if (!node) return;
                const path = node.getAttribute("data-rz-edit");
                if (!path) return;
                // wrap / unwrap the content in a single aligned <div>, in place
                let div = node.querySelector(":scope > div") as HTMLElement | null;
                const isWrap = !!div && /text-align/i.test(div.getAttribute("style") || "");
                if (a === "left") {
                    if (isWrap && div) {
                        while (div.firstChild) node.insertBefore(div.firstChild, div);
                        div.remove();
                    }
                } else {
                    if (!isWrap) {
                        div = document.createElement("div");
                        while (node.firstChild) div.appendChild(node.firstChild);
                        node.appendChild(div);
                    }
                    if (div) div.style.textAlign = a;
                }
                const value = serializeInline(node).replace(/\s+/g, " ").trim();
                skipSync.current = true;
                onEditRef.current?.(path, value);
                notifyFormat();
            },
            getAlign: () => {
                const div = lastNode?.querySelector(":scope > div") as HTMLElement | null;
                const a =
                    div && /text-align/i.test(div.getAttribute("style") || "")
                        ? (div.style.textAlign || "left").toLowerCase()
                        : "left";
                return (["center", "right", "justify"].includes(a) ? a : "left") as Align;
            },
        };

        // Register the focused/selected node with the shared FormatToolbar. Done on
        // BOTH focusin and mouseup — re-clicking an already-focused contentEditable
        // doesn't always re-fire focusin, so mouseup guarantees the toolbar wakes up.
        const register = (target: EventTarget | null) => {
            const node = (target as HTMLElement)?.closest?.("[data-rz-edit]") as HTMLElement | null;
            if (node && FMT_FIELD(node.getAttribute("data-rz-edit") || "")) {
                lastNode = node;
                setFormatTarget(api);
            } else if (node) {
                setFormatTarget(null); // a non-formattable inline field
            }
        };
        const onFocusIn = (e: FocusEvent) => register(e.target);
        const onMouseUp = (e: Event) => register(e.target);
        const onFocusOut = (e: FocusEvent) => {
            window.setTimeout(() => clearFormatTargetIf(api), 150);
            const node = (e.target as HTMLElement)?.closest?.("[data-rz-edit]") as HTMLElement | null;
            if (!node) return;
            const path = node.getAttribute("data-rz-edit");
            if (!path) return;
            const raw = FMT_FIELD(path) ? serializeInline(node) : node.textContent || "";
            const value = raw.replace(/\s+/g, " ").trim();
            const old = getByPath(dataRef.current, path);
            if (typeof old === "string" && value === old) return; // no change
            skipSync.current = true; // our edit — don't let the re-render clobber the caret
            onEditRef.current?.(path, value);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                const node = (e.target as HTMLElement)?.closest?.("[data-rz-edit]");
                if (node) {
                    e.preventDefault();
                    (node as HTMLElement).blur();
                }
                return;
            }
            // Bold / Italic / Underline — like a normal editor — on formattable fields.
            if ((e.metaKey || e.ctrlKey) && !e.altKey) {
                const k = e.key.toLowerCase();
                if (k === "b" || k === "i" || k === "u") {
                    const node = (e.target as HTMLElement)?.closest?.("[data-rz-edit]") as HTMLElement | null;
                    if (!node) return;
                    e.preventDefault(); // also blocks formatting on non-formattable fields
                    if (FMT_FIELD(node.getAttribute("data-rz-edit") || "")) {
                        try {
                            document.execCommand("styleWithCSS", false, "false");
                            document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline", false);
                        } catch {
                            /* execCommand unsupported — ignore */
                        }
                    }
                }
            }
        };
        el.addEventListener("focusin", onFocusIn);
        el.addEventListener("mouseup", onMouseUp);
        el.addEventListener("focusout", onFocusOut);
        el.addEventListener("keydown", onKeyDown);
        return () => {
            el.removeEventListener("focusin", onFocusIn);
            el.removeEventListener("mouseup", onMouseUp);
            el.removeEventListener("focusout", onFocusOut);
            el.removeEventListener("keydown", onKeyDown);
            clearFormatTargetIf(api);
        };
    }, [editable]);

    // Tell the form which field is hovered / focused so it can scroll there and
    // highlight it. Focus (active edit) wins over hover.
    useEffect(() => {
        const el = contentRef.current;
        if (!el || !editable) return;
        let hoverPath: string | null = null;
        let focusPath: string | null = null;
        let current: string | null = null;
        const emit = () => {
            const next = focusPath ?? hoverPath;
            if (next !== current) {
                current = next;
                onActivateRef.current?.(next);
            }
        };
        const pathOf = (t: EventTarget | null) =>
            t instanceof HTMLElement ? t.closest("[data-rz-edit]")?.getAttribute("data-rz-edit") ?? null : null;
        const onOver = (e: MouseEvent) => {
            hoverPath = pathOf(e.target);
            emit();
        };
        const onOut = (e: MouseEvent) => {
            hoverPath = pathOf(e.relatedTarget); // null when leaving all edit nodes
            emit();
        };
        const onFocusIn = (e: FocusEvent) => {
            focusPath = pathOf(e.target);
            emit();
        };
        const onFocusOut = () => {
            focusPath = null;
            emit();
        };
        el.addEventListener("mouseover", onOver);
        el.addEventListener("mouseout", onOut);
        el.addEventListener("focusin", onFocusIn);
        el.addEventListener("focusout", onFocusOut);
        return () => {
            el.removeEventListener("mouseover", onOver);
            el.removeEventListener("mouseout", onOut);
            el.removeEventListener("focusin", onFocusIn);
            el.removeEventListener("focusout", onFocusOut);
            onActivateRef.current?.(null);
        };
    }, [editable]);

    // Page-break guides — replicate Chromium's fragmentation against the REAL
    // rendered geometry, so the dashed lines match the downloaded PDF exactly.
    // We collect the finest units the layout can break between ("atoms"):
    //   • entries are atomic (break-inside:avoid) → one atom for the whole entry
    //   • headings glue to the next block (break-after:avoid) → atom marked glue
    //   • paragraphs / bullet lists break between LINE BOXES → one atom per line
    // then fill A4 content-height pages, moving a break back over any glued
    // heading so it never orphans at the bottom of a page.
    useEffect(() => {
        // Two-column flows into balanced CSS columns; the single-column sim can't
        // model that, so we don't draw page-break guides for it (the PDF still uses
        // the same multicol HTML, so layout matches — only the dashed guide is off).
        if (mode !== "document" || spec.layout === "two-col" || spec.layout === "split") {
            setPageBreaks([]);
            return;
        }
        const sheet = sheetRef.current;
        const content = contentRef.current;
        if (!sheet || !content || typeof ResizeObserver === "undefined") return;
        const A4_W = 595;
        const A4_H = 842;

        const measure = () => {
            const w = sheet.clientWidth;
            if (w < 50) return;
            const rect = sheet.getBoundingClientRect();
            const zf = rect.width / w || 1; // undo the workspace's zoom-to-fit
            const rectTop = rect.top;
            const m = spec.margin * marginScale;
            // Per-template page margins: sidebar = top only (band to bottom);
            // header-band = bottom only (band full-bleed at the top); single = both.
            const sidebar = spec.layout === "sidebar";
            const headerBand = spec.headerBand === true && !sidebar;
            const topM = headerBand ? 0 : m;
            const botM = sidebar ? 0 : m;
            const pad = (w * topM) / A4_W;
            const pageContentH = (w * (A4_H - topM - botM)) / A4_W;
            if (pageContentH < 50) return;

            const atoms: { top: number; bottom: number; glue: boolean }[] = [];
            const pushEl = (el: Element, glue: boolean) => {
                const r = el.getBoundingClientRect();
                if (r.height <= 0) return;
                atoms.push({ top: (r.top - rectTop) / zf, bottom: (r.bottom - rectTop) / zf, glue });
            };
            const pushLines = (el: Element) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const rs = Array.from(range.getClientRects());
                if (!rs.length) {
                    pushEl(el, false);
                    return;
                }
                const lines: { top: number; bottom: number }[] = [];
                for (const rc of rs) {
                    if (rc.height <= 0 || rc.width <= 0) continue;
                    const top = (rc.top - rectTop) / zf;
                    const bottom = (rc.bottom - rectTop) / zf;
                    const last = lines[lines.length - 1];
                    if (last && top < last.bottom - 0.5) {
                        last.top = Math.min(last.top, top);
                        last.bottom = Math.max(last.bottom, bottom);
                    } else {
                        lines.push({ top, bottom });
                    }
                }
                for (const ln of lines) atoms.push({ top: ln.top, bottom: ln.bottom, glue: false });
            };
            const hasBlockKids = (el: Element) =>
                Array.from(el.children).some((c) => {
                    const d = getComputedStyle(c).display;
                    return (
                        d === "block" ||
                        d === "flex" ||
                        d === "grid" ||
                        d === "list-item" ||
                        c.tagName === "UL" ||
                        c.tagName === "OL"
                    );
                });
            const walk = (parent: Element) => {
                for (const el of Array.from(parent.children)) {
                    if (getComputedStyle(el).position === "absolute") {
                        continue; // out of flow (sidebar labels, accents) — doesn't paginate
                    }
                    if (el.hasAttribute("data-rz-heading")) {
                        pushEl(el, true); // heading sticks to whatever follows it
                        continue;
                    }
                    if (getComputedStyle(el).getPropertyValue("break-inside").trim() === "avoid") {
                        pushEl(el, false); // an entry — kept whole
                        continue;
                    }
                    if (el.children.length && hasBlockKids(el)) {
                        walk(el); // container — descend to finer units
                        continue;
                    }
                    pushLines(el); // text leaf — break between its lines
                }
            };
            walk(content);

            const out: number[] = [];
            let pageStart = pad;
            let limit = pageStart + pageContentH;
            const EPS = 1;
            for (let i = 0; i < atoms.length && out.length < 50; i++) {
                const a = atoms[i];
                if (a.bottom <= limit + EPS) continue; // fits on the current page
                let bi = i;
                while (bi - 1 >= 0 && atoms[bi - 1].glue && atoms[bi - 1].top > pageStart + EPS) bi--;
                const breakY = atoms[bi].top;
                if (breakY <= pageStart + EPS) {
                    // taller than a whole page — let it overflow; next page starts below it
                    pageStart = a.bottom;
                    limit = pageStart + pageContentH;
                    continue;
                }
                out.push(Math.round(breakY));
                pageStart = breakY;
                limit = pageStart + pageContentH;
                i = bi - 1; // re-evaluate the moved-back atoms on the fresh page
            }

            setPageBreaks((prev) =>
                prev.length === out.length && prev.every((v, i) => v === out[i]) ? prev : out
            );
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(sheet);
        return () => ro.disconnect();
    }, [mode, spec.margin, marginScale, data, font.stack, fontScale, accent]);

    const marginPx = Math.round(spec.margin * marginScale * PT_TO_PX);
    // Sidebar: the tinted band lives on an INNER page-body that's inset by the
    // top/bottom margin (which stays white). This matches the PDF — there the band
    // is the body background and the @page top/bottom margin is white. (Painting
    // the band on the sheet itself tinted the top margin strip — the bug.)
    const isSidebar = spec.layout === "sidebar";
    // Header-band: band full-bleed at the top + sides (sheet padding 0 there);
    // white bottom margin only. Content provides its own side insets.
    const isHeaderBand = spec.headerBand === true && !isSidebar;
    const bandPx = Math.round((spec.sidebarWidth ?? 156) * PT_TO_PX);
    const band = spec.bandColor ?? "#dbe7f5";
    const bandGradient = `linear-gradient(to right, ${band} 0, ${band} ${bandPx}px, #fff ${bandPx}px, #fff 100%)`;
    const sheetPad: CSSProperties["padding"] = isSidebar ? 0 : isHeaderBand ? `0 0 ${marginPx}px 0` : marginPx;
    const sheetStyle: CSSProperties =
        mode === "document"
            ? {
                  width: PAGE_W_PX,
                  minHeight: 920,
                  padding: sheetPad,
                  ...(isSidebar ? { display: "flex", flexDirection: "column" } : {}),
              }
            : {
                  width: PAGE_W_PX,
                  aspectRatio: "1 / 1.414",
                  padding: sheetPad,
                  ...(isSidebar ? { display: "flex", flexDirection: "column" } : {}),
              };

    return (
        <div ref={sheetRef} className="relative overflow-hidden bg-white shadow-soft-sm" style={sheetStyle}>
            {isSidebar ? (
                <div style={{ background: bandGradient, marginTop: marginPx, flex: "1 0 auto" }}>
                    <div ref={contentRef} />
                </div>
            ) : (
                <div ref={contentRef} />
            )}
            {pageBreaks.map((y, i) => (
                <div
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-300/80"
                    style={{ top: y }}
                >
                    <span className="absolute -top-2.5 right-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 shadow-sm dark:bg-slate-700 dark:text-slate-300">
                        Page {i + 2}
                    </span>
                </div>
            ))}
        </div>
    );
}
