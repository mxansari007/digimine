import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const j = (o: any) => JSON.stringify(o, null, 1);
(async () => {
  console.log("======== COURSE: operating-systems ========");
  const c = await db.collection("courses").doc("operating-systems").get();
  const cd = c.data()!;
  console.log("course keys:", Object.keys(cd).sort().join(", "));
  console.log("notesOutline[0]:", j(cd.notesOutline?.[0]));
  const chap = await db.collection("courses").doc("operating-systems").collection("chapters").get();
  console.log("chapters SUBCOLLECTION count:", chap.size);
  if (chap.size) console.log("chapters[0]:", j(chap.docs[0].data()));

  console.log("\n======== QUIZ: operating-systems ========");
  const q = await db.collection("quizzes").doc("operating-systems").get();
  console.log("quiz exists:", q.exists, "keys:", q.exists ? Object.keys(q.data()!).sort().join(", ") : "-");
  const qq = await db.collection("quizzes").doc("operating-systems").collection("questions").limit(1).get();
  console.log("questions count (sampled limit1):", qq.size);
  if (qq.size) console.log("question[0] keys:", Object.keys(qq.docs[0].data()).sort().join(", "), "\n", j(qq.docs[0].data()));

  console.log("\n======== MOCK TEST SERIES ========");
  const s = await db.collection("tests").doc("tcs-nqt-2026-mock-test-series").get();
  console.log("series keys:", Object.keys(s.data()!).sort().join(", "));
  const tests = await db.collection("tests").doc("tcs-nqt-2026-mock-test-series").collection("tests").limit(1).get();
  console.log("tests subcollection count (limit1):", tests.size);
  if (tests.size) {
    const t = tests.docs[0];
    console.log("test[0] id:", t.id, "keys:", Object.keys(t.data()).sort().join(", "));
    console.log("test[0].sections[0]:", j((t.data().sections||[])[0]));
    const tq = await t.ref.collection("questions").limit(1).get();
    console.log("test question count(limit1):", tq.size);
    if (tq.size) console.log("test question[0] keys:", Object.keys(tq.docs[0].data()).sort().join(", "), "\n", j(tq.docs[0].data()));
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
