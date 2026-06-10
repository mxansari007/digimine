import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const REQUIRED = ["id", "title", "summary", "contentHtml", "imageUrls", "videos", "order"];
(async () => {
  const ref = db.collection("courses").doc("data-structures-algorithms").collection("chapters").doc("ch-foundations-complexity-analysis");
  const snap = await ref.get();
  const d = snap.data()!;
  console.log(`Chapter doc keys: ${Object.keys(d).sort().join(", ")}`);
  console.log(`Chapter: "${d.title}" · order=${d.order} · ${d.subtopics.length} subtopics\n`);
  let allOk = true;
  for (const s of d.subtopics) {
    const missing = REQUIRED.filter((k) => !(k in s));
    const extra = Object.keys(s).filter((k) => !REQUIRED.includes(k) && k !== "seo");
    const len = (s.contentHtml || "").length;
    const svgs = ((s.contentHtml || "").match(/<svg/g) || []).length;
    const figs = ((s.contentHtml || "").match(/<figure/g) || []).length;
    const ok = missing.length === 0 && len > 200;
    if (!ok) allOk = false;
    console.log(`${ok ? "✓" : "✗"} ${s.title}`);
    console.log(`    contentHtml=${len} chars · ${svgs} svg · ${figs} figures · imageUrls=${(s.imageUrls||[]).length} · videos=${(s.videos||[]).length}` +
      (missing.length ? ` · MISSING: ${missing.join(",")}` : "") + (extra.length ? ` · EXTRA: ${extra.join(",")}` : ""));
  }
  // Cross-check notesOutline/notesSummary on the course doc stay consistent
  const course = (await db.collection("courses").doc("data-structures-algorithms").get()).data()!;
  const outlineChapter = (course.notesOutline || []).find((c: any) => c.id === "ch-foundations-complexity-analysis");
  console.log(`\nnotesOutline chapter present: ${!!outlineChapter} · outline subtopics=${outlineChapter?.subtopics?.length}`);
  console.log(`notesSummary: ${JSON.stringify(course.notesSummary)}`);
  console.log(`\nSCHEMA ${allOk ? "VALID ✓" : "HAS ISSUES ✗"}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
