/**
 * DEPRECATED — do not run.
 *
 * This script seeds the LEGACY `subscription_plans` (snake_case) collection,
 * which NOTHING in the codebase reads anymore:
 *   - checkPlanLimits.ts now resolves limits via getTeachingEntitlements,
 *     which reads the camelCase `subscriptionPlans` collection.
 *   - The teacher usage page reads /api/me/teaching-features (same resolver).
 *
 * Plans authored here would be invisible to every pricing page, resolver,
 * and limit check — a silent disconnect between "plans created" and "what
 * users can access". Author plans in the admin app (/subscription) or run
 * scripts/seed-plans.ts, both of which target `subscriptionPlans`.
 *
 * The script now exits immediately to make running it harmless. Delete the
 * file (and the orphaned `subscription_plans` collection in Firestore) once
 * you're confident nothing external depends on it.
 */

console.error(
    "[seed-subscription-plans] DEPRECATED: this seeds the orphaned snake_case " +
        "`subscription_plans` collection that no code reads. Use scripts/seed-plans.ts " +
        "(camelCase `subscriptionPlans`) or the admin app instead. Exiting without writing."
);
process.exit(1);

// eslint-disable-next-line no-unreachable
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Load env manually since we're running outside Next.js
require("dotenv").config({ path: ".env" });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!clientEmail || !privateKey) {
    console.error("ERROR: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in .env");
    process.exit(1);
}

if (getApps().length === 0) {
    initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
    });
}

const db = getFirestore();

// Bootstrap rows for `subscription_plans`. The schema matches what the
// admin app at `/plan-limits` reads and writes (see
// apps/admin/src/lib/firestore/planLimits.ts):
//
//   - id, name, description
//   - priceINR / priceUSD (monthly), annualPrice* (optional), compareAtINR
//   - trialDays, sortOrder
//   - limits.{maxStudents, maxTests, maxQuizzes, maxContests, maxCourses,
//             maxQuestions, pistonConcurrency}    // -1 = unlimited
//   - features[]
//
// Free is a real plan (id="free") so teachers without a paid plan resolve
// to a doc instead of falling through to the hardcoded 50-student default
// in checkPlanLimits.
const plans = [
    {
        id: "free",
        name: "Free",
        priceINR: 0,
        priceUSD: 0,
        annualPriceINR: 0,
        annualPriceUSD: 0,
        compareAtINR: null,
        trialDays: 0,
        sortOrder: 0,
        limits: {
            maxStudents: 30,
            maxTests: 1,
            maxQuizzes: 3,
            maxContests: 0,
            maxCourses: 1,
            maxQuestions: 50,
            pistonConcurrency: 1,
        },
        features: ["community_support"],
        description: "Try the platform with a small class.",
    },
    {
        id: "starter",
        name: "Starter",
        priceINR: 499,
        priceUSD: 6,
        annualPriceINR: 4990,
        annualPriceUSD: 59,
        compareAtINR: 599,
        trialDays: 7,
        sortOrder: 10,
        limits: {
            maxStudents: 50,
            maxTests: 5,
            maxQuizzes: 10,
            maxContests: 2,
            maxCourses: 2,
            maxQuestions: 200,
            pistonConcurrency: 2,
        },
        features: ["email_support"],
        description: "Perfect for individual educators getting started.",
    },
    {
        id: "pro",
        name: "Pro",
        priceINR: 1499,
        priceUSD: 18,
        annualPriceINR: 14990,
        annualPriceUSD: 179,
        compareAtINR: 1799,
        trialDays: 14,
        sortOrder: 20,
        limits: {
            maxStudents: 300,
            maxTests: 20,
            maxQuizzes: 50,
            maxContests: 10,
            maxCourses: 10,
            maxQuestions: 2000,
            pistonConcurrency: 5,
        },
        features: ["priority_email_support"],
        description: "For growing educators with more students and content.",
    },
    {
        id: "growth",
        name: "Growth",
        priceINR: 2999,
        priceUSD: 36,
        annualPriceINR: 29990,
        annualPriceUSD: 359,
        compareAtINR: 3499,
        trialDays: 14,
        sortOrder: 30,
        limits: {
            maxStudents: 800,
            maxTests: 50,
            maxQuizzes: 150,
            maxContests: 25,
            maxCourses: 25,
            maxQuestions: 5000,
            pistonConcurrency: 6,
        },
        features: ["priority_email_support", "chat_support"],
        description: "For coaching centres scaling past a few hundred students.",
    },
    {
        id: "institution",
        name: "Institution",
        priceINR: 4999,
        priceUSD: 60,
        annualPriceINR: 49990,
        annualPriceUSD: 599,
        compareAtINR: 5999,
        trialDays: 30,
        sortOrder: 40,
        limits: {
            maxStudents: -1,
            maxTests: -1,
            maxQuizzes: -1,
            maxContests: -1,
            maxCourses: -1,
            maxQuestions: 10000,
            pistonConcurrency: 8,
        },
        features: ["chat_support", "call_support", "dedicated_piston_lane"],
        description: "Unlimited everything for schools and coaching institutes.",
    },
];

async function seed() {
    console.log("Seeding subscription plans...");

    for (const plan of plans) {
        const ref = db.collection("subscription_plans").doc(plan.id);
        await ref.set({
            ...plan,
            updatedAt: new Date(),
        });
        console.log(`  ✓ ${plan.name} (${plan.id})`);
    }

    console.log("\nDone! All subscription plans seeded.");
    process.exit(0);
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
