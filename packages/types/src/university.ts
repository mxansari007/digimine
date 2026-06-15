/**
 * University directory — a lightweight, shared lookup of college / university
 * names so teachers pick a canonical entry on signup instead of typing free
 * text. This is deliberately distinct from `Institute` (a paid, managed org
 * with admins + billing): a University is just a label + aliases used to
 * dedupe and resolve short forms (e.g. "cu" => "Chandigarh University").
 *
 * The resolver (server-side) collapses near-duplicates so we never end up
 * with "Chandigarh University", "chandigarh university" and "CU" as three
 * separate rows.
 */

export interface University {
    id: string;
    /** Canonical display name, e.g. "Chandigarh University". */
    name: string;
    /** URL-safe handle, e.g. "chandigarh-university". */
    slug: string;
    /**
     * Lowercased / punctuation-stripped key used for exact-match dedupe.
     * Two inputs that normalise to the same key are the same university.
     */
    normalizedName: string;
    /**
     * Normalised alternate forms — short names + acronyms + common misspellings
     * (e.g. ["cu", "chandigarh uni"]). Matched before fuzzy search.
     */
    aliases: string[];
    /** Human short form shown in the UI, e.g. "CU". */
    shortName: string | null;
    city: string | null;
    state: string | null;
    /** ISO country code; defaults to "IN". */
    country: string;
    /**
     * "active" = curated/known; "pending" = first added by a teacher and not
     * yet reviewed. Both are selectable; status just drives moderation.
     */
    status: "active" | "pending";
    /** How many teachers reference this university (for ranking suggestions). */
    teacherCount: number;
    /** uid of the teacher who first added it, or "system" for seeded rows. */
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateUniversityInput {
    name: string;
    shortName?: string;
    city?: string;
    state?: string;
    country?: string;
}

/** How a candidate matched the query — drives confidence + UI labelling. */
export type UniversityMatchKind = "exact" | "alias" | "acronym" | "fuzzy";

/** A ranked candidate returned by the resolver / search endpoint. */
export interface UniversityMatch {
    university: Pick<University, "id" | "name" | "slug" | "shortName" | "city" | "state">;
    /** 0..1 confidence. */
    score: number;
    matchedOn: UniversityMatchKind;
}

/**
 * Result of resolving a free-text input server-side.
 * - `resolved` is set when there is a single high-confidence match (auto-pick).
 * - `suggestions` are ranked options to show in the dropdown.
 * - `canCreate` is true when nothing matched well enough, so the UI may offer
 *   "Add ‘<typed name>’ as a new university".
 */
export interface ResolveUniversityResult {
    query: string;
    resolved: UniversityMatch | null;
    suggestions: UniversityMatch[];
    canCreate: boolean;
}
