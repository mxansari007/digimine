/**
 * Seed the local Firebase emulator suite with a realistic dataset for
 * end-to-end testing.
 *
 * Run:
 *   1. Start emulators in one terminal:
 *        cd firebase && firebase emulators:start
 *   2. In another terminal, from the repo root:
 *        pnpm seed:emulators
 *      (Equivalent to: npx tsx scripts/seed-emulators.ts)
 *
 * What gets created (all passwords: Test1234!):
 *
 *   ── Accounts ──
 *   admin@test.com          super-admin
 *   teacher@test.com        teacher with one class + content + attempts
 *   institute@test.com      institute admin owning an institute + class
 *   student1@test.com  …  student5@test.com  students enrolled in classes
 *
 *   ── Persona accounts (one canonical example per feature state) ──
 *   rookie / explorer / active / streaker / lapsed / struggler / firsttry /
 *   sqlonly / polyglot / paid-pro / trial-pro / expired-pro / promo /
 *   community / rescue / course-active / multiclass / quiz-resume /
 *   test-resume / test-failed @test.com — see scripts/seed-student-scenarios.ts
 *   for what each one exercises. Final seed output prints the full table.
 *
 *   ── Structures ──
 *   teachers/{uid}             1 teacher doc with starter plan trial
 *   institutes/{instId}        1 institute with starter trial
 *   classes/{classA}           Owned by teacher@test.com, 5 students
 *   classes/{classB}           Owned by institute@test.com, 3 students
 *   quizzes (3)                Two assigned to classA, one to classB
 *   quizAttempts (mixed)       Spread across students to create real risk
 *                               variance — some pass, some fail, some idle.
 *
 * The script is idempotent: it deletes the auth users + Firestore docs it
 * owns before recreating them, so you can re-run it any time to reset state.
 */

/* eslint-disable no-console */

import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { seedStudentScenarios, printPersonaSummary } from "./seed-student-scenarios";

// ─── Emulator wiring ──────────────────────────────────────────────────
// The admin SDK auto-detects these env vars and routes all calls through
// the local emulator suite without any credential. We set them inside the
// script so the user doesn't have to remember.
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "localhost:9099";
process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "localhost:9199";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
const PASSWORD = "Test1234!";

if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
}
const auth = getAuth();
const db = getFirestore();

// ─── Account definitions ──────────────────────────────────────────────

type SeedAccount = {
    uid: string;
    email: string;
    displayName: string;
    firstName: string;
    lastName: string;
    role: "super_admin" | "teacher" | "institute_admin" | "customer" | null;
    phoneNumber?: string;
};

const ACCOUNTS: SeedAccount[] = [
    {
        uid: "seed-admin",
        email: "admin@test.com",
        displayName: "Super Admin",
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
    },
    {
        uid: "seed-teacher",
        email: "teacher@test.com",
        displayName: "Anita Verma",
        firstName: "Anita",
        lastName: "Verma",
        role: "teacher",
        phoneNumber: "+919876500001",
    },
    {
        uid: "seed-institute",
        email: "institute@test.com",
        displayName: "Rohan Kapoor",
        firstName: "Rohan",
        lastName: "Kapoor",
        role: "institute_admin",
        phoneNumber: "+919876500002",
    },
    // Two additional teachers attached to Rohan's institute so the
    // multi-subject class demo has more than one teacher to assign.
    {
        uid: "seed-teacher-vikram",
        email: "vikram@test.com",
        displayName: "Vikram Singh",
        firstName: "Vikram",
        lastName: "Singh",
        role: "teacher",
        phoneNumber: "+919876500011",
    },
    {
        uid: "seed-teacher-priya",
        email: "priya@test.com",
        displayName: "Priya Gupta",
        firstName: "Priya",
        lastName: "Gupta",
        role: "teacher",
        phoneNumber: "+919876500012",
    },
    ...[1, 2, 3, 4, 5].map((n) => ({
        uid: `seed-student-${n}`,
        email: `student${n}@test.com`,
        displayName: `Student ${n} Demo`,
        firstName: `Student${n}`,
        lastName: "Demo",
        role: "customer" as const,
        phoneNumber: `+9198765001${String(n).padStart(2, "0")}`,
    })),
];

const CLASS_A_ID = "seed-class-dsa";
const CLASS_B_ID = "seed-class-institute-frontend";
const INSTITUTE_ID = "seed-institute-001";
const QUIZ_IDS = ["seed-quiz-arrays", "seed-quiz-strings", "seed-quiz-react"];
const TEST_IDS = ["seed-test-dsa-mock-1", "seed-test-marketplace-aptitude"];
const CONTEST_IDS = ["seed-contest-weekly-1"];
const COURSE_IDS = ["seed-course-dsa-foundations"];

// ─── Utility ──────────────────────────────────────────────────────────

const now = () => Timestamp.now();
const minutesAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * 60_000);
const daysAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * 86_400_000);

async function deleteIfExists(collection: string, docId: string) {
    const ref = db.collection(collection).doc(docId);
    if ((await ref.get()).exists) await ref.delete();
}

async function deleteSubcollection(parent: FirebaseFirestore.DocumentReference, name: string) {
    const snap = await parent.collection(name).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
}

// ─── Auth user upsert ─────────────────────────────────────────────────

async function upsertAuthUser(a: SeedAccount): Promise<UserRecord> {
    // Delete first so password is always reset to the seed value.
    try {
        await auth.deleteUser(a.uid);
    } catch {
        /* not found — fine */
    }
    return auth.createUser({
        uid: a.uid,
        email: a.email,
        password: PASSWORD,
        emailVerified: true,
        displayName: a.displayName,
        ...(a.phoneNumber ? { phoneNumber: a.phoneNumber } : {}),
    });
}

async function writeUserDoc(a: SeedAccount) {
    await db
        .collection("users")
        .doc(a.uid)
        .set({
            email: a.email,
            displayName: a.displayName,
            firstName: a.firstName,
            lastName: a.lastName,
            role: a.role,
            phoneNumber: a.phoneNumber || null,
            createdAt: now(),
            updatedAt: now(),
            ...(a.phoneNumber ? { phoneVerifiedAt: now() } : {}),
        });
}

// ─── Domain entities ──────────────────────────────────────────────────

async function seedTeacherDoc(account: SeedAccount) {
    const trialEnd = Timestamp.fromMillis(Date.now() + 7 * 86_400_000);
    await db.collection("teachers").doc(account.uid).set({
        userId: account.uid,
        profile: {
            name: account.displayName,
            institute: "Demo Institute of Tech",
            phone: account.phoneNumber || "",
            bio: "Seeded teacher account for local testing.",
            avatarUrl: null,
            subjects: ["DSA", "Algorithms"],
        },
        inviteCode: "TEACH_SEEDDEMO",
        subscription: {
            // Legacy snake_case plan id (checkPlanLimits reads this).
            planId: "starter",
            // Camel-case plan code (teachingEntitlements + pricing UI read
            // this; without it the pricing page can't mark Current plan).
            planCode: "teacher-starter",
            status: "trial",
            startedAt: now(),
            expiresAt: trialEnd,
            gracePeriodEndsAt: null,
            autoRenew: false,
            planPrice: 50,
            cadence: "monthly",
        },
        stats: { totalStudents: 5, totalQuizzes: 2, totalTests: 0, totalContests: 0, totalCourses: 0 },
        isVerified: true,
        createdAt: now(),
        updatedAt: now(),
    });
}

async function seedInstitute(adminAccount: SeedAccount) {
    await deleteSubcollection(db.collection("institutes").doc(INSTITUTE_ID), "admins");
    await db.collection("institutes").doc(INSTITUTE_ID).set({
        name: "Seed Institute of Frontend",
        slug: "seed-institute-of-frontend",
        description: "Seeded institute for local testing.",
        ownerId: adminAccount.uid,
        ownerPhone: adminAccount.phoneNumber || "",
        contactEmail: "hello@seed-institute.test",
        contactPhone: adminAccount.phoneNumber || "",
        website: null,
        address: null,
        inviteCode: "INST_SEEDDEMO",
        branding: { logoUrl: null, primaryColor: null, tagline: null },
        subscription: {
            // "trial" wasn't a real plan id — fixed to point at an actual
            // doc in subscriptionPlans so the entitlements resolver and
            // pricing UI can match.
            planId: "institute-free",
            planCode: "institute-free",
            status: "trial",
            startedAt: now(),
            expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
            gracePeriodEndsAt: null,
            seats: 5,
            autoRenew: false,
            cadence: "monthly",
        },
        stats: { teacherCount: 1, activeTeacherCount: 1, classCount: 1, studentCount: 3 },
        trust: { ownerPhoneVerified: true, flagged: false, ipHashAtSignup: "seed" },
        isArchived: false,
        createdAt: now(),
        updatedAt: now(),
    });
    await db
        .collection("institutes")
        .doc(INSTITUTE_ID)
        .collection("admins")
        .doc(adminAccount.uid)
        .set({
            userId: adminAccount.uid,
            email: adminAccount.email,
            name: adminAccount.displayName,
            role: "owner",
            addedAt: now(),
            addedBy: adminAccount.uid,
        });
}

/**
 * Wires multiple seed teachers into the seed institute's `teachers`
 * subcollection as active members and creates one demo pending invite so
 * the bulk-claim flow has something to test against — the printed claim
 * URL lets you walk through the /claim/{token} page without first
 * running through the bulk-invite UI.
 *
 * Idempotent: deletes the existing roster before writing.
 */
async function seedInstituteRoster(opts: {
    instituteId: string;
    ownerId: string;
    activeTeachers: SeedAccount[];
    pendingInviteEmail: string;
}) {
    const rosterRef = db.collection("institutes").doc(opts.instituteId).collection("teachers");
    await deleteSubcollection(db.collection("institutes").doc(opts.instituteId), "teachers");

    // Link every active teacher into the institute roster as a separate row.
    for (const teacher of opts.activeTeachers) {
        await rosterRef.doc(teacher.uid).set({
            teacherId: teacher.uid,
            email: teacher.email,
            name: teacher.displayName,
            status: "active",
            invitedAt: daysAgo(30),
            invitedBy: opts.ownerId,
            joinedAt: daysAgo(30),
            removedAt: null,
            claimToken: null,
            claimTokenExpiresAt: null,
        });
        // Mirror the link on the teacher doc so guards + rules recognise it.
        await db
            .collection("teachers")
            .doc(teacher.uid)
            .set(
                { instituteId: opts.instituteId, updatedAt: now() },
                { merge: true }
            );
        console.log(`         ✓ ${teacher.displayName} linked as active member`);
    }

    // Demo pending invite with a deterministic claim token so the printed
    // URL is stable across re-seeds.
    const demoToken = "seed-claim-demo-token-1234567890abcdef";
    const demoEmail = opts.pendingInviteEmail.toLowerCase();
    await rosterRef.doc(`invite:${demoEmail}`).set({
        teacherId: `invite:${demoEmail}`,
        email: demoEmail,
        name: null,
        status: "invited",
        invitedAt: daysAgo(2),
        invitedBy: opts.ownerId,
        joinedAt: null,
        removedAt: null,
        claimToken: demoToken,
        claimTokenExpiresAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
    });

    console.log(`         ✓ Demo pending invite for ${demoEmail}`);
    console.log(`         → Claim URL: http://localhost:3000/claim/${demoToken}`);
}

/**
 * Seeds the multi-subject curriculum for an institute-owned class.
 * Demonstrates the design intent: one class section, multiple subjects,
 * each subject can be taught by a different teacher — AND the same
 * teacher can be assigned to more than one subject (Anita teaches both
 * HTML/CSS and React below).
 */
async function seedClassSubjects(opts: {
    classId: string;
    subjects: Array<{ name: string; teacher: SeedAccount }>;
}) {
    const classRef = db.collection("classes").doc(opts.classId);
    await deleteSubcollection(classRef, "subjects");

    const teacherIds = new Set<string>();
    for (let i = 0; i < opts.subjects.length; i += 1) {
        const { name, teacher } = opts.subjects[i];
        const subjectRef = classRef.collection("subjects").doc();
        await subjectRef.set({
            name,
            teacherId: teacher.uid,
            teacherName: teacher.displayName,
            teacherEmail: teacher.email,
            order: i + 1,
            createdAt: now(),
            updatedAt: now(),
            createdBy: "seed",
        });
        teacherIds.add(teacher.uid);

        // Add the classId to each teacher's denormalised "what classes do
        // I teach in" array — used by future cross-class teacher queries.
        await db
            .collection("teachers")
            .doc(teacher.uid)
            .set(
                {
                    teachingClassIds: FieldValue.arrayUnion(opts.classId),
                    updatedAt: now(),
                },
                { merge: true }
            );
        console.log(`         ✓ ${name.padEnd(14)} → ${teacher.displayName}`);
    }

    // Sync the denormalised class.teacherIds + subjectCount so the
    // institute classes page renders the right summary numbers without
    // a follow-up subjects load.
    await classRef.set(
        {
            teacherIds: Array.from(teacherIds),
            subjectCount: opts.subjects.length,
            updatedAt: now(),
        },
        { merge: true }
    );
}

async function seedClass(opts: {
    classId: string;
    teacherId: string;
    instituteId?: string;
    name: string;
    description: string;
    inviteCode: string;
    studentIds: string[];
}) {
    const classRef = db.collection("classes").doc(opts.classId);
    await deleteSubcollection(classRef, "students");
    await classRef.set({
        teacherId: opts.teacherId,
        ...(opts.instituteId ? { instituteId: opts.instituteId } : {}),
        name: opts.name,
        description: opts.description,
        inviteCode: opts.inviteCode,
        studentsCount: opts.studentIds.length,
        activeStudentsCount: opts.studentIds.length,
        isArchived: false,
        createdAt: now(),
        updatedAt: now(),
    });

    // Roster — must match the shape the real enrollment route writes
    // (apps/web/src/app/api/teacher/classes/[classId]/students/route.ts).
    // The single-student detail page does a `collectionGroup("students")`
    // query filtered by `studentId + teacherId`, so both fields MUST be
    // present on every membership doc; otherwise the page renders
    // "Student not in your classes". The seed missed teacherId/classId in
    // its first iteration — fixed here.
    const batch = db.batch();
    for (const sid of opts.studentIds) {
        const student = ACCOUNTS.find((a) => a.uid === sid);
        if (!student) continue;
        batch.set(classRef.collection("students").doc(sid), {
            classId: opts.classId,
            teacherId: opts.teacherId,
            studentId: sid,
            studentEmail: student.email,
            studentName: student.displayName,
            rollNumber: null,
            status: "active",
            enrolledAt: daysAgo(20),
            lastActiveAt: daysAgo(Math.floor(Math.random() * 7)),
            totalAttempts: 0,
        });
        // Denormalise on the student's user doc so other queries that join
        // through `users.classMemberships` / `enrolledTeacherIds` work.
        batch.set(
            db.collection("users").doc(sid),
            {
                enrolledTeacherIds: FieldValue.arrayUnion(opts.teacherId),
                classMemberships: FieldValue.arrayUnion({
                    classId: opts.classId,
                    teacherId: opts.teacherId,
                    status: "active",
                    joinedAt: daysAgo(20),
                }),
                updatedAt: now(),
            },
            { merge: true }
        );
    }
    await batch.commit();
}

async function seedQuiz(opts: {
    id: string;
    teacherId: string;
    title: string;
    category: string;
    classIds: string[];
    questions: Array<{ id: string; text: string; options: string[]; correctIndex: number; marks: number }>;
}) {
    const quizRef = db.collection("quizzes").doc(opts.id);
    await deleteSubcollection(quizRef, "questions");
    await quizRef.set({
        teacherId: opts.teacherId,
        slug: opts.id,
        title: opts.title,
        description: `Seeded quiz: ${opts.title}`,
        status: "published",
        visibility: "private",
        accessType: "free",
        classIds: opts.classIds,
        category: opts.category,
        difficulty: "medium",
        timeLimitMinutes: 15,
        totalQuestions: opts.questions.length,
        totalMarks: opts.questions.reduce((s, q) => s + q.marks, 0),
        passingPercentage: 40,
        shuffleQuestions: false,
        shuffleOptions: false,
        allowRetake: true,
        instantResults: true,
        createdAt: now(),
        updatedAt: now(),
    });
    const batch = db.batch();
    opts.questions.forEach((q, i) => {
        batch.set(quizRef.collection("questions").doc(q.id), {
            order: i,
            type: "mcq",
            text: q.text,
            options: q.options.map((label, idx) => ({
                id: `${q.id}-o${idx}`,
                text: label,
                isCorrect: idx === q.correctIndex,
            })),
            marks: q.marks,
            negativeMarks: 0,
        });
    });
    await batch.commit();
}

async function seedQuizAttempt(opts: {
    userId: string;
    quizId: string;
    quizTitle: string;
    category: string;
    percentage: number;
    daysAgoCompleted: number;
}) {
    const attemptId = `seed-${opts.quizId}-${opts.userId}`;
    const total = 5;
    const correct = Math.round((opts.percentage / 100) * total);
    const wrong = total - correct;
    const startedAt = Timestamp.fromMillis(
        Date.now() - opts.daysAgoCompleted * 86_400_000 - 12 * 60_000
    );
    const completedAt = Timestamp.fromMillis(Date.now() - opts.daysAgoCompleted * 86_400_000);
    await db
        .collection("quizAttempts")
        .doc(attemptId)
        .set({
            userId: opts.userId,
            quizId: opts.quizId,
            contentId: opts.quizId,
            contentTitle: opts.quizTitle,
            category: opts.category,
            status: "completed",
            percentage: opts.percentage,
            totalScore: correct,
            maxPossibleScore: total,
            correctAnswers: correct,
            wrongAnswers: wrong,
            unattempted: 0,
            durationSeconds: 60 * 10 + Math.floor(Math.random() * 300),
            startedAt,
            completedAt,
            createdAt: completedAt,
            updatedAt: completedAt,
            answers: [],
            sectionResults: [],
        });
}

// ─── Subscription plans (both legacy + new collections) ───────────────
// The full pricing seeds live in scripts/seed-subscription-plans.ts and
// scripts/seed-teacher-plans.ts. We mirror a slim, identical set here so a
// single `pnpm seed:emulators` run gets you everything — entitlements +
// checkPlanLimits + pricing pages — without remembering to run two more
// scripts. Doc shapes match what the readers expect (see the dedicated
// seed files for the canonical schema).

async function seedSubscriptionPlans() {
    // Legacy snake_case collection consumed by checkPlanLimits middleware.
    const legacyPlans = [
        { id: "free",        name: "Free",        priceINR: 0,    limits: { maxStudents: 30,  maxTests: 1,  maxQuizzes: 3,   maxContests: 0,  maxCourses: 1,  maxQuestions: 50,    pistonConcurrency: 1 }, features: ["community_support"] },
        { id: "starter",     name: "Starter",     priceINR: 499,  limits: { maxStudents: 50,  maxTests: 5,  maxQuizzes: 10,  maxContests: 2,  maxCourses: 2,  maxQuestions: 200,   pistonConcurrency: 2 }, features: ["email_support"] },
        { id: "pro",         name: "Pro",         priceINR: 1499, limits: { maxStudents: 300, maxTests: 20, maxQuizzes: 50,  maxContests: 10, maxCourses: 10, maxQuestions: 2000,  pistonConcurrency: 5 }, features: ["priority_email_support"] },
        { id: "growth",      name: "Growth",      priceINR: 2999, limits: { maxStudents: 800, maxTests: 50, maxQuizzes: 150, maxContests: 25, maxCourses: 25, maxQuestions: 5000,  pistonConcurrency: 6 }, features: ["priority_email_support", "chat_support"] },
        { id: "institution", name: "Institution", priceINR: 4999, limits: { maxStudents: -1,  maxTests: -1, maxQuizzes: -1,  maxContests: -1, maxCourses: -1, maxQuestions: 10000, pistonConcurrency: 8 }, features: ["chat_support", "call_support", "dedicated_piston_lane"] },
    ];
    for (const p of legacyPlans) {
        await db.collection("subscription_plans").doc(p.id).set({ ...p, updatedAt: now() });
    }

    // New camelCase collection consumed by the pricing pages + entitlements
    // resolver. Includes student-facing AND teacher/institute plans.
    const newPlans: Array<{
        id: string;
        code: string;
        name: string;
        tagline: string;
        roleScope: "student" | "teacher" | "institute";
        monthlyPriceINR: number;
        annualPriceINR: number | null;
        compareAtINR: number | null;
        isFree: boolean;
        recommended: boolean;
        badge: string | null;
        sortOrder: number;
        features: Record<string, boolean>;
        quotas: Record<string, number>;
        teachingFeatures: Record<string, boolean>;
        aiQuestionsPerDay: number | null;
        seatCap: number | null;
        highlights: string[];
    }> = [
        // Student plans
        { id: "student-free", code: "free", name: "Free", tagline: "Start practising for free.", roleScope: "student", monthlyPriceINR: 0, annualPriceINR: null, compareAtINR: null, isFree: true, recommended: false, badge: null, sortOrder: 0, features: {}, quotas: { practiceSubmissionsPerDay: 20, premiumProblemUnlocksPerMonth: 5 }, teachingFeatures: {}, aiQuestionsPerDay: null, seatCap: null, highlights: ["20 submissions / day", "5 premium problem unlocks / month", "Community support"] },
        { id: "student-pro",  code: "pro",  name: "Pro",  tagline: "Unlock all practice + mocks.", roleScope: "student", monthlyPriceINR: 299, annualPriceINR: 2990, compareAtINR: 399, isFree: false, recommended: true, badge: "Most popular", sortOrder: 10, features: { practice_premium: true, revision_radar: true, mock_tests: true, quizzes_premium: true, courses_premium: true, contests: true, downloads: true, ad_free: true, certificates: true }, quotas: { practiceSubmissionsPerDay: -1, premiumProblemUnlocksPerMonth: -1, mockTestsPerMonth: -1, premiumQuizzesPerMonth: -1, courseEnrollmentsActive: -1 }, teachingFeatures: {}, aiQuestionsPerDay: null, seatCap: null, highlights: ["Unlimited practice + premium problems", "Revision Radar (spaced repetition)", "All mocks, quizzes, courses", "Ad-free + downloadable resources"] },
        // Teacher plans (mirrors scripts/seed-teacher-plans.ts)
        { id: "teacher-free",    code: "teacher-free",    name: "Free",    tagline: "Start running classes today.",         roleScope: "teacher",   monthlyPriceINR: 0,    annualPriceINR: null,  compareAtINR: null, isFree: true,  recommended: false, badge: null,            sortOrder: 0,  features: {}, quotas: {}, teachingFeatures: {}, aiQuestionsPerDay: 0,    seatCap: null, highlights: ["Up to 3 classes, 30 students", "Authoring for quizzes/tests/contests/courses"] },
        { id: "teacher-starter", code: "teacher-starter", name: "Starter", tagline: "For the busy individual teacher.",     roleScope: "teacher",   monthlyPriceINR: 499,  annualPriceINR: 4990,  compareAtINR: 599,  isFree: false, recommended: false, badge: null,            sortOrder: 10, features: {}, quotas: {}, teachingFeatures: { question_bank_template_download: true, question_bank_markdown_import: true }, aiQuestionsPerDay: 0, seatCap: null, highlights: ["Up to 10 classes, 200 students", "Template download + bulk import", "Priority email support (48h SLA)"] },
        { id: "teacher-pro",     code: "teacher-pro",     name: "Pro",     tagline: "Unlock AI question drafting.",         roleScope: "teacher",   monthlyPriceINR: 1499, annualPriceINR: 14990, compareAtINR: 1799, isFree: false, recommended: true,  badge: "Most popular",  sortOrder: 20, features: {}, quotas: {}, teachingFeatures: { question_bank_template_download: true, question_bank_markdown_import: true, ai_question_generation: true }, aiQuestionsPerDay: 50, seatCap: null, highlights: ["Up to 25 classes, 1,000 students", "AI question generation — 50/day", "Priority chat support (24h SLA)"] },
        // Institute plans
        { id: "institute-free",   code: "institute-free",   name: "Free",   tagline: "Pilot the platform with a small team.",       roleScope: "institute", monthlyPriceINR: 0,    annualPriceINR: null,  compareAtINR: null, isFree: true,  recommended: false, badge: null,           sortOrder: 0,  features: {}, quotas: {}, teachingFeatures: {}, aiQuestionsPerDay: 0,   seatCap: 5,    highlights: ["Up to 5 teacher seats, 100 students", "Centralised quizzes + question bank"] },
        { id: "institute-growth", code: "institute-growth", name: "Growth", tagline: "For coaching centres scaling past 10 teachers.",roleScope: "institute", monthlyPriceINR: 2499, annualPriceINR: 24990, compareAtINR: 2999, isFree: false, recommended: false, badge: null,           sortOrder: 10, features: {}, quotas: {}, teachingFeatures: { question_bank_template_download: true, question_bank_markdown_import: true }, aiQuestionsPerDay: 0, seatCap: 20, highlights: ["Up to 20 teacher seats, 1,000 students", "Bulk teacher invites", "Email support (24h SLA)"] },
        { id: "institute-scale",  code: "institute-scale",  name: "Scale",  tagline: "For schools and institutes with many cohorts.", roleScope: "institute", monthlyPriceINR: 6999, annualPriceINR: 69990, compareAtINR: 8499, isFree: false, recommended: true,  badge: "Most popular", sortOrder: 20, features: {}, quotas: {}, teachingFeatures: { question_bank_template_download: true, question_bank_markdown_import: true, ai_question_generation: true }, aiQuestionsPerDay: 200, seatCap: null, highlights: ["Unlimited teacher seats + students", "AI question generation — 200/day pooled", "Priority phone support (4h SLA)"] },
    ];

    for (const p of newPlans) {
        const { id, ...rest } = p;
        await db.collection("subscriptionPlans").doc(id).set({
            ...rest,
            // priceINR mirrored to monthly for back-compat with older readers.
            priceINR: rest.monthlyPriceINR,
            interval: "monthly",
            isActive: true,
            createdAt: now(),
            updatedAt: now(),
        });
    }
}

// ─── User subscriptions ───────────────────────────────────────────────

async function seedUserSubscription(opts: {
    userId: string;
    planCode: string;
    status: "active" | "trialing" | "expired" | "cancelled" | "none";
    source: "paid" | "promo" | "grant" | "trial";
    expiresInDays: number | null;
    promoCode?: string | null;
}) {
    const expiresAt =
        opts.expiresInDays === null
            ? null
            : Timestamp.fromMillis(Date.now() + opts.expiresInDays * 86_400_000);
    await db.collection("userSubscriptions").doc(opts.userId).set({
        userId: opts.userId,
        planCode: opts.planCode,
        status: opts.status,
        source: opts.source,
        startedAt: daysAgo(opts.status === "expired" ? 60 : 5),
        expiresAt,
        autoRenew: opts.status === "active",
        promoCode: opts.promoCode || null,
        updatedAt: now(),
    });
}

// ─── Tests / Contests / Courses ───────────────────────────────────────

async function seedTest(opts: {
    id: string;
    teacherId: string;            // "" = admin-authored (catalog/public)
    title: string;
    description: string;
    classIds: string[];
    visibility: "private" | "published";
    accessType: "free" | "premium";
    price: number;
    compareAtPrice: number | null;
    category: string;
    tags: string[];
    sections: Array<{ name: string; totalQuestions: number; marksPerQuestion: number }>;
    durationMinutes: number;
}) {
    const totalQuestions = opts.sections.reduce((s, x) => s + x.totalQuestions, 0);
    const totalMarks = opts.sections.reduce((s, x) => s + x.totalQuestions * x.marksPerQuestion, 0);
    const ref = db.collection("tests").doc(opts.id);
    await deleteSubcollection(ref, "subtests");
    await deleteSubcollection(ref, "questions");
    await ref.set({
        slug: opts.id,
        title: opts.title,
        description: opts.description,
        shortDescription: opts.description.slice(0, 200),
        thumbnailURL: null,
        price: opts.price,
        compareAtPrice: opts.compareAtPrice,
        accessType: opts.accessType,
        category: opts.category,
        tags: opts.tags,
        highlights: opts.sections.map((s) => `${s.name}: ${s.totalQuestions} Qs`),
        totalTests: opts.sections.length,
        totalQuestions,
        totalMarks,
        duration: opts.durationMinutes,
        status: "published",
        visibility: opts.visibility,
        teacherId: opts.teacherId,
        classIds: opts.classIds,
        isDeleted: false,
        createdAt: now(),
        updatedAt: now(),
        createdBy: opts.teacherId || "seed-admin",
    });
    // Sub-tests (one per section) — minimal docs so the list page renders.
    for (let i = 0; i < opts.sections.length; i += 1) {
        const sec = opts.sections[i];
        await ref.collection("subtests").doc(`s${i + 1}`).set({
            order: i,
            name: sec.name,
            totalQuestions: sec.totalQuestions,
            marksPerQuestion: sec.marksPerQuestion,
            durationMinutes: Math.round(opts.durationMinutes / opts.sections.length),
            createdAt: now(),
        });
    }
}

async function seedContest(opts: {
    id: string;
    teacherId: string;
    title: string;
    description: string;
    classIds: string[];
    startsInMinutes: number;
    durationMinutes: number;
    totalQuestions: number;
    totalMarks: number;
}) {
    const startsAt = Timestamp.fromMillis(Date.now() + opts.startsInMinutes * 60_000);
    const endsAt = Timestamp.fromMillis(
        Date.now() + (opts.startsInMinutes + opts.durationMinutes) * 60_000
    );
    await db.collection("contests").doc(opts.id).set({
        slug: opts.id,
        teacherId: opts.teacherId,
        title: opts.title,
        description: opts.description,
        shortDescription: opts.description.slice(0, 200),
        accessType: "free",
        category: "Weekly",
        tags: ["contest", "weekly"],
        visibility: "private",
        status: "published",
        classIds: opts.classIds,
        startsAt,
        endsAt,
        durationMinutes: opts.durationMinutes,
        totalQuestions: opts.totalQuestions,
        totalMarks: opts.totalMarks,
        passingPercentage: 40,
        allowLateJoin: false,
        instantResults: false,
        leaderboardEnabled: true,
        isDeleted: false,
        createdAt: now(),
        updatedAt: now(),
        createdBy: opts.teacherId,
    });
}

async function seedCourse(opts: {
    id: string;
    teacherId: string;            // "" = admin-authored
    title: string;
    description: string;
    classIds: string[];
    visibility: "private" | "published";
    accessType: "free" | "premium";
    price: number;
    estimatedHours: number;
    difficulty: "beginner" | "intermediate" | "advanced";
    notesOutline: Array<{ moduleTitle: string; lessonTitles: string[] }>;
    linkedQuizzes: string[];
    linkedTestSeriesIds: string[];
}) {
    const totalLessons = opts.notesOutline.reduce((s, m) => s + m.lessonTitles.length, 0);
    await db.collection("courses").doc(opts.id).set({
        slug: opts.id,
        title: opts.title,
        description: opts.description,
        shortDescription: opts.description.slice(0, 200),
        thumbnailURL: null,
        price: opts.price,
        compareAtPrice: opts.price > 0 ? Math.round(opts.price * 1.5) : null,
        accessType: opts.accessType,
        category: "Programming",
        tags: ["course", opts.difficulty],
        difficulty: opts.difficulty,
        estimatedHours: opts.estimatedHours,
        totalModules: opts.notesOutline.length,
        totalLessons,
        notesOutline: opts.notesOutline,
        notesSummary: `${opts.notesOutline.length} modules · ${totalLessons} lessons.`,
        linkedTestSeriesIds: opts.linkedTestSeriesIds,
        linkedQuizzes: opts.linkedQuizzes,
        status: "published",
        visibility: opts.visibility,
        teacherId: opts.teacherId,
        classIds: opts.classIds,
        isDeleted: false,
        createdAt: now(),
        updatedAt: now(),
        createdBy: opts.teacherId || "seed-admin",
    });
}

// ─── Practice problems (import from JSON packs) ───────────────────────
// Pulls problems from the three seed/practice-problems*.json packs so the
// Practice module has real data after a single `pnpm seed:emulators` run.
// Idempotent: each slug is the doc id, so re-runs overwrite in place.

/**
 * Firestore forbids arrays-of-arrays, so a SQL problem's 2-D `expectedRows`
 * must be wrapped per row before writing. Mirrors `encodeSqlForStore` in
 * apps/web/src/lib/server/practice.ts — keep this in sync if that helper
 * ever evolves.
 */
function encodeSqlForStore(sql: any) {
    if (!sql) return null;
    const rows = Array.isArray(sql.expectedRows) ? sql.expectedRows : [];
    return {
        schemaSql: sql.schemaSql || "",
        solutionSql: sql.solutionSql || "",
        orderMatters: Boolean(sql.orderMatters),
        expectedColumns: Array.isArray(sql.expectedColumns) ? sql.expectedColumns : [],
        expectedRows: rows.map((r: any) => ({ cells: Array.isArray(r) ? r : [] })),
    };
}

async function seedPracticeProblems() {
    const seedDir = path.resolve(__dirname, "../seed");
    const packs = [
        "practice-problems.json",
        "practice-problems-pack-2.json",
        "practice-problems-pack-3.json",
    ];
    let total = 0;
    for (const file of packs) {
        const full = path.join(seedDir, file);
        let raw: string;
        try {
            raw = await fs.readFile(full, "utf8");
        } catch {
            console.log(`         · skipping ${file} (not found)`);
            continue;
        }
        const data = JSON.parse(raw) as { problems: Array<Record<string, any>> };
        for (const p of data.problems || []) {
            const slug = String(p.slug || `seed-problem-${total}`);
            // SQL problems carry a 2-D `expectedRows` array which Firestore
            // rejects — wrap each row as { cells: [...] } the same way the
            // admin import endpoint does.
            const payload: Record<string, any> = { ...p, slug };
            if (p.kind === "sql" && p.sql) {
                payload.sql = encodeSqlForStore(p.sql);
            }
            payload.createdAt = now();
            payload.updatedAt = now();
            payload.createdBy = "seed-admin";
            payload.isDeleted = false;
            await db.collection("practiceProblems").doc(slug).set(payload);
            total += 1;
        }
        console.log(`         · imported ${file}`);
    }
    console.log(`         ✓ ${total} practice problems seeded`);
}

async function seedPracticeAttempt(opts: {
    userId: string;
    problemSlug: string;
    verdict: "accepted" | "wrong_answer" | "tle";
    language: "python" | "javascript" | "cpp" | "java";
    daysAgo: number;
}) {
    const completedAt = Timestamp.fromMillis(Date.now() - opts.daysAgo * 86_400_000);
    const attemptId = `seed-pa-${opts.problemSlug}-${opts.userId}-${opts.daysAgo}`;
    await db.collection("practiceAttempts").doc(attemptId).set({
        userId: opts.userId,
        problemSlug: opts.problemSlug,
        language: opts.language,
        verdict: opts.verdict,
        passedSampleCount: opts.verdict === "accepted" ? 4 : 2,
        totalSampleCount: 4,
        durationMs: 250 + Math.floor(Math.random() * 1500),
        memoryKb: 4000 + Math.floor(Math.random() * 8000),
        submittedAt: completedAt,
        createdAt: completedAt,
    });
}

// ─── Drive the seed ───────────────────────────────────────────────────

async function main() {
    console.log(`[seed] Connecting to emulators on:`);
    console.log(`         Auth      → ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
    console.log(`         Firestore → ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log(`         Storage   → ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
    console.log(`         Project   → ${PROJECT_ID}`);

    // 1. Accounts (auth + users doc)
    console.log("\n[seed] Creating accounts…");
    for (const a of ACCOUNTS) {
        await upsertAuthUser(a);
        await writeUserDoc(a);
        console.log(`         ✓ ${a.email.padEnd(28)} role=${a.role}`);
    }

    // 2. Teacher
    const teacher = ACCOUNTS.find((a) => a.role === "teacher")!;
    const institute = ACCOUNTS.find((a) => a.role === "institute_admin")!;
    const students = ACCOUNTS.filter((a) => a.uid.startsWith("seed-student-"));

    console.log("\n[seed] Creating teacher doc + institute…");
    await seedTeacherDoc(teacher);
    await seedInstitute(institute);
    // Promote the institute user with instituteId on their user doc so the
    // institute layout guard finds them.
    await db
        .collection("users")
        .doc(institute.uid)
        .set({ instituteId: INSTITUTE_ID, updatedAt: now() }, { merge: true });

    // 2b. Institute roster — link Anita + Vikram + Priya into Rohan's
    //     institute as active members, AND seed one demo pending invite
    //     so the bulk-claim flow has something to test against without
    //     having to invite a new email first.
    const teacherVikram = ACCOUNTS.find((a) => a.uid === "seed-teacher-vikram")!;
    const teacherPriya = ACCOUNTS.find((a) => a.uid === "seed-teacher-priya")!;
    console.log("\n[seed] Linking teachers to institute + demo invite…");
    await seedInstituteRoster({
        instituteId: INSTITUTE_ID,
        ownerId: institute.uid,
        activeTeachers: [teacher, teacherVikram, teacherPriya],
        pendingInviteEmail: "pending-teacher@test.com",
    });

    // 3. Classes
    console.log("\n[seed] Creating classes…");
    await seedClass({
        classId: CLASS_A_ID,
        teacherId: teacher.uid,
        name: "DSA Mastery — Demo Batch",
        description: "Seeded class owned by teacher@test.com. All 5 students enrolled.",
        inviteCode: "DSA-DEMO",
        studentIds: students.map((s) => s.uid),
    });
    await seedClass({
        classId: CLASS_B_ID,
        teacherId: institute.uid,
        instituteId: INSTITUTE_ID,
        name: "Frontend Foundations — Demo Cohort",
        description: "Seeded institute class. First 3 students enrolled.",
        inviteCode: "FE-DEMO",
        studentIds: students.slice(0, 3).map((s) => s.uid),
    });
    console.log(`         ✓ ${CLASS_A_ID} (5 students)`);
    console.log(`         ✓ ${CLASS_B_ID} (3 students)`);

    // 3b. Subjects under the institute-owned class (Frontend Foundations).
    //     Demonstrates the multi-subject + multi-teacher pattern. Anita
    //     teaches TWO subjects here on purpose — the design supports a
    //     teacher covering multiple subjects in the same class.
    console.log("\n[seed] Adding subjects to institute class…");
    await seedClassSubjects({
        classId: CLASS_B_ID,
        subjects: [
            { name: "HTML / CSS",  teacher: teacher },        // Anita
            { name: "JavaScript",  teacher: teacherVikram },  // Vikram
            { name: "React",       teacher: teacher },        // Anita (2nd subject)
            { name: "Node.js",     teacher: teacherPriya },   // Priya
        ],
    });

    // 4. Quizzes
    console.log("\n[seed] Creating quizzes…");
    const arrayQuestions = [
        { id: "q1", text: "What is the time complexity of accessing an array element by index?", options: ["O(1)", "O(n)", "O(log n)", "O(n²)"], correctIndex: 0, marks: 1 },
        { id: "q2", text: "Which method adds an element to the end of an array in JS?", options: ["shift", "unshift", "push", "pop"], correctIndex: 2, marks: 1 },
        { id: "q3", text: "What does .map() return?", options: ["The original array", "A new array", "undefined", "A number"], correctIndex: 1, marks: 1 },
        { id: "q4", text: "Which is NOT a way to copy an array?", options: ["[...arr]", "arr.slice()", "Array.from(arr)", "arr.copy()"], correctIndex: 3, marks: 1 },
        { id: "q5", text: "What does Array.isArray([]) return?", options: ["true", "false", "undefined", "throws"], correctIndex: 0, marks: 1 },
    ];
    const stringQuestions = [
        { id: "q1", text: "What does 'abc'.length return?", options: ["2", "3", "4", "undefined"], correctIndex: 1, marks: 1 },
        { id: "q2", text: "Which method makes a string uppercase?", options: ["toUpper()", "upperCase()", "toUpperCase()", "upper()"], correctIndex: 2, marks: 1 },
        { id: "q3", text: "How do you split 'a,b,c' into an array?", options: ["'a,b,c'.split(',')", "'a,b,c'.cut(',')", "'a,b,c'.array()", "split('a,b,c')"], correctIndex: 0, marks: 1 },
        { id: "q4", text: "Is string concatenation done with…?", options: ["·", "+", "&", "."], correctIndex: 1, marks: 1 },
        { id: "q5", text: "Which is a template literal?", options: ["\"hi\"", "'hi'", "`hi ${name}`", "<hi>"], correctIndex: 2, marks: 1 },
    ];
    const reactQuestions = [
        { id: "q1", text: "What does useState return?", options: ["A function", "An array", "An object", "A string"], correctIndex: 1, marks: 1 },
        { id: "q2", text: "Which hook runs after every render?", options: ["useState", "useEffect", "useRef", "useMemo"], correctIndex: 1, marks: 1 },
        { id: "q3", text: "What does JSX compile to?", options: ["HTML", "React.createElement calls", "Vue templates", "SVG"], correctIndex: 1, marks: 1 },
        { id: "q4", text: "Props are…?", options: ["Mutable", "Immutable", "Functions only", "Async"], correctIndex: 1, marks: 1 },
        { id: "q5", text: "Which key prop is correct on a list?", options: ["index", "stable unique id", "Math.random()", "name"], correctIndex: 1, marks: 1 },
    ];

    await seedQuiz({
        id: QUIZ_IDS[0],
        teacherId: teacher.uid,
        title: "Arrays Basics",
        category: "Arrays",
        classIds: [CLASS_A_ID],
        questions: arrayQuestions,
    });
    await seedQuiz({
        id: QUIZ_IDS[1],
        teacherId: teacher.uid,
        title: "String Manipulation",
        category: "Strings",
        classIds: [CLASS_A_ID],
        questions: stringQuestions,
    });
    await seedQuiz({
        id: QUIZ_IDS[2],
        teacherId: institute.uid,
        title: "React Fundamentals",
        category: "React",
        classIds: [CLASS_B_ID],
        questions: reactQuestions,
    });
    QUIZ_IDS.forEach((id) => console.log(`         ✓ ${id}`));

    // 5. Attempts — spread to create realistic risk variance
    //    Student 1: top performer (high scores, recent activity)
    //    Student 2: average performer
    //    Student 3: struggling (low scores, declining trend)
    //    Student 4: ghost (one early attempt, then inactive)
    //    Student 5: never attempted
    console.log("\n[seed] Creating quiz attempts (variance for risk scoring)…");
    const attemptPlan: Array<[number, string, number, number]> = [
        // [studentN, quizId, percentage, daysAgoCompleted]
        // Student 1 — top performer
        [1, QUIZ_IDS[0], 90, 6],
        [1, QUIZ_IDS[1], 85, 3],
        [1, QUIZ_IDS[0], 95, 1],
        // Student 2 — average
        [2, QUIZ_IDS[0], 62, 8],
        [2, QUIZ_IDS[1], 58, 4],
        // Student 3 — struggling, declining
        [3, QUIZ_IDS[0], 45, 14],
        [3, QUIZ_IDS[1], 30, 9],
        [3, QUIZ_IDS[0], 22, 2],
        // Student 4 — ghost
        [4, QUIZ_IDS[0], 50, 28],
        // Student 5 — no attempts
        // (also seed institute-class attempts for the first 3 students)
        [1, QUIZ_IDS[2], 80, 5],
        [2, QUIZ_IDS[2], 55, 7],
        [3, QUIZ_IDS[2], 35, 11],
    ];
    for (const [n, quizId, pct, days] of attemptPlan) {
        const title =
            quizId === QUIZ_IDS[0]
                ? "Arrays Basics"
                : quizId === QUIZ_IDS[1]
                  ? "String Manipulation"
                  : "React Fundamentals";
        const category =
            quizId === QUIZ_IDS[0] ? "Arrays" : quizId === QUIZ_IDS[1] ? "Strings" : "React";
        await seedQuizAttempt({
            userId: `seed-student-${n}`,
            quizId,
            quizTitle: title,
            category,
            percentage: pct,
            daysAgoCompleted: days,
        });
        console.log(`         ✓ student${n} → ${quizId} (${pct}%, ${days}d ago)`);
    }

    // 6. App config — disable subscription enforcement for testing
    await db.collection("appConfig").doc("subscription").set(
        {
            enforced: false,
            updatedAt: now(),
            updatedBy: "seed-admin",
        },
        { merge: true }
    );

    // 7. Subscription plan docs (both legacy + new collections) so a single
    //    seed run also covers /pricing, /membership, and checkPlanLimits.
    console.log("\n[seed] Seeding subscription plans (subscription_plans + subscriptionPlans)…");
    await seedSubscriptionPlans();
    console.log(`         ✓ 5 legacy plans, 8 new plans (student / teacher / institute)`);

    // 8. User subscriptions — one active paid, one trialing, one expired.
    //    Gives the entitlements resolver real records to work against.
    console.log("\n[seed] Seeding userSubscriptions…");
    await seedUserSubscription({
        userId: "seed-student-1",
        planCode: "pro",
        status: "active",
        source: "paid",
        expiresInDays: 25,
    });
    await seedUserSubscription({
        userId: "seed-student-2",
        planCode: "pro",
        status: "trialing",
        source: "trial",
        expiresInDays: 7,
    });
    await seedUserSubscription({
        userId: "seed-student-4",
        planCode: "pro",
        status: "expired",
        source: "paid",
        expiresInDays: -10,
    });
    console.log(`         ✓ student1 active · student2 trialing · student4 expired`);

    // 9. Tests — one classroom (teacher-owned, private) + one marketplace
    //    catalog test (admin-authored, public).
    console.log("\n[seed] Seeding tests…");
    await seedTest({
        id: TEST_IDS[0],
        teacherId: teacher.uid,
        title: "DSA Mock — Set 1",
        description: "Three-section mock series covering arrays, strings, and basic DP. Built for Class A.",
        classIds: [CLASS_A_ID],
        visibility: "private",
        accessType: "free",
        price: 0,
        compareAtPrice: null,
        category: "DSA",
        tags: ["mock", "dsa", "arrays"],
        sections: [
            { name: "Arrays",  totalQuestions: 10, marksPerQuestion: 2 },
            { name: "Strings", totalQuestions: 10, marksPerQuestion: 2 },
            { name: "DP",      totalQuestions:  5, marksPerQuestion: 4 },
        ],
        durationMinutes: 60,
    });
    await seedTest({
        id: TEST_IDS[1],
        teacherId: "",
        title: "Aptitude — Public Sample",
        description: "Free public aptitude sample so the marketplace catalog has visible content. Quant + Verbal.",
        classIds: [],
        visibility: "published",
        accessType: "free",
        price: 0,
        compareAtPrice: null,
        category: "Aptitude",
        tags: ["catalog", "aptitude"],
        sections: [
            { name: "Quant",  totalQuestions: 20, marksPerQuestion: 1 },
            { name: "Verbal", totalQuestions: 15, marksPerQuestion: 1 },
        ],
        durationMinutes: 45,
    });
    console.log(`         ✓ ${TEST_IDS[0]} (classroom) · ${TEST_IDS[1]} (catalog)`);

    // 10. Contest — one upcoming weekly contest in Class A.
    console.log("\n[seed] Seeding contests…");
    await seedContest({
        id: CONTEST_IDS[0],
        teacherId: teacher.uid,
        title: "DSA Weekly — Week 1",
        description: "Live weekly contest for Class A. 5 questions, 60 minutes, leaderboard at the end.",
        classIds: [CLASS_A_ID],
        startsInMinutes: 60 * 24,    // tomorrow
        durationMinutes: 60,
        totalQuestions: 5,
        totalMarks: 50,
    });
    console.log(`         ✓ ${CONTEST_IDS[0]} (starts in 24h)`);

    // 11. Course — DSA Foundations with a notes outline, wired to the test
    //     above and the existing arrays quiz so the linkage pages have data.
    console.log("\n[seed] Seeding courses…");
    await seedCourse({
        id: COURSE_IDS[0],
        teacherId: teacher.uid,
        title: "DSA Foundations — Class A",
        description: "Five-module foundations course for Class A. Maps to the DSA Mock Set 1 test and the Arrays quiz.",
        classIds: [CLASS_A_ID],
        visibility: "private",
        accessType: "free",
        price: 0,
        estimatedHours: 12,
        difficulty: "beginner",
        notesOutline: [
            { moduleTitle: "Arrays + Hashing", lessonTitles: ["Reading arrays", "Hash sets", "Hash maps", "Two-pass patterns"] },
            { moduleTitle: "Two Pointers",     lessonTitles: ["Symmetric pointers", "Window-style pointers"] },
            { moduleTitle: "Sliding Window",   lessonTitles: ["Fixed-size windows", "Variable-size windows"] },
            { moduleTitle: "Stacks",           lessonTitles: ["Bracket matching", "Monotonic stack intro"] },
            { moduleTitle: "Intro DP",         lessonTitles: ["Climbing stairs", "Kadane"] },
        ],
        linkedQuizzes: [QUIZ_IDS[0]],
        linkedTestSeriesIds: [TEST_IDS[0]],
    });
    console.log(`         ✓ ${COURSE_IDS[0]}`);

    // 12. Practice problems — import from the three seed/ packs so the
    //     Practice module has real data on first run.
    console.log("\n[seed] Seeding practice problems…");
    await seedPracticeProblems();

    // 13. A few practice attempts to give analytics + Revision Radar
    //     something to render.
    console.log("\n[seed] Seeding practice attempts…");
    const paPlan: Array<{ studentN: number; slug: string; verdict: "accepted" | "wrong_answer" | "tle"; lang: "python" | "javascript" | "cpp" | "java"; daysAgo: number }> = [
        { studentN: 1, slug: "sum-of-an-array",          verdict: "accepted",     lang: "python",     daysAgo: 4 },
        { studentN: 1, slug: "valid-parentheses",        verdict: "accepted",     lang: "javascript", daysAgo: 2 },
        { studentN: 2, slug: "sum-of-an-array",          verdict: "wrong_answer", lang: "python",     daysAgo: 6 },
        { studentN: 2, slug: "sum-of-an-array",          verdict: "accepted",     lang: "python",     daysAgo: 5 },
        { studentN: 3, slug: "contains-duplicate",       verdict: "tle",          lang: "python",     daysAgo: 8 },
        { studentN: 1, slug: "merge-intervals",          verdict: "accepted",     lang: "cpp",        daysAgo: 1 },
    ];
    for (const a of paPlan) {
        await seedPracticeAttempt({
            userId: `seed-student-${a.studentN}`,
            problemSlug: a.slug,
            verdict: a.verdict,
            language: a.lang,
            daysAgo: a.daysAgo,
        });
        console.log(`         ✓ student${a.studentN} → ${a.slug} (${a.verdict})`);
    }

    // 14. Comprehensive student persona scenarios — ~20 accounts, each one
    //     a canonical example of a specific feature state (rookie / streaker
    //     / lapsed / paid-pro / community / rescue / multiclass / etc.).
    //     Lives in scripts/seed-student-scenarios.ts.
    await seedStudentScenarios({
        auth,
        db,
        teacherId: teacher.uid,
        quizId: QUIZ_IDS[0],
        quizTitle: "Arrays Basics",
        quizCategory: "Arrays",
        testSeriesId: TEST_IDS[0],
        testSubtestId: "s1",
        testTitle: "DSA Mock — Set 1 · Section 1",
        testDurationMinutes: 60,
        courseId: COURSE_IDS[0],
        classA: { classId: CLASS_A_ID, teacherId: teacher.uid },
        classB: { classId: CLASS_B_ID, teacherId: institute.uid },
    });

    console.log("\n[seed] ✓ Done.");
    console.log("\nLog in with any of these accounts (password is the same for all):");
    console.log("─────────────────────────────────────────────────────────────");
    for (const a of ACCOUNTS) {
        console.log(`  ${a.email.padEnd(28)} ${a.role?.padEnd(16)} password: ${PASSWORD}`);
    }
    console.log("─────────────────────────────────────────────────────────────");
    console.log(`\n  Class A invite code: DSA-DEMO  (5 students, teacher-owned)`);
    console.log(`  Class B invite code: FE-DEMO   (3 students, institute-owned)`);
    console.log(`    Subjects:  HTML/CSS → Anita · JavaScript → Vikram`);
    console.log(`               React    → Anita · Node.js    → Priya`);
    console.log(`               (Anita teaches 2 subjects in the same class)`);
    console.log(`\n  Content seeded for Class A (teacher-owned):`);
    console.log(`    Quizzes:   Arrays Basics · String Manipulation`);
    console.log(`    Test:      DSA Mock — Set 1 (3 sections, 25 Qs, 60min)`);
    console.log(`    Contest:   DSA Weekly — Week 1 (starts in 24h)`);
    console.log(`    Course:    DSA Foundations (5 modules, linked to test + quiz)`);
    console.log(`\n  Public catalog:  Aptitude — Public Sample (visible to anonymous users)`);
    console.log(`\n  User subscriptions:  student1 active(pro) · student2 trialing(pro) · student4 expired(pro)`);

    printPersonaSummary();

    console.log(`\n  Emulator UI: http://localhost:4000`);

    for (const a of getApps()) await deleteApp(a);
    process.exit(0);
}

main().catch((err) => {
    console.error("\n[seed] FAILED:", err);
    process.exit(1);
});
