/**
 * Seed ONE test login per subscription plan into the live project so each tier
 * can be exercised end-to-end. Idempotent — re-running deletes + recreates the
 * auth users (so the password always resets) and overwrites their docs.
 *
 * Creates, per plan:
 *   - an Auth user (email + PASSWORD, emailVerified) with a deterministic uid
 *   - users/{uid}  (role + onboardingStep:"complete" so it lands on the dash)
 *   - the role-specific subscription:
 *       student   → userSubscriptions/{uid}.planCode
 *       teacher   → teachers/{uid}.subscription.{planCode,planId}
 *       institute → institutes/{id}.subscription + institutes/{id}/admins/{uid}
 *
 * Run against PROD (emulator hosts cleared):
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= FIREBASE_STORAGE_EMULATOR_HOST= \
 *     pnpm tsx scripts/seed-test-users.ts
 *
 * Clean up later: re-run with `DELETE_ONLY=1` to remove just these test users.
 */
import path from "path";
require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env") });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

const PASSWORD = "Test1234!";
const EMAIL_DOMAIN = "digimine.test";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";

if (!getApps().length) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (clientEmail && privateKey) {
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } else {
        throw new Error("Missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in apps/web/.env.local");
    }
}
const auth = getAuth();
const db = getFirestore();
const now = () => Timestamp.now();
const inDays = (d: number) => Timestamp.fromMillis(Date.now() + d * 86_400_000);

type Role = "customer" | "teacher" | "institute_admin";
interface TestAccount {
    key: string;          // stable suffix used for uid/email/slug
    role: Role;
    name: string;
    planCode: string;     // subscriptionPlans doc id
    planId?: string;      // legacy short id (teacher/institute checkPlanLimits)
    seats?: number | null;
}

const ACCOUNTS: TestAccount[] = [
    { key: "student-free", role: "customer", name: "Test Student Free", planCode: "free" },
    { key: "student-pro", role: "customer", name: "Test Student Pro", planCode: "pro" },
    { key: "teacher-free", role: "teacher", name: "Test Teacher Free", planCode: "teacher-free", planId: "free" },
    { key: "teacher-starter", role: "teacher", name: "Test Teacher Starter", planCode: "teacher-starter", planId: "starter" },
    { key: "teacher-pro", role: "teacher", name: "Test Teacher Pro", planCode: "teacher-pro", planId: "pro" },
    { key: "institute-free", role: "institute_admin", name: "Test Institute Free", planCode: "institute-free", planId: "institute-free", seats: 5 },
    { key: "institute-growth", role: "institute_admin", name: "Test Institute Growth", planCode: "institute-growth", planId: "institute-growth", seats: 20 },
    { key: "institute-scale", role: "institute_admin", name: "Test Institute Scale", planCode: "institute-scale", planId: "institute-scale", seats: null },
];

const uidFor = (key: string) => `test-${key}`;
const emailFor = (key: string) => `test-${key}@${EMAIL_DOMAIN}`;
const instIdFor = (key: string) => `test-inst-${key}`;

async function deleteAccount(a: TestAccount) {
    const uid = uidFor(a.key);
    try { await auth.deleteUser(uid); } catch { /* not found */ }
    await db.collection("users").doc(uid).delete().catch(() => {});
    await db.collection("userSubscriptions").doc(uid).delete().catch(() => {});
    await db.collection("teachers").doc(uid).delete().catch(() => {});
    if (a.role === "institute_admin") {
        const instId = instIdFor(a.key);
        await db.collection("institutes").doc(instId).collection("admins").doc(uid).delete().catch(() => {});
        await db.collection("institutes").doc(instId).delete().catch(() => {});
    }
}

async function createAccount(a: TestAccount) {
    const uid = uidFor(a.key);
    const email = emailFor(a.key);
    const [firstName, ...rest] = a.name.split(" ");
    const lastName = rest.join(" ") || "Account";

    // 1. Auth user (delete-then-create so the password always resets).
    try { await auth.deleteUser(uid); } catch { /* not found */ }
    await auth.createUser({ uid, email, password: PASSWORD, emailVerified: true, displayName: a.name });

    // 2. users/{uid} — role + completed onboarding so it lands on the dashboard.
    await db.collection("users").doc(uid).set({
        email,
        displayName: a.name,
        firstName,
        lastName,
        role: a.role,
        onboardingStep: "complete",
        phoneNumber: a.role === "customer" ? null : "+910000000000",
        phoneVerifiedAt: a.role === "customer" ? null : now(),
        createdAt: now(),
        updatedAt: now(),
    });

    // 3. role-specific subscription
    if (a.role === "customer") {
        await db.collection("userSubscriptions").doc(uid).set({
            userId: uid,
            planCode: a.planCode,
            status: "active",
            source: "grant",
            startedAt: now(),
            expiresAt: null, // lifetime for testing
            autoRenew: false,
            promoCode: null,
            updatedAt: now(),
        });
    } else if (a.role === "teacher") {
        await db.collection("teachers").doc(uid).set({
            userId: uid,
            profile: { name: a.name, institute: "", phone: "+910000000000", bio: "Test teacher account.", avatarUrl: null, subjects: ["DSA"] },
            inviteCode: `TEST_${a.key.toUpperCase().replace(/-/g, "_")}`,
            subscription: {
                planId: a.planId,
                planCode: a.planCode,
                status: "active",
                startedAt: now(),
                expiresAt: inDays(365),
                gracePeriodEndsAt: null,
                autoRenew: false,
                cadence: "monthly",
            },
            stats: { totalStudents: 0, totalQuizzes: 0, totalTests: 0, totalContests: 0, totalCourses: 0 },
            isVerified: true,
            createdAt: now(),
            updatedAt: now(),
        });
    } else {
        const instId = instIdFor(a.key);
        await db.collection("institutes").doc(instId).set({
            name: a.name,
            slug: `test-institute-${a.key.replace("institute-", "")}`,
            description: "Test institute account.",
            ownerId: uid,
            ownerPhone: "+910000000000",
            contactEmail: email,
            contactPhone: "+910000000000",
            website: null,
            address: null,
            inviteCode: `TESTINST${a.key.toUpperCase().replace(/[^A-Z]/g, "")}`,
            branding: { logoUrl: null, primaryColor: null, tagline: null },
            subscription: {
                planId: a.planId,
                planCode: a.planCode,
                status: "active",
                startedAt: now(),
                expiresAt: inDays(365),
                gracePeriodEndsAt: null,
                seats: a.seats ?? null,
                autoRenew: false,
                cadence: "monthly",
            },
            stats: { teacherCount: 0, activeTeacherCount: 0, classCount: 0, studentCount: 0 },
            trust: { ownerPhoneVerified: true, flagged: false, ipHashAtSignup: "test" },
            isArchived: false,
            createdAt: now(),
            updatedAt: now(),
        });
        await db.collection("institutes").doc(instId).collection("admins").doc(uid).set({
            userId: uid,
            email,
            name: a.name,
            role: "owner",
            addedAt: now(),
            addedBy: uid,
        });
    }
}

async function main() {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
        console.log(`[test-users] EMULATOR at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    } else {
        console.log(`[test-users] CLOUD project ${projectId} (service account)`);
    }
    const deleteOnly = process.env.DELETE_ONLY === "1";
    for (const a of ACCOUNTS) {
        if (deleteOnly) {
            await deleteAccount(a);
            console.log(`  − removed ${uidFor(a.key)}`);
        } else {
            await createAccount(a);
            console.log(`  + ${emailFor(a.key).padEnd(34)} ${a.role.padEnd(16)} plan=${a.planCode}`);
        }
    }
    if (!deleteOnly) {
        console.log(`\nAll passwords: ${PASSWORD}`);
        console.log("Log in at https://www.placementranker.com/login");
    }
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
