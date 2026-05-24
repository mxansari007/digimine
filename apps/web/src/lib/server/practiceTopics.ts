/**
 * Server-side reader for practice topics — used by the public
 * /practice/topics/[slug] page. Caches via the shared Redis layer so each
 * unique slug hits Firestore at most once per TTL window.
 *
 *  - `getCachedTopicBySlug(slug)` uses the slug-as-doc-id fast path then
 *    falls back to a `where("slug", "==", slug)` query for legacy random-ID
 *    docs. Public-catalog gate (status === "published") enforced inside.
 *  - `getCachedTopicProblems(topic)` resolves the problem list for a topic:
 *    starts with any pinned slugs (in their explicit order), then appends
 *    every other published problem whose `primaryPattern` matches the
 *    topic's pattern (alphabetical by title, dedup against pins).
 *  - All returned values are plain serializable shapes (Firestore Timestamps
 *    → ISO strings) so they cross the RSC boundary safely.
 */
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson } from "@/lib/server/cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawDoc = Record<string, any>;

export type CachedTopic = {
    id: string;
    slug: string;
    kind: "dsa" | "sql";
    pattern: string;
    title: string;
    subtitle: string | null;
    summary: string;
    introHtml: string;
    mentalModelHtml: string;
    coverImageUrl: string | null;
    warmupQuizSlug: string | null;
    prerequisiteTopicSlugs: string[];
    relatedTopicSlugs: string[];
    pinnedProblemSlugs: string[];
    tags: string[];
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

export type CachedTopicProblem = {
    id: string;
    slug: string;
    title: string;
    kind: "dsa" | "sql";
    difficulty: string;
    primaryPattern: string;
    totalSolved: number;
    isFree: boolean;
    isPinned: boolean;
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

function serializeTopic(id: string, raw: RawDoc): CachedTopic {
    return {
        id,
        slug: String(raw.slug || id),
        kind: (raw.kind as CachedTopic["kind"]) || "dsa",
        pattern: String(raw.pattern || "arrays-hashing"),
        title: String(raw.title || ""),
        subtitle: (raw.subtitle as string | null) ?? null,
        summary: String(raw.summary || ""),
        introHtml: String(raw.introHtml || ""),
        mentalModelHtml: String(raw.mentalModelHtml || ""),
        coverImageUrl: (raw.coverImageUrl as string | null) ?? null,
        warmupQuizSlug: (raw.warmupQuizSlug as string | null) ?? null,
        prerequisiteTopicSlugs: Array.isArray(raw.prerequisiteTopicSlugs)
            ? raw.prerequisiteTopicSlugs
            : [],
        relatedTopicSlugs: Array.isArray(raw.relatedTopicSlugs) ? raw.relatedTopicSlugs : [],
        pinnedProblemSlugs: Array.isArray(raw.pinnedProblemSlugs) ? raw.pinnedProblemSlugs : [],
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        isFeatured: Boolean(raw.isFeatured),
        status: (raw.status as CachedTopic["status"]) || "draft",
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

async function fetchTopicBySlug(slug: string): Promise<CachedTopic | null> {
    if (!slug) return null;

    // Slug-as-doc-id fast path (no index required).
    const direct = await adminDb.collection("practiceTopics").doc(slug).get();
    if (direct.exists) {
        const data = direct.data() || {};
        if (isPublic(data)) return serializeTopic(direct.id, data);
    }

    // Legacy fallback — old random-ID docs.
    const snap = await adminDb
        .collection("practiceTopics")
        .where("slug", "==", slug)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() || {};
    if (!isPublic(data)) return null;
    return serializeTopic(d.id, data);
}

export async function getCachedTopicBySlug(slug: string): Promise<CachedTopic | null> {
    if (!slug) return null;
    return cachedJson<CachedTopic | null>(
        `practiceTopic:by-slug:v1:${slug}`,
        TTL_SECONDS,
        () => fetchTopicBySlug(slug),
        { negativeTtlSeconds: NEGATIVE_TTL_SECONDS }
    );
}

async function fetchPublishedTopicSummaries(): Promise<CachedTopic[]> {
    const snap = await adminDb
        .collection("practiceTopics")
        .where("status", "==", "published")
        .get();
    return snap.docs
        .map((d) => serializeTopic(d.id, d.data() || {}))
        .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getCachedPublishedTopics(): Promise<CachedTopic[]> {
    return cachedJson<CachedTopic[]>(
        "practiceTopics:list:v1",
        TTL_SECONDS,
        fetchPublishedTopicSummaries,
        { negativeTtlSeconds: NEGATIVE_TTL_SECONDS }
    );
}

/**
 * Resolve the problem list for a topic: pinned slugs first (in order), then
 * everything else with matching `primaryPattern`, alphabetical by title.
 * Missing pinned slugs are silently dropped — keeps the page from breaking
 * when a problem is unpublished without updating the topic.
 */
async function fetchTopicProblems(topic: CachedTopic): Promise<CachedTopicProblem[]> {
    const [byPattern, pinned] = await Promise.all([
        adminDb
            .collection("practiceProblems")
            .where("status", "==", "published")
            .where("primaryPattern", "==", topic.pattern)
            .get(),
        topic.pinnedProblemSlugs.length === 0
            ? Promise.resolve(null)
            : adminDb
                  .collection("practiceProblems")
                  .where("status", "==", "published")
                  .where("slug", "in", topic.pinnedProblemSlugs.slice(0, 10))
                  .get(),
    ]);

    const map = new Map<string, CachedTopicProblem>();
    const addDoc = (id: string, raw: RawDoc, isPinned: boolean) => {
        const slug = String(raw.slug || id);
        if (map.has(slug)) {
            if (isPinned) map.get(slug)!.isPinned = true;
            return;
        }
        map.set(slug, {
            id,
            slug,
            title: String(raw.title || ""),
            kind: (raw.kind as "dsa" | "sql") || "dsa",
            difficulty: String(raw.difficulty || "easy"),
            primaryPattern: String(raw.primaryPattern || ""),
            totalSolved: Number(raw.totalSolved || 0),
            isFree: (raw.access as string) === "free" || raw.access === undefined,
            isPinned,
        });
    };

    // Pinned first so they keep the explicit order.
    if (pinned) {
        const bySlug = new Map<string, RawDoc>();
        for (const d of pinned.docs) bySlug.set(String(d.data()?.slug || d.id), { id: d.id, ...d.data() });
        for (const slug of topic.pinnedProblemSlugs) {
            const raw = bySlug.get(slug);
            if (raw) addDoc(String(raw.id), raw, true);
        }
    }

    for (const d of byPattern.docs) addDoc(d.id, d.data() || {}, false);

    // Sort: pinned first (in their pinned-slug order, already done above),
    // then the pattern-matched batch alphabetically.
    const pinnedList: CachedTopicProblem[] = [];
    const others: CachedTopicProblem[] = [];
    for (const p of map.values()) {
        (p.isPinned ? pinnedList : others).push(p);
    }
    pinnedList.sort(
        (a, b) =>
            topic.pinnedProblemSlugs.indexOf(a.slug) - topic.pinnedProblemSlugs.indexOf(b.slug)
    );
    others.sort((a, b) => a.title.localeCompare(b.title));
    return [...pinnedList, ...others];
}

export async function getCachedTopicProblems(
    topic: CachedTopic
): Promise<CachedTopicProblem[]> {
    return cachedJson<CachedTopicProblem[]>(
        `practiceTopic:problems:v1:${topic.id}:${topic.pinnedProblemSlugs.join("|")}`,
        TTL_SECONDS,
        () => fetchTopicProblems(topic)
    );
}
