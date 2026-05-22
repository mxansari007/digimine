/**
 * Migrate from one-class-per-teacher to many-classes-per-teacher.
 *
 * For every teacher that has any students under `teacher_enrollments/{teacherId}`,
 * this creates a default class doc, copies the roster into the class's
 * `students` subcollection, tags the teacher's existing content with the
 * new classId, and denormalizes `enrolledTeacherIds` onto each student's
 * user doc (so Firestore rules can check class enrollment without a deep
 * collection-group query).
 *
 * Idempotent: re-running skips teachers that already have a class.
 *
 * Run with the same env vars as `seed-subscription-plans.ts`:
 *   node --loader ts-node/esm scripts/migrate-teacher-classes.ts
 *   # or
 *   npx ts-node scripts/migrate-teacher-classes.ts
 *
 * Add `--dry-run` to preview the changes without writing.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

require("dotenv").config({ path: ".env" });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!clientEmail || !privateKey) {
    console.error("ERROR: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in .env");
    process.exit(1);
}

if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();
const dryRun = process.argv.includes("--dry-run");

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_PREFIX = "CLS-";

function generateInviteCode(): string {
    let code = INVITE_PREFIX;
    for (let i = 0; i < 8; i++) {
        code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
    }
    return code;
}

async function allocateInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInviteCode();
        const existing = await db
            .collection("classes")
            .where("inviteCode", "==", code)
            .limit(1)
            .get();
        if (existing.empty) return code;
    }
    return `${INVITE_PREFIX}${Date.now().toString(36).toUpperCase()}`;
}

async function migrateOneTeacher(teacherDoc: FirebaseFirestore.QueryDocumentSnapshot) {
    const teacherId = teacherDoc.id;
    const teacherData = teacherDoc.data() || {};
    const displayName =
        teacherData.profile?.name ||
        teacherData.name ||
        teacherData.displayName ||
        "Default Class";

    // Skip if teacher already has at least one class — assume migrated.
    const existingClassesSnap = await db
        .collection("classes")
        .where("teacherId", "==", teacherId)
        .limit(1)
        .get();
    if (!existingClassesSnap.empty) {
        console.log(`  ↳ teacher ${teacherId} already has a class. Skipping.`);
        return { skipped: true, teacherId };
    }

    const enrollmentsSnap = await db
        .collection("teacher_enrollments")
        .doc(teacherId)
        .collection("students")
        .get();

    // Inherit the legacy teacher invite code if present; otherwise mint a new one.
    const legacyInvite =
        typeof teacherData.inviteCode === "string" && teacherData.inviteCode
            ? teacherData.inviteCode
            : null;
    const inviteCode = legacyInvite || (await allocateInviteCode());

    const classRef = db.collection("classes").doc();
    const classId = classRef.id;
    const now = Timestamp.now();

    const studentDocs = enrollmentsSnap.docs;
    const activeCount = studentDocs.filter((d) => d.data().status === "active").length;

    if (dryRun) {
        console.log(
            `  ↳ DRY: would create class "${displayName}" for teacher ${teacherId} (${studentDocs.length} students, ${activeCount} active, invite=${inviteCode})`
        );
    } else {
        await classRef.set({
            teacherId,
            name: `${displayName}'s Class`,
            description: null,
            inviteCode,
            studentsCount: studentDocs.length,
            activeStudentsCount: activeCount,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
        });
    }

    // Copy roster.
    let copied = 0;
    let updatedUsers = 0;
    for (const studentDoc of studentDocs) {
        const data = studentDoc.data();
        const studentId = data.studentId || studentDoc.id;
        if (!studentId) continue;
        const newRef = classRef.collection("students").doc(studentId);
        const newData = {
            classId,
            teacherId,
            studentId,
            studentEmail: data.studentEmail || "",
            studentName: data.studentName || data.studentEmail || "Student",
            rollNumber: data.rollNumber || null,
            enrolledAt: data.enrolledAt || now,
            status: data.status || "active",
            totalAttempts: data.totalAttempts || 0,
            lastActiveAt: data.lastActiveAt || null,
        };
        if (!dryRun) {
            await newRef.set(newData);
            // Denormalize on user doc so rules can fast-check enrollment.
            if (data.status === "active") {
                await db
                    .collection("users")
                    .doc(studentId)
                    .set(
                        {
                            enrolledTeacherIds: FieldValue.arrayUnion(teacherId),
                            classMemberships: FieldValue.arrayUnion({
                                classId,
                                teacherId,
                                status: "active",
                                joinedAt: data.enrolledAt || now,
                            }),
                            updatedAt: now,
                        },
                        { merge: true }
                    );
                updatedUsers++;
            }
        }
        copied++;
    }

    // Tag the teacher's existing content with this classId.
    const collections = ["quizzes", "tests", "courses", "contests"] as const;
    let contentTagged = 0;
    for (const col of collections) {
        const contentSnap = await db.collection(col).where("teacherId", "==", teacherId).get();
        for (const doc of contentSnap.docs) {
            const existingClassIds: string[] = Array.isArray(doc.data().classIds)
                ? doc.data().classIds
                : [];
            if (existingClassIds.includes(classId)) continue;
            const next = [...existingClassIds, classId];
            if (!dryRun) {
                await doc.ref.update({ classIds: next, updatedAt: now });
            }
            contentTagged++;
        }
    }

    console.log(
        `  ↳ teacher ${teacherId}: class=${classId}, students copied=${copied} (active=${activeCount}, users updated=${updatedUsers}), content tagged=${contentTagged}`
    );
    return { skipped: false, teacherId, classId, copied, contentTagged };
}

async function main() {
    console.log(dryRun ? "Running migration in DRY RUN mode" : "Running migration (writes enabled)");

    // Migration walks the `teachers` collection to make sure every teacher
    // gets a default class, not just ones with current enrollments.
    const teachersSnap = await db.collection("teachers").get();
    if (teachersSnap.empty) {
        console.log("No teacher docs found. Nothing to migrate.");
        return;
    }

    console.log(`Found ${teachersSnap.size} teachers. Migrating...`);
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    for (const teacherDoc of teachersSnap.docs) {
        try {
            const result = await migrateOneTeacher(teacherDoc);
            if (result.skipped) skipped++;
            else migrated++;
        } catch (err) {
            console.error(`  ✗ teacher ${teacherDoc.id} failed:`, err);
            failed++;
        }
    }

    console.log("");
    console.log(`Done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
    if (dryRun) {
        console.log("(dry run — no writes were made)");
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Migration failed:", err);
        process.exit(1);
    });
