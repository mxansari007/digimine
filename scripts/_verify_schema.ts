import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();
(async () => {
  const c = await db.collection("courses").doc("aptitude-placement-prep").get();
  const d = c.data()!;
  const ch = d.notesOutline?.[0];
  console.log("notesOutline[0] keys:", ch ? Object.keys(ch).sort().join(", ") : "NONE");
  console.log("notesOutline[0].subtopics[0]:", JSON.stringify(ch?.subtopics?.[0]));
  console.log("notesSummary:", JSON.stringify(d.notesSummary));
  console.log("linkedQuizzes[0]:", JSON.stringify(d.linkedQuizzes?.[0]));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
