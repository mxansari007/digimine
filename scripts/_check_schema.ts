import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();
(async () => {
  // Check one course
  const c = await db.collection("courses").doc("operating-systems").get();
  console.log("=== COURSE operating-systems ===");
  const cd = c.data()!;
  console.log("keys:", Object.keys(cd).sort().join(", "));
  console.log("notesSummary type:", typeof cd.notesSummary, "value:", JSON.stringify(cd.notesSummary));
  console.log("notesOutline[0]:", JSON.stringify(cd.notesOutline?.[0]));
  console.log("linkedQuizzes[0]:", JSON.stringify(cd.linkedQuizzes?.[0]));
  console.log("linkedTestSeriesIds:", JSON.stringify(cd.linkedTestSeriesIds));

  // Check test series
  const ts = await db.collection("tests").doc("tcs-nqt-2026-mock-test-series").get();
  console.log("\n=== TEST SERIES ===");
  const td = ts.data()!;
  console.log("keys:", Object.keys(td).sort().join(", "));
  console.log("highlights:", JSON.stringify(td.highlights));
  console.log("metaTitle:", td.metaTitle);
  console.log("accessType:", td.accessType);
  console.log("subcategory:", td.subcategory);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
