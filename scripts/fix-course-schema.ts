/**
 * One-shot migration: fix the 3 schema mismatches in all course docs.
 *
 * What was wrong                       What it should be
 * ─────────────────────────────────── ─────────────────────────────────────────────
 * notesOutline[i].moduleTitle/        { id, title, description, order,
 *   lessonTitles[]                      subtopics: [{id,title,summary,order,...}] }
 *
 * notesSummary: string                { chapterCount, subtopicCount, imageCount,
 *                                       videoCount }
 *
 * linkedQuizzes: string[]             CourseLinkedQuiz[] = [{id, quizId, title,
 *                                       description, url, status}]
 *
 * Run (prod):
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *   FIREBASE_STORAGE_EMULATOR_HOST= NEXT_PUBLIC_USE_FIREBASE_EMULATORS= \
 *   pnpm tsx scripts/fix-course-schema.ts
 */
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

function slugId(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

(async () => {
    console.log("[fix-course-schema] target=prod project=" + pid);

    // 1. Load all quiz docs so we can populate linkedQuizzes with real titles
    const quizSnap = await db.collection("quizzes")
        .where("status", "==", "published")
        .where("visibility", "==", "published")
        .get();
    const quizMap: Record<string, { title: string; shortDescription: string }> = {};
    quizSnap.forEach(d => {
        quizMap[d.id] = { title: d.data().title || d.id, shortDescription: d.data().shortDescription || "" };
    });
    console.log(`  loaded ${Object.keys(quizMap).length} quizzes`);

    // 2. Load all courses
    const courseSnap = await db.collection("courses")
        .where("status", "==", "published")
        .get();
    console.log(`  found ${courseSnap.size} courses to migrate`);

    for (const courseDoc of courseSnap.docs) {
        const data = courseDoc.data();
        const raw: any[] = data.notesOutline || [];

        // Skip already-migrated docs (already have the correct shape)
        if (raw.length > 0 && raw[0].subtopics !== undefined) {
            console.log(`  SKIP ${courseDoc.id} (already migrated)`);
            continue;
        }

        // ── notesOutline: { moduleTitle, lessonTitles[] } → CourseNoteOutlineChapter[]
        const notesOutline = raw.map((m: any, chIdx: number) => {
            const chId = `ch-${slugId(m.moduleTitle || String(chIdx))}`;
            const subtopics = (m.lessonTitles || []).map((lt: string, ltIdx: number) => ({
                id: `${chId}-st${ltIdx}`,
                title: lt,
                summary: "",
                hasImages: false,
                videoCount: 0,
                order: ltIdx,
            }));
            return {
                id: chId,
                title: m.moduleTitle || `Module ${chIdx + 1}`,
                description: "",
                order: chIdx,
                subtopics,
            };
        });

        // ── notesSummary: string → { chapterCount, subtopicCount, imageCount, videoCount }
        const notesSummary = {
            chapterCount: notesOutline.length,
            subtopicCount: notesOutline.reduce((s: number, ch: any) => s + ch.subtopics.length, 0),
            imageCount: 0,
            videoCount: 0,
        };

        // ── linkedQuizzes: string[] → CourseLinkedQuiz[]
        const rawLinked: any[] = data.linkedQuizzes || [];
        const linkedQuizzes = rawLinked.map((entry: any) => {
            // Already migrated object
            if (typeof entry === "object" && entry !== null && entry.id) return entry;
            // Plain string slug
            const slug = String(entry);
            const info = quizMap[slug];
            return {
                id: slug,
                quizId: slug,
                title: info?.title || slug,
                description: info?.shortDescription || "",
                url: `/quizzes/${slug}`,
                status: "published",
            };
        });

        await courseDoc.ref.update({
            notesOutline,
            notesSummary,
            linkedQuizzes,
            updatedAt: Timestamp.now(),
        });

        console.log(`  ✓ ${courseDoc.id}  →  ${notesSummary.chapterCount} chapters · ${notesSummary.subtopicCount} subtopics · ${linkedQuizzes.length} quizzes`);
    }

    console.log("[fix-course-schema] DONE");
    process.exit(0);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
