#!/usr/bin/env node
/**
 * Quick diagnostic: prints the Firestore record for an article slug so you
 * can see why the public page might not be rendering it.
 *
 *   node --env-file=.env.local scripts/debug-article.mjs tcs-nqt-2026-pattern-syllabus-cutoffs
 *
 * Look for:
 *   - status: should be exactly "published" (case-sensitive)
 *   - slug:   should exactly match what you typed in the URL
 *   - isDeleted: should be false / undefined
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const slug = (process.argv[2] || "").trim();
if (!slug) {
    console.error("Usage: node scripts/debug-article.mjs <slug>");
    process.exit(1);
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing FIREBASE_* env vars. Use --env-file=.env.local");
    process.exit(1);
}

const app = getApps().length ? getApp() : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

console.log(`\nSearching for slug: "${slug}" in project ${projectId}\n`);

// 1) Try slug as doc ID (the fast path)
const direct = await db.collection("articles").doc(slug).get();
if (direct.exists) {
    console.log(`✓ Found via doc(slug) — doc ID = "${direct.id}"`);
    printArticle(direct.data());
} else {
    console.log(`✗ No doc with ID "${slug}"`);
}

// 2) Try where("slug", "==", slug)
const q = await db.collection("articles").where("slug", "==", slug).limit(5).get();
if (q.empty) {
    console.log(`✗ No article with field slug = "${slug}"`);
} else {
    console.log(`\n✓ Found ${q.size} match(es) via where("slug", "==", slug):`);
    q.docs.forEach((d) => {
        console.log(`  doc ID = "${d.id}"`);
        printArticle(d.data());
    });
}

// 3) Loose search — case mismatch?
const all = await db.collection("articles").get();
const fuzzy = all.docs.filter((d) => {
    const s = (d.data().slug || "").toLowerCase();
    return s.includes(slug.toLowerCase().slice(0, 12));
});
if (fuzzy.length && q.empty) {
    console.log(`\n⚠ But ${fuzzy.length} article(s) have a SIMILAR slug — possible case/typo mismatch:`);
    fuzzy.forEach((d) => console.log(`  "${d.data().slug}"  (status: ${d.data().status})`));
}

function printArticle(data) {
    const fields = ["title", "slug", "status", "isDeleted", "publishedAt", "category", "teacherId", "visibility"];
    fields.forEach((f) => {
        const v = data?.[f];
        const display = v?.toDate ? v.toDate().toISOString() : (v === undefined ? "(unset)" : JSON.stringify(v));
        console.log(`    ${f.padEnd(14)} ${display}`);
    });
}

process.exit(0);
