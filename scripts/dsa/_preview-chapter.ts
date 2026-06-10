import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFileSync } from "fs";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const chapterId = process.argv[2] || "ch-foundations-complexity-analysis";

// Approximation of FormattedContent's CSS so the preview matches production.
const CSS = `
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;padding:2rem 1rem;color:#334155;background:#f8fafc}
.sub{background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:2rem 2.25rem;margin:1.5rem 0;box-shadow:0 1px 3px rgba(15,23,42,.05)}
.eyebrow{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:#0d9488}
.fc{line-height:1.7;color:#334155}
.fc h1{font-size:1.9rem;font-weight:800;color:#0f172a;margin:.2rem 0 1rem;letter-spacing:-.01em}
.fc h2{font-size:1.2rem;font-weight:700;color:#0f172a;margin:1.6rem 0 .6rem}
.fc p{margin:.7rem 0}
.fc ul,.fc ol{margin:.7rem 0;padding-left:1.4rem}.fc li{margin:.3rem 0}
.fc code{font-family:ui-monospace,Menlo,monospace;font-size:.85em;background:#f1f5f9;color:#0f172a;padding:.1em .35em;border-radius:5px}
.fc pre{background:#0b1220;color:#e2e8f0;padding:1rem 1.1rem;border-radius:12px;overflow:auto;font-size:.84rem;line-height:1.55;margin:1rem 0}
.fc pre code{background:none;color:inherit;padding:0;font-size:inherit}
.fc table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.9rem}
.fc th{background:#f1f5f9;color:#0f172a;text-align:left;font-weight:700;padding:.55rem .7rem;border:1px solid #e2e8f0}
.fc td{padding:.55rem .7rem;border:1px solid #e2e8f0}
.fc blockquote{margin:1.2rem 0;padding:.85rem 1.1rem;border-left:3px solid #0d9488;background:#f0fdfa;border-radius:0 10px 10px 0;color:#0f172a}
.fc figure{margin:1.5rem auto}
`;

(async () => {
  const snap = await db.collection("courses").doc("data-structures-algorithms").collection("chapters").doc(chapterId).get();
  if (!snap.exists) { console.error("chapter not found"); process.exit(1); }
  const d = snap.data()!;
  const subs = d.subtopics || [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${d.title} — preview</title><style>${CSS}</style></head><body>
<h1 style="font-size:1.4rem;color:#64748b;font-weight:600">Live preview · ${d.title} · ${subs.length} subtopics</h1>
${subs.map((s: any, i: number) => `<div class="sub"><p class="eyebrow">Subtopic ${i + 1}</p><div class="fc"><h1>${s.title}</h1>${s.contentHtml || "<p style='color:#94a3b8'>(empty)</p>"}</div></div>`).join("")}
</body></html>`;
  const out = `/tmp/dsa-${chapterId}.html`;
  writeFileSync(out, html);
  console.log("wrote " + out);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
