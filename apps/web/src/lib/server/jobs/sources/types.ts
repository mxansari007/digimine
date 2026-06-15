import type { JobSource } from "@digimine/types";

/**
 * A job normalized from a source feed, BEFORE geocoding + id assignment. The
 * sync layer geocodes `locationRaw` (unless the adapter already supplied
 * lat/lng) and writes it as a `JobOpening` keyed by `source:externalId`.
 */
export interface NormalizedJob {
    source: JobSource;
    externalId: string;
    title: string;
    company: string;
    companyLogo: string | null;
    locationRaw: string;
    /** Pre-resolved coordinates if the source provides them (e.g. Adzuna). */
    lat: number | null;
    lng: number | null;
    remote: boolean;
    type: string | null;
    category: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    descriptionSnippet: string;
    applyUrl: string;
    tags: string[];
    postedAt: string | null; // ISO
}

export interface JobSourceAdapter {
    id: JobSource;
    /** False when required env/keys are missing — skipped silently by sync. */
    enabled(): boolean;
    /** Fetch + normalize; MUST resolve to [] on failure (never throw). */
    fetch(): Promise<NormalizedJob[]>;
}

/** Strip HTML → a short plain-text snippet. */
export function stripHtml(html: string, max = 280): string {
    const text = (html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#0?39;|&rsquo;|&apos;/g, "'")
        .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/** fetch JSON with a hard timeout; null on any failure. */
export async function fetchJson<T = any>(url: string, init?: RequestInit, timeoutMs = 15000): Promise<T | null> {
    try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}
