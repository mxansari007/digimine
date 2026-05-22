/**
 * Seed script for subscription plans.
 * Run: npx ts-node scripts/seed-subscription-plans.ts
 * Or: node --loader ts-node/esm scripts/seed-subscription-plans.ts
 */

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

const plans = [
    {
        id: "starter",
        name: "Starter",
        priceINR: 499,
        priceUSD: 6,
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
        id: "institution",
        name: "Institution",
        priceINR: 4999,
        priceUSD: 60,
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
