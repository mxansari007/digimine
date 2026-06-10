import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();
(async () => {
  for (const slug of ["operating-systems","aptitude-placement-prep"]) {
    const ch = await db.collection("courses").doc(slug).collection("chapters").orderBy("order").get();
    console.log(`${slug}: ${ch.size} chapter docs in subcollection`);
    const c0 = ch.docs[0]?.data();
    console.log(`  chapter[0]: id=${c0?.id} title="${c0?.title}" subtopics=${c0?.subtopics?.length}`);
    const s0 = c0?.subtopics?.[0];
    console.log(`  subtopic[0] keys: ${s0 ? Object.keys(s0).sort().join(", ") : "-"} | contentHtml len=${s0?.contentHtml?.length}`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
