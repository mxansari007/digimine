#!/usr/bin/env node
/**
 * One-shot: stamp `publishedAt = now` on every article where
 *   status === "published" AND publishedAt is null / missing.
 *
 * Why: the public articles listing uses `orderBy("publishedAt","desc")`,
 * and Firestore silently drops docs missing that field. Run once after
 * publishing through an older code path that didn't stamp the timestamp.
 *
 *   node --env-file=.env.local scripts/backfill-article-publishedat.mjs
 *
 * Dry-runs by default. Pass --confirm to actually write.
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const CONFIRM = process.argv.includes("--confirm");

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing FIREBASE_* env vars. Run with --env-file=.env.local");
    process.exit(1);
}

const app = getApps().length ? getApp() : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

console.log(`\nScanning articles in ${projectId} (mode: ${CONFIRM ? "WRITE" : "DRY RUN"})\n`);

const snap = await db.collection("articles").where("status", "==", "published").get();
const toFix = snap.docs.filter((d) => !d.data().publishedAt);

console.log(`Published articles total:  ${snap.size}`);
console.log(`Missing publishedAt:       ${toFix.length}`);

if (toFix.length === 0) {
    console.log("\n✓ Nothing to backfill.");
    process.exit(0);
}

for (const d of toFix) {
    const data = d.data();
    console.log(`  • ${d.id.padEnd(40)} "${(data.title || "").slice(0, 60)}"`);
}

if (!CONFIRM) {
    console.log("\n[DRY RUN] Re-run with --confirm to stamp publishedAt = createdAt (or now if no createdAt).");
    process.exit(0);
}

let stamped = 0;
for (const d of toFix) {
    const data = d.data();
    const fallback = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now();
    await d.ref.update({ publishedAt: fallback });
    stamped += 1;
}

console.log(`\n✓ Stamped publishedAt on ${stamped} article(s).`);
process.exit(0);
