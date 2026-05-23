#!/usr/bin/env node
/**
 * Flush Firestore + Auth (+ optionally Storage), leaving exactly one survivor
 * user as admin. By default this script DRY-RUNS — nothing is touched until
 * you pass `--confirm` and type the project-ID confirmation phrase.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *   # 1. See what would happen (no changes, safe to run)
 *   node --env-file=.env.local scripts/flush-firebase.mjs
 *
 *   # 2. Actually flush Firestore + Auth, keep storage
 *   node --env-file=.env.local scripts/flush-firebase.mjs --confirm
 *
 *   # 3. Also wipe Storage bucket
 *   node --env-file=.env.local scripts/flush-firebase.mjs --confirm --include-storage
 *
 *   # 4. Change the survivor email
 *   node --env-file=.env.local scripts/flush-firebase.mjs \
 *        --keep-email=admin@example.com --confirm
 *
 * ── Required env (same vars used by apps/web/src/lib/firebase/admin.ts) ──
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY           (newlines may be escaped as \n)
 *
 * ── After flushing ───────────────────────────────────────────────────────
 *   The script prints a reminder — your code's email allowlists are
 *   hardcoded in 4 spots and must include the survivor email for the admin
 *   UI to actually let them in:
 *     firebase/firestore.rules
 *     apps/web/src/app/api/admin/practice/problems/route.ts
 *     apps/admin/src/contexts/AdminAuthContext.tsx
 *     apps/web/check-auth.mjs
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import readline from "node:readline";

// ── args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const optVal = (name, fallback) => {
    const pref = `--${name}=`;
    const found = argv.find((a) => a.startsWith(pref));
    return found ? found.slice(pref.length) : fallback;
};

const CONFIRM = flag("confirm");
const INCLUDE_STORAGE = flag("include-storage");
const KEEP_EMAIL = optVal("keep-email", "mxansari007@gmail.com").toLowerCase().trim();

// ── env ──────────────────────────────────────────────────────────────────
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
    console.error("✖ Missing Firebase Admin env vars:");
    console.error("  NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY");
    console.error("\nHint: run with `node --env-file=.env.local scripts/flush-firebase.mjs`");
    process.exit(1);
}

// ── init ─────────────────────────────────────────────────────────────────
const app = getApps().length
    ? getApp()
    : initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
          storageBucket: `${projectId}.appspot.com`,
      });
const db = getFirestore(app);
const auth = getAuth(app);

// ── banner ───────────────────────────────────────────────────────────────
console.log("");
console.log("════════════════════════════════════════════════════════════════");
console.log("  FIREBASE FLUSH");
console.log("════════════════════════════════════════════════════════════════");
console.log("  Project:           " + projectId);
console.log("  Survivor email:    " + KEEP_EMAIL);
console.log("  Include Storage:   " + (INCLUDE_STORAGE ? "YES" : "no"));
console.log("  Mode:              " + (CONFIRM ? "🔥 DELETE FOR REAL" : "✓ DRY RUN — no changes"));
console.log("════════════════════════════════════════════════════════════════\n");

// ── survey ───────────────────────────────────────────────────────────────
console.log("→ Surveying Firestore…");
const topCollections = await db.listCollections();
const collectionSummary = [];
for (const col of topCollections) {
    try {
        const c = await col.count().get();
        collectionSummary.push({ name: col.id, count: c.data().count });
    } catch {
        collectionSummary.push({ name: col.id, count: "?" });
    }
}
collectionSummary.sort((a, b) => String(a.name).localeCompare(b.name));
console.log(`  Found ${collectionSummary.length} top-level collections:`);
for (const s of collectionSummary) console.log(`    • ${s.name.padEnd(40)} ${s.count} docs`);

console.log("\n→ Surveying Auth users…");
let surveyToken = undefined;
let totalUsers = 0;
let survivor = null;
do {
    const page = await auth.listUsers(1000, surveyToken);
    totalUsers += page.users.length;
    if (!survivor) {
        survivor = page.users.find((u) => (u.email || "").toLowerCase() === KEEP_EMAIL) || null;
    }
    surveyToken = page.pageToken;
} while (surveyToken);
console.log(`  Total users:       ${totalUsers}`);
console.log(`  Survivor user:     ${survivor ? `✓ found (uid=${survivor.uid})` : "✗ not found — will be created"}`);

if (INCLUDE_STORAGE) {
    try {
        const bucket = getStorage(app).bucket();
        const [files] = await bucket.getFiles({ maxResults: 1 });
        const [allFiles] = await bucket.getFiles();
        console.log(`\n→ Storage bucket ${bucket.name}: ${allFiles.length} files (sampled first: ${files[0]?.name || "—"})`);
    } catch (e) {
        console.warn(`  ⚠ Could not survey storage: ${e.message}`);
    }
}

if (!CONFIRM) {
    console.log("\n[DRY RUN] Nothing was changed. Re-run with --confirm to actually flush.\n");
    process.exit(0);
}

// ── confirmation prompt ──────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const phrase = `DELETE ${projectId}`;
console.log("\n⚠  THIS WILL PERMANENTLY DELETE EVERYTHING SHOWN ABOVE.");
console.log(`   To proceed, type exactly:    ${phrase}`);
const typed = (await ask("   > ")).trim();
rl.close();
if (typed !== phrase) {
    console.log("\n✖ Confirmation did not match. Aborted. Nothing was changed.\n");
    process.exit(1);
}

// ── flush firestore ──────────────────────────────────────────────────────
console.log("\n→ Deleting Firestore collections (recursive)…");
for (const col of await db.listCollections()) {
    process.stdout.write(`  • ${col.id} … `);
    try {
        await db.recursiveDelete(col);
        console.log("done");
    } catch (e) {
        console.log(`failed: ${e.message}`);
    }
}

// ── flush auth users (except survivor) ───────────────────────────────────
console.log("\n→ Deleting Auth users (keeping survivor)…");
let token = undefined;
let deletedCount = 0;
do {
    const page = await auth.listUsers(1000, token);
    const toDelete = page.users
        .filter((u) => (u.email || "").toLowerCase() !== KEEP_EMAIL)
        .map((u) => u.uid);
    if (toDelete.length > 0) {
        const res = await auth.deleteUsers(toDelete);
        deletedCount += res.successCount;
        if (res.failureCount > 0) {
            console.warn(`    ⚠ ${res.failureCount} deletions failed in this batch`);
        }
    }
    token = page.pageToken;
} while (token);
console.log(`  Deleted ${deletedCount} users.`);

// ── ensure survivor exists + is admin ────────────────────────────────────
console.log("\n→ Restoring survivor as admin…");
let survivorUid = survivor?.uid;
if (!survivorUid) {
    const created = await auth.createUser({
        email: KEEP_EMAIL,
        emailVerified: true,
        displayName: "Admin",
    });
    survivorUid = created.uid;
    console.log(`  Created survivor user (uid=${survivorUid})`);
} else {
    console.log(`  Survivor uid=${survivorUid}`);
}

await auth.setCustomUserClaims(survivorUid, { admin: true, role: "admin" });
console.log("  Set custom claims: { admin: true, role: \"admin\" }");

await db.collection("users").doc(survivorUid).set(
    {
        id: survivorUid,
        email: KEEP_EMAIL,
        displayName: survivor?.displayName || "Admin",
        role: "admin",
        isAdmin: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    { merge: true }
);
console.log("  Upserted users/" + survivorUid + " with admin role.");

// ── storage ──────────────────────────────────────────────────────────────
if (INCLUDE_STORAGE) {
    console.log("\n→ Wiping Storage bucket…");
    try {
        const bucket = getStorage(app).bucket();
        await bucket.deleteFiles({ force: true });
        console.log("  Done.");
    } catch (e) {
        console.warn(`  ⚠ Storage wipe failed: ${e.message}`);
    }
}

// ── done ─────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════════");
console.log("  ✅ Flush complete.");
console.log("════════════════════════════════════════════════════════════════");
console.log("  Project '" + projectId + "' now contains:");
console.log("    • One Auth user:  " + KEEP_EMAIL + " (uid " + survivorUid + ")");
console.log("    • One Firestore doc: users/" + survivorUid);
console.log("    • No other data.");
console.log("");
console.log("⚠  Next steps to make this user actually admin in the UI:");
console.log("   Replace 'admin@digimine.shop' with '" + KEEP_EMAIL + "' in:");
console.log("     1. firebase/firestore.rules");
console.log("     2. apps/web/src/app/api/admin/practice/problems/route.ts");
console.log("     3. apps/admin/src/contexts/AdminAuthContext.tsx");
console.log("     4. apps/web/check-auth.mjs");
console.log("   Then commit + deploy.");
console.log("");
process.exit(0);
