/**
 * Admin-side Firestore helpers for `practiceSheets`.
 *
 *  - Slug-as-doc-id (matches topics, articles, problems), so the public
 *    detail page reads via O(1) `doc(slug).get()` with no index lookup.
 *  - Sections are the modern shape; legacy `items[]` is preserved and
 *    auto-empty on new creates so existing reader code keeps working.
 *  - `mapSheet` keeps Timestamps → Dates conversion in one place so callers
 *    never have to .toDate() themselves.
 */
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit as fbLimit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
} from "firebase/firestore";
import {
    DEFAULT_PRACTICE_SHEET_SEO,
    type CreatePracticeSheetInput,
    type PracticeSheet,
    type PracticeSheetSeo,
    type PracticeSheetSection,
} from "@digimine/types";
import { db } from "@/lib/firebase/client";

const COL = () => collection(db, "practiceSheets");

function slugify(s: string): string {
    return s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 80);
}

function mapSeo(d: Partial<PracticeSheetSeo> | undefined): PracticeSheetSeo {
    return { ...DEFAULT_PRACTICE_SHEET_SEO, ...(d || {}) };
}

function mapSection(raw: Record<string, unknown>): PracticeSheetSection {
    return {
        topicSlug: (raw.topicSlug as string | null) ?? null,
        title: String(raw.title || ""),
        summary: (raw.summary as string | null) ?? null,
        problemSlugs: Array.isArray(raw.problemSlugs)
            ? (raw.problemSlugs as string[]).filter(Boolean)
            : [],
    };
}

function mapSheet(id: string, d: Record<string, unknown>): PracticeSheet {
    const ts = (v: unknown): Date => {
        const x = v as { toDate?: () => Date } | undefined;
        return x && typeof x.toDate === "function" ? x.toDate() : new Date();
    };
    return {
        id,
        slug: String(d.slug || id),
        kind: (d.kind as PracticeSheet["kind"]) || "dsa",
        title: String(d.title || ""),
        subtitle: (d.subtitle as string | null) ?? null,
        description: String(d.description || ""),
        coverImageUrl: (d.coverImageUrl as string | null) ?? null,
        items: Array.isArray(d.items) ? (d.items as PracticeSheet["items"]) : [],
        sections: Array.isArray(d.sections)
            ? (d.sections as Record<string, unknown>[]).map(mapSection)
            : [],
        difficulty: (d.difficulty as PracticeSheet["difficulty"]) ?? null,
        estimatedHours:
            typeof d.estimatedHours === "number" ? (d.estimatedHours as number) : null,
        tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
        isOfficial: Boolean(d.isOfficial),
        isFeatured: Boolean(d.isFeatured),
        status: (d.status as PracticeSheet["status"]) || "draft",
        seo: mapSeo(d.seo as Partial<PracticeSheetSeo> | undefined),
        createdBy: String(d.createdBy || ""),
        createdAt: ts(d.createdAt),
        updatedAt: ts(d.updatedAt),
    };
}

export async function listSheets(opts?: {
    kind?: "dsa" | "sql" | "mixed" | "all";
    status?: PracticeSheet["status"] | "all";
    limit?: number;
}): Promise<PracticeSheet[]> {
    const constraints = [];
    if (opts?.kind && opts.kind !== "all") constraints.push(where("kind", "==", opts.kind));
    if (opts?.status && opts.status !== "all")
        constraints.push(where("status", "==", opts.status));
    constraints.push(orderBy("updatedAt", "desc"));
    if (opts?.limit) constraints.push(fbLimit(opts.limit));
    const snap = await getDocs(query(COL(), ...constraints));
    return snap.docs.map((d) => mapSheet(d.id, d.data() || {}));
}

export async function getSheet(id: string): Promise<PracticeSheet | null> {
    const snap = await getDoc(doc(COL(), id));
    if (!snap.exists()) return null;
    return mapSheet(snap.id, snap.data() || {});
}

async function uniqueSlug(desired: string, excludeId?: string): Promise<string> {
    const base = slugify(desired) || "sheet";
    let candidate = base;
    for (let i = 2; i < 30; i++) {
        const directSnap = await getDoc(doc(COL(), candidate));
        const takenByDoc = directSnap.exists() && directSnap.id !== excludeId;
        if (!takenByDoc) {
            const fieldSnap = await getDocs(
                query(COL(), where("slug", "==", candidate), fbLimit(2))
            );
            const takenByField = fieldSnap.docs.some((d) => d.id !== excludeId);
            if (!takenByField) return candidate;
        }
        candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
}

function buildPayload(
    input: CreatePracticeSheetInput,
    slug: string,
    adminUid: string,
    isNew: boolean
): Record<string, unknown> {
    const sections: PracticeSheetSection[] = (input.sections || []).map((s) => ({
        topicSlug: s.topicSlug || null,
        title: (s.title || "").trim(),
        summary: s.summary || null,
        problemSlugs: (s.problemSlugs || []).filter(Boolean),
    }));
    const payload: Record<string, unknown> = {
        slug,
        kind: input.kind,
        title: input.title.trim(),
        subtitle: input.subtitle ?? null,
        description: input.description || "",
        coverImageUrl: input.coverImageUrl ?? null,
        sections,
        // Don't overwrite legacy items[] on update — preserve whatever's there
        // unless we're creating fresh.
        ...(isNew ? { items: [] } : {}),
        difficulty: input.difficulty ?? null,
        estimatedHours:
            typeof input.estimatedHours === "number" ? input.estimatedHours : null,
        tags: input.tags || [],
        isOfficial: Boolean(input.isOfficial),
        isFeatured: Boolean(input.isFeatured),
        status: input.status || "draft",
        seo: { ...DEFAULT_PRACTICE_SHEET_SEO, ...(input.seo || {}) },
        updatedAt: serverTimestamp(),
    };
    if (isNew) {
        payload.createdBy = adminUid;
        payload.createdAt = serverTimestamp();
    }
    return payload;
}

export async function createSheet(
    input: CreatePracticeSheetInput,
    adminUid: string
): Promise<string> {
    const slug = await uniqueSlug(input.slug || input.title);
    const id = slug;
    await setDoc(doc(COL(), id), buildPayload(input, slug, adminUid, true));
    return id;
}

export async function updateSheet(
    id: string,
    input: CreatePracticeSheetInput,
    adminUid: string
): Promise<void> {
    const existing = await getSheet(id);
    if (!existing) throw new Error("Sheet not found");
    const slug =
        input.slug && input.slug !== existing.slug
            ? await uniqueSlug(input.slug, id)
            : existing.slug;
    await setDoc(doc(COL(), id), buildPayload(input, slug, adminUid, false), { merge: true });
}

export async function deleteSheet(id: string): Promise<void> {
    await deleteDoc(doc(COL(), id));
}
