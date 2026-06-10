import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();
(async () => {
  const chapters = await db.collection("courses").doc("data-structures-algorithms").collection("chapters").orderBy("order").get();
  let total = 0;
  for (const ch of chapters.docs) {
    const d = ch.data();
    const subs = d.subtopics || [];
    total += subs.length;
    console.log(`\nCh${d.order+1}: ${d.title} (${subs.length} subtopics)`);
    subs.forEach((s: any, i: number) => console.log(`  ${i+1}. ${s.title}`));
  }
  console.log(`\nTotal: ${chapters.size} chapters, ${total} subtopics`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
