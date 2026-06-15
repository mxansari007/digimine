/**
 * Backfill the University / Section / Subject class model onto existing data.
 *
 *  1. teachers: resolve free-text `profile.institute` to a shared `universities`
 *     row (dedupe by normalized name / alias, create a "pending" row if new),
 *     then set `profile.universityId` + the canonical `profile.institute`.
 *  2. classes: set `subject = name` where missing (legacy classes become plain
 *     subject classes; section/groups/timetable stay empty and keep working),
 *     and stamp `universityId` from the owning teacher when available.
 *
 * Safe to re-run (idempotent — skips docs already migrated).
 * ALWAYS run --dry-run first to preview:
 *
 *   npx tsx scripts/backfill-class-model.ts --dry-run
 *   npx tsx scripts/backfill-class-model.ts          # writes
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Public Firebase config lives in the root .env; the Admin SDK service-account
// creds (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) live in apps/web/.env.local.
// Load both — dotenv keeps the first value for any duplicate keys.
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "apps/web/.env.local" });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!clientEmail || !privateKey) {
    console.error("ERROR: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in .env");
    process.exit(1);
}

if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const dryRun = process.argv.includes("--dry-run");

// ── Inline university matcher (mirrors @digimine/utils to keep the script
//    standalone — same normalize/acronym/slug rules as the live resolver). ──
const STOP = new Set(["of", "the", "and", "for", "de", "at", "in", "an", "a", "&"]);
function normalize(s: string): string {
    return (s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}
function acronym(name: string): string {
    return normalize(name)
        .split(" ")
        .filter((w) => w && !STOP.has(w))
        .map((w) => w[0])
        .join("");
}
function slugify(name: string): string {
    return normalize(name).replace(/\s+/g, "-");
}
function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return h;
}

async function resolveUniversity(institute: string, uid: string): Promise<{ id: string; name: string } | null> {
    const name = (institute || "").trim();
    const norm = normalize(name);
    if (norm.length < 2) return null;

    let snap = await db.collection("universities").where("normalizedName", "==", norm).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, name: snap.docs[0].data()?.name || name };

    snap = await db.collection("universities").where("aliases", "array-contains", norm).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, name: snap.docs[0].data()?.name || name };

    let slug = slugify(name) || `u-${Math.abs(hash(norm))}`;
    let ref = db.collection("universities").doc(slug);
    if ((await ref.get()).exists) {
        slug = `${slug}-${Math.abs(hash(norm)) % 9999}`;
        ref = db.collection("universities").doc(slug);
    }
    const now = Timestamp.now();
    const doc = {
        name,
        slug,
        normalizedName: norm,
        aliases: [acronym(name)].filter(Boolean),
        shortName: null,
        city: null,
        state: null,
        country: "IN",
        status: "pending",
        teacherCount: 1,
        createdBy: uid || "backfill",
        createdAt: now,
        updatedAt: now,
    };
    if (dryRun) console.log(`  DRY: would create university "${name}" (${slug})`);
    else await ref.set(doc);
    return { id: slug, name };
}

async function backfillTeachers() {
    const snap = await db.collection("teachers").get();
    let updated = 0;
    let skipped = 0;
    let created = 0;
    for (const doc of snap.docs) {
        const data = doc.data() || {};
        const profile = data.profile || {};
        if (profile.universityId || !profile.institute) {
            skipped++;
            continue;
        }
        const existed = await db
            .collection("universities")
            .where("normalizedName", "==", normalize(profile.institute))
            .limit(1)
            .get();
        const resolved = await resolveUniversity(profile.institute, doc.id);
        if (!resolved) {
            skipped++;
            continue;
        }
        if (existed.empty) created++;
        if (dryRun) {
            console.log(`  DRY: teacher ${doc.id} institute "${profile.institute}" → ${resolved.id} ("${resolved.name}")`);
        } else {
            await doc.ref.set(
                { profile: { ...profile, institute: resolved.name, universityId: resolved.id }, updatedAt: Timestamp.now() },
                { merge: true }
            );
        }
        updated++;
    }
    console.log(`  teachers: ${updated} updated, ${skipped} skipped, ~${created} new universities`);
}

async function backfillClasses() {
    const snap = await db.collection("classes").get();
    let updated = 0;
    let skipped = 0;
    const now = Timestamp.now();
    for (const doc of snap.docs) {
        const data = doc.data() || {};
        const patch: Record<string, unknown> = {};
        if (data.subject === undefined || data.subject === null) {
            patch.subject = data.name || "Class";
        }
        if (!data.universityId && data.teacherId) {
            const t = await db.collection("teachers").doc(data.teacherId).get();
            const uniId = t.exists ? t.data()?.profile?.universityId : null;
            if (uniId) patch.universityId = uniId;
        }
        if (Object.keys(patch).length === 0) {
            skipped++;
            continue;
        }
        patch.updatedAt = now;
        if (dryRun) console.log(`  DRY: class ${doc.id} →`, patch);
        else await doc.ref.set(patch, { merge: true });
        updated++;
    }
    console.log(`  classes: ${updated} updated, ${skipped} skipped`);
}

async function main() {
    console.log(dryRun ? "DRY RUN — no writes\n" : "Backfilling (writes enabled)\n");
    await backfillTeachers();
    await backfillClasses();
    console.log(dryRun ? "\n(dry run — no writes were made)" : "\nDone.");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Backfill failed:", err);
        process.exit(1);
    });
