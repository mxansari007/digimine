/**
 * Resume Maker types.
 *
 * A student-facing resume builder: structured, ATS-friendly resumes that can
 * be authored from scratch, imported from an uploaded PDF/DOCX, AI-assisted
 * (bullet rewriting, summary generation, JD tailoring), ATS-scored by the
 * configured LLM (DeepSeek by default), and exported to a server-rendered PDF.
 *
 * Persistence: the `resumes` Firestore collection is SERVER-ONLY (admin SDK
 * via /api/resume*); every doc carries a `userId` and is owned by that user.
 * Uploaded source files live in Storage under `resumes/{uid}/...`.
 *
 * The AI ATS check, AI assist, and AI import are metered by the student
 * entitlements layer (feature `resume_ats` + quota `resumeAtsPerMonth`, with
 * credit overflow via the `resume_ats` credit task).
 */

// ─────────────────────────────────────────────────────────────────────
// Resume content model (the editable document)
// ─────────────────────────────────────────────────────────────────────

export interface ResumeLink {
    /** e.g. "GitHub", "LinkedIn", "Portfolio". */
    label: string;
    url: string;
}

export interface ResumeContact {
    fullName: string;
    /** e.g. "Final-year B.Tech CSE" — sits under the name. */
    headline: string;
    email: string;
    phone: string;
    location: string;
    links: ResumeLink[];
}

export interface ResumeExperience {
    id: string;
    company: string;
    role: string;
    location: string;
    /** Free-form so "Jan 2024" / "2024-01" both work. */
    startDate: string;
    endDate: string;
    /** When true the UI shows "Present" and ignores endDate. */
    current: boolean;
    /** Achievement bullets — the heart of an ATS resume. */
    bullets: string[];
}

export interface ResumeEducation {
    id: string;
    school: string;
    degree: string;
    field: string;
    location: string;
    startDate: string;
    endDate: string;
    /** e.g. "8.7 CGPA" / "3.8 GPA". Free-form, optional. */
    grade: string;
    /** Optional extra lines (coursework, honours). */
    details: string[];
}

export interface ResumeProject {
    id: string;
    name: string;
    /** One-line subtitle, e.g. "Full-stack expense tracker". */
    subtitle: string;
    link: string;
    /** Tech stack chips. */
    tech: string[];
    bullets: string[];
}

export interface ResumeSkillGroup {
    id: string;
    /** e.g. "Languages", "Frameworks", "Tools". */
    category: string;
    skills: string[];
}

export interface ResumeCertification {
    id: string;
    name: string;
    issuer: string;
    date: string;
    link: string;
}

/** One block inside a custom section. `bullets` is always available; the other
 *  fields are OPTIONAL components the user can "plug in" (heading, subtitle,
 *  date, link) so a custom section can act like Experience, Awards, Publications,
 *  etc. — without forcing any of them. */
export interface ResumeCustomEntry {
    id: string;
    /** Optional entry heading. */
    title: string;
    /** Optional secondary line (organisation, venue…). */
    subtitle: string;
    /** Optional date or range — the pluggable "date" component. */
    date: string;
    /** Optional link. */
    link: string;
    bullets: string[];
}

/** A user-defined extra section (e.g. "Achievements", "Publications"). Its
 *  heading is editable, and it holds one or more pluggable entries. */
export interface ResumeCustomSection {
    id: string;
    title: string;
    entries: ResumeCustomEntry[];
}

/** The body sections a user can reorder (contact/header is always first). The
 *  "custom" key renders all of `customSections` as a block at that position. */
export type ResumeSectionKey =
    | "summary"
    | "experience"
    | "projects"
    | "education"
    | "skills"
    | "certifications"
    | "custom";

export const DEFAULT_SECTION_ORDER: ResumeSectionKey[] = [
    "summary",
    "experience",
    "projects",
    "education",
    "skills",
    "certifications",
    "custom",
];

export const REORDERABLE_SECTIONS: { key: ResumeSectionKey; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "experience", label: "Experience" },
    { key: "projects", label: "Projects" },
    { key: "education", label: "Education" },
    { key: "skills", label: "Skills" },
    { key: "certifications", label: "Certifications" },
    { key: "custom", label: "Custom sections" },
];

/** The built-in (non-custom) body sections, in default order. */
export const BUILTIN_SECTION_KEYS = [
    "summary",
    "experience",
    "projects",
    "education",
    "skills",
    "certifications",
] as const;
export type ResumeBuiltinSectionKey = (typeof BUILTIN_SECTION_KEYS)[number];

export const CUSTOM_SECTION_TOKEN_PREFIX = "custom:";
export function customSectionToken(id: string): string {
    return `${CUSTOM_SECTION_TOKEN_PREFIX}${id}`;
}
export function isCustomSectionToken(token: string): boolean {
    return token.startsWith(CUSTOM_SECTION_TOKEN_PREFIX);
}
export function customSectionIdFromToken(token: string): string {
    return token.slice(CUSTOM_SECTION_TOKEN_PREFIX.length);
}

/** Normalize a raw section order into a clean token list that contains every
 *  built-in section and every CURRENT custom section exactly once, in a stable
 *  order. A bare legacy `"custom"` token expands to all custom sections (in
 *  array order) — so old resumes migrate seamlessly; unknown / deleted tokens
 *  are dropped, and anything missing is appended in default order. */
export function normalizeSectionOrder(raw: unknown, customIds: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const builtins = BUILTIN_SECTION_KEYS as readonly string[];
    const pushBuiltin = (k: string) => {
        if (builtins.includes(k) && !seen.has(k)) {
            seen.add(k);
            out.push(k);
        }
    };
    const pushCustom = (id: string) => {
        const t = customSectionToken(id);
        if (customIds.includes(id) && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    };
    if (Array.isArray(raw)) {
        for (const tok of raw) {
            if (typeof tok !== "string") continue;
            if (tok === "custom") customIds.forEach(pushCustom);
            else if (isCustomSectionToken(tok)) pushCustom(customSectionIdFromToken(tok));
            else pushBuiltin(tok);
        }
    }
    for (const k of BUILTIN_SECTION_KEYS) pushBuiltin(k);
    for (const id of customIds) pushCustom(id);
    return out;
}

/** The full editable resume document. */
export interface ResumeData {
    contact: ResumeContact;
    /** Professional summary / objective. */
    summary: string;
    experience: ResumeExperience[];
    education: ResumeEducation[];
    projects: ResumeProject[];
    skills: ResumeSkillGroup[];
    certifications: ResumeCertification[];
    customSections: ResumeCustomSection[];
    /** Render order of the body sections as a list of TOKENS: a built-in key
     *  ("summary", "experience"…) or `custom:<sectionId>` for an individual
     *  custom section, so each custom section can be interleaved anywhere.
     *  Normalized (deduped + completed) via `normalizeSectionOrder`. */
    sectionOrder: string[];
}

// ─────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────

/**
 * Pre-tested, ATS-friendly templates. All are single-column with standard
 * fonts and selectable text (no tables/columns/graphics that break ATS
 * parsers) — they differ only in typography, spacing, and accent treatment.
 */
/** A template id — a built-in slug ("classic"...) or an admin-defined slug. */
export type ResumeTemplateId = string;

// ─────────────────────────────────────────────────────────────────────
// Fonts (user choice, per resume — like the accent colour)
// ─────────────────────────────────────────────────────────────────────

export interface ResumeFont {
    id: string;
    label: string;
    /** CSS font-family stack. */
    stack: string;
    /** Google Fonts family spec for loading (preview + PDF), or null for a
     *  system font that needs no loading. */
    google: string | null;
    serif?: boolean;
}

/** Curated, ATS-safe fonts (mostly Google Fonts so the PDF matches the preview). */
export const RESUME_FONTS: ResumeFont[] = [
    { id: "inter", label: "Inter", stack: "'Inter', system-ui, -apple-system, sans-serif", google: "Inter:wght@400;500;600;700" },
    { id: "roboto", label: "Roboto", stack: "'Roboto', system-ui, sans-serif", google: "Roboto:wght@400;500;700" },
    { id: "open-sans", label: "Open Sans", stack: "'Open Sans', system-ui, sans-serif", google: "Open+Sans:wght@400;600;700" },
    { id: "lato", label: "Lato", stack: "'Lato', system-ui, sans-serif", google: "Lato:wght@400;700" },
    { id: "source-sans", label: "Source Sans 3", stack: "'Source Sans 3', system-ui, sans-serif", google: "Source+Sans+3:wght@400;600;700" },
    { id: "calibri", label: "Calibri / Carlito", stack: "'Carlito', Calibri, system-ui, sans-serif", google: "Carlito:wght@400;700" },
    { id: "merriweather", label: "Merriweather", stack: "'Merriweather', Georgia, serif", google: "Merriweather:wght@400;700", serif: true },
    { id: "lora", label: "Lora", stack: "'Lora', Georgia, serif", google: "Lora:wght@400;500;600;700", serif: true },
    { id: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif", google: null, serif: true },
];

export const DEFAULT_RESUME_FONT = "inter";

export function resolveResumeFont(id: string): ResumeFont {
    return RESUME_FONTS.find((f) => f.id === id) ?? RESUME_FONTS[0];
}

export interface ResumeFontScale {
    id: string;
    label: string;
    value: number;
}

export const RESUME_FONT_SCALES: ResumeFontScale[] = [
    { id: "s", label: "Small", value: 0.92 },
    { id: "m", label: "Medium", value: 1.0 },
    { id: "l", label: "Large", value: 1.08 },
    { id: "xl", label: "X-Large", value: 1.16 },
];

export const DEFAULT_RESUME_FONT_SCALE = 1.0;

export function clampFontScale(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return DEFAULT_RESUME_FONT_SCALE;
    return Math.max(0.8, Math.min(1.3, Math.round(n * 100) / 100));
}

/** Page-margin multiplier applied to the template's base margin. Lower = tighter
 *  page, more content per page (helps fit onto fewer pages). */
export interface ResumeMarginScale {
    id: string;
    label: string;
    value: number;
}

export const RESUME_MARGIN_SCALES: ResumeMarginScale[] = [
    { id: "tight", label: "Tight", value: 0.5 },
    { id: "compact", label: "Compact", value: 0.72 },
    { id: "normal", label: "Normal", value: 1.0 },
    { id: "wide", label: "Wide", value: 1.28 },
];

export const DEFAULT_RESUME_MARGIN_SCALE = 1.0;

export function clampMarginScale(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return DEFAULT_RESUME_MARGIN_SCALE;
    return Math.max(0.4, Math.min(1.5, Math.round(n * 100) / 100));
}

export type ResumeHeadingStyle = "accent" | "dark" | "muted";

/** Layout family: "single" = classic single column; "sidebar" = section labels
 *  in a tinted left band with content on the right; "two-col" = two balanced
 *  columns with coloured section icons; "split" = narrow left column (skills /
 *  education) + wide right column (experience); "academic" = section labels hang
 *  in the left margin (no band) with a centred name; "hanging" = slim gutter label
 *  + vertical accent rule down a single flow; "inline" = run-in headings. */
export type ResumeLayout =
    | "single"
    | "sidebar"
    | "two-col"
    | "split"
    | "academic"
    | "hanging"
    | "inline";

/**
 * A resume template is fully DATA-DRIVEN: a set of typography/spacing knobs the
 * HTML preview and the PDF renderer both consume. This is what lets an admin
 * create a new template (stored in Firestore `appConfig/resumeTemplates`)
 * without any code change — built-ins are just specs that ship in code.
 *
 * Sizes are in POINTS (the PDF unit); the HTML preview scales them to pixels.
 */
export interface ResumeTemplateSpec {
    id: ResumeTemplateId;
    label: string;
    blurb: string;
    /** True for the in-code built-ins; false for admin-created ones. */
    builtin: boolean;
    /** Name (top heading) font size. */
    nameSize: number;
    /** Whether the name uses the accent colour (else near-black). */
    nameAccent: boolean;
    /** Section-heading font size. */
    headingSize: number;
    /** Section-heading colour treatment. */
    headingStyle: ResumeHeadingStyle;
    /** Draw an accent underline rule under each section heading. */
    headingRule: boolean;
    /** Section-heading letter spacing. */
    letterSpacing: number;
    /** Body text font size. */
    bodySize: number;
    /** Vertical space above each section. */
    sectionGap: number;
    /** Vertical space between entries within a section. */
    entryGap: number;
    /** Page margin (PDF) / page padding (preview). For "sidebar" this is the
     *  vertical (top/bottom) inset; left/right run to the page edge for the band. */
    margin: number;
    /** Layout family (default "single"). */
    layout?: ResumeLayout;
    /** (sidebar) Width of the left label band, in points. */
    sidebarWidth?: number;
    /** (sidebar) Left band tint colour (hex). */
    bandColor?: string;
    /** (sidebar) Render the name + section labels in a serif italic face. */
    headingSerif?: boolean;
    /** Template uses a SECOND accent colour (header band / labels / icons) — the
     *  editor shows a secondary colour picker when true. */
    usesAccent2?: boolean;
    /** Render the header as a full-width tinted band (accent2) with light text. */
    headerBand?: boolean;
    /** Centre the name + section headings (headings get rules on both sides). */
    headingCenter?: boolean;
    /** Entries put the date in a left column instead of the right (timeline look). */
    dateLeft?: boolean;
    /** Render the header name inside a filled box (secondary accent) with the
     *  contact block beside it — a bold "boxed name" header. */
    nameBox?: boolean;
    /** Render section headings as filled label tags (primary-accent fill, light
     *  text) instead of plain text. */
    headingTag?: boolean;
    /** ALL-CAPS heading hugging the left with an accent rule extending to the right
     *  margin (the "ascend" treatment). */
    headingRuleRight?: boolean;
    /** Heading framed between two fine rules, above and below (the "bracket" look). */
    headingBracket?: boolean;
    /** Heading trailed by a dotted leader out to the right margin (the "ledger" look). */
    headingLeader?: boolean;
}

/** Clamp helper bounds — also used to validate admin input. */
export const TEMPLATE_SPEC_BOUNDS = {
    nameSize: [14, 40] as const,
    headingSize: [8, 16] as const,
    bodySize: [8, 12] as const,
    letterSpacing: [0, 3] as const,
    sectionGap: [4, 24] as const,
    entryGap: [2, 16] as const,
    margin: [20, 60] as const,
    sidebarWidth: [110, 230] as const,
};

export const BUILTIN_RESUME_TEMPLATES: ResumeTemplateSpec[] = [
    { id: "classic", label: "Classic", blurb: "Timeless single-column layout favoured by campus placement cells. The safest ATS pick.", builtin: true, nameSize: 21, nameAccent: true, headingSize: 11, headingStyle: "accent", headingRule: false, letterSpacing: 0.6, bodySize: 10, sectionGap: 10, entryGap: 7, margin: 38 },
    { id: "modern", label: "Modern", blurb: "Clean accent rule under each section heading. Single-column and ATS-safe.", builtin: true, nameSize: 23, nameAccent: true, headingSize: 10.5, headingStyle: "accent", headingRule: true, letterSpacing: 0.6, bodySize: 10, sectionGap: 11, entryGap: 8, margin: 40 },
    { id: "professional", label: "Professional", blurb: "Confident larger name, bold accent headings. Great for experienced candidates.", builtin: true, nameSize: 27, nameAccent: true, headingSize: 11, headingStyle: "accent", headingRule: false, letterSpacing: 1.2, bodySize: 10, sectionGap: 11, entryGap: 8, margin: 40 },
    { id: "minimal", label: "Minimal", blurb: "Understated, monochrome, lots of whitespace. Lets your content speak.", builtin: true, nameSize: 21, nameAccent: false, headingSize: 9.5, headingStyle: "muted", headingRule: false, letterSpacing: 1.6, bodySize: 10, sectionGap: 12, entryGap: 7, margin: 44 },
    { id: "compact", label: "Compact", blurb: "Tighter spacing to fit dense experience onto one page without losing parseability.", builtin: true, nameSize: 18, nameAccent: true, headingSize: 9.5, headingStyle: "dark", headingRule: false, letterSpacing: 0.6, bodySize: 9, sectionGap: 7, entryGap: 5, margin: 30 },
    { id: "sidebar", label: "Sidebar", blurb: "Two-tone two-column layout: section labels sit in a left band tinted with your secondary accent; labels take the primary accent, content on the right. Bold serif headings — still ATS-parseable.", builtin: true, nameSize: 26, nameAccent: false, headingSize: 12.5, headingStyle: "accent", headingRule: false, letterSpacing: 0, bodySize: 10, sectionGap: 13, entryGap: 9, margin: 30, layout: "sidebar", sidebarWidth: 156, bandColor: "#dbe7f5", headingSerif: true, usesAccent2: true },
    { id: "onyx", label: "Onyx", blurb: "Bold full-width header band with your name in it, then a clean single-column body. Two-tone: band uses the secondary accent, headings use the primary.", builtin: true, nameSize: 25, nameAccent: false, headingSize: 11, headingStyle: "accent", headingRule: true, letterSpacing: 1, bodySize: 10, sectionGap: 11, entryGap: 8, margin: 40, headerBand: true, usesAccent2: true },
    { id: "helix", label: "Two-Column", blurb: "Compact two-column layout with coloured section icons in a single accent. Skills as chips. Great for fitting a lot on one page.", builtin: true, nameSize: 23, nameAccent: true, headingSize: 10.5, headingStyle: "accent", headingRule: false, letterSpacing: 0.8, bodySize: 9.5, sectionGap: 9, entryGap: 6, margin: 36, layout: "two-col" },
    { id: "meridian", label: "Centered", blurb: "Elegant centred name and centred section headings flanked by rules. Calm, symmetric single-column layout.", builtin: true, nameSize: 26, nameAccent: true, headingSize: 11, headingStyle: "accent", headingRule: false, letterSpacing: 2, bodySize: 10, sectionGap: 12, entryGap: 8, margin: 44, headingCenter: true },
    { id: "timeline", label: "Timeline", blurb: "Dark header band with your name, then a timeline body — dates in a left column beside each entry. Two-tone (band + accent headings).", builtin: true, nameSize: 24, nameAccent: false, headingSize: 11, headingStyle: "accent", headingRule: true, letterSpacing: 1, bodySize: 10, sectionGap: 12, entryGap: 9, margin: 40, headerBand: true, dateLeft: true, usesAccent2: true },
    { id: "split", label: "Split", blurb: "Narrow left column for skills, education and certifications; wide right column for experience and projects. Two-tone accents.", builtin: true, nameSize: 24, nameAccent: false, headingSize: 10.5, headingStyle: "accent", headingRule: false, letterSpacing: 0.8, bodySize: 9.5, sectionGap: 10, entryGap: 7, margin: 34, layout: "split", usesAccent2: true },
    { id: "academic", label: "Academic", blurb: "Centred name with section labels hanging in the left margin and a hairline rule per section — the clean academic-CV look. One accent, fully ATS-parseable.", builtin: true, nameSize: 24, nameAccent: false, headingSize: 10.5, headingStyle: "accent", headingRule: false, letterSpacing: 1, bodySize: 10, sectionGap: 12, entryGap: 7, margin: 44, layout: "academic" },
    { id: "vertex", label: "Boxed", blurb: "Bold boxed name in the secondary accent with contact beside it, dates in a left timeline column, and section headings as filled accent tags. Two-tone, ATS-parseable.", builtin: true, nameSize: 20, nameAccent: false, headingSize: 9.5, headingStyle: "dark", headingRule: false, letterSpacing: 1, bodySize: 9.5, sectionGap: 12, entryGap: 8, margin: 38, dateLeft: true, nameBox: true, headingTag: true, usesAccent2: true },
    { id: "ascend", label: "Ascend", blurb: "ALL-CAPS section headings with a thin accent rule running out to the right margin. The clean, modern, recruiter-safe single column.", builtin: true, nameSize: 24, nameAccent: true, headingSize: 10.5, headingStyle: "dark", headingRule: false, letterSpacing: 1.2, bodySize: 10, sectionGap: 11, entryGap: 8, margin: 40, headingRuleRight: true },
    { id: "bracket", label: "Bracket", blurb: "Section headings framed between two fine rules — an architectural, quiet-luxury single column. Accent headings, fine rules, fully ATS-parseable.", builtin: true, nameSize: 23, nameAccent: false, headingSize: 10.5, headingStyle: "accent", headingRule: false, letterSpacing: 1.5, bodySize: 10, sectionGap: 12, entryGap: 8, margin: 42, headingBracket: true },
    { id: "ledger", label: "Ledger", blurb: "Quiet single column with small-caps headings trailed by a dotted leader to the right margin — a refined, statement-like look. One accent, ATS-parseable.", builtin: true, nameSize: 22, nameAccent: false, headingSize: 10, headingStyle: "accent", headingRule: false, letterSpacing: 1, bodySize: 10, sectionGap: 11, entryGap: 7, margin: 42, headingLeader: true },
    { id: "spine", label: "Spine", blurb: "Section labels in a slim left gutter with a vertical accent rule running down the body — a single clean flow with a coloured spine. One accent, ATS-parseable.", builtin: true, nameSize: 24, nameAccent: true, headingSize: 10, headingStyle: "accent", headingRule: false, letterSpacing: 1, bodySize: 10, sectionGap: 12, entryGap: 7, margin: 40, layout: "hanging" },
    { id: "inline", label: "Inline", blurb: "Run-in headings sit on the same line as their content for a dense, editorial one-page layout. One accent, very ATS-parseable.", builtin: true, nameSize: 21, nameAccent: false, headingSize: 9.5, headingStyle: "accent", headingRule: false, letterSpacing: 1, bodySize: 9.5, sectionGap: 9, entryGap: 6, margin: 38, layout: "inline" },
];

/** Back-compat alias: the gallery / pickers list templates from here. */
export const RESUME_TEMPLATES = BUILTIN_RESUME_TEMPLATES;

/** Group templates by visual family (for the picker filter + dropdown sections). */
export const RESUME_TEMPLATE_FAMILIES = [
    "Single column",
    "Centered",
    "Header band",
    "Two-column",
    "Sidebar",
] as const;
export type ResumeTemplateFamily = (typeof RESUME_TEMPLATE_FAMILIES)[number];

export function resumeTemplateFamily(spec: ResumeTemplateSpec): ResumeTemplateFamily {
    if (spec.layout === "sidebar" || spec.layout === "academic" || spec.layout === "hanging") return "Sidebar";
    if (spec.layout === "two-col" || spec.layout === "split") return "Two-column";
    if (spec.headerBand || spec.nameBox) return "Header band";
    if (spec.headingCenter) return "Centered";
    return "Single column";
}

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = "classic";

/** Resolve a template id to its spec from (customs + built-ins), falling back
 *  to the first built-in so an unknown/deleted id always renders something. */
export function resolveTemplateSpec(
    id: string,
    customs: ResumeTemplateSpec[] = []
): ResumeTemplateSpec {
    return (
        customs.find((t) => t.id === id) ||
        BUILTIN_RESUME_TEMPLATES.find((t) => t.id === id) ||
        BUILTIN_RESUME_TEMPLATES[0]
    );
}

function clampNum(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Validate + normalize an admin-supplied template spec. Returns null if it has
 *  no usable label. `index` seeds a fallback id. */
export function sanitizeTemplateSpec(raw: unknown, index: number): ResumeTemplateSpec | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 40) : "";
    if (!label) return null;
    const B = TEMPLATE_SPEC_BOUNDS;
    const id =
        (typeof r.id === "string" && slugify(r.id)) || slugify(label) || `custom-${index + 1}`;
    const headingStyle: ResumeHeadingStyle =
        r.headingStyle === "dark" || r.headingStyle === "muted" ? r.headingStyle : "accent";
    const sidebar = r.layout === "sidebar";
    const hex = typeof r.bandColor === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(r.bandColor.trim());
    return {
        id: `custom-${id}`.replace(/^custom-custom-/, "custom-"),
        label,
        blurb: typeof r.blurb === "string" ? r.blurb.trim().slice(0, 120) : "",
        builtin: false,
        nameSize: clampNum(r.nameSize, B.nameSize, 22),
        nameAccent: r.nameAccent !== false,
        headingSize: clampNum(r.headingSize, B.headingSize, 11),
        headingStyle,
        headingRule: r.headingRule === true,
        letterSpacing: clampNum(r.letterSpacing, B.letterSpacing, 0.6),
        bodySize: clampNum(r.bodySize, B.bodySize, 10),
        sectionGap: clampNum(r.sectionGap, B.sectionGap, 10),
        entryGap: clampNum(r.entryGap, B.entryGap, 7),
        margin: clampNum(r.margin, B.margin, 38),
        usesAccent2: r.usesAccent2 === true,
        headerBand: r.headerBand === true,
        headingCenter: r.headingCenter === true,
        dateLeft: r.dateLeft === true,
        nameBox: r.nameBox === true,
        headingTag: r.headingTag === true,
        headingRuleRight: r.headingRuleRight === true,
        headingBracket: r.headingBracket === true,
        headingLeader: r.headingLeader === true,
        layout: sidebar
            ? "sidebar"
            : r.layout === "two-col"
              ? "two-col"
              : r.layout === "split"
                ? "split"
                : r.layout === "academic"
                  ? "academic"
                  : r.layout === "hanging"
                    ? "hanging"
                    : r.layout === "inline"
                      ? "inline"
                      : "single",
        ...(sidebar
            ? {
                  sidebarWidth: clampNum(r.sidebarWidth, B.sidebarWidth, 156),
                  bandColor: hex ? (r.bandColor as string).trim().toLowerCase() : "#dbe7f5",
                  headingSerif: r.headingSerif !== false,
              }
            : {}),
    };
}

/** Accent colours offered in the editor (kept dark enough for print contrast). */
export const RESUME_ACCENT_COLORS = [
    "#0f766e", // teal (brand primary)
    "#1d4ed8", // blue
    "#0f172a", // slate (mono / most ATS-neutral)
    "#7c3aed", // violet
    "#b45309", // amber-brown
] as const;

export type ResumeAccentColor = (typeof RESUME_ACCENT_COLORS)[number];
export const DEFAULT_RESUME_ACCENT: ResumeAccentColor = "#0f172a";
/** Secondary accent — used by two-tone templates (header bands, labels, the
 *  second of two section-icon colours…). Defaults to a deep slate band colour. */
export const DEFAULT_RESUME_ACCENT_2 = "#1e293b";

// ─────────────────────────────────────────────────────────────────────
// ATS scoring
// ─────────────────────────────────────────────────────────────────────

/** The fixed rubric the LLM scores against. Weights sum to 100 and the
 *  overall score is recomputed server-side from these — the model never
 *  sets the overall directly. */
export type AtsDimensionKey =
    | "keyword_match"
    | "impact"
    | "completeness"
    | "clarity"
    | "formatting"
    | "length";

export interface AtsDimensionMeta {
    key: AtsDimensionKey;
    label: string;
    blurb: string;
    /** Relative weight in the overall score. */
    weight: number;
}

export const ATS_DIMENSIONS: AtsDimensionMeta[] = [
    {
        key: "keyword_match",
        label: "Keyword match",
        blurb: "Coverage of the skills/keywords a recruiter (or the target job description) looks for.",
        weight: 30,
    },
    {
        key: "impact",
        label: "Impact & metrics",
        blurb: "Quantified achievements and strong action verbs vs. vague duty statements.",
        weight: 22,
    },
    {
        key: "completeness",
        label: "Section completeness",
        blurb: "All essential sections present: contact, experience/projects, education, skills.",
        weight: 16,
    },
    {
        key: "clarity",
        label: "Clarity & grammar",
        blurb: "Concise, consistent tense, no fluff, clean grammar and spelling.",
        weight: 14,
    },
    {
        key: "formatting",
        label: "ATS formatting",
        blurb: "Parseable structure — standard headings, dates, no characters that confuse parsers.",
        weight: 10,
    },
    {
        key: "length",
        label: "Length & density",
        blurb: "Appropriate length and information density for the candidate's experience level.",
        weight: 8,
    },
];

export interface AtsSubscore {
    key: AtsDimensionKey;
    label: string;
    /** 0–100. */
    score: number;
    /** One short sentence on why. */
    summary: string;
    /** Concrete, actionable fixes for this dimension. */
    suggestions: string[];
}

export interface AtsScore {
    /** 0–100, recomputed server-side from the weighted subscores. */
    overall: number;
    /** 2–3 sentence plain-language verdict for the student. */
    summary: string;
    subscores: AtsSubscore[];
    /** Keywords found in the resume relevant to the role/JD. */
    matchedKeywords: string[];
    /** Important keywords the resume is missing (esp. vs. the JD). */
    missingKeywords: string[];
    /** The top cross-cutting fixes, ranked. */
    topFixes: string[];
    /** Whether the score was computed against a pasted job description. */
    hasJobDescription: boolean;
    /** ISO timestamp of when it was graded. */
    gradedAt: string;
}

// ─────────────────────────────────────────────────────────────────────
// Stored document
// ─────────────────────────────────────────────────────────────────────

/** `resumes/{resumeId}` — server-only, owned by `userId`. */
export interface Resume {
    id: string;
    userId: string;
    /** User-facing name of this resume, e.g. "SDE — Google". */
    title: string;
    templateId: ResumeTemplateId;
    accentColor: string;
    /** Secondary accent (two-tone templates). */
    accentColor2: string;
    /** Font family id (see RESUME_FONTS). */
    fontId: string;
    /** Font size multiplier applied to the template's sizes. */
    fontScale: number;
    /** Page-margin multiplier applied to the template's base margin. */
    marginScale: number;
    data: ResumeData;
    /** Last ATS check result (cached for display), or null if never checked. */
    lastAts: AtsScore | null;
    /** Source file this resume was imported from, if any. */
    importedFrom: { fileName: string; storagePath: string } | null;
    createdAt: string;
    updatedAt: string;
}

/** A trimmed shape for the resume-list view. */
export interface ResumeSummary {
    id: string;
    title: string;
    templateId: ResumeTemplateId;
    /** Cached overall ATS score for the list card, or null. */
    atsScore: number | null;
    updatedAt: string;
    createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────
// AI assist actions
// ─────────────────────────────────────────────────────────────────────

export type ResumeAssistAction = "rewrite_bullet" | "generate_summary" | "tailor";

export interface ResumeAssistResultRewrite {
    action: "rewrite_bullet";
    /** A few rewritten variants, strongest first. */
    variants: string[];
}

export interface ResumeAssistResultSummary {
    action: "generate_summary";
    summary: string;
}

export interface ResumeTailorSuggestion {
    /** Where the change applies, e.g. "summary", "skills", "experience: Acme". */
    target: string;
    suggestion: string;
}

export interface ResumeAssistResultTailor {
    action: "tailor";
    /** Keywords from the JD missing in the resume. */
    missingKeywords: string[];
    suggestions: ResumeTailorSuggestion[];
}

export type ResumeAssistResult =
    | ResumeAssistResultRewrite
    | ResumeAssistResultSummary
    | ResumeAssistResultTailor;

// ─────────────────────────────────────────────────────────────────────
// Factories / defaults
// ─────────────────────────────────────────────────────────────────────

export function emptyResumeData(): ResumeData {
    return {
        contact: {
            fullName: "",
            headline: "",
            email: "",
            phone: "",
            location: "",
            links: [],
        },
        summary: "",
        experience: [],
        education: [],
        projects: [],
        skills: [],
        certifications: [],
        customSections: [],
        sectionOrder: [...DEFAULT_SECTION_ORDER],
    };
}

/** A realistic sample resume used to render template thumbnails in the picker
 *  and to optionally pre-fill a new resume so the user has something to edit. */
export const SAMPLE_RESUME_DATA: ResumeData = {
    contact: {
        fullName: "Aisha Khan",
        headline: "Final-year B.Tech CSE · Aspiring Software Engineer",
        email: "aisha.khan@email.com",
        phone: "+91 90000 00000",
        location: "Bengaluru, India",
        links: [
            { label: "GitHub", url: "https://github.com/aishakhan" },
            { label: "LinkedIn", url: "https://linkedin.com/in/aishakhan" },
        ],
    },
    summary:
        "Final-year Computer Science student with internship experience in full-stack web development. Shipped 3 production apps serving 10k+ users and enjoy turning ambiguous problems into clean, well-tested systems.",
    experience: [
        {
            id: "s-exp-1",
            company: "Fintech Labs",
            role: "Software Engineer Intern",
            location: "Remote",
            startDate: "Jun 2025",
            endDate: "Aug 2025",
            current: false,
            bullets: [
                "Built 12 REST endpoints in Node/Express, cutting p95 latency 40% for 8k daily users",
                "Added a Redis cache layer that reduced database reads by 65%",
                "Wrote integration tests raising coverage from 48% to 86%",
            ],
        },
    ],
    education: [
        {
            id: "s-edu-1",
            school: "Chandigarh University",
            degree: "B.Tech",
            field: "Computer Science",
            location: "Punjab, India",
            startDate: "2022",
            endDate: "2026",
            grade: "8.7 CGPA",
            details: [],
        },
    ],
    projects: [
        {
            id: "s-proj-1",
            name: "ExpenseFlow",
            subtitle: "Full-stack expense tracker",
            link: "https://github.com/aishakhan/expenseflow",
            tech: ["React", "Node", "PostgreSQL"],
            bullets: [
                "Designed a budgeting tool with charts and CSV import used by 500+ students",
                "Implemented JWT auth and role-based access control",
            ],
        },
    ],
    skills: [
        { id: "s-sk-1", category: "Languages", skills: ["Python", "JavaScript", "TypeScript", "SQL"] },
        { id: "s-sk-2", category: "Frameworks", skills: ["React", "Node.js", "Express"] },
        { id: "s-sk-3", category: "Tools", skills: ["Git", "Docker", "PostgreSQL", "Redis"] },
    ],
    certifications: [
        { id: "s-cert-1", name: "AWS Cloud Practitioner", issuer: "Amazon", date: "2025", link: "" },
    ],
    customSections: [
        {
            id: "s-cs-1",
            title: "Achievements",
            entries: [
                {
                    id: "s-cs-1-e1",
                    title: "",
                    subtitle: "",
                    date: "",
                    link: "",
                    bullets: ["Winner, Smart India Hackathon 2025", "Top 2% on the campus DSA leaderboard"],
                },
            ],
        },
    ],
    sectionOrder: [...DEFAULT_SECTION_ORDER],
};
