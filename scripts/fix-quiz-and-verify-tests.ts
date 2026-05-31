/**
 * (A) QUIZ FIX — backfill quizId + createdAt + updatedAt on every quiz question.
 *     The admin createQuizQuestion writes these (quizId, createdAt, updatedAt);
 *     the placement-quiz deploy script omitted them, so the admin question
 *     editor's mapDoc couldn't map them and RawQuizQuestion.quizId was absent.
 *     Backfill them on every existing quiz question doc that lacks them.
 *
 * (B) TEST VERIFY — read-only integrity check on the TCS NQT mock series:
 *     for every test, confirm each question.sectionId matches a section.id in
 *     the test doc (orphan sectionIds get bucketed as "__unsectioned" by the
 *     web scorer and break sectional cut-offs). Reports any mismatch; writes
 *     nothing.
 *
 * Run (prod):
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *   FIREBASE_STORAGE_EMULATOR_HOST= NEXT_PUBLIC_USE_FIREBASE_EMULATORS= \
 *   pnpm tsx scripts/fix-quiz-and-verify-tests.ts
 */
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

async function fixQuizzes() {
    console.log("\n=== (A) QUIZ: backfill quizId + createdAt + updatedAt on questions ===");
    const quizzes = await db.collection("quizzes")
        .where("status", "==", "published").where("visibility", "==", "published").get();
    let totalFixed = 0;
    for (const quiz of quizzes.docs) {
        const slug = quiz.id;
        const createdAt = quiz.data().createdAt || Timestamp.now();
        const qs = await quiz.ref.collection("questions").get();
        let batch = db.batch();
        let n = 0, fixed = 0;
        for (const qd of qs.docs) {
            const d = qd.data();
            const patch: Record<string, unknown> = {};
            if (d.quizId === undefined) patch.quizId = slug;
            if (d.createdAt === undefined) patch.createdAt = createdAt;
            if (d.updatedAt === undefined) patch.updatedAt = Timestamp.now();
            if (Object.keys(patch).length) {
                batch.set(qd.ref, patch, { merge: true });
                fixed++;
                if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
            }
        }
        if (n % 400 !== 0) await batch.commit();
        totalFixed += fixed;
        console.log(`  ${slug}: ${fixed}/${qs.size} questions backfilled`);
    }
    console.log(`  TOTAL quiz questions backfilled: ${totalFixed}`);
}

async function verifyTests() {
    console.log("\n=== (B) TEST: sectionId integrity check (read-only) ===");
    const SERIES = "tcs-nqt-2026-mock-test-series";
    const tests = await db.collection("tests").doc(SERIES).collection("tests").get();
    let problems = 0;
    for (const t of tests.docs) {
        const td = t.data();
        const sectionIds = new Set((td.sections || []).map((s: any) => s.id));
        const qs = await t.ref.collection("questions").get();
        const orphans = new Map<string, number>();
        let noSection = 0;
        qs.docs.forEach((qd) => {
            const sid = qd.data().sectionId;
            if (!sid) { noSection++; return; }
            if (!sectionIds.has(sid)) orphans.set(sid, (orphans.get(sid) || 0) + 1);
        });
        const ok = orphans.size === 0 && noSection === 0;
        const tag = ok ? "OK" : "PROBLEM";
        if (!ok) problems++;
        console.log(`  ${t.id}: ${qs.size} Qs · ${sectionIds.size} sections · ${tag}` +
            (orphans.size ? ` · orphan sectionIds: ${[...orphans.entries()].map(([k, v]) => `${k}(${v})`).join(", ")}` : "") +
            (noSection ? ` · ${noSection} questions with NO sectionId` : ""));
    }
    console.log(problems ? `  ⚠ ${problems} test(s) with sectionId problems` : "  ✓ all tests: every question.sectionId matches a section.id");
}

(async () => {
    console.log("[fix-quiz-and-verify-tests] target=prod project=" + pid);
    await fixQuizzes();
    await verifyTests();
    console.log("\n[fix-quiz-and-verify-tests] DONE");
    process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
