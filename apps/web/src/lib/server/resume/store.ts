/**
 * Firestore access + serialization + input hardening for Resume Maker.
 *
 * `resumes` is a SERVER-ONLY collection (admin SDK via /api/resume*); every
 * doc carries `userId` and is owned by that user. All client-supplied resume
 * content flows through `sanitizeResumeData` first: it coerces every field,
 * caps lengths/counts (so a doc can't blow the 1 MB Firestore limit), assigns
 * ids to array items, and — crucially — strips `undefined`, which Firestore
 * rejects.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import {
    DEFAULT_RESUME_ACCENT,
    DEFAULT_RESUME_ACCENT_2,
    DEFAULT_RESUME_FONT,
    DEFAULT_RESUME_FONT_SCALE,
    DEFAULT_RESUME_MARGIN_SCALE,
    DEFAULT_RESUME_TEMPLATE,
    RESUME_FONTS,
    clampFontScale,
    clampMarginScale,
    emptyResumeData,
    normalizeSectionOrder,
    type AtsScore,
    type Resume,
    type ResumeData,
    type ResumeSummary,
    type ResumeTemplateId,
} from "@digimine/types";

export const RESUMES = "resumes";

/**
 * Hard cap on the serialized `data` field, measured in UTF-8 BYTES (Firestore
 * sizes docs in bytes, and a CJK/Cyrillic resume can be 2-3× its character
 * count). 900 KB leaves headroom for the cached `lastAts` blob + field names
 * under Firestore's 1 MiB doc limit. The per-field char caps below keep normal
 * resumes far under this; this is the backstop for multibyte / crafted input.
 */
export const RESUME_MAX_DATA_BYTES = 900_000;

/** Thrown when a resume's `data` exceeds the byte budget. Routes map it to 413. */
export class ResumeTooLargeError extends Error {
    constructor() {
        super("This resume is too large to save. Trim some sections or shorten long bullets.");
        this.name = "ResumeTooLargeError";
    }
}

function assertResumeDataSize(data: ResumeData): void {
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > RESUME_MAX_DATA_BYTES) {
        throw new ResumeTooLargeError();
    }
}

/** Storage path prefix uploaded source resumes live under, per user. */
export function resumeStoragePrefix(userId: string): string {
    return `resumes/${userId}/`;
}

// ─────────────────────────────────────────────────────────────────────
// Coercion helpers (never trust client input)
// ─────────────────────────────────────────────────────────────────────

function str(v: unknown, max: number): string {
    return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strArr(v: unknown, maxItems: number, maxLen: number): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, maxLen))
        .slice(0, maxItems);
}

const FMT_TAG_MAP: Record<string, string> = { b: "strong", strong: "strong", i: "em", em: "em", u: "u" };

/** Keep a tiny inline-formatting allowlist (bold/italic/underline) as clean
 *  tags and strip every other tag + ALL attributes (so no event handlers / hrefs
 *  survive). Text is left raw — it's escaped at render by `fmtInline`. */
function fmtStr(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    const cleaned = v.replace(
        /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
        (_m, close: string, name: string, attrs: string) => {
            const n = name.toLowerCase();
            const tag = FMT_TAG_MAP[n];
            if (tag) return `<${close ? "/" : ""}${tag}>`;
            if (n === "br" && !close) return "<br>";
            if (n === "div") {
                if (close) return "</div>";
                const a = /text-align\s*:\s*(center|right|justify|left)/i.exec(attrs || "");
                return a ? `<div style="text-align:${a[1].toLowerCase()}">` : "";
            }
            return "";
        }
    );
    return cleaned.trim().slice(0, max);
}

/** strArr, but each item keeps the inline-formatting allowlist. Items that are
 *  empty once tags are stripped are dropped. */
function fmtArr(v: unknown, maxItems: number, maxLen: number): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((s): s is string => typeof s === "string")
        .map((s) => fmtStr(s, maxLen))
        .filter((s) => s.replace(/<[^>]*>/g, "").trim().length > 0)
        .slice(0, maxItems);
}

let _idSeq = 0;
function genId(): string {
    // Stable-enough per process; ids only need to be unique within one resume.
    _idSeq = (_idSeq + 1) % 1_000_000;
    return `r${Date.now().toString(36)}${_idSeq.toString(36)}`;
}

function id(v: unknown): string {
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 64) : genId();
}

const LIMITS = {
    title: 120,
    summary: 2400,
    bullet: 600,
    bulletsPer: 12,
    experience: 20,
    education: 12,
    projects: 24,
    skillGroups: 14,
    skillsPer: 50,
    certifications: 20,
    customSections: 10,
    customEntries: 20,
    links: 10,
    field: 200,
    detailsPer: 8,
    techPer: 24,
};

export function sanitizeTemplateId(v: unknown): ResumeTemplateId {
    // Any non-empty slug is accepted (built-in OR admin-defined). Whether it
    // actually exists is resolved at render time (resolveTemplateSpec falls
    // back to a built-in), so a deleted custom id still renders.
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : DEFAULT_RESUME_TEMPLATE;
}

export function sanitizeFontId(v: unknown): string {
    return RESUME_FONTS.some((f) => f.id === v) ? (v as string) : DEFAULT_RESUME_FONT;
}

export function sanitizeFontScale(v: unknown): number {
    return v === undefined || v === null ? DEFAULT_RESUME_FONT_SCALE : clampFontScale(v);
}

export function sanitizeMarginScale(v: unknown): number {
    return v === undefined || v === null ? DEFAULT_RESUME_MARGIN_SCALE : clampMarginScale(v);
}

export function sanitizeAccent(v: unknown): string {
    // Accept any valid hex colour (presets are hex too) so users can pick their
    // own accent; fall back to the default for anything malformed.
    if (typeof v === "string") {
        const hex = v.trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return hex.toLowerCase();
    }
    return DEFAULT_RESUME_ACCENT;
}

export function sanitizeAccent2(v: unknown): string {
    if (typeof v === "string") {
        const hex = v.trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return hex.toLowerCase();
    }
    return DEFAULT_RESUME_ACCENT_2;
}

/** Coerce arbitrary input into a clean, bounded, Firestore-safe ResumeData. */
export function sanitizeResumeData(raw: unknown): ResumeData {
    const base = emptyResumeData();
    if (!raw || typeof raw !== "object") return base;
    const r = raw as Record<string, any>;
    const c = (r.contact && typeof r.contact === "object" ? r.contact : {}) as Record<string, any>;

    // Custom sections first — the section order is normalized against their ids.
    const customSections = (Array.isArray(r.customSections) ? r.customSections : [])
        .slice(0, LIMITS.customSections)
        .map((s: any) => {
            // Accept the new {entries} shape; migrate the legacy {bullets} shape
            // (one entry holding those bullets) so old resumes keep working.
            const rawEntries: any[] = Array.isArray(s?.entries)
                ? s.entries
                : Array.isArray(s?.bullets) && s.bullets.length
                  ? [{ bullets: s.bullets }]
                  : [];
            return {
                id: id(s?.id),
                title: str(s?.title, 80),
                entries: rawEntries.slice(0, LIMITS.customEntries).map((e: any) => ({
                    id: id(e?.id),
                    title: str(e?.title, LIMITS.field),
                    subtitle: str(e?.subtitle, LIMITS.field),
                    date: str(e?.date, 40),
                    link: str(e?.link, 400),
                    bullets: fmtArr(e?.bullets, LIMITS.bulletsPer, LIMITS.bullet),
                })),
            };
        });

    return {
        contact: {
            fullName: str(c.fullName, LIMITS.field),
            headline: str(c.headline, LIMITS.field),
            email: str(c.email, LIMITS.field),
            phone: str(c.phone, LIMITS.field),
            location: str(c.location, LIMITS.field),
            links: (Array.isArray(c.links) ? c.links : [])
                .slice(0, LIMITS.links)
                .map((l: any) => ({
                    label: str(l?.label, 60),
                    url: str(l?.url, 400),
                }))
                .filter((l: { label: string; url: string }) => l.label || l.url),
        },
        summary: fmtStr(r.summary, LIMITS.summary),
        experience: (Array.isArray(r.experience) ? r.experience : [])
            .slice(0, LIMITS.experience)
            .map((e: any) => ({
                id: id(e?.id),
                company: str(e?.company, LIMITS.field),
                role: str(e?.role, LIMITS.field),
                location: str(e?.location, LIMITS.field),
                startDate: str(e?.startDate, 40),
                endDate: str(e?.endDate, 40),
                current: e?.current === true,
                bullets: fmtArr(e?.bullets, LIMITS.bulletsPer, LIMITS.bullet),
            })),
        education: (Array.isArray(r.education) ? r.education : [])
            .slice(0, LIMITS.education)
            .map((e: any) => ({
                id: id(e?.id),
                school: str(e?.school, LIMITS.field),
                degree: str(e?.degree, LIMITS.field),
                field: str(e?.field, LIMITS.field),
                location: str(e?.location, LIMITS.field),
                startDate: str(e?.startDate, 40),
                endDate: str(e?.endDate, 40),
                grade: str(e?.grade, 60),
                details: fmtArr(e?.details, LIMITS.detailsPer, LIMITS.bullet),
            })),
        projects: (Array.isArray(r.projects) ? r.projects : [])
            .slice(0, LIMITS.projects)
            .map((p: any) => ({
                id: id(p?.id),
                name: str(p?.name, LIMITS.field),
                subtitle: str(p?.subtitle, LIMITS.field),
                link: str(p?.link, 400),
                tech: strArr(p?.tech, LIMITS.techPer, 40),
                bullets: fmtArr(p?.bullets, LIMITS.bulletsPer, LIMITS.bullet),
            })),
        skills: (Array.isArray(r.skills) ? r.skills : [])
            .slice(0, LIMITS.skillGroups)
            .map((g: any) => ({
                id: id(g?.id),
                category: str(g?.category, 80),
                skills: strArr(g?.skills, LIMITS.skillsPer, 60),
            })),
        certifications: (Array.isArray(r.certifications) ? r.certifications : [])
            .slice(0, LIMITS.certifications)
            .map((cert: any) => ({
                id: id(cert?.id),
                name: str(cert?.name, LIMITS.field),
                issuer: str(cert?.issuer, LIMITS.field),
                date: str(cert?.date, 40),
                link: str(cert?.link, 400),
            })),
        customSections,
        sectionOrder: normalizeSectionOrder(r.sectionOrder, customSections.map((s) => s.id)),
    };
}

export function sanitizeTitle(v: unknown): string {
    const t = str(v, LIMITS.title);
    return t || "Untitled resume";
}

// ─────────────────────────────────────────────────────────────────────
// Plain-text rendering — what the LLM sees for ATS scoring / import structuring
// ─────────────────────────────────────────────────────────────────────

/** Render a resume to clean plain text for the model (mirrors how an ATS
 *  parser flattens it). Kept compact + bounded. */
export function resumeToPlainText(data: ResumeData): string {
    const lines: string[] = [];
    const c = data.contact;
    if (c.fullName) lines.push(c.fullName);
    if (c.headline) lines.push(c.headline);
    const contactBits = [c.email, c.phone, c.location, ...c.links.map((l) => `${l.label}: ${l.url}`)].filter(Boolean);
    if (contactBits.length) lines.push(contactBits.join(" | "));

    if (data.summary) {
        lines.push("", "SUMMARY", data.summary);
    }
    if (data.experience.length) {
        lines.push("", "EXPERIENCE");
        for (const e of data.experience) {
            const when = e.current ? `${e.startDate} - Present` : [e.startDate, e.endDate].filter(Boolean).join(" - ");
            lines.push([e.role, e.company, e.location, when].filter(Boolean).join(" | "));
            e.bullets.forEach((b) => lines.push(`- ${b}`));
        }
    }
    if (data.projects.length) {
        lines.push("", "PROJECTS");
        for (const p of data.projects) {
            lines.push([p.name, p.subtitle, p.tech.join(", "), p.link].filter(Boolean).join(" | "));
            p.bullets.forEach((b) => lines.push(`- ${b}`));
        }
    }
    if (data.education.length) {
        lines.push("", "EDUCATION");
        for (const e of data.education) {
            const when = [e.startDate, e.endDate].filter(Boolean).join(" - ");
            lines.push([e.degree, e.field, e.school, e.grade, when].filter(Boolean).join(" | "));
            e.details.forEach((d) => lines.push(`- ${d}`));
        }
    }
    if (data.skills.length) {
        lines.push("", "SKILLS");
        for (const g of data.skills) {
            lines.push(`${g.category ? g.category + ": " : ""}${g.skills.join(", ")}`);
        }
    }
    if (data.certifications.length) {
        lines.push("", "CERTIFICATIONS");
        for (const cert of data.certifications) {
            lines.push([cert.name, cert.issuer, cert.date].filter(Boolean).join(" | "));
        }
    }
    for (const s of data.customSections) {
        lines.push("", s.title.toUpperCase());
        for (const e of s.entries) {
            const head = [e.title, e.subtitle, e.date].filter(Boolean).join(" | ");
            if (head) lines.push(head);
            e.bullets.forEach((b) => lines.push(`- ${b}`));
        }
    }
    // Strip any inline-formatting tags so the model + ATS see clean plain text.
    return lines.join("\n").replace(/<[^>]*>/g, "").slice(0, 16_000);
}

/** True when the resume has enough content to score / export. */
export function resumeHasContent(data: ResumeData): boolean {
    return Boolean(
        data.contact.fullName ||
            data.summary ||
            data.experience.length ||
            data.projects.length ||
            data.education.length ||
            data.skills.length
    );
}

// ─────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────

export function serializeResume(doc: any): Resume | null {
    // A Firestore snapshot has a `data()` METHOD; a plain doc object (from
    // createResume) has a `data` FIELD (the ResumeData). Distinguish by type —
    // checking truthiness would call the ResumeData object as a function.
    const data = typeof doc?.data === "function" ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        userId: data.userId || "",
        title: data.title || "Untitled resume",
        templateId: sanitizeTemplateId(data.templateId),
        accentColor: sanitizeAccent(data.accentColor),
        accentColor2: sanitizeAccent2(data.accentColor2),
        fontId: sanitizeFontId(data.fontId),
        fontScale: sanitizeFontScale(data.fontScale),
        marginScale: sanitizeMarginScale(data.marginScale),
        data: sanitizeResumeData(data.data),
        lastAts: (data.lastAts as AtsScore) ?? null,
        importedFrom: data.importedFrom ?? null,
        createdAt: toIsoDate(data.createdAt) || new Date(0).toISOString(),
        updatedAt: toIsoDate(data.updatedAt) || new Date(0).toISOString(),
    };
}

export function serializeResumeSummary(doc: any): ResumeSummary | null {
    const data = typeof doc?.data === "function" ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        title: data.title || "Untitled resume",
        templateId: sanitizeTemplateId(data.templateId),
        atsScore: typeof data.lastAts?.overall === "number" ? data.lastAts.overall : null,
        createdAt: toIsoDate(data.createdAt) || new Date(0).toISOString(),
        updatedAt: toIsoDate(data.updatedAt) || new Date(0).toISOString(),
    };
}

// ─────────────────────────────────────────────────────────────────────
// CRUD (admin SDK — ownership enforced in the routes)
// ─────────────────────────────────────────────────────────────────────

export async function getResumeDoc(resumeId: string): Promise<any | null> {
    if (!resumeId) return null;
    const snap = await adminDb.collection(RESUMES).doc(resumeId).get();
    return snap.exists ? snap : null;
}

export async function listResumesForUser(userId: string): Promise<ResumeSummary[]> {
    const snap = await adminDb
        .collection(RESUMES)
        .where("userId", "==", userId)
        .orderBy("updatedAt", "desc")
        .limit(100)
        .get();
    return snap.docs.map(serializeResumeSummary).filter((r): r is ResumeSummary => r !== null);
}

export interface CreateResumeInput {
    title: string;
    templateId: ResumeTemplateId;
    accentColor: string;
    accentColor2?: string;
    fontId?: string;
    fontScale?: number;
    marginScale?: number;
    data: ResumeData;
    importedFrom?: { fileName: string; storagePath: string } | null;
}

export async function createResume(userId: string, input: CreateResumeInput): Promise<Resume> {
    const ref = adminDb.collection(RESUMES).doc();
    const now = Timestamp.now();
    const cleanData = sanitizeResumeData(input.data);
    assertResumeDataSize(cleanData);
    const doc = {
        userId,
        title: sanitizeTitle(input.title),
        templateId: sanitizeTemplateId(input.templateId),
        accentColor: sanitizeAccent(input.accentColor),
        accentColor2: sanitizeAccent2(input.accentColor2),
        fontId: sanitizeFontId(input.fontId),
        fontScale: sanitizeFontScale(input.fontScale),
        marginScale: sanitizeMarginScale(input.marginScale),
        data: cleanData,
        lastAts: null,
        importedFrom: input.importedFrom ?? null,
        createdAt: now,
        updatedAt: now,
    };
    await ref.set(doc);
    return serializeResume({ id: ref.id, ...doc })!;
}

export interface UpdateResumePatch {
    title?: string;
    templateId?: ResumeTemplateId;
    accentColor?: string;
    accentColor2?: string;
    fontId?: string;
    fontScale?: number;
    marginScale?: number;
    data?: ResumeData;
    lastAts?: AtsScore | null;
}

/** Apply a patch to an owned resume. Only the provided fields change. */
export async function updateResume(resumeId: string, patch: UpdateResumePatch): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (patch.title !== undefined) update.title = sanitizeTitle(patch.title);
    if (patch.templateId !== undefined) update.templateId = sanitizeTemplateId(patch.templateId);
    if (patch.accentColor !== undefined) update.accentColor = sanitizeAccent(patch.accentColor);
    if (patch.accentColor2 !== undefined) update.accentColor2 = sanitizeAccent2(patch.accentColor2);
    if (patch.fontId !== undefined) update.fontId = sanitizeFontId(patch.fontId);
    if (patch.fontScale !== undefined) update.fontScale = sanitizeFontScale(patch.fontScale);
    if (patch.marginScale !== undefined) update.marginScale = sanitizeMarginScale(patch.marginScale);
    if (patch.data !== undefined) {
        const cleanData = sanitizeResumeData(patch.data);
        assertResumeDataSize(cleanData);
        update.data = cleanData;
    }
    if (patch.lastAts !== undefined) update.lastAts = patch.lastAts;
    await adminDb.collection(RESUMES).doc(resumeId).set(update, { merge: true });
}

export async function deleteResume(resumeId: string): Promise<void> {
    await adminDb.collection(RESUMES).doc(resumeId).delete();
}
