/**
 * Deploy the generated placement quizzes (~/Downloads/placementranker-quizzes/*.json)
 * into Firestore as PUBLIC, free, published quizzes.
 *
 *   Emulator (default, safe):   pnpm tsx scripts/deploy-placement-quizzes.ts
 *   Production:                 PR_TARGET=prod GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json \
 *                               NEXT_PUBLIC_FIREBASE_PROJECT_ID=digimine-1c33f \
 *                               pnpm tsx scripts/deploy-placement-quizzes.ts
 *
 * A quiz is shown in the public catalog when status==="published" AND
 * visibility==="published" (admin-authored, teacherId===""). Idempotent: it
 * overwrites quizzes/{slug} and rewrites the questions subcollection.
 */
import { config as dotenvConfig } from "dotenv";
import { initializeApp, getApps, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Load the same creds the web app uses. Mirrors scripts/seed-plans.ts:
// when FIRESTORE_EMULATOR_HOST is present we target the local emulator; when it
// is cleared (run with `FIRESTORE_EMULATOR_HOST= ...`), we hit PROD via the
// service-account cert from .env.local. dotenv never overrides an already-set
// env var, so clearing the host on the command line wins.
dotenvConfig({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
dotenvConfig({ path: "/Users/maazansari/digimine/apps/web/.env" });

const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const TARGET = useEmulator ? "emulator" : "prod";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
if (!getApps().length) {
    if (useEmulator) {
        initializeApp({ projectId: PROJECT_ID });
    } else {
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        if (clientEmail && privateKey) {
            initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail, privateKey }) });
        } else {
            initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
        }
    }
}
const db = getFirestore();

const DIR = process.env.PR_QUIZ_DIR || path.join(os.homedir(), "Downloads/placementranker-quizzes");
const AUTHOR = process.env.PR_QUIZ_AUTHOR || ""; // "" = admin/catalog-authored

type GenQuestion = {
    text: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    difficulty: "easy" | "medium" | "hard";
};
type GenQuiz = {
    slug: string;
    title: string;
    category: string;
    shortDescription: string;
    difficulty: "easy" | "medium" | "hard";
    timeLimitMinutes: number;
    questions: GenQuestion[];
};

function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Basic structural validation so a malformed file can't deploy a broken quiz. */
function validate(q: GenQuiz, file: string): string[] {
    const errs: string[] = [];
    if (!q.slug || !q.title || !q.category) errs.push("missing slug/title/category");
    if (!Array.isArray(q.questions) || q.questions.length === 0) errs.push("no questions");
    (q.questions || []).forEach((qq, i) => {
        if (!qq.text) errs.push(`q${i}: no text`);
        if (!Array.isArray(qq.options) || qq.options.length !== 4) errs.push(`q${i}: needs exactly 4 options`);
        if (typeof qq.correctIndex !== "number" || qq.correctIndex < 0 || qq.correctIndex > 3)
            errs.push(`q${i}: bad correctIndex`);
    });
    return errs.map((e) => `${path.basename(file)} → ${e}`);
}

async function deployOne(q: GenQuiz) {
    const slug = q.slug || slugify(q.title);
    const ts = Timestamp.now();
    const marksPer = 1;
    const totalMarks = q.questions.length * marksPer;

    const quizRef = db.collection("quizzes").doc(slug);
    // wipe old questions so re-runs don't leave stale ones
    const old = await quizRef.collection("questions").get();
    const wipe = db.batch();
    old.forEach((d) => wipe.delete(d.ref));
    await wipe.commit();

    await quizRef.set({
        teacherId: AUTHOR,
        createdBy: AUTHOR || "placement-content",
        slug,
        title: q.title,
        description: q.shortDescription || q.title,
        shortDescription: q.shortDescription || q.title,
        thumbnailURL: null,
        status: "published",
        visibility: "published",
        accessType: "free",
        classIds: [],
        category: q.category,
        tags: [q.category, "placement", "aptitude", "company-pattern"].filter(Boolean),
        difficulty: q.difficulty || "medium",
        timeLimitMinutes: q.timeLimitMinutes || Math.round(q.questions.length * 1.2),
        totalQuestions: q.questions.length,
        totalMarks,
        passingPercentage: 50,
        shuffleQuestions: true,
        shuffleOptions: true,
        showExplanations: true,
        allowRetake: true,
        instantResults: true,
        linkedCourseIds: [],
        availableFrom: null,
        createdAt: ts,
        updatedAt: ts,
    });

    const batch = db.batch();
    q.questions.forEach((qq, i) => {
        const qid = `${slug}-q${i + 1}`;
        batch.set(quizRef.collection("questions").doc(qid), {
            // quizId + createdAt/updatedAt mirror what the admin createQuizQuestion
            // writes — RawQuizQuestion requires quizId and the admin editor's
            // mapDoc reads the timestamps.
            quizId: slug,
            order: i,
            type: "mcq",
            // The attempt reader maps `questionText` (RawQuizQuestion). Keep
            // `text` too for any legacy reader.
            questionText: qq.text,
            text: qq.text,
            options: qq.options.map((label, idx) => ({
                id: `${qid}-o${idx}`,
                text: label,
                isCorrect: idx === qq.correctIndex,
            })),
            correctAnswer: qq.options[qq.correctIndex] ?? "",
            explanation: qq.explanation || "",
            marks: marksPer,
            negativeMarks: 0,
            difficulty: qq.difficulty || "medium",
            createdAt: ts,
            updatedAt: ts,
        });
    });
    await batch.commit();
    return { slug, title: q.title, questions: q.questions.length, category: q.category };
}

async function main() {
    console.log(`[deploy-quizzes] target=${TARGET} project=${PROJECT_ID} dir=${DIR}`);
    if (!fs.existsSync(DIR)) {
        console.error(`Directory not found: ${DIR}. Run the quiz generation workflow first.`);
        process.exit(1);
    }
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
    if (!files.length) {
        console.error("No quiz JSON files found.");
        process.exit(1);
    }

    let deployed = 0,
        totalQ = 0;
    const byCat: Record<string, number> = {};
    for (const f of files) {
        const full = path.join(DIR, f);
        let q: GenQuiz;
        try {
            q = JSON.parse(fs.readFileSync(full, "utf8"));
        } catch (e) {
            console.error(`  ✗ ${f}: invalid JSON`);
            continue;
        }
        const errs = validate(q, full);
        if (errs.length) {
            console.error(`  ✗ ${f}: skipped —`, errs.join("; "));
            continue;
        }
        const r = await deployOne(q);
        deployed++;
        totalQ += r.questions;
        byCat[r.category] = (byCat[r.category] || 0) + 1;
        console.log(`  ✓ ${r.slug}  (${r.questions} Qs · ${r.category})`);
    }
    console.log(`\n[deploy-quizzes] DONE → ${deployed} quizzes, ${totalQ} questions, all PUBLIC + free.`);
    console.log("  by category:", byCat);
    if (TARGET !== "prod") console.log("  Visible at  http://localhost:3000/quizzes");
    process.exit(0);
}

main().catch((e) => {
    console.error("[deploy-quizzes] FAILED:", e);
    process.exit(1);
});
