/**
 * Company-specific prep tracks — the "TCS NQT / Infosys SP / Wipro NLTH"
 * catalogue. Each track maps a real campus-hiring exam pattern (sections,
 * question counts, timings) to the mock test series on the platform that
 * matches it. The #1 thing students and TPOs search for.
 *
 * Data: `companyTracks/{slug}` (slug IS the doc ID, consistent with the
 * rest of the catalogue). Authored by admins via scripts/seed-company-tracks.ts
 * for now; server-only reads through the admin SDK with the same two-layer
 * cache the other catalogue listings use.
 */
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { cachedJson } from "@/lib/server/cache";

const TTL = 600; // 10 minutes, matches the rest of the catalogue

function shared<T>(key: string, inner: () => Promise<T>): () => Promise<T> {
    return () => cachedJson(key, TTL, inner);
}

function str(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export type TrackSection = {
    title: string;
    questions: number;
    minutes: number;
    /** e.g. "Numerical Ability", "Advanced Coding" — shown under the title. */
    blurb: string;
};

export type CompanyTrack = {
    /** Doc ID and URL key, e.g. "tcs-nqt". */
    slug: string;
    company: string;
    /** Exam name as candidates know it, e.g. "TCS NQT (National Qualifier Test)". */
    examName: string;
    tagline: string;
    /** What the real exam looks like — section-by-section. */
    pattern: TrackSection[];
    /** Slugs of `tests` series on the platform mapped to this pattern. */
    seriesSlugs: string[];
    /** Hiring window or cycle note, e.g. "Hiring season: Aug–Nov". */
    seasonNote: string;
    sortOrder: number;
    isActive: boolean;
};

export type TrackSeriesCard = {
    slug: string;
    title: string;
    shortDescription: string;
    accessType: string;
    price: number;
    totalTests: number;
    totalQuestions: number;
};

async function fetchCompanyTracks(): Promise<CompanyTrack[]> {
    const snap = await adminDb.collection("companyTracks").get();
    return snap.docs
        .map((d) => {
            const x = d.data() || {};
            return {
                slug: d.id,
                company: str(x.company),
                examName: str(x.examName),
                tagline: str(x.tagline),
                pattern: Array.isArray(x.pattern)
                    ? x.pattern.map((s: any) => ({
                          title: str(s?.title),
                          questions: num(s?.questions),
                          minutes: num(s?.minutes),
                          blurb: str(s?.blurb),
                      }))
                    : [],
                seriesSlugs: Array.isArray(x.seriesSlugs)
                    ? x.seriesSlugs.filter((s: unknown) => typeof s === "string")
                    : [],
                seasonNote: str(x.seasonNote),
                sortOrder: num(x.sortOrder),
                isActive: x.isActive !== false,
            };
        })
        .filter((t) => t.isActive && t.company)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.company.localeCompare(b.company));
}

export const getCachedCompanyTracks = shared(
    "catalog:companyTracks:v1",
    unstable_cache(fetchCompanyTracks, ["catalog:companyTracks:v1"], { revalidate: TTL })
);

export async function getCompanyTrackBySlug(slug: string): Promise<CompanyTrack | null> {
    const tracks = await getCachedCompanyTracks();
    return tracks.find((t) => t.slug === slug) || null;
}

/**
 * Resolve a track's linked test series into public cards (published,
 * non-deleted only). Slug-keyed direct gets with a where-fallback for
 * legacy auto-ID docs — same resolution order as the rest of the catalogue.
 */
export async function getTrackSeriesCards(seriesSlugs: string[]): Promise<TrackSeriesCard[]> {
    const cards: TrackSeriesCard[] = [];
    for (const slug of seriesSlugs) {
        let data: Record<string, unknown> | null = null;
        const direct = await adminDb.collection("tests").doc(slug).get();
        if (direct.exists) {
            data = direct.data() || {};
        } else {
            const q = await adminDb
                .collection("tests")
                .where("slug", "==", slug)
                .limit(1)
                .get();
            if (!q.empty) data = q.docs[0].data() || {};
        }
        if (!data) continue;
        if (str(data.status) !== "published" || data.isDeleted === true) continue;
        cards.push({
            slug,
            title: str(data.title, "Mock test series"),
            shortDescription: str(data.shortDescription),
            accessType: str(data.accessType, "free"),
            price: num(data.price),
            totalTests: num(data.totalTests),
            totalQuestions: num(data.totalQuestions),
        });
    }
    return cards;
}
