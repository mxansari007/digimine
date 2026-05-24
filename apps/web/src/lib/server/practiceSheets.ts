/**
 * Server-side reader for practice sheets — used by /practice/sheets/[slug].
 * Caches via the shared Redis layer with a 10-minute TTL.
 *
 *  - `getCachedSheetBySlug(slug)` — slug-as-doc-id fast path + legacy fallback.
 *  - `getCachedSheetProblems(sheet)` — resolves every problem slug across all
 *    sections in a single Firestore batch (`where slug in [...]`, chunked
 *    per Firestore's 30-slug `in` limit). Returns a Map keyed by slug so
 *    the page renderer can paint each section in order.
 *  - Public-catalog gate baked in (status === "published").
 */
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson } from "@/lib/server/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawDoc = Record<string, any>;

export type CachedSheetSection = {
    topicSlug: string | null;
    title: string;
    summary: string | null;
    problemSlugs: string[];
};

export type CachedSheet = {
    id: string;
    slug: string;
    kind: "dsa" | "sql" | "mixed";
    title: string;
    subtitle: string | null;
    description: string;
    coverImageUrl: string | null;
    sections: CachedSheetSection[];
    difficulty: "beginner" | "intermediate" | "advanced" | null;
    estimatedHours: number | null;
    tags: string[];
    isOfficial: boolean;
    isFeatured: boolean;
    status: "draft" | "published" | "archived";
    seo: {
        metaTitle: string | null;
        metaDescription: string | null;
        ogImageUrl: string | null;
        noIndex: boolean;
    };
    createdAtIso: string | null;
    updatedAtIso: string | null;
};

export type CachedSheetProblem = {
    id: string;
    slug: string;
    title: string;
    kind: "dsa" | "sql";
    difficulty: string;
    primaryPattern: string;
    totalSolved: number;
};

const TTL_SECONDS = 600;
const NEGATIVE_TTL_SECONDS = 30;

function isoOrNull(v: unknown): string | null {
    if (!v) return null;
    const x = v as { toDate?: () => Date; seconds?: number };
    if (typeof x.toDate === "function") return x.toDate().toISOString();
    if (typeof x.seconds === "number") return new Date(x.seconds * 1000).toISOString();
    if (typeof v === "string") return v;
    return null;
}

function isPublic(raw: RawDoc): boolean {
    if (raw.isDeleted === true) return false;
    if ((raw.status as string | undefined) !== "published") return false;
    return true;
}

function serializeSection(raw: RawDoc): CachedSheetSection {
    return {
        topicSlug: (raw.topicSlug as string | null) ?? null,
        title: String(raw.title || ""),
        summary: (raw.summary as string | null) ?? null,
        problemSlugs: Array.isArray(raw.problemSlugs)
            ? (raw.problemSlugs as string[]).filter(Boolean)
            : [],
    };
}

function serializeSheet(id: string, raw: RawDoc): CachedSheet {
    // Migrate legacy `items[]` into a single "Problems" section when the
    // newer `sections[]` is absent. Keeps old sheets renderable.
    let sections: CachedSheetSection[] = Array.isArray(raw.sections)
        ? raw.sections.map(serializeSection)
        : [];
    if (sections.length === 0 && Array.isArray(raw.items) && raw.items.length > 0) {
        // Group legacy items by their string `section` (or null = ungrouped).
        const grouped = new Map<string, string[]>();
        for (const it of raw.items as RawDoc[]) {
            const sec = (it.section as string | null) || "Problems";
            const list = grouped.get(sec) || [];
            // Legacy stored problemId — we map to slug at render time via a
            // separate doc lookup; here we just keep what we have. Older sheets
            // may not have slugs; the page renderer drops missing ones safely.
            list.push(String(it.problemId || ""));
            grouped.set(sec, list);
        }
        sections = Array.from(grouped.entries()).map(([title, problemSlugs]) => ({
            topicSlug: null,
            title,
            summary: null,
            problemSlugs,
        }));
    }
    return {
        id,
        slug: String(raw.slug || id),
        kind: (raw.kind as CachedSheet["kind"]) || "dsa",
        title: String(raw.title || ""),
        subtitle: (raw.subtitle as string | null) ?? null,
        description: String(raw.description || ""),
        coverImageUrl: (raw.coverImageUrl as string | null) ?? null,
        sections,
        difficulty: (raw.difficulty as CachedSheet["difficulty"]) ?? null,
        estimatedHours:
            typeof raw.estimatedHours === "number" ? (raw.estimatedHours as number) : null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        isOfficial: Boolean(raw.isOfficial),
        isFeatured: Boolean(raw.isFeatured),
        status: (raw.status as CachedSheet["status"]) || "draft",
        seo: {
            metaTitle: (raw.seo?.metaTitle as string | null) ?? null,
            metaDescription: (raw.seo?.metaDescription as string | null) ?? null,
            ogImageUrl: (raw.seo?.ogImageUrl as string | null) ?? null,
            noIndex: Boolean(raw.seo?.noIndex),
        },
        createdAtIso: isoOrNull(raw.createdAt),
        updatedAtIso: isoOrNull(raw.updatedAt),
    };
}

async function fetchSheetBySlug(slug: string): Promise<CachedSheet | null> {
    if (!slug) return null;
    const direct = await adminDb.collection("practiceSheets").doc(slug).get();
    if (direct.exists) {
        const data = direct.data() || {};
        if (isPublic(data)) return serializeSheet(direct.id, data);
    }
    const snap = await adminDb
        .collection("practiceSheets")
        .where("slug", "==", slug)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() || {};
    if (!isPublic(data)) return null;
    return serializeSheet(d.id, data);
}

export async function getCachedSheetBySlug(slug: string): Promise<CachedSheet | null> {
    if (!slug) return null;
    return cachedJson<CachedSheet | null>(
        `practiceSheet:by-slug:v1:${slug}`,
        TTL_SECONDS,
        () => fetchSheetBySlug(slug),
        { negativeTtlSeconds: NEGATIVE_TTL_SECONDS }
    );
}

/**
 * Resolve every problem slug in the sheet, in a single batched roundtrip.
 * Returns a plain `Record<slug, problem>` (JSON-serializable for the
 * Redis cache) — the page renders sections by iterating
 * `section.problemSlugs` and silently dropping slugs not in the record
 * (happens when a referenced problem was unpublished or renamed).
 */
async function fetchSheetProblems(
    sheet: CachedSheet
): Promise<Record<string, CachedSheetProblem>> {
    const allSlugs = Array.from(
        new Set(sheet.sections.flatMap((s) => s.problemSlugs.filter(Boolean)))
    );
    if (allSlugs.length === 0) return {};

    // Firestore `where in` caps at 30 values per query — chunk and parallelize.
    const CHUNK = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < allSlugs.length; i += CHUNK) {
        chunks.push(allSlugs.slice(i, i + CHUNK));
    }

    const snaps = await Promise.all(
        chunks.map((chunk) =>
            adminDb
                .collection("practiceProblems")
                .where("status", "==", "published")
                .where("slug", "in", chunk)
                .get()
        )
    );

    const out: Record<string, CachedSheetProblem> = {};
    for (const snap of snaps) {
        for (const d of snap.docs) {
            const raw = d.data() || {};
            const slug = String(raw.slug || d.id);
            out[slug] = {
                id: d.id,
                slug,
                title: String(raw.title || ""),
                kind: (raw.kind as "dsa" | "sql") || "dsa",
                difficulty: String(raw.difficulty || "easy"),
                primaryPattern: String(raw.primaryPattern || ""),
                totalSolved: Number(raw.totalSolved || 0),
            };
        }
    }
    return out;
}

export async function getCachedSheetProblems(
    sheet: CachedSheet
): Promise<Record<string, CachedSheetProblem>> {
    // Cache key includes a hash of the section/slug list so admin edits
    // invalidate the cache automatically.
    const fingerprint = sheet.sections
        .map((s) => `${s.title}|${s.problemSlugs.join(",")}`)
        .join("||");
    return cachedJson<Record<string, CachedSheetProblem>>(
        `practiceSheet:problems:v1:${sheet.id}:${hashString(fingerprint)}`,
        TTL_SECONDS,
        () => fetchSheetProblems(sheet)
    );
}

function hashString(s: string): string {
    // 32-bit djb2 — enough to invalidate cache keys, not a security primitive.
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
