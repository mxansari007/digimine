/**
 * One-off: pull the free job sources (Remotive + Adzuna) and upsert into the
 * emulator `jobOpenings`, using the SAME adapters + geocoder the app's cron
 * uses. Run in a fresh process so it picks up the current apps/web/.env.local
 * (Adzuna keys) regardless of the dev server's loaded env.
 *
 *   cd ~/digimine && npx tsx scripts/sync-jobs.ts
 *
 * Writes go to the local Firestore emulator (FIRESTORE_EMULATOR_HOST).
 */
/* eslint-disable no-console */
import { config } from "dotenv";
config({ path: "apps/web/.env.local" });

process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "localhost:9099";

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
    initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f" });
}
const db = getFirestore();

async function main() {
    // Import AFTER env is loaded — adzuna.ts reads ADZUNA_* at module init.
    const { remotiveSource } = await import("../apps/web/src/lib/server/jobs/sources/remotive");
    const { adzunaSource } = await import("../apps/web/src/lib/server/jobs/sources/adzuna");
    const { jobicySource } = await import("../apps/web/src/lib/server/jobs/sources/jobicy");
    const { geocodeLocation, isRemoteLocation } = await import("../apps/web/src/lib/server/jobs/geocode");

    const runStart = Timestamp.now();
    const sources = [remotiveSource, adzunaSource, jobicySource].filter((s) => s.enabled());
    console.log("Enabled sources:", sources.map((s) => s.id).join(", ") || "(none)");

    const fetched = (await Promise.all(sources.map((s) => s.fetch().catch(() => [])))).flat();
    const seen = new Set<string>();
    const unique = fetched.filter((j) => {
        const k = `${j.source}:${j.externalId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    let geocoded = 0;
    const nowIso = new Date().toISOString();
    const docs: any[] = [];
    for (const j of unique) {
        let { lat, lng } = j;
        let city: string | null = null,
            state: string | null = null,
            country: string | null = null;
        if (lat == null || lng == null) {
            const g = await geocodeLocation(j.locationRaw);
            lat = g.lat;
            lng = g.lng;
            city = g.city;
            state = g.state;
            country = g.country;
            if (lat != null) geocoded++;
        } else {
            const g = await geocodeLocation(j.locationRaw, false);
            city = g.city;
            state = g.state;
            country = g.country;
        }
        const id = `${j.source}_${j.externalId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
        docs.push({
            id,
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

    let upserted = 0;
    for (let i = 0; i < docs.length; i += 450) {
        const slice = docs.slice(i, i + 450);
        const batch = db.batch();
        for (const d of slice) {
            batch.set(db.collection("jobOpenings").doc(d.id), { ...d, syncedAt: Timestamp.now() }, { merge: true });
        }
        await batch.commit();
        upserted += slice.length;
    }

    // Expire jobs that fell off each source's feed (parity with the cron sync).
    let expired = 0;
    for (const s of sources) {
        const snap = await db.collection("jobOpenings").where("source", "==", s.id).get();
        const stale = snap.docs.filter((d) => {
            const x = d.data();
            return x.active !== false && x.syncedAt && x.syncedAt.toMillis() < runStart.toMillis();
        });
        for (let i = 0; i < stale.length; i += 450) {
            const b = db.batch();
            for (const d of stale.slice(i, i + 450)) b.update(d.ref, { active: false });
            await b.commit();
            expired += Math.min(450, stale.length - i);
        }
    }

    const bySource: Record<string, number> = {};
    const withCoords: Record<string, number> = {};
    for (const d of docs) {
        bySource[d.source] = (bySource[d.source] || 0) + 1;
        if (d.location.lat != null) withCoords[d.source] = (withCoords[d.source] || 0) + 1;
    }
    console.log(JSON.stringify({ fetched: fetched.length, upserted, geocoded, expired, bySource, withCoords }, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("sync-jobs failed:", e);
        process.exit(1);
    });
