/**
 * Admin-side Firestore helpers for `practiceTopics`.
 *
 *  - Slug-as-doc-id (matches articles + practiceProblems), so the public
 *    detail page can do an O(1) `doc(slug).get()` with no index lookup.
 *  - `uniqueSlug` dedupes against existing topics, including legacy
 *    random-ID docs if any.
 *  - `mapTopic` keeps the shape stable between Firestore Timestamps and
 *    plain JS Dates so callers never have to .toDate() themselves.
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
    DEFAULT_PRACTICE_TOPIC_SEO,
    type CreatePracticeTopicInput,
    type PracticeTopic,
    type PracticeTopicSeo,
} from "@digimine/types";
import { db } from "@/lib/firebase/client";

const COL = () => collection(db, "practiceTopics");

function slugify(s: string): string {
    return s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 80);
}

function mapSeo(d: Partial<PracticeTopicSeo> | undefined): PracticeTopicSeo {
    return { ...DEFAULT_PRACTICE_TOPIC_SEO, ...(d || {}) };
}

function mapTopic(id: string, d: Record<string, unknown>): PracticeTopic {
    const ts = (v: unknown): Date => {
        const x = v as { toDate?: () => Date } | undefined;
        return x && typeof x.toDate === "function" ? x.toDate() : new Date();
    };
    return {
        id,
        slug: String(d.slug || id),
        kind: (d.kind as PracticeTopic["kind"]) || "dsa",
        pattern: (d.pattern as PracticeTopic["pattern"]) || "arrays-hashing",
        title: String(d.title || ""),
        subtitle: (d.subtitle as string | null) ?? null,
        summary: String(d.summary || ""),
        introHtml: String(d.introHtml || ""),
        mentalModelHtml: String(d.mentalModelHtml || ""),
        coverImageUrl: (d.coverImageUrl as string | null) ?? null,
        warmupQuizSlug: (d.warmupQuizSlug as string | null) ?? null,
        prerequisiteTopicSlugs: Array.isArray(d.prerequisiteTopicSlugs)
            ? (d.prerequisiteTopicSlugs as string[])
            : [],
        relatedTopicSlugs: Array.isArray(d.relatedTopicSlugs)
            ? (d.relatedTopicSlugs as string[])
            : [],
        pinnedProblemSlugs: Array.isArray(d.pinnedProblemSlugs)
            ? (d.pinnedProblemSlugs as string[])
            : [],
        tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
        isFeatured: Boolean(d.isFeatured),
        status: (d.status as PracticeTopic["status"]) || "draft",
        seo: mapSeo(d.seo as Partial<PracticeTopicSeo> | undefined),
        createdBy: String(d.createdBy || ""),
        createdAt: ts(d.createdAt),
        updatedAt: ts(d.updatedAt),
    };
}

export async function listTopics(opts?: {
    kind?: "dsa" | "sql" | "all";
    status?: PracticeTopic["status"] | "all";
    limit?: number;
}): Promise<PracticeTopic[]> {
    const constraints = [];
    if (opts?.kind && opts.kind !== "all") constraints.push(where("kind", "==", opts.kind));
    if (opts?.status && opts.status !== "all")
        constraints.push(where("status", "==", opts.status));
    constraints.push(orderBy("updatedAt", "desc"));
    if (opts?.limit) constraints.push(fbLimit(opts.limit));
    const snap = await getDocs(query(COL(), ...constraints));
    return snap.docs.map((d) => mapTopic(d.id, d.data() || {}));
}

export async function getTopic(id: string): Promise<PracticeTopic | null> {
    const snap = await getDoc(doc(COL(), id));
    if (!snap.exists()) return null;
    return mapTopic(snap.id, snap.data() || {});
}

async function uniqueSlug(desired: string, excludeId?: string): Promise<string> {
    const base = slugify(desired) || "topic";
    let candidate = base;
    for (let i = 2; i < 30; i++) {
        // Cheapest dedupe: try the slug-as-doc-id directly. If it's taken by a
        // different doc, bump the suffix.
        const directSnap = await getDoc(doc(COL(), candidate));
        const takenByDoc = directSnap.exists() && directSnap.id !== excludeId;
        if (!takenByDoc) {
            // Belt + suspenders: also check the slug field for legacy random-ID
            // docs that don't use slug-as-id.
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
    input: CreatePracticeTopicInput,
    slug: string,
    adminUid: string,
    isNew: boolean
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        slug,
        kind: input.kind,
        pattern: input.pattern,
        title: input.title.trim(),
        subtitle: input.subtitle ?? null,
        summary: input.summary || "",
        introHtml: input.introHtml || "",
        mentalModelHtml: input.mentalModelHtml || "",
        coverImageUrl: input.coverImageUrl ?? null,
        warmupQuizSlug: input.warmupQuizSlug ?? null,
        prerequisiteTopicSlugs: input.prerequisiteTopicSlugs || [],
        relatedTopicSlugs: input.relatedTopicSlugs || [],
        pinnedProblemSlugs: input.pinnedProblemSlugs || [],
        tags: input.tags || [],
        isFeatured: Boolean(input.isFeatured),
        status: input.status || "draft",
        seo: { ...DEFAULT_PRACTICE_TOPIC_SEO, ...(input.seo || {}) },
        updatedAt: serverTimestamp(),
    };
    if (isNew) {
        payload.createdBy = adminUid;
        payload.createdAt = serverTimestamp();
    }
    return payload;
}

export async function createTopic(
    input: CreatePracticeTopicInput,
    adminUid: string
): Promise<string> {
    const slug = await uniqueSlug(input.slug || input.title);
    // Slug as doc ID — public detail page reads via doc(slug).get() with no index.
    const id = slug;
    await setDoc(doc(COL(), id), buildPayload(input, slug, adminUid, true));
    return id;
}

export async function updateTopic(
    id: string,
    input: CreatePracticeTopicInput,
    adminUid: string
): Promise<void> {
    const existing = await getTopic(id);
    if (!existing) throw new Error("Topic not found");
    const slug =
        input.slug && input.slug !== existing.slug
            ? await uniqueSlug(input.slug, id)
            : existing.slug;
    await setDoc(doc(COL(), id), buildPayload(input, slug, adminUid, false), { merge: true });
}

export async function deleteTopic(id: string): Promise<void> {
    await deleteDoc(doc(COL(), id));
}
