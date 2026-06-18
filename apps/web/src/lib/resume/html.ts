/**
 * Single source of truth for how a resume LOOKS.
 *
 * `resumeBodyHtml` builds the resume as a self-contained HTML string with
 * all-inline styles, driven by the template spec + per-resume style options
 * (accent, font, size). BOTH the on-screen preview AND the PDF use this exact
 * markup, so the PDF is pixel-identical to the preview.
 *
 * When `editable` is set, text fields get `contenteditable` + a `data-rz-edit`
 * path so the preview can be edited inline (ResumePreview commits on blur).
 * `data-rz-stop` marks page-break candidate blocks; `data-rz-heading` marks
 * headings (kept with following content).
 */
import {
    customSectionIdFromToken,
    isCustomSectionToken,
    normalizeSectionOrder,
    type ResumeBuiltinSectionKey,
    type ResumeCustomEntry,
    type ResumeData,
    type ResumeTemplateSpec,
} from "@digimine/types";

export const PT_TO_PX = 96 / 72;
export const PAGE_W_PX = 794;

export interface ResumeStyleOpts {
    accent: string;
    /** Secondary accent (two-tone templates: header bands, labels, icons…). */
    accent2?: string;
    /** CSS font-family stack. */
    fontStack: string;
    /** Multiplier applied to all font sizes. */
    fontScale: number;
    /** Multiplier applied to the template's page margin (default 1). */
    marginScale?: number;
    /** Render text fields as contentEditable (preview only). */
    editable?: boolean;
}

function esc(s: unknown): string {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const INLINE_FMT_TAGS: Record<string, string> = {
    b: "strong",
    strong: "strong",
    i: "em",
    em: "em",
    u: "u",
};

/** Render user text that MAY carry a tiny formatting allowlist — inline
 *  bold/italic/underline + <br>, and a single block-alignment wrapper
 *  <div style="text-align:…">. ALL text is escaped and only those tags survive
 *  (attributes stripped, except the one whitelisted text-align), so the result
 *  is safe to drop into innerHTML and the PDF. Used for the long-form fields the
 *  user can format (summary, bullets); short fields stay plain via esc(). */
export function fmtInline(value: unknown): string {
    const s = String(value ?? "");
    if (!s) return "";
    if (s.indexOf("<") === -1) return esc(s); // fast path — no markup
    let out = "";
    let last = 0;
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
        out += esc(s.slice(last, m.index));
        const closing = m[1] === "/";
        const name = m[2].toLowerCase();
        const tag = INLINE_FMT_TAGS[name];
        if (tag) {
            out += closing ? `</${tag}>` : `<${tag}>`;
        } else if (name === "br" && !closing) {
            out += "<br>";
        } else if (name === "div") {
            if (closing) {
                out += "</div>";
            } else {
                const a = /text-align\s*:\s*(center|right|justify|left)/i.exec(m[3] || "");
                out += a ? `<div style="text-align:${a[1].toLowerCase()}">` : "<div>";
            }
        }
        last = re.lastIndex;
    }
    out += esc(s.slice(last));
    return out;
}

function safeHref(url: string): string {
    const v = String(url || "").trim();
    if (!v) return "";
    if (/^(https?:|mailto:)/i.test(v)) return esc(v);
    return esc("https://" + v.replace(/^\/+/, ""));
}

function dateRange(start: string, end: string, current?: boolean): string {
    const e = current ? "Present" : end;
    return [start, e].filter(Boolean).join(" – ");
}

/** Parse a #rgb or #rrggbb hex into [r,g,b]; falls back to slate on bad input. */
function hexToRgb(hex: string): [number, number, number] {
    let h = (hex || "").trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return [30, 41, 59]; // #1e293b
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Mix a hex colour with white. `weight` = fraction of the colour kept (0..1);
 *  lower = lighter. Lets a band derive a soft tint from a strong accent. */
export function tintWithWhite(hex: string, weight: number): string {
    const [r, g, b] = hexToRgb(hex);
    const mix = (c: number) => Math.round(c * weight + 255 * (1 - weight));
    return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** The sidebar's left-band colour: a light tint of the SECONDARY accent when the
 *  template opts into two-tone (usesAccent2), else its fixed bandColor. Shared by
 *  the live preview and the PDF renderer so the band always matches. */
export function sidebarBandColor(spec: ResumeTemplateSpec, accent2?: string): string {
    if (spec.usesAccent2) return tintWithWhite(accent2 || "#1e293b", 0.16);
    return spec.bandColor ?? "#dbe7f5";
}

export function resumeBodyHtml(data: ResumeData, spec: ResumeTemplateSpec, opts: ResumeStyleOpts): string {
    const { accent, fontStack, fontScale } = opts;
    const accent2 = opts.accent2 || "#1e293b";
    const editable = opts.editable === true;
    const nameColor = spec.nameAccent ? accent : spec.layout === "split" ? accent2 : "#1a1a1a";
    const headingColor =
        spec.headingStyle === "accent" ? accent : spec.headingStyle === "muted" ? "#64748b" : "#1a1a1a";

    const px = (pt: number) => Math.round(pt * PT_TO_PX * fontScale * 100) / 100;
    const body = px(spec.bodySize);
    const name = px(spec.nameSize);
    const heading = px(spec.headingSize);
    const gap = px(spec.sectionGap);
    const entryGap = px(spec.entryGap);
    const ls = spec.letterSpacing;
    const meta = body - 1;

    const ed = (path: string) =>
        editable ? ` contenteditable="true" data-rz-edit="${path}" spellcheck="false"` : "";

    /** Editable single text node (only editable when non-empty). */
    const txt = (value: string, path: string) =>
        editable && value && value.trim() ? `<span${ed(path)}>${esc(value)}</span>` : esc(value);

    /** Join non-empty fields with a separator, each individually editable. */
    const joinFields = (parts: { v: string; p: string }[], sep: string) =>
        parts
            .filter((x) => x.v && x.v.trim())
            .map((x) => (editable ? `<span${ed(x.p)}>${esc(x.v)}</span>` : esc(x.v)))
            .join(sep);

    const capStyle = `font-size:${heading}px;font-weight:700;text-transform:uppercase;letter-spacing:${ls}px;color:${headingColor};`;
    const headingHtml = (title: string, editPath?: string) => {
        const inner = editPath ? txt(title, editPath) : esc(title);
        // Filled label tag (boxed-name family) — primary-accent fill, light text.
        if (isHeadingTag) {
            return `<div data-rz-stop data-rz-heading style="margin-bottom:5px;break-after:avoid;"><span style="display:inline-block;background:${accent};color:#fff;font-size:${heading}px;font-weight:700;text-transform:uppercase;letter-spacing:${ls}px;padding:2px 8px;">${inner}</span></div>`;
        }
        // ALL-CAPS heading hugging the left with an accent rule extending to the
        // right margin (ascend).
        if (isHeadingRuleRight) {
            return `<div data-rz-stop data-rz-heading style="display:flex;align-items:center;gap:9px;margin-bottom:5px;break-after:avoid;"><span style="${capStyle}white-space:nowrap;">${inner}</span><span style="flex:1;height:1px;background:${accent};"></span></div>`;
        }
        // Heading framed between two fine rules (bracket).
        if (isHeadingBracket) {
            return `<div data-rz-stop data-rz-heading style="${capStyle}border-top:1px solid #3a3a3a;border-bottom:1px solid #3a3a3a;padding:2.5px 0;margin-bottom:5px;break-after:avoid;">${inner}</div>`;
        }
        // Heading trailed by a dotted leader to the right margin (ledger).
        if (isHeadingLeader) {
            return `<div data-rz-stop data-rz-heading style="display:flex;align-items:baseline;gap:7px;margin-bottom:5px;break-after:avoid;"><span style="${capStyle}white-space:nowrap;">${inner}</span><span style="flex:1;position:relative;top:-3px;border-bottom:1.5px dotted ${accent}99;"></span></div>`;
        }
        if (isHeadingCenter) {
            const line = `<span style="flex:1;height:1px;background:${accent}59;"></span>`;
            return `<div data-rz-stop data-rz-heading style="display:flex;align-items:center;gap:10px;margin:0 0 5px;break-after:avoid;">${line}<span style="${capStyle}white-space:nowrap;">${inner}</span>${line}</div>`;
        }
        return `<div data-rz-stop data-rz-heading style="${capStyle}margin-bottom:4px;break-after:avoid;${
            spec.headingRule ? `border-bottom:1px solid ${accent};padding-bottom:2px;` : ""
        }">${inner}</div>`;
    };

    const bullets = (items: string[], pathPrefix: string) => {
        const list = (items || [])
            .map((b, j) => ({ b, j }))
            .filter((x) => x.b && x.b.trim());
        if (!list.length) return "";
        return `<ul style="margin:2px 0 0;padding-left:16px;list-style:disc;">${list
            .map((x) => `<li${ed(`${pathPrefix}.${x.j}`)} style="margin-top:2px;">${fmtInline(x.b)}</li>`)
            .join("")}</ul>`;
    };

    const headerRow = (leftHtml: string, rightHtml: string) =>
        `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;"><span style="font-weight:600;flex:1;min-width:0;">${leftHtml}</span>${
            rightHtml ? `<span style="flex-shrink:0;white-space:nowrap;text-align:right;">${rightHtml}</span>` : ""
        }</div>`;

    const metaSpan = (text: string) =>
        text ? `<span style="font-size:${meta}px;color:#555;">${esc(text)}</span>` : "";

    const entryWrap = (i: number, inner: string) =>
        `<div data-rz-stop style="margin-top:${i === 0 ? 6 : entryGap}px;break-inside:avoid;">${inner}</div>`;

    // A custom-section entry — every component is optional; only the ones the
    // user plugged in (non-empty) render.
    const customEntry = (en: ResumeCustomEntry, si: number, i: number) => {
        const right = [
            en.date
                ? `<span${ed(`customSections.${si}.entries.${i}.date`)} style="font-size:${meta}px;color:#555;white-space:nowrap;">${esc(en.date)}</span>`
                : "",
            en.link
                ? `<a href="${safeHref(en.link)}" style="font-size:${meta}px;color:${accent};text-decoration:none;">Link</a>`
                : "",
        ]
            .filter(Boolean)
            .join("&nbsp;&nbsp;");
        const left = en.title ? txt(en.title, `customSections.${si}.entries.${i}.title`) : "";
        const sub = en.subtitle
            ? `<div style="color:#333;">${txt(en.subtitle, `customSections.${si}.entries.${i}.subtitle`)}</div>`
            : "";
        // The header (title/date/subtitle) is kept together; the bullets below flow
        // and split across pages like a normal list, so a bullet-heavy custom
        // section doesn't get forced whole onto the next page.
        const header =
            left || right || sub
                ? `<div style="break-inside:avoid;">${left || right ? headerRow(left, right) : ""}${sub}</div>`
                : "";
        return `<div data-rz-stop style="margin-top:${i === 0 ? 6 : entryGap}px;">${header}${bullets(
            en.bullets,
            `customSections.${si}.entries.${i}.bullets`
        )}</div>`;
    };

    // ── Layout helpers ──────────────────────────────────────────────────
    const isSidebar = spec.layout === "sidebar";
    const isTwoCol = spec.layout === "two-col";
    const isSplit = spec.layout === "split";
    const isAcademic = spec.layout === "academic";
    const isHanging = spec.layout === "hanging";
    const isInline = spec.layout === "inline";
    const isNameBox = spec.nameBox === true && !isSidebar && !isTwoCol;
    const isHeadingTag = spec.headingTag === true && !isSidebar && !isTwoCol;
    // Single-column heading-rule treatments (mutually exclusive in practice).
    const isHeadingRuleRight = spec.headingRuleRight === true && !isSidebar && !isTwoCol;
    const isHeadingBracket = spec.headingBracket === true && !isSidebar && !isTwoCol;
    const isHeadingLeader = spec.headingLeader === true && !isSidebar && !isTwoCol;
    const isHeaderBand = spec.headerBand === true && !isSidebar && !isTwoCol && !isNameBox;
    const isHeadingCenter = spec.headingCenter === true;
    const isDateLeft = spec.dateLeft === true;
    const lpx = (pt: number) => Math.round(pt * PT_TO_PX * 100) / 100; // layout dims (no font scale)
    // Horizontal page inset (px) — matches the @page/sheet side margin. For
    // header-band templates the band runs full-bleed while content is inset by this.
    const pagePadPx = Math.round(spec.margin * (opts.marginScale ?? 1) * PT_TO_PX);
    const sidebarPx = lpx(spec.sidebarWidth ?? 156);
    const contentGutterPx = lpx(18); // white gutter between the band and the content
    const contentLeftPx = sidebarPx + contentGutterPx;
    const labelInsetPx = lpx(22);
    const rightPadPx = lpx(spec.margin);
    const secPadTopPx = Math.max(8, Math.round(px(spec.sectionGap) * 0.85));
    const secPadBotPx = Math.max(6, Math.round(px(spec.sectionGap) * 0.7));
    const labelWidthPx = Math.max(56, Math.round(sidebarPx - labelInsetPx - lpx(12)));
    const SERIF = "Georgia, 'Times New Roman', serif";

    // A sidebar section: the label sits in the left band (absolute, so it never
    // repeats when the section spans pages); the content is indented past the
    // band + a gutter, with a rule above.
    const sidebarBlock = (title: string, inner: string, editPath?: string) =>
        `<section style="position:relative;border-top:1px solid #d2d2d2;padding:${secPadTopPx}px ${rightPadPx}px ${secPadBotPx}px ${contentLeftPx}px;">` +
        `<div data-rz-skip style="position:absolute;left:${labelInsetPx}px;top:${secPadTopPx}px;width:${labelWidthPx}px;font-size:${heading}px;font-weight:700;font-style:italic;line-height:1.15;color:${headingColor};${spec.headingSerif ? `font-family:${SERIF};` : ""}">${editPath ? txt(title, editPath) : esc(title)}</div>` +
        `${inner}</section>`;

    // An academic section: an ALL-CAPS label hangs in the left margin (absolute, so
    // it never repeats across a page break), content in a right column, a hairline
    // rule above. No tinted band, normal page margins — one accent (label = accent).
    const acLabelW = lpx(104);
    const acContentLeft = acLabelW + lpx(16);
    const academicBlock = (title: string, inner: string, editPath?: string) =>
        `<section style="position:relative;border-top:1px solid #e3e3e3;padding:${secPadTopPx}px 0 ${secPadBotPx}px ${acContentLeft}px;">` +
        `<div data-rz-skip style="position:absolute;left:0;top:${secPadTopPx}px;width:${acLabelW}px;font-size:${heading}px;font-weight:700;text-transform:uppercase;letter-spacing:${Math.max(ls, 0.5)}px;line-height:1.25;color:${headingColor};">${editPath ? txt(title, editPath) : esc(title)}</div>` +
        `${inner}</section>`;

    // A spine section: a slim gutter label (absolute, so it never repeats across a
    // page break) and the content in a single flow with a vertical accent rule
    // (border-left, which DOES repeat per page) running down its left edge.
    const spineLabelW = lpx(86);
    const spineBlock = (title: string, inner: string, editPath?: string) =>
        `<section style="position:relative;padding:${secPadTopPx}px 0 ${secPadBotPx}px ${spineLabelW}px;">` +
        `<div data-rz-skip style="position:absolute;left:0;top:${secPadTopPx + 1}px;width:${spineLabelW - lpx(12)}px;font-size:${heading}px;font-weight:700;text-transform:uppercase;letter-spacing:${Math.max(ls, 0.5)}px;line-height:1.3;color:${headingColor};">${editPath ? txt(title, editPath) : esc(title)}</div>` +
        `<div style="border-left:2px solid ${accent};padding-left:${lpx(13)}px;">${inner}</div></section>`;

    // An inline (run-in) section: the heading floats left so the content runs in on
    // the same line and wraps beneath it — dense, editorial.
    const inlineBlock = (title: string, inner: string, editPath?: string) =>
        `<section style="margin-top:${gap}px;overflow:hidden;">` +
        `<span data-rz-heading style="float:left;margin:1px ${lpx(11)}px 0 0;${capStyle}line-height:1.35;">${editPath ? txt(title, editPath) : esc(title)}</span>` +
        `${inner}</section>`;

    // Two-column: a coloured round icon (alternating accent / accent2) beside each
    // uppercase heading. Simple line glyphs by section.
    const iconSz = Math.round(heading * 1.55);
    const glyphSz = Math.round(heading * 0.95);
    const GLYPHS: Record<string, string> = {
        Summary: '<circle cx="8" cy="5.6" r="2.3"/><path d="M3.8 12.4c0-2.3 1.9-3.6 4.2-3.6s4.2 1.3 4.2 3.6"/>',
        Experience: '<rect x="3" y="5.6" width="10" height="6.6" rx="1.2"/><path d="M6.2 5.6V4.6a1 1 0 011-1h1.6a1 1 0 011 1v1"/><path d="M3 8.4h10"/>',
        Projects: '<path d="M6.2 5.8L3.6 8l2.6 2.2M9.8 5.8L12.4 8l-2.6 2.2"/>',
        Education: '<path d="M8 3.9l5 2.1-5 2.1-5-2.1 5-2.1z"/><path d="M11.6 7.3v2.4c0 1-1.6 1.8-3.6 1.8s-3.6-.8-3.6-1.8V7.3"/>',
        Skills: '<path d="M8 3.5l1.35 2.75 3.05.45-2.2 2.15.52 3.02L8 10.45l-2.72 1.42.52-3.02-2.2-2.15 3.04-.45z"/>',
        Certifications: '<circle cx="8" cy="6.2" r="2.7"/><path d="M6.2 8.6L5.2 12l2.8-1.4L10.8 12l-1-3.4"/>',
    };
    const iconHeading = (title: string, idx: number, editPath?: string) => {
        // Two-tone templates alternate accent / accent2 by section; single-accent
        // ones (usesAccent2 off) keep every icon on the primary accent.
        const color = spec.usesAccent2 && idx % 2 === 1 ? accent2 : accent;
        const glyph = GLYPHS[title] || '<circle cx="8" cy="8" r="2.1"/>';
        return (
            `<div data-rz-stop data-rz-heading style="display:flex;align-items:center;gap:6px;margin-bottom:4px;break-after:avoid;">` +
            `<span style="display:inline-flex;align-items:center;justify-content:center;width:${iconSz}px;height:${iconSz}px;border-radius:50%;background:${color};flex-shrink:0;"><svg viewBox="0 0 16 16" width="${glyphSz}" height="${glyphSz}" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></span>` +
            `<span style="font-size:${heading}px;font-weight:700;text-transform:uppercase;letter-spacing:${ls}px;color:${color};">${editPath ? txt(title, editPath) : esc(title)}</span></div>`
        );
    };

    /** Wrap a section's inner content for the active layout. */
    const sectionShell = (title: string, inner: string, editPath?: string, idx = 0) =>
        !inner
            ? ""
            : isSidebar
              ? sidebarBlock(title, inner, editPath)
              : isAcademic
                ? academicBlock(title, inner, editPath)
                : isHanging
                  ? spineBlock(title, inner, editPath)
                  : isInline
                    ? inlineBlock(title, inner, editPath)
                    : isTwoCol
                      ? `<section style="margin-bottom:${gap}px;">${iconHeading(title, idx, editPath)}${inner}</section>`
                      : `<section style="margin-top:${gap}px;">${headingHtml(title, editPath)}${inner}</section>`;

    // A dated entry. dateLeft → date in a left column (timeline); else date right.
    const entryBlock = (i: number, titleHtml: string, dateText: string, midHtml: string, bulletsHtml: string) =>
        entryWrap(
            i,
            isDateLeft
                ? `<div style="display:flex;gap:12px;"><div style="width:${lpx(52)}px;flex-shrink:0;font-size:${meta}px;color:#777;line-height:1.35;">${esc(dateText)}</div><div style="flex:1;min-width:0;"><div style="font-weight:600;">${titleHtml}</div>${midHtml}${bulletsHtml}</div></div>`
                : `${headerRow(titleHtml, dateText ? metaSpan(dateText) : "")}${midHtml}${bulletsHtml}`
        );

    const TITLES: Record<ResumeBuiltinSectionKey, string> = {
        summary: "Summary",
        experience: "Experience",
        projects: "Projects",
        education: "Education",
        skills: "Skills",
        certifications: "Certifications",
    };

    // Inner content of each built-in section (heading/section wrapper added by sectionShell).
    const bodyParts: Record<ResumeBuiltinSectionKey, string> = {
        summary: data.summary
            ? `<p data-rz-stop${ed("summary")} style="margin:0;">${fmtInline(data.summary)}</p>`
            : "",
        experience: data.experience.length
            ? data.experience
                  .map((e, i) =>
                      entryBlock(
                          i,
                          joinFields(
                              [
                                  { v: e.role, p: `experience.${i}.role` },
                                  { v: e.company, p: `experience.${i}.company` },
                              ],
                              ", "
                          ),
                          dateRange(e.startDate, e.endDate, e.current),
                          e.location ? `<div style="color:#333;">${txt(e.location, `experience.${i}.location`)}</div>` : "",
                          bullets(e.bullets, `experience.${i}.bullets`)
                      )
                  )
                  .join("")
            : "",
        projects: data.projects.length
            ? data.projects
                  .map((p, i) =>
                      entryWrap(
                          i,
                          `${headerRow(
                              joinFields(
                                  [
                                      { v: p.name, p: `projects.${i}.name` },
                                      { v: p.subtitle, p: `projects.${i}.subtitle` },
                                  ],
                                  " — "
                              ),
                              p.link
                                  ? `<a href="${safeHref(p.link)}" style="font-size:${meta}px;color:${accent};text-decoration:none;">Link</a>`
                                  : ""
                          )}${p.tech.length ? `<div style="color:#333;">${txt(p.tech.join(", "), `projects.${i}.tech`)}</div>` : ""}${bullets(
                              p.bullets,
                              `projects.${i}.bullets`
                          )}`
                      )
                  )
                  .join("")
            : "",
        education: data.education.length
            ? data.education
                  .map((e, i) =>
                      entryBlock(
                          i,
                          joinFields(
                              [
                                  { v: e.degree, p: `education.${i}.degree` },
                                  { v: e.field, p: `education.${i}.field` },
                              ],
                              ", "
                          ),
                          dateRange(e.startDate, e.endDate),
                          `<div style="color:#333;">${joinFields(
                              [
                                  { v: e.school, p: `education.${i}.school` },
                                  { v: e.location, p: `education.${i}.location` },
                                  { v: e.grade, p: `education.${i}.grade` },
                              ],
                              "  •  "
                          )}</div>`,
                          bullets(e.details, `education.${i}.details`)
                      )
                  )
                  .join("")
            : "",
        skills: data.skills.length
            ? isTwoCol
                ? // Chips: a label per group then pill chips for each skill.
                  data.skills
                      .map(
                          (g) =>
                              `${g.category ? `<div style="font-weight:700;margin:3px 0 1px;">${esc(g.category)}</div>` : ""}<div>${g.skills
                                  .map(
                                      (s) =>
                                          `<span style="display:inline-block;background:#eef1f6;color:#334155;border-radius:9px;padding:1px 7px;margin:0 3px 3px 0;font-size:${meta}px;white-space:nowrap;">${esc(s)}</span>`
                                  )
                                  .join("")}</div>`
                      )
                      .join("")
                : isSidebar
                ? // Two-column bulleted list (edited via the form, not inline). If the
                  // groups have no categories, each skill is its own bullet; otherwise
                  // one bullet per category line.
                  `<ul style="margin:0;padding-left:15px;list-style:disc;column-count:2;column-gap:26px;">${(data.skills.every(
                      (g) => !g.category.trim()
                  )
                      ? data.skills.flatMap((g) => g.skills).map((s) => esc(s))
                      : data.skills.map(
                            (g) => `${g.category ? `<strong>${esc(g.category)}: </strong>` : ""}${esc(g.skills.join(", "))}`
                        )
                  )
                      .map((h) => `<li style="margin-top:2px;break-inside:avoid;">${h}</li>`)
                      .join("")}</ul>`
                : `<div>${data.skills
                      .map(
                          (g, i) =>
                              `<p data-rz-stop style="margin:2px 0 0;">${g.category ? `<strong>${txt(g.category, `skills.${i}.category`)}: </strong>` : ""}${txt(
                                  g.skills.join(", "),
                                  `skills.${i}.skills`
                              )}</p>`
                      )
                      .join("")}</div>`
            : "",
        certifications: data.certifications.length
            ? data.certifications
                  .map((c, i) =>
                      entryBlock(
                          i,
                          `<strong>${txt(c.name, `certifications.${i}.name`)}</strong>${
                              c.issuer ? ` — ${txt(c.issuer, `certifications.${i}.issuer`)}` : ""
                          }`,
                          c.date,
                          "",
                          ""
                      )
                  )
                  .join("")
            : "",
    };

    // Render order is a token list: built-in keys + `custom:<id>` for individual
    // custom sections, so each custom section can sit anywhere among the rest.
    const customIndexById = new Map(data.customSections.map((s, i) => [s.id, i]));
    const order = normalizeSectionOrder(
        data.sectionOrder,
        data.customSections.map((s) => s.id)
    );
    const renderToken = (tok: string, idx: number): string => {
        if (isCustomSectionToken(tok)) {
            const si = customIndexById.get(customSectionIdFromToken(tok));
            if (si === undefined) return "";
            const s = data.customSections[si];
            const cbody = s.entries.map((en, i) => customEntry(en, si, i)).join("");
            return sectionShell(s.title || "More", cbody, `customSections.${si}.title`, idx);
        }
        const key = tok as ResumeBuiltinSectionKey;
        return sectionShell(TITLES[key], bodyParts[key], undefined, idx);
    };
    const c = data.contact;
    const contactLine = joinFields(
        [
            { v: c.email, p: "contact.email" },
            { v: c.phone, p: "contact.phone" },
            { v: c.location, p: "contact.location" },
        ],
        " • "
    );
    const linksHtml = c.links.length
        ? `<div style="font-size:${meta}px;color:#333;margin-top:2px;">${c.links
              .map(
                  (l, i) =>
                      `${i > 0 ? " • " : ""}<a href="${safeHref(l.url)}" style="color:${accent};text-decoration:none;">${esc(
                          l.label || l.url
                      )}</a>`
              )
              .join("")}</div>`
        : "";

    // Boxed-name header: the name sits in a filled secondary-accent box with the
    // contact block right-aligned beside it.
    const nameBoxHeader =
        `<header data-rz-stop style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:${lpx(8)}px;">` +
        `<div style="min-width:0;">` +
        (c.fullName
            ? `<div${ed("contact.fullName")} style="display:inline-block;background:${accent2};color:#fff;font-size:${name}px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;line-height:1.05;padding:${lpx(6)}px ${lpx(11)}px;">${esc(c.fullName)}</div>`
            : "") +
        (c.headline
            ? `<div${ed("contact.headline")} style="font-size:${body + 1}px;color:#555;margin-top:5px;">${esc(c.headline)}</div>`
            : "") +
        `</div>` +
        `<div style="flex-shrink:0;text-align:right;font-size:${meta}px;color:#444;line-height:1.55;max-width:46%;">` +
        (contactLine ? `<div>${contactLine}</div>` : "") +
        linksHtml +
        `</div></header>`;

    // Academic header: centred name + contact, no band (the first section's top
    // rule serves as the divider beneath it).
    const academicHeader =
        `<header data-rz-stop style="text-align:center;padding-bottom:${lpx(7)}px;">` +
        (c.fullName
            ? `<div${ed("contact.fullName")} style="font-size:${name}px;font-weight:700;color:${nameColor};line-height:1.1;letter-spacing:${Math.max(ls, 0.5)}px;">${esc(c.fullName)}</div>`
            : "") +
        (c.headline
            ? `<div${ed("contact.headline")} style="font-size:${body + 1}px;color:#444;margin-top:2px;">${esc(c.headline)}</div>`
            : "") +
        (contactLine ? `<div style="font-size:${meta}px;color:#333;margin-top:3px;">${contactLine}</div>` : "") +
        linksHtml +
        `</header>`;

    const header = isSidebar
        ? `<header data-rz-stop style="position:relative;background:#fff;padding:${lpx(8)}px ${rightPadPx}px ${lpx(14)}px ${lpx(80)}px;">` +
          `<div data-rz-skip style="position:absolute;left:0;top:0;width:${lpx(9)}px;height:${lpx(40)}px;background:${accent};"></div>` +
          (c.fullName
              ? `<div${ed("contact.fullName")} style="font-size:${name}px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1a1a1a;line-height:1.05;${spec.headingSerif ? `font-family:${SERIF};` : ""}">${esc(c.fullName)}</div>`
              : "") +
          (c.headline
              ? `<div${ed("contact.headline")} style="font-size:${body + 1}px;color:#444;margin-top:3px;">${esc(c.headline)}</div>`
              : "") +
          (contactLine ? `<div style="font-size:${meta}px;color:#444;margin-top:6px;">${contactLine}</div>` : "") +
          linksHtml +
          `</header>`
        : isNameBox
          ? nameBoxHeader
          : isHeaderBand
          ? // Full-width tinted band (accent2) pulled to the page edges with
            // negative margins; light text inside.
            `<header data-rz-stop style="background:${accent2};color:#fff;margin:0;padding:${lpx(26)}px ${pagePadPx}px ${lpx(20)}px ${pagePadPx}px;">` +
            (c.fullName
                ? `<div${ed("contact.fullName")} style="font-size:${name}px;font-weight:700;letter-spacing:0.5px;line-height:1.1;color:#fff;">${esc(c.fullName)}</div>`
                : "") +
            (c.headline
                ? `<div${ed("contact.headline")} style="font-size:${body + 1}px;color:rgba(255,255,255,0.85);margin-top:3px;">${esc(c.headline)}</div>`
                : "") +
            (contactLine
                ? `<div style="font-size:${meta}px;color:rgba(255,255,255,0.82);margin-top:6px;">${contactLine}</div>`
                : "") +
            (c.links.length
                ? `<div style="font-size:${meta}px;color:rgba(255,255,255,0.82);margin-top:2px;">${c.links
                      .map(
                          (l, i) =>
                              `${i > 0 ? " • " : ""}<a href="${safeHref(l.url)}" style="color:#fff;text-decoration:underline;">${esc(l.label || l.url)}</a>`
                      )
                      .join("")}</div>`
                : "") +
            `</header>`
          : isAcademic
          ? academicHeader
          : `<header data-rz-stop${isHeadingCenter ? ' style="text-align:center;"' : ""}>${
                c.fullName
                    ? `<div${ed("contact.fullName")} style="font-size:${name}px;font-weight:700;color:${nameColor};line-height:1.1;${isHeadingCenter ? `letter-spacing:${Math.max(ls, 1)}px;` : ""}">${esc(c.fullName)}</div>`
                    : ""
            }${c.headline ? `<div${ed("contact.headline")} style="font-size:${body + 1}px;color:#444;margin-top:2px;">${esc(c.headline)}</div>` : ""}${
                contactLine ? `<div style="font-size:${meta}px;color:#333;margin-top:2px;">${contactLine}</div>` : ""
            }${linksHtml}</header>`;

    // Build sections, tracking a VISIBLE index (skipping empty ones) so two-column
    // icon colours alternate by rendered section. Keep the token for split layout.
    let visIdx = 0;
    const rendered: { tok: string; html: string }[] = [];
    for (const tok of order) {
        const h = renderToken(tok, visIdx);
        if (h) {
            rendered.push({ tok, html: h });
            visIdx++;
        }
    }
    const sectionsHtml = rendered.map((r) => r.html).join("");

    // Split layout: skills / education / certifications go in a narrow left column,
    // everything else in a wide right column.
    const SPLIT_LEFT = new Set(["skills", "education", "certifications"]);
    const splitBody = () => {
        const left = rendered.filter((r) => !isCustomSectionToken(r.tok) && SPLIT_LEFT.has(r.tok)).map((r) => r.html).join("");
        const right = rendered.filter((r) => isCustomSectionToken(r.tok) || !SPLIT_LEFT.has(r.tok)).map((r) => r.html).join("");
        return `${header}<div style="display:flex;gap:${lpx(20)}px;align-items:flex-start;"><div style="width:34%;flex-shrink:0;">${left}</div><div style="flex:1;min-width:0;border-left:1px solid ${accent2}26;padding-left:${lpx(18)}px;">${right}</div></div>`;
    };

    const bodyInner = isHeaderBand
        ? // Header-band: full-bleed band, sections in a side-inset wrapper.
          `${header}<div style="padding:0 ${pagePadPx}px;">${sectionsHtml}</div>`
        : isTwoCol
          ? // Two-column: sections flow into two balanced columns.
            `${header}<div style="column-count:2;column-gap:${lpx(22)}px;margin-top:${gap}px;">${sectionsHtml}</div>`
          : isSplit
            ? splitBody()
            : `${header}${sectionsHtml}`;
    return `<div style="font-family:${fontStack};font-size:${body}px;line-height:1.4;color:#1a1a1a;">${bodyInner}</div>`;
}

/** Full standalone HTML document for headless-Chromium PDF rendering. */
export function resumePdfDocument(
    data: ResumeData,
    spec: ResumeTemplateSpec,
    opts: ResumeStyleOpts & { fontGoogle?: string | null }
): string {
    const fontLink = opts.fontGoogle
        ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${opts.fontGoogle}&display=swap" rel="stylesheet">`
        : "";
    const pageMargin = Math.round(spec.margin * (opts.marginScale ?? 1) * 10) / 10;
    // Sidebar: zero L/R page margin so the tinted band runs to the page edge (a
    // body gradient paints it on EVERY page); top/bottom margin keeps the uniform
    // vertical pagination model. The content provides its own horizontal insets.
    const sidebar = spec.layout === "sidebar";
    const headerBand = spec.headerBand === true && !sidebar;
    const bandPx = Math.round((spec.sidebarWidth ?? 156) * PT_TO_PX * 10) / 10;
    const band = sidebarBandColor(spec, opts.accent2);
    // Sidebar: white margin only at the TOP; band runs to bottom + side edges.
    // Header-band: no top/side margin (band is full-bleed at the top); normal
    // bottom margin. Single: uniform margin. (top right bottom left)
    const pageRule = sidebar
        ? `${pageMargin}pt 0 0 0`
        : headerBand
          ? `0 0 ${pageMargin}pt 0`
          : `${pageMargin}pt`;
    const bodyBg = sidebar
        ? `background: linear-gradient(to right, ${band} 0, ${band} ${bandPx}px, #fff ${bandPx}px, #fff 100%);`
        : "";
    return `<!doctype html><html><head><meta charset="utf-8">
${fontLink}
<style>
  @page { size: A4; margin: ${pageRule}; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${opts.fontStack}; ${bodyBg} }
</style></head><body>${resumeBodyHtml(data, spec, { ...opts, editable: false })}</body></html>`;
}
