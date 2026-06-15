import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { JobOpening } from "@digimine/types";
import { geocodeLocation, isRemoteLocation } from "./geocode";
import type { JobSourceAdapter, NormalizedJob } from "./sources/types";
import { remotiveSource } from "./sources/remotive";
import { adzunaSource } from "./sources/adzuna";
import { jobicySource } from "./sources/jobicy";

export const JOB_OPENINGS = "jobOpenings";

// Register sources here. `enabled()` skips ones missing keys (e.g. Adzuna).
// Remotive + Jobicy = the global remote layer; Adzuna = the India feed.
const SOURCES: JobSourceAdapter[] = [remotiveSource, adzunaSource, jobicySource];

export interface JobSyncResult {
    fetched: number;
    upserted: number;
    geocoded: number;
    expired: number;
    bySource: Record<string, number>;
    sources: string[];
}

const docId = (source: string, externalId: string) =>
    `${source}_${externalId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);

/**
 * Pull every enabled source, normalize + geocode, then upsert into
 * `jobOpenings` (keyed by source:externalId) and deactivate any API jobs that
 * have dropped out of their feed. Admin-posted (`internal`) jobs are untouched.
 */
export async function syncJobOpenings(): Promise<JobSyncResult> {
    const enabled = SOURCES.filter((s) => s.enabled());
    const runStart = Timestamp.now();

    const fetched = (
        await Promise.all(
            enabled.map(async (s) => {
                try {
                    return await s.fetch();
                } catch {
                    return [] as NormalizedJob[];
                }
            })
        )
    ).flat();

    // Dedupe within the run by source:externalId.
    const seen = new Set<string>();
    const unique = fetched.filter((j) => {
        const k = `${j.source}:${j.externalId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    let geocoded = 0;
    const col = adminDb.collection(JOB_OPENINGS);
    const nowIso = new Date().toISOString();

    // Build docs (geocode sequentially so the in-process geocode cache + the
    // Nominatim fallback stay polite under rate limits).
    const docs: (JobOpening & { active: boolean })[] = [];
    for (const j of unique) {
        let { lat, lng } = j;
        let city: string | null = null;
        let state: string | null = null;
        let country: string | null = null;
        if (lat == null || lng == null) {
            const geo = await geocodeLocation(j.locationRaw);
            lat = geo.lat;
            lng = geo.lng;
            city = geo.city;
            state = geo.state;
            country = geo.country;
            if (lat != null) geocoded++;
        } else {
            // Source already gave coords — just resolve nice labels offline.
            const geo = await geocodeLocation(j.locationRaw, false);
            city = geo.city;
            state = geo.state;
            country = geo.country;
        }
        docs.push({
            id: docId(j.source, j.externalId),
            source: j.source,
            externalId: j.externalId,
            title: j.title,
            company: j.company,
            companyLogo: j.companyLogo,
            location: { raw: j.locationRaw, city, state, country, lat, lng },
            remote: j.remote || isRemoteLocation(j.locationRaw),
            type: j.type,
            category: j.category,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            salaryCurrency: j.salaryCurrency,
            descriptionSnippet: j.descriptionSnippet,
            applyUrl: j.applyUrl,
            tags: j.tags,
            postedAt: j.postedAt,
            expiresAt: null,
            createdAt: j.postedAt || nowIso,
            postedBy: null,
            active: true,
        });
    }

    // Upsert (Firestore batch cap 500).
    let upserted = 0;
    for (let i = 0; i < docs.length; i += 450) {
        const slice = docs.slice(i, i + 450);
        const batch = adminDb.batch();
        for (const d of slice) {
            batch.set(
                col.doc(d.id),
                { ...d, syncedAt: Timestamp.now() },
                { merge: true }
            );
        }
        await batch.commit();
        upserted += slice.length;
    }

    // Expire API jobs that weren't in this run (fell off the feed).
    let expired = 0;
    for (const s of enabled) {
        const snap = await col.where("source", "==", s.id).get();
        const stale = snap.docs.filter((d) => {
            const data = d.data();
            const ts = data.syncedAt as Timestamp | undefined;
            return data.active !== false && ts != null && ts.toMillis() < runStart.toMillis();
        });
        for (let i = 0; i < stale.length; i += 450) {
            const slice = stale.slice(i, i + 450);
            const batch = adminDb.batch();
            for (const d of slice) batch.update(d.ref, { active: false });
            await batch.commit();
            expired += slice.length;
        }
    }

    const bySource: Record<string, number> = {};
    for (const j of unique) bySource[j.source] = (bySource[j.source] || 0) + 1;

    return { fetched: fetched.length, upserted, geocoded, expired, bySource, sources: enabled.map((s) => s.id) };
}
