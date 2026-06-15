/**
 * Job openings shown on the student "job intelligence" map. Distinct from
 * `job.ts` (the Piston code-execution queue). Openings come from two feeds:
 * admin-posted (`internal`) and free job APIs (`remotive`, `adzuna`, …).
 *
 * Stored at `jobOpenings/{id}`; deduped by `source:externalId`. This is the
 * SERIALIZED (API) shape — dates are ISO strings, ready for the client/map.
 */

export type JobSource = "internal" | "remotive" | "adzuna" | "jobicy";

export interface JobLocation {
    /** As provided by the source, e.g. "Bengaluru, India" or "Remote". */
    raw: string;
    city: string | null;
    state: string | null;
    country: string | null;
    /** Plotting coordinates — null until geocoded (remote-only roles may stay null). */
    lat: number | null;
    lng: number | null;
}

export interface JobOpening {
    id: string;
    source: JobSource;
    /** Stable id from the source feed (null for internal/admin-posted). */
    externalId: string | null;
    title: string;
    company: string;
    companyLogo: string | null;
    location: JobLocation;
    remote: boolean;
    /** full_time | internship | contract | part_time | … (free-text from sources). */
    type: string | null;
    /** Role family / primary tag, e.g. "Software", "Data". */
    category: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    descriptionSnippet: string;
    applyUrl: string;
    tags: string[];
    postedAt: string | null; // ISO
    expiresAt: string | null; // ISO
    createdAt: string; // ISO
    /** Admin uid for `internal` openings. */
    postedBy: string | null;
    /** Highlighted on the map (amber). */
    featured?: boolean;
}

/** Payload for an admin-posted opening (server geocodes `locationRaw`). */
export interface CreateJobOpeningInput {
    title: string;
    company: string;
    locationRaw: string;
    applyUrl: string;
    type?: string | null;
    category?: string | null;
    remote?: boolean;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    descriptionSnippet?: string;
    tags?: string[];
    companyLogo?: string | null;
    expiresAt?: string | null;
    featured?: boolean;
}
