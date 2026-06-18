/* eslint-disable no-console */
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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

const now = () => Timestamp.now();
const daysAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * 86_400_000);

const TEACHER = {
    uid: "seed-standalone-teacher",
    email: "standalone-teacher@test.com",
    displayName: "Rahul Sharma",
    firstName: "Rahul",
    lastName: "Sharma",
    role: "teacher" as const,
    phoneNumber: "+919876500020",
};

const CLASS_ID = "seed-class-standalone";

async function seedStandaloneTeacher() {
    console.log("[seed-standalone-teacher] Creating standalone teacher account…");

    // Auth user
    try {
        await auth.deleteUser(TEACHER.uid);
    } catch {
        /* not found — fine */
    }
    await auth.createUser({
        uid: TEACHER.uid,
        email: TEACHER.email,
        password: PASSWORD,
        emailVerified: true,
        displayName: TEACHER.displayName,
        phoneNumber: TEACHER.phoneNumber,
    });

    // Users doc
    await db.collection("users").doc(TEACHER.uid).set({
        email: TEACHER.email,
        displayName: TEACHER.displayName,
        firstName: TEACHER.firstName,
        lastName: TEACHER.lastName,
        role: TEACHER.role,
        phoneNumber: TEACHER.phoneNumber,
        createdAt: now(),
        updatedAt: now(),
        phoneVerifiedAt: now(),
    });

    // Teachers doc — no instituteId
    const trialEnd = Timestamp.fromMillis(Date.now() + 7 * 86_400_000);
    await db.collection("teachers").doc(TEACHER.uid).set({
        userId: TEACHER.uid,
        profile: {
            name: TEACHER.displayName,
            institute: "",
            phone: TEACHER.phoneNumber,
            bio: "Standalone teacher who signed up directly without an institute.",
            avatarUrl: null,
            subjects: ["DSA", "Algorithms", "System Design"],
        },
        inviteCode: "TEACH_STANDALONE",
        subscription: {
            planId: "starter",
            planCode: "teacher-starter",
            status: "trial",
            startedAt: now(),
            expiresAt: trialEnd,
            gracePeriodEndsAt: null,
            autoRenew: false,
            planPrice: 50,
            cadence: "monthly",
        },
        stats: { totalStudents: 2, totalQuizzes: 0, totalTests: 0, totalContests: 0, totalCourses: 0 },
        isVerified: true,
        createdAt: now(),
        updatedAt: now(),
    });

    // Standalone class with a couple of students
    const studentIds = ["seed-student-1", "seed-student-2"];
    const classRef = db.collection("classes").doc(CLASS_ID);
    await classRef.set({
        teacherId: TEACHER.uid,
        name: "Rahul's DSA Batch — Standalone",
        description: "Class owned by a standalone teacher (no institute).",
        inviteCode: "RAHUL-DSA",
        studentsCount: studentIds.length,
        activeStudentsCount: studentIds.length,
        isArchived: false,
        createdAt: now(),
        updatedAt: now(),
    });

    const batch = db.batch();
    for (const sid of studentIds) {
        const studentSnap = await db.collection("users").doc(sid).get();
        const student = studentSnap.data();
        if (!student) continue;
        batch.set(classRef.collection("students").doc(sid), {
            classId: CLASS_ID,
            teacherId: TEACHER.uid,
            studentId: sid,
            studentEmail: student.email,
            studentName: student.displayName,
            rollNumber: null,
            status: "active",
            enrolledAt: daysAgo(10),
            lastActiveAt: daysAgo(2),
            totalAttempts: 0,
        });
        batch.set(
            db.collection("users").doc(sid),
            {
                enrolledTeacherIds: [TEACHER.uid],
                classMemberships: [
                    {
                        classId: CLASS_ID,
                        teacherId: TEACHER.uid,
                        status: "active",
                        joinedAt: daysAgo(10),
                    },
                ],
                updatedAt: now(),
            },
            { merge: true }
        );
    }
    await batch.commit();

    console.log("✓ Standalone teacher seeded:");
    console.log(`  Email:    ${TEACHER.email}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  Name:     ${TEACHER.displayName}`);
    console.log(`  Class:    ${CLASS_ID} (invite code: RAHUL-DSA)`);
    console.log(`  Note:     No instituteId — this teacher signed up independently.`);

    for (const a of getApps()) await deleteApp(a);
    process.exit(0);
}

seedStandaloneTeacher().catch((err) => {
    console.error("\n[seed-standalone-teacher] FAILED:", err);
    process.exit(1);
});
