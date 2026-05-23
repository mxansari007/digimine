/**
 * Generic "fetch a published catalog doc by slug" — cached, slug-fast-pathed,
 * gate-baked-in.
 *
 * Two paths:
 *   1. `doc(slug).get()` — if the doc was created with the slug as its ID, a
 *      single key-value read with no index. Cheapest possible.
 *   2. `where("slug", "==", slug).limit(1)` — fallback for legacy docs with
 *      random IDs.
 *
 * Both paths go through Redis with a 10-minute TTL via `cachedJson`, so each
 * unique slug hits Firestore at most once per TTL window across the entire
 * Vercel fleet + crawler traffic.
 *
 * The PUBLIC-CATALOG GATE is enforced inside the fetch (not at call sites)
 * so no consumer can accidentally render teacher-private or unpublished
 * content. A doc passes the gate iff:
 *   - status === "published"
 *   - isDeleted !== true
 *   - (no teacherId) OR (teacherId set AND visibility === "published")
 *
 * The returned value is fully JSON-serializable (Firestore Timestamps → ISO
 * strings) so it's safe to store in Redis and pass through Next's RSC
 * boundary to client components.
 */
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson, invalidateCache } from "@/lib/server/cache";

// Permissive shape so callers can dot-access fields (`doc.title`,
// `doc.tags?.slice(0, 12)`, etc.) without per-call type narrowing — the
// previous bespoke `loadX()` functions all ended with `as any`, so this
// matches that ergonomics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawDoc = Record<string, any>;

/** Public-catalog gate. Mirrors the predicate used elsewhere in this app. */
function isPublicCatalogDoc(raw: RawDoc): boolean {
    if (raw.isDeleted === true) return false;
    if ((raw.status as string | undefined) !== "published") return false;
    const teacherId = typeof raw.teacherId === "string" ? raw.teacherId.trim() : "";
    if (!teacherId) return true;
    return (raw.visibility as string | undefined) === "published";
}

/** Convert Firestore Timestamps in a doc → ISO strings so JSON.stringify works. */
function toSerializable(raw: RawDoc, id: string): RawDoc {
    const out: RawDoc = { id };
    for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === "object" && typeof (v as { toDate?: () => Date }).toDate === "function") {
            out[k] = (v as { toDate: () => Date }).toDate().toISOString();
        } else if (v && typeof v === "object" && !Array.isArray(v)) {
            // Recurse one level for nested objects (e.g. seo, author).
            const nested: RawDoc = {};
            for (const [nk, nv] of Object.entries(v as RawDoc)) {
                if (nv && typeof nv === "object" && typeof (nv as { toDate?: () => Date }).toDate === "function") {
                    nested[nk] = (nv as { toDate: () => Date }).toDate().toISOString();
                } else {
                    nested[nk] = nv as never;
                }
            }
            out[k] = nested;
        } else {
            out[k] = v as never;
        }
    }
    return out;
}

async function fetchBySlug(collection: string, slug: string): Promise<RawDoc | null> {
    if (!slug) return null;

    // Fast path: slug-as-doc-id (no index needed).
    const direct = await adminDb.collection(collection).doc(slug).get();
    if (direct.exists) {
        const data = direct.data() || {};
        if (isPublicCatalogDoc(data)) return toSerializable(data, direct.id);
    }

    // Legacy fallback: where-clause query. Single indexed read, limit 1.
    const snap = await adminDb.collection(collection).where("slug", "==", slug).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() || {};
    if (!isPublicCatalogDoc(data)) return null;
    return toSerializable(data, d.id);
}

const TTL_SECONDS = 600;
/**
 * Short TTL for null results. Prevents a "you visited the URL before
 * publishing → page 404s for 10 minutes after publishing" stuck-state.
 */
const NEGATIVE_TTL_SECONDS = 30;

function keyFor(collection: string, slug: string) {
    return `${collection}:by-slug:v1:${slug}`;
}

/**
 * Public API. Generic over the doc shape — pass `T` to type the return:
 *
 *   const course = await getCachedDocBySlug<CachedCourse>("courses", slug);
 *
 * Returns `null` if no published, non-deleted doc matches.
 */
export async function getCachedDocBySlug<T = RawDoc>(
    collection: string,
    slug: string
): Promise<T | null> {
    if (!slug) return null;
    return cachedJson<T | null>(
        keyFor(collection, slug),
        TTL_SECONDS,
        () => fetchBySlug(collection, slug) as Promise<T | null>,
        { negativeTtlSeconds: NEGATIVE_TTL_SECONDS }
    );
}

/**
 * Drop the cached entry for one slug — call this from admin save/publish
 * paths so changes show up immediately instead of after TTL expiry.
 */
export async function invalidateSlugCache(collection: string, slug: string): Promise<void> {
    if (!slug) return;
    await invalidateCache(keyFor(collection, slug));
}
