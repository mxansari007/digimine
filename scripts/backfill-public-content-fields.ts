/**
 * Backfill `teacherId: ""` and `isDeleted: false` on every admin-authored
 * content document (tests, quizzes, courses, contests) that's missing them.
 *
 * Why: the public catalog queries now filter by `where("teacherId", "==", "")`
 * to keep teacher classroom content out of public lists. Firestore only matches
 * docs where the field exists, so admin docs created before this change never
 * appear in the new queries unless we explicitly write the field.
 *
 * Safe to re-run. Skips docs that already have the field set.
 *
 *   node --loader ts-node/esm scripts/backfill-public-content-fields.ts
 *   # or
 *   npx ts-node scripts/backfill-public-content-fields.ts
 *
 * Add `--dry-run` to preview without writing.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

require("dotenv").config({ path: ".env" });

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

const COLLECTIONS = ["tests", "quizzes", "courses", "contests"] as const;

async function backfillCollection(col: string) {
    const snap = await db.collection(col).get();
    let updated = 0;
    let skipped = 0;
    const now = Timestamp.now();

    for (const doc of snap.docs) {
        const data = doc.data() || {};
        const patch: Record<string, unknown> = {};

        // Admin docs may have `teacherId` undefined. Set it to "" explicitly so
        // the `where("teacherId", "==", "")` query matches them.
        if (data.teacherId === undefined) patch.teacherId = "";
        // Public catalog reads expect this field — default to false when missing.
        if (data.isDeleted === undefined) patch.isDeleted = false;

        if (Object.keys(patch).length === 0) {
            skipped++;
            continue;
        }
        patch.updatedAt = now;

        if (dryRun) {
            console.log(`  DRY: would patch ${col}/${doc.id} with`, patch);
        } else {
            await doc.ref.update(patch);
        }
        updated++;
    }

    console.log(`  ${col}: ${updated} updated, ${skipped} already had fields.`);
    return { updated, skipped };
}

async function main() {
    console.log(dryRun ? "DRY RUN mode — no writes" : "Backfilling (writes enabled)");
    let totalUpdated = 0;
    let totalSkipped = 0;
    for (const col of COLLECTIONS) {
        const { updated, skipped } = await backfillCollection(col);
        totalUpdated += updated;
        totalSkipped += skipped;
    }
    console.log("");
    console.log(`Done. total updated=${totalUpdated} skipped=${totalSkipped}`);
    if (dryRun) console.log("(dry run — no writes were made)");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Backfill failed:", err);
        process.exit(1);
    });
