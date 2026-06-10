/**
 * Deploy generated TCS NQT mock tests into the existing series
 *   tests/tcs-nqt-2026-mock-test-series
 * as docs in its `tests` subcollection (each with a `questions` subcollection),
 * mirroring the production schema. Supports scheduled release via availableFrom.
 *
 *   Emulator (default):  pnpm tsx scripts/deploy-tcs-mock-tests.ts
 *   Production:          FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *                       FIREBASE_STORAGE_EMULATOR_HOST= NEXT_PUBLIC_USE_FIREBASE_EMULATORS= \
 *                       pnpm tsx scripts/deploy-tcs-mock-tests.ts
 *
 * Reads one JSON per mock from ~/Downloads/placementranker-mocks/*.json:
 *   { mock, title, availableFrom: string|null,
 *     sections: [{ title, negativeMarks, cutoffMarks,
 *                  questions: [{ text, options[4], correctIndex, explanation, difficulty }] }] }
 * Idempotent: overwrites tests/{series}/tests/{testId} + rewrites its questions.
 */
import { config as dotenvConfig } from "dotenv";
import { initializeApp, getApps, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

dotenvConfig({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
dotenvConfig({ path: "/Users/maazansari/digimine/apps/web/.env" });

const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const TARGET = useEmulator ? "emulator" : "prod";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
if (!getApps().length) {
    if (useEmulator) initializeApp({ projectId: PROJECT_ID });
    else {
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        initializeApp(
            clientEmail && privateKey
                ? { credential: cert({ projectId: PROJECT_ID, clientEmail, privateKey }) }
                : { credential: applicationDefault(), projectId: PROJECT_ID }
        );
    }
}
const db = getFirestore();

const SERIES = process.env.PR_SERIES || "tcs-nqt-2026-mock-test-series";
const DIR = process.env.PR_MOCK_DIR || path.join(os.homedir(), "Downloads/placementranker-mocks");

type GenQ = { text: string; options: string[]; correctIndex: number; explanation: string; difficulty: string };
type GenSection = { title: string; negativeMarks?: number; cutoffMarks?: number; questions: GenQ[] };
type GenMock = { mock: string; title: string; availableFrom: string | null; sections: GenSection[] };

// Wrap plain text in <p>, convert `code` spans to <code>, keep existing HTML.
function html(s: string): string {
    if (!s) return "";
    const withCode = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return /^\s*</.test(withCode) ? withCode : `<p>${withCode}</p>`;
}
function optHtml(s: string): string {
    return (s || "").replace(/`([^`]+)`/g, "<code>$1</code>");
}

async function deployMock(m: GenMock, order: number) {
    const testId = `tcs-nqt-mock-${m.mock}`;
    const seriesRef = db.collection("tests").doc(SERIES);
    const mockRef = seriesRef.collection("tests").doc(testId);

    // wipe old questions
    const old = await mockRef.collection("questions").get();
    for (let i = 0; i < old.docs.length; i += 400) {
        const b = db.batch();
        old.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
    }

    const sections = m.sections.map((s, i) => ({
        id: `${testId}-sec${i}`,
        title: s.title,
        description: `${s.title} — TCS NQT Foundation pattern.`,
        order: i,
        marksPerQuestion: 1,
        negativeMarks: s.negativeMarks ?? 0,
        cutoffMarks: s.cutoffMarks ?? 0,
    }));
    const totalQuestions = m.sections.reduce((s, sec) => s + sec.questions.length, 0);
    const totalMarks = totalQuestions;
    const passingMarks = sections.reduce((s, sec) => s + (sec.cutoffMarks || 0), 0);
    const ts = Timestamp.now();

    await mockRef.set({
        seriesId: SERIES,
        title: m.title,
        description: `${m.title}: Numerical, Verbal and Reasoning Ability — full TCS NQT Foundation mock with sectional cut-offs and negative marking.`,
        order,
        duration: 60,
        totalQuestions,
        totalMarks,
        passingMarks,
        instantResults: true,
        allowRetake: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        status: "published",
        availableFrom: m.availableFrom ? Timestamp.fromDate(new Date(m.availableFrom)) : null,
        sections,
        createdAt: ts,
        updatedAt: ts,
    });

    let order2 = 0;
    let batch = db.batch();
    let n = 0;
    for (let si = 0; si < m.sections.length; si++) {
        const sec = m.sections[si];
        const sectionId = sections[si].id;
        for (const q of sec.questions) {
            const qid = `${testId}-q${order2 + 1}`;
            batch.set(mockRef.collection("questions").doc(qid), {
                seriesId: SERIES,
                testId,
                type: "mcq",
                questionText: html(q.text),
                options: q.options.map((label, idx) => ({
                    id: `${qid}-o${idx}`,
                    text: optHtml(label),
                    isCorrect: idx === q.correctIndex,
                })),
                correctAnswer: optHtml(q.options[q.correctIndex] ?? ""),
                explanation: q.explanation || "",
                marks: 1,
                negativeMarks: sec.negativeMarks ?? 0,
                difficulty: q.difficulty || "medium",
                sectionId,
                order: order2,
                createdAt: ts,
                updatedAt: ts,
            });
            order2++;
            if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
        }
    }
    await batch.commit();
    return { testId, title: m.title, totalQuestions, scheduled: !!m.availableFrom, availableFrom: m.availableFrom };
}

async function main() {
    console.log(`[deploy-mocks] target=${TARGET} project=${PROJECT_ID} series=${SERIES} dir=${DIR}`);
    const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : [];
    if (!files.length) { console.error("No mock JSON files in", DIR); process.exit(1); }

    let order = 1; // Mock 01 is order 0
    const done: any[] = [];
    for (const f of files) {
        const m: GenMock = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
        const r = await deployMock(m, order++);
        done.push(r);
        console.log(`  ✓ ${r.testId}  (${r.totalQuestions} Qs)${r.scheduled ? `  ⏰ scheduled ${r.availableFrom}` : "  · live now"}`);
    }

    // Update the series rollups (count Mock 01 too).
    const seriesRef = db.collection("tests").doc(SERIES);
    const allMocks = await seriesRef.collection("tests").get();
    let seriesQ = 0;
    allMocks.forEach((d) => (seriesQ += d.data().totalQuestions || 0));
    await seriesRef.set({ totalTests: allMocks.size, totalQuestions: seriesQ, updatedAt: Timestamp.now() }, { merge: true });

    console.log(`\n[deploy-mocks] DONE → +${done.length} mocks. Series now has ${allMocks.size} tests, ${seriesQ} questions.`);
    process.exit(0);
}
main().catch((e) => { console.error("[deploy-mocks] FAILED:", e); process.exit(1); });
