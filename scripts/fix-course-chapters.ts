/**
 * Create the `chapters` SUBCOLLECTION for every published course.
 *
 * THE BUG: the deploy wrote only the inline `notesOutline` array. But the admin
 * course editor (CourseNotesEditor) binds to `course.chapters`, which
 * getCourse() loads from the `courses/{id}/chapters` SUBCOLLECTION — so the
 * editor showed "0 chapters · 0 subtopics" and the full notes never existed.
 *
 * This migration mirrors each notesOutline chapter → a CourseNoteChapter doc in
 * the chapters subcollection (keyed by chapter.id), with each outline subtopic →
 * a CourseNoteSubtopic { id, title, summary, contentHtml, imageUrls, videos,
 * order }. It then rebuilds notesOutline + notesSummary from those chapters via
 * the SAME logic the admin uses (buildNotesOutline / buildNotesSummary) so the
 * public outline and the editor stay perfectly consistent.
 *
 * Idempotent: re-running overwrites the chapters subcollection from notesOutline.
 * Will NOT clobber chapters that already have real contentHtml (skips a course
 * whose chapters subcollection already exists with non-empty content).
 *
 * Run (prod):
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *   FIREBASE_STORAGE_EMULATOR_HOST= NEXT_PUBLIC_USE_FIREBASE_EMULATORS= \
 *   pnpm tsx scripts/fix-course-chapters.ts
 */
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

type OutlineSub = { id: string; title: string; summary?: string; hasImages?: boolean; videoCount?: number; order?: number };
type OutlineChap = { id: string; title: string; description?: string; order?: number; subtopics: OutlineSub[] };

// A short, honest starter note so the subtopic isn't blank in the editor or on
// the public page. Admins replace this with full notes via the rich editor.
function starterHtml(chapterTitle: string, subTitle: string): string {
    return (
        `<p><strong>${subTitle}</strong> — part of <em>${chapterTitle}</em>.</p>` +
        `<p>Detailed notes for this topic are being added. Key points to master: ` +
        `definitions, how it works, where it is used, and the common exam/interview questions around <strong>${subTitle}</strong>.</p>`
    );
}

// Mirror the admin's buildNotesOutline / buildNotesSummary so the public outline
// and the summary counts match the chapters subcollection exactly.
function buildNotesOutline(chapters: any[]) {
    return chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        description: chapter.description || "",
        order: chapter.order,
        subtopics: (chapter.subtopics || []).map((s: any) => ({
            id: s.id,
            title: s.title,
            summary: s.summary || "",
            hasImages: (s.imageUrls || []).length > 0,
            videoCount: (s.videos || []).length,
            order: s.order,
        })),
    }));
}
function buildNotesSummary(chapters: any[]) {
    return chapters.reduce(
        (sum, ch) => ({
            chapterCount: sum.chapterCount + 1,
            subtopicCount: sum.subtopicCount + (ch.subtopics || []).length,
            imageCount: sum.imageCount + (ch.subtopics || []).reduce((t: number, s: any) => t + (s.imageUrls || []).length, 0),
            videoCount: sum.videoCount + (ch.subtopics || []).reduce((t: number, s: any) => t + (s.videos || []).length, 0),
        }),
        { chapterCount: 0, subtopicCount: 0, imageCount: 0, videoCount: 0 }
    );
}

async function migrateCourse(courseId: string) {
    const ref = db.collection("courses").doc(courseId);
    const snap = await ref.get();
    if (!snap.exists) return { courseId, skipped: "not found" };
    const data = snap.data()!;
    const outline: OutlineChap[] = data.notesOutline || [];
    if (!outline.length) return { courseId, skipped: "no notesOutline" };

    // Guard: if chapters subcollection already has REAL content, don't clobber.
    const existing = await ref.collection("chapters").get();
    const hasRealContent = existing.docs.some((d) => {
        const subs = (d.data().subtopics || []) as any[];
        return subs.some((s) => s.contentHtml && s.contentHtml.length > 120 && !s.contentHtml.includes("being added"));
    });
    if (hasRealContent) return { courseId, skipped: "chapters already have real content" };

    // Build full CourseNoteChapter[] from the outline.
    const chapters = outline.map((ch, ci) => ({
        id: ch.id,
        title: ch.title,
        description: ch.description || "",
        order: ci,
        subtopics: (ch.subtopics || []).map((s, si) => ({
            id: s.id,
            title: s.title,
            summary: s.summary || "",
            contentHtml: starterHtml(ch.title, s.title),
            imageUrls: [] as string[],
            videos: [] as any[],
            order: si,
        })),
    }));

    // Wipe + rewrite chapters subcollection (one doc per chapter, keyed by id).
    const oldDocs = existing.docs;
    for (let i = 0; i < oldDocs.length; i += 400) {
        const b = db.batch();
        oldDocs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
    }
    for (let i = 0; i < chapters.length; i += 400) {
        const b = db.batch();
        chapters.slice(i, i + 400).forEach((ch) => b.set(ref.collection("chapters").doc(ch.id), ch));
        await b.commit();
    }

    // Rebuild outline + summary from chapters so everything is consistent.
    const notesOutline = buildNotesOutline(chapters);
    const notesSummary = buildNotesSummary(chapters);
    await ref.update({
        notesOutline,
        notesSummary,
        totalModules: chapters.length,
        totalLessons: notesSummary.subtopicCount,
        updatedAt: Timestamp.now(),
    });

    return { courseId, chapters: chapters.length, subtopics: notesSummary.subtopicCount };
}

(async () => {
    console.log("[fix-course-chapters] target=prod project=" + pid);
    const courses = await db.collection("courses").where("status", "==", "published").get();
    console.log(`  ${courses.size} published courses`);
    for (const c of courses.docs) {
        const r = await migrateCourse(c.id);
        if ((r as any).skipped) console.log(`  - ${r.courseId}: SKIP (${(r as any).skipped})`);
        else console.log(`  ✓ ${r.courseId}: ${ (r as any).chapters } chapters · ${ (r as any).subtopics } subtopics → chapters subcollection`);
    }
    console.log("[fix-course-chapters] DONE");
    process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
