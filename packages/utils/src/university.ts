/**
 * Pure, dependency-light helpers for matching university names — used by the
 * server-side resolver to dedupe what teachers type ("CU", "chandigarh
 * university", "Chandigarh  University") down to a single canonical row.
 *
 * No Firebase here — just string logic so it's trivially testable and shared.
 */
import { slugify } from "./format";

/** Words that don't help identify a university — dropped when building acronyms. */
const STOPWORDS = new Set(["of", "the", "and", "for", "de", "at", "in", "an", "a", "&"]);

/** Lowercase, strip accents + punctuation, collapse whitespace. The dedupe key. */
export function normalizeUniversityName(input: string): string {
    return (input || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // strip diacritics
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function universitySlug(name: string): string {
    return slugify(name);
}

/** First letters of the significant words, e.g. "Chandigarh University" -> "cu". */
export function acronymOf(name: string): string {
    return normalizeUniversityName(name)
        .split(" ")
        .filter((w) => w && !STOPWORDS.has(w))
        .map((w) => w[0])
        .join("");
}

/** Classic Levenshtein edit distance (iterative, two-row). */
export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array<number>(n + 1);
    let curr = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

/**
 * 0..1 similarity between two free-text names. Combines an edit-distance ratio,
 * token overlap (robust to word order / extra words), and a substring boost
 * (so "chandigarh univ" scores high against "Chandigarh University").
 */
export function similarity(a: string, b: string): number {
    const na = normalizeUniversityName(a);
    const nb = normalizeUniversityName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;

    const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);

    const ta = na.split(" ");
    const tb = new Set(nb.split(" "));
    let shared = 0;
    for (const t of new Set(ta)) if (tb.has(t)) shared++;
    const overlap = shared / Math.max(ta.length, tb.size);

    let score = Math.max(lev, overlap);
    if (na.includes(nb) || nb.includes(na)) score = Math.max(score, 0.85);
    return Math.max(0, Math.min(1, score));
}

export type UniversityMatchKind = "exact" | "alias" | "acronym" | "fuzzy";

/** Minimal candidate shape the ranker needs (works for DB rows and seed rows). */
export interface RankableUniversity {
    id: string;
    name: string;
    slug?: string;
    shortName?: string | null;
    city?: string | null;
    state?: string | null;
    aliases?: string[];
    normalizedName?: string;
    teacherCount?: number;
}

export interface RankedUniversity {
    university: RankableUniversity;
    score: number;
    matchedOn: UniversityMatchKind;
}

/** Score one candidate against the query, picking the strongest signal. */
export function scoreUniversity(
    query: string,
    u: RankableUniversity
): { score: number; matchedOn: UniversityMatchKind } {
    const q = normalizeUniversityName(query);
    if (!q) return { score: 0, matchedOn: "fuzzy" };

    const norm = u.normalizedName || normalizeUniversityName(u.name);
    if (norm === q) return { score: 1, matchedOn: "exact" };

    const aliases = (u.aliases || []).map(normalizeUniversityName);
    if (aliases.includes(q)) return { score: 0.97, matchedOn: "alias" };

    const ac = acronymOf(u.name);
    const shortNorm = u.shortName ? normalizeUniversityName(u.shortName) : "";
    if ((ac && ac === q) || (shortNorm && shortNorm === q)) {
        return { score: 0.95, matchedOn: "acronym" };
    }

    let best = similarity(q, norm);
    for (const a of aliases) best = Math.max(best, similarity(q, a));
    return { score: best, matchedOn: "fuzzy" };
}

/** Rank a list of candidates against the query, best first. */
export function rankUniversityMatches(
    query: string,
    candidates: RankableUniversity[],
    limit = 8
): RankedUniversity[] {
    const seen = new Set<string>();
    const ranked: RankedUniversity[] = [];
    for (const u of candidates) {
        const key = u.id || u.slug || normalizeUniversityName(u.name);
        if (seen.has(key)) continue;
        seen.add(key);
        const { score, matchedOn } = scoreUniversity(query, u);
        if (score > 0) ranked.push({ university: u, score, matchedOn });
    }
    ranked.sort(
        (a, b) =>
            b.score - a.score ||
            (b.university.teacherCount || 0) - (a.university.teacherCount || 0)
    );
    return ranked.slice(0, limit);
}

/** A single match at/above this score auto-resolves (no "did you mean"). */
export const UNIVERSITY_AUTORESOLVE_THRESHOLD = 0.9;
/** Minimum score to show a candidate as a suggestion at all. */
export const UNIVERSITY_SUGGEST_THRESHOLD = 0.4;
