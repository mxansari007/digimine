/**
 * Seed teacher- and institute-scoped subscription plans into
 * `subscriptionPlans`. Each plan carries BOTH monthly and annual prices
 * so the pricing/subscribe UI can render a single card with a cadence
 * toggle (no separate annual rows).
 *
 * Run: pnpm tsx scripts/seed-teacher-plans.ts
 *
 * Targets the local emulator when FIRESTORE_EMULATOR_HOST is set in
 * .env.local (apps/web). For prod, also set FIREBASE_CLIENT_EMAIL +
 * FIREBASE_PRIVATE_KEY and the script will use real credentials.
 *
 * Rows seeded:
 *   teacher-free     ₹0/mo                no teaching features
 *   teacher-starter  ₹499/mo  ₹4,990/yr   template + import
 *   teacher-pro      ₹1499/mo ₹14,990/yr  template + import + AI (recommended)
 *
 *   institute-free     ₹0/mo                5 teacher seats
 *   institute-growth   ₹2499/mo ₹24,990/yr  20 seats, template + import
 *   institute-scale    ₹6999/mo ₹69,990/yr  unlimited seats, all features (recommended)
 *
 * Safe to re-run: each row is keyed by a deterministic doc id, so
 * subsequent runs upsert in place.
 *
 * Note: this REPLACES the older seed which had separate -monthly /
 * -annual rows. The previous codes (teacher-pro-monthly etc.) are left
 * orphan in the collection — they're still active, so you may want to
 * de-activate them in /admin/subscription or delete via the emulator UI.
 */
import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as path from "path";

require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env") });

const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (getApps().length === 0) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
    if (useEmulator) {
        initializeApp({ projectId });
        console.log(`[seed] using emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    } else {
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        if (clientEmail && privateKey) {
            initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
            console.log(`[seed] using service-account creds against project ${projectId}`);
        } else {
            initializeApp({ credential: applicationDefault(), projectId });
            console.log(`[seed] using application-default credentials against ${projectId}`);
        }
    }
}

const db = getFirestore();

type SeedPlan = {
    id: string;
    code: string;
    name: string;
    tagline: string;
    highlights: string[];
    monthlyPriceINR: number;
    annualPriceINR: number | null;
    compareAtINR: number | null;
    roleScope: "teacher" | "institute";
    seatCap: number | null;
    isFree: boolean;
    recommended: boolean;
    badge: string | null;
    sortOrder: number;
    teachingFeatures: Record<string, boolean>;
    /**
     * Numeric usage caps consumed by checkPlanLimits + /teacher/usage.
     * -1 = unlimited. Admins can later override these from
     * /admin/subscription, which writes to the same field.
     */
    teachingLimits: {
        maxClasses: number;
        maxStudents: number;
        maxTests: number;
        maxQuizzes: number;
        maxContests: number;
        maxCourses: number;
        maxQuestions: number;
        pistonConcurrency: number;
    };
    aiQuestionsPerDay: number | null;
    // Extra fields (not in the strict AppSubscriptionPlan type yet but
    // safe to seed — Firestore is permissive and the pricing/admin
    // pages destructure only the fields they read). They give the
    // pricing UI + future entitlement gates richer data to render
    // without a re-seed when wiring lands.
    trialDays: number;
    support: { channel: "community" | "email" | "chat" | "phone"; slaHours: number | null };
    featurePreview: string[];
    /** Soft cap for classes (display + future enforcement). */
    classCap: number | null;
    /** Soft cap for students (display + future enforcement). */
    studentCap: number | null;
};

const PLANS: SeedPlan[] = [
    // ─── Teacher ──────────────────────────────────────────────────────
    {
        id: "teacher-free",
        code: "teacher-free",
        name: "Free",
        tagline: "Start running classes today.",
        highlights: [
            "Up to 3 classes, 30 students",
            "Authoring for quizzes, tests, contests, courses",
            "Class roster + student analytics",
            "Manual question authoring (one at a time)",
            "Community support (forum + docs)",
        ],
        monthlyPriceINR: 0,
        annualPriceINR: null,
        compareAtINR: null,
        roleScope: "teacher",
        seatCap: null,
        isFree: true,
        recommended: false,
        badge: null,
        sortOrder: 0,
        teachingFeatures: {},
        teachingLimits: {
            maxClasses: 3,
            maxStudents: 30,
            maxTests: 1,
            maxQuizzes: 3,
            maxContests: 0,
            maxCourses: 1,
            maxQuestions: 50,
            pistonConcurrency: 1,
        },
        aiQuestionsPerDay: 0,
        trialDays: 0,
        support: { channel: "community", slaHours: null },
        featurePreview: [
            "Template download (Starter)",
            "Bulk markdown import (Starter)",
            "AI question generation (Pro)",
        ],
        classCap: 3,
        studentCap: 30,
    },
    {
        id: "teacher-starter",
        code: "teacher-starter",
        name: "Starter",
        tagline: "For the busy individual teacher.",
        highlights: [
            "Up to 10 classes, 200 students",
            "Markdown template download + bulk import",
            "Class roster + per-student analytics",
            "Priority email support (48h SLA)",
            "7-day free trial — cancel anytime",
        ],
        monthlyPriceINR: 499,
        annualPriceINR: 4990,
        compareAtINR: 599,
        roleScope: "teacher",
        seatCap: null,
        isFree: false,
        recommended: false,
        badge: null,
        sortOrder: 10,
        teachingFeatures: {
            question_bank_template_download: true,
            question_bank_markdown_import: true,
        },
        teachingLimits: {
            maxClasses: 10,
            maxStudents: 200,
            maxTests: 5,
            maxQuizzes: 10,
            maxContests: 2,
            maxCourses: 2,
            maxQuestions: 200,
            pistonConcurrency: 2,
        },
        // Starter doesn't unlock AI in the feature flag above, so the cap
        // is moot — set 0 defensively.
        aiQuestionsPerDay: 0,
        trialDays: 7,
        support: { channel: "email", slaHours: 48 },
        featurePreview: [
            "AI question generation (Pro)",
            "Higher class + student caps (Pro)",
        ],
        classCap: 10,
        studentCap: 200,
    },
    {
        id: "teacher-pro",
        code: "teacher-pro",
        name: "Pro",
        tagline: "Unlock AI question drafting.",
        highlights: [
            "Up to 25 classes, 1,000 students",
            "Everything in Starter",
            "AI question generation — 50 questions / day",
            "Priority chat support (24h SLA)",
            "14-day free trial — cancel anytime",
            "Annual plan: save ₹2,998 vs. monthly",
        ],
        monthlyPriceINR: 1499,
        annualPriceINR: 14990,
        compareAtINR: 1799,
        roleScope: "teacher",
        seatCap: null,
        isFree: false,
        recommended: true,
        badge: "Most popular",
        sortOrder: 20,
        teachingFeatures: {
            question_bank_template_download: true,
            question_bank_markdown_import: true,
            ai_question_generation: true,
        },
        teachingLimits: {
            maxClasses: 25,
            maxStudents: 1000,
            maxTests: 20,
            maxQuizzes: 50,
            maxContests: 10,
            maxCourses: 10,
            maxQuestions: 2000,
            pistonConcurrency: 5,
        },
        // Pro @ ₹1499/mo with DeepSeek economics (~₹1 per 10-question
        // request) → ~₹150/mo AI budget at 10% of plan = 50/day cap.
        aiQuestionsPerDay: 50,
        trialDays: 14,
        support: { channel: "chat", slaHours: 24 },
        featurePreview: [
            "Image-input AI generation",
            "Branded result PDFs",
        ],
        classCap: 25,
        studentCap: 1000,
    },
    // ─── Institute ────────────────────────────────────────────────────
    {
        id: "institute-free",
        code: "institute-free",
        name: "Free",
        tagline: "Pilot the platform with a small team.",
        highlights: [
            "Up to 5 teacher seats",
            "Up to 100 students",
            "Centralised quizzes + question bank",
            "Single institute admin",
            "Community support (forum + docs)",
        ],
        monthlyPriceINR: 0,
        annualPriceINR: null,
        compareAtINR: null,
        roleScope: "institute",
        seatCap: 5,
        isFree: true,
        recommended: false,
        badge: null,
        sortOrder: 0,
        teachingFeatures: {},
        teachingLimits: {
            maxClasses: 10,
            maxStudents: 100,
            maxTests: 5,
            maxQuizzes: 10,
            maxContests: 2,
            maxCourses: 2,
            maxQuestions: 200,
            pistonConcurrency: 2,
        },
        aiQuestionsPerDay: 0,
        trialDays: 0,
        support: { channel: "community", slaHours: null },
        featurePreview: [
            "Bulk teacher invites (Growth)",
            "AI question generation (Scale)",
            "More seats (Growth / Scale)",
        ],
        classCap: 10,
        studentCap: 100,
    },
    {
        id: "institute-growth",
        code: "institute-growth",
        name: "Growth",
        tagline: "For coaching centres scaling past 10 teachers.",
        highlights: [
            "Up to 20 teacher seats",
            "Up to 1,000 students",
            "Markdown template + bulk import",
            "Bulk teacher invite with claim links",
            "Email support (24h SLA)",
            "14-day free trial — cancel anytime",
        ],
        monthlyPriceINR: 2499,
        annualPriceINR: 24990,
        compareAtINR: 2999,
        roleScope: "institute",
        seatCap: 20,
        isFree: false,
        recommended: false,
        badge: null,
        sortOrder: 10,
        teachingFeatures: {
            question_bank_template_download: true,
            question_bank_markdown_import: true,
        },
        teachingLimits: {
            maxClasses: 50,
            maxStudents: 1000,
            maxTests: 30,
            maxQuizzes: 100,
            maxContests: 20,
            maxCourses: 20,
            maxQuestions: 5000,
            pistonConcurrency: 6,
        },
        aiQuestionsPerDay: 0,
        trialDays: 14,
        support: { channel: "email", slaHours: 24 },
        featurePreview: [
            "AI question generation (Scale)",
            "Phone support (Scale)",
        ],
        classCap: 50,
        studentCap: 1000,
    },
    {
        id: "institute-scale",
        code: "institute-scale",
        name: "Scale",
        tagline: "For schools and institutes with many cohorts.",
        highlights: [
            "Unlimited teacher seats",
            "Unlimited students",
            "Everything in Growth",
            "AI question generation — 200 questions / day, pooled",
            "Priority phone support (4h SLA)",
            "30-day free trial — cancel anytime",
            "Annual plan: save ₹13,998 vs. monthly",
        ],
        monthlyPriceINR: 6999,
        annualPriceINR: 69990,
        compareAtINR: 8499,
        roleScope: "institute",
        seatCap: null,
        isFree: false,
        recommended: true,
        badge: "Most popular",
        sortOrder: 20,
        teachingFeatures: {
            question_bank_template_download: true,
            question_bank_markdown_import: true,
            ai_question_generation: true,
        },
        teachingLimits: {
            maxClasses: -1,
            maxStudents: -1,
            maxTests: -1,
            maxQuizzes: -1,
            maxContests: -1,
            maxCourses: -1,
            maxQuestions: 20000,
            pistonConcurrency: 10,
        },
        // Institute Scale @ ₹6999/mo gets a larger pool — the institute
        // admin can drive AI generation for the whole institute. 200/day
        // is roughly 4× the teacher Pro cap.
        aiQuestionsPerDay: 200,
        trialDays: 30,
        support: { channel: "phone", slaHours: 4 },
        featurePreview: [
            "Per-branch teacher rollups",
            "SSO (SAML / Google Workspace)",
        ],
        classCap: null,
        studentCap: null,
    },
];

async function seed() {
    console.log(`[seed] writing ${PLANS.length} plans into subscriptionPlans`);
    for (const plan of PLANS) {
        const { id, ...rest } = plan;
        const ref = db.collection("subscriptionPlans").doc(id);
        const existing = await ref.get();
        const payload: any = {
            ...rest,
            // priceINR is kept mirrored to monthly for back-compat with
            // legacy readers (membership page, promo engine, JSON-LD).
            priceINR: rest.monthlyPriceINR,
            // `interval` is moot in the new model but retained so older
            // deserialisers don't choke.
            interval: "monthly",
            features: {},
            quotas: {},
            isActive: true,
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (!existing.exists) payload.createdAt = FieldValue.serverTimestamp();
        await ref.set(payload, { merge: true });
        console.log(
            `  ${existing.exists ? "↻" : "+"} ${id}  ${plan.name}  ` +
                `₹${plan.monthlyPriceINR}/mo` +
                (plan.annualPriceINR != null ? ` · ₹${plan.annualPriceINR}/yr` : "")
        );
    }

    // Deactivate the previous separate-cadence rows from the older seed,
    // if they exist. Leaving them active would clutter the pricing UI.
    const ORPHAN_IDS = [
        "teacher-starter-monthly",
        "teacher-starter-annual",
        "teacher-pro-monthly",
        "teacher-pro-annual",
    ];
    for (const oid of ORPHAN_IDS) {
        const ref = db.collection("subscriptionPlans").doc(oid);
        const snap = await ref.get();
        if (snap.exists) {
            await ref.update({ isActive: false, updatedAt: FieldValue.serverTimestamp() });
            console.log(`  ⊘ ${oid} deactivated (legacy split-cadence row)`);
        }
    }

    console.log("[seed] done.");
}

seed()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[seed] failed:", err);
        process.exit(1);
    });
