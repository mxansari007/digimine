/**
 * PRODUCTION plan seed — student + teacher + institute subscription plans,
 * plus the global subscription config. This is the one script to run when
 * provisioning a fresh prod project (or refreshing the catalog).
 *
 *   Collection: `subscriptionPlans/{id}`   (read by the entitlement resolver,
 *                                            pricing pages, admin editor)
 *   Doc:        `appConfig/subscription`    (the launch-mode kill switch)
 *
 * ── Run ────────────────────────────────────────────────────────────────
 *   Emulator:   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *               NEXT_PUBLIC_FIREBASE_PROJECT_ID=digimine-1c33f \
 *               pnpm tsx scripts/seed-plans.ts
 *
 *   Production: set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (service
 *               account) in apps/web/.env, then:
 *                   pnpm tsx scripts/seed-plans.ts
 *               (or rely on application-default creds via `gcloud auth
 *                application-default login`.)
 *
 * ── Launch pricing (deliberately low — burn-money-to-learn phase) ────────
 *   STUDENT     free ₹0            ·  pro       ₹99/mo   ₹799/yr
 *   TEACHER     free ₹0            ·  starter   ₹149/mo  ₹1,490/yr
 *                                  ·  pro       ₹299/mo  ₹2,990/yr  (AI)
 *   INSTITUTE   free ₹0 (5 seats)  ·  growth    ₹499/mo  ₹4,990/yr
 *                                  ·  scale     ₹1,499/mo ₹14,990/yr (AI, ∞ seats)
 *
 * The global config is seeded with `enforced: false` → LAUNCH MODE. Every
 * user gets full access regardless of plan, so pricing is visible (great for
 * measuring willingness-to-pay) but nothing is gated yet. Flip `enforced` to
 * true from /admin/subscription when you're ready to turn the paywall on.
 *
 * Idempotent: every doc is keyed by a deterministic id, so re-running upserts
 * in place (and refreshes prices) without creating duplicates.
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

// ─────────────────────────────────────────────────────────────────────────
// Seed shape — a superset of the fields the pricing/admin pages read. Student
// plans use `features`/`quotas`; teacher + institute plans use
// `teachingFeatures`/`teachingLimits`/`aiQuestionsPerDay`. Everything else is
// shared. All optional blocks default sensibly at write time.
// ─────────────────────────────────────────────────────────────────────────
type Support = { channel: "community" | "email" | "chat" | "phone"; slaHours: number | null };

type SeedPlan = {
    id: string;
    code: string;
    name: string;
    tagline: string;
    highlights: string[];
    monthlyPriceINR: number;
    annualPriceINR: number | null;
    compareAtINR: number | null;
    roleScope: "student" | "teacher" | "institute";
    seatCap: number | null;
    isFree: boolean;
    recommended: boolean;
    badge: string | null;
    sortOrder: number;
    /** Student capability flags (ignored for teacher/institute). */
    features?: Record<string, boolean>;
    /** Student numeric quotas, -1 = unlimited (ignored for teacher/institute). */
    quotas?: Record<string, number>;
    /** Teacher/institute capability flags. */
    teachingFeatures?: Record<string, boolean>;
    /** Teacher/institute caps, -1 = unlimited. */
    teachingLimits?: {
        maxClasses: number;
        maxStudents: number;
        maxTests: number;
        maxQuizzes: number;
        maxContests: number;
        maxCourses: number;
        maxQuestions: number;
        pistonConcurrency: number;
    };
    aiQuestionsPerDay?: number | null;
    /** Display/wiring extras (read by pricing UI; safe to store). */
    trialDays: number;
    support: Support;
};

const PLANS: SeedPlan[] = [
    // ═══════════════════════════════════════════════════════════════════
    // STUDENT (consumer membership) — drives the /membership paywall and
    // the entitlement resolver. `free` is the fallback everyone lands on.
    // ═══════════════════════════════════════════════════════════════════
    {
        id: "free",
        code: "free",
        name: "Free",
        tagline: "Everything you need to start practising.",
        highlights: [
            "50 practice submissions / day",
            "1 AI mock interview / week",
            "Revision Radar (spaced repetition)",
            "Join live contests",
            "Completion certificates",
            "10 premium problem previews / month",
        ],
        monthlyPriceINR: 0,
        annualPriceINR: null,
        compareAtINR: null,
        roleScope: "student",
        seatCap: null,
        isFree: true,
        recommended: false,
        badge: null,
        sortOrder: 0,
        // Generous free tier for launch — keep the heavy premium surfaces
        // (full practice library, mock tests, premium courses/quizzes,
        // downloads, mentor) gated to leave a reason to upgrade.
        features: {
            practice_premium: false,
            revision_radar: true,
            mentor_rescue: false,
            mock_tests: false,
            quizzes_premium: false,
            courses_premium: false,
            contests: true,
            // AI interview is on for free, but capped to a weekly taste below
            // (the per-week quota is what actually limits it).
            ai_interview: true,
            downloads: false,
            ad_free: false,
            certificates: true,
        },
        quotas: {
            practiceSubmissionsPerDay: 50,
            premiumProblemUnlocksPerMonth: 10,
            mockTestsPerMonth: 2,
            premiumQuizzesPerMonth: 5,
            courseEnrollmentsActive: 1,
            aiInterviewsPerWeek: 1,
        },
        trialDays: 0,
        support: { channel: "community", slaHours: null },
    },
    {
        id: "pro",
        code: "pro",
        name: "Pro",
        tagline: "Unlock everything — one simple plan.",
        highlights: [
            "Unlimited practice + full solutions",
            "Unlimited AI mock interviews",
            "All mock test series, premium quizzes & courses",
            "Mentor Rescue hints",
            "Downloads + ad-free",
            "Certificates on every track",
        ],
        // Launch price: cheap on purpose. ~₹2.7/day annually.
        monthlyPriceINR: 99,
        annualPriceINR: 799,
        compareAtINR: 199,
        roleScope: "student",
        seatCap: null,
        isFree: false,
        recommended: true,
        badge: "Best value",
        sortOrder: 10,
        features: {
            practice_premium: true,
            revision_radar: true,
            mentor_rescue: true,
            mock_tests: true,
            quizzes_premium: true,
            courses_premium: true,
            contests: true,
            ai_interview: true,
            downloads: true,
            ad_free: true,
            certificates: true,
        },
        quotas: {
            practiceSubmissionsPerDay: -1,
            premiumProblemUnlocksPerMonth: -1,
            mockTestsPerMonth: -1,
            premiumQuizzesPerMonth: -1,
            courseEnrollmentsActive: -1,
            aiInterviewsPerWeek: -1,
        },
        trialDays: 0,
        support: { channel: "email", slaHours: 48 },
    },

    // ═══════════════════════════════════════════════════════════════════
    // TEACHER — individual educators. `teacher-starter` is the code the
    // onboarding trial maps to (see api/teacher/onboard).
    // ═══════════════════════════════════════════════════════════════════
    {
        id: "teacher-free",
        code: "teacher-free",
        name: "Free",
        tagline: "Start running classes today.",
        highlights: [
            "Up to 3 classes, 40 students",
            "Quizzes, tests, contests & courses",
            "Class roster + student analytics",
            "Manual question authoring",
            "Community support",
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
            maxStudents: 40,
            maxTests: 2,
            maxQuizzes: 5,
            maxContests: 1,
            maxCourses: 1,
            maxQuestions: 100,
            pistonConcurrency: 1,
        },
        aiQuestionsPerDay: 0,
        trialDays: 0,
        support: { channel: "community", slaHours: null },
    },
    {
        id: "teacher-starter",
        code: "teacher-starter",
        name: "Starter",
        tagline: "For the busy individual teacher.",
        highlights: [
            "Up to 10 classes, 300 students",
            "Markdown template download + bulk import",
            "Per-student analytics",
            "Email support (48h)",
        ],
        // Launch price: a fraction of the original ₹499.
        monthlyPriceINR: 149,
        annualPriceINR: 1490,
        compareAtINR: 249,
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
            maxStudents: 300,
            maxTests: 10,
            maxQuizzes: 20,
            maxContests: 3,
            maxCourses: 3,
            maxQuestions: 500,
            pistonConcurrency: 2,
        },
        aiQuestionsPerDay: 0,
        trialDays: 7,
        support: { channel: "email", slaHours: 48 },
    },
    {
        id: "teacher-pro",
        code: "teacher-pro",
        name: "Pro",
        tagline: "Unlock AI question drafting.",
        highlights: [
            "Up to 25 classes, 1,500 students",
            "Everything in Starter",
            "AI question generation — 50 / day",
            "Chat support (24h)",
        ],
        // Launch price: ₹299 vs. the original ₹1499.
        monthlyPriceINR: 299,
        annualPriceINR: 2990,
        compareAtINR: 499,
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
            maxStudents: 1500,
            maxTests: 30,
            maxQuizzes: 60,
            maxContests: 10,
            maxCourses: 10,
            maxQuestions: 3000,
            pistonConcurrency: 5,
        },
        aiQuestionsPerDay: 50,
        trialDays: 14,
        support: { channel: "chat", slaHours: 24 },
    },

    // ═══════════════════════════════════════════════════════════════════
    // INSTITUTE — coaching centres / schools. `seatCap` = teacher seats.
    // ═══════════════════════════════════════════════════════════════════
    {
        id: "institute-free",
        code: "institute-free",
        name: "Free",
        tagline: "Pilot the platform with a small team.",
        highlights: [
            "Up to 5 teacher seats",
            "Up to 150 students",
            "Centralised quizzes + question bank",
            "Single institute admin",
            "Community support",
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
            maxClasses: 15,
            maxStudents: 150,
            maxTests: 5,
            maxQuizzes: 15,
            maxContests: 2,
            maxCourses: 3,
            maxQuestions: 300,
            pistonConcurrency: 2,
        },
        aiQuestionsPerDay: 0,
        trialDays: 0,
        support: { channel: "community", slaHours: null },
    },
    {
        id: "institute-growth",
        code: "institute-growth",
        name: "Growth",
        tagline: "For coaching centres scaling past one team.",
        highlights: [
            "Up to 20 teacher seats",
            "Up to 1,500 students",
            "Markdown template + bulk import",
            "Bulk teacher invites",
            "Email support (24h)",
        ],
        // Launch price: ₹499 vs. the original ₹2499.
        monthlyPriceINR: 499,
        annualPriceINR: 4990,
        compareAtINR: 799,
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
            maxClasses: 60,
            maxStudents: 1500,
            maxTests: 40,
            maxQuizzes: 120,
            maxContests: 20,
            maxCourses: 20,
            maxQuestions: 6000,
            pistonConcurrency: 6,
        },
        aiQuestionsPerDay: 0,
        trialDays: 14,
        support: { channel: "email", slaHours: 24 },
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
            "AI question generation — 200 / day, pooled",
            "Phone support (4h)",
        ],
        // Launch price: ₹1499 vs. the original ₹6999.
        monthlyPriceINR: 1499,
        annualPriceINR: 14990,
        compareAtINR: 2499,
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
            maxQuestions: 25000,
            pistonConcurrency: 10,
        },
        aiQuestionsPerDay: 200,
        trialDays: 30,
        support: { channel: "phone", slaHours: 4 },
    },
];

async function seedPlans() {
    console.log(`[seed] writing ${PLANS.length} plans into subscriptionPlans`);
    for (const plan of PLANS) {
        const { id, ...rest } = plan;
        const ref = db.collection("subscriptionPlans").doc(id);
        const existing = await ref.get();
        const payload: any = {
            ...rest,
            // priceINR mirrors monthly for back-compat (membership page,
            // promo engine, JSON-LD all still read it).
            priceINR: rest.monthlyPriceINR,
            // `interval` is moot in the dual-price model but retained so
            // older deserialisers don't choke.
            interval: "monthly",
            // Ensure the maps always exist so the resolver/editor never sees
            // `undefined`. Student plans carry features/quotas; teacher and
            // institute plans carry teachingFeatures/teachingLimits.
            features: rest.features ?? {},
            quotas: rest.quotas ?? {},
            teachingFeatures: rest.teachingFeatures ?? {},
            aiQuestionsPerDay: rest.aiQuestionsPerDay ?? null,
            isActive: true,
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (!existing.exists) payload.createdAt = FieldValue.serverTimestamp();
        await ref.set(payload, { merge: true });
        console.log(
            `  ${existing.exists ? "↻" : "+"} ${id.padEnd(18)} ${plan.roleScope.padEnd(10)} ` +
                `₹${plan.monthlyPriceINR}/mo` +
                (plan.annualPriceINR != null ? ` · ₹${plan.annualPriceINR}/yr` : "")
        );
    }
}

async function seedGlobalConfig() {
    const ref = db.collection("appConfig").doc("subscription");
    const existing = await ref.get();
    const payload: any = {
        currency: "INR",
        freePlanCode: "free",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "seed:seed-plans",
    };

    // Enforcement (the paywall kill switch):
    //   - SEED_ENFORCED=true|false  → explicitly set it (deliberate flip).
    //   - unset, doc missing        → create in LAUNCH MODE (enforced=false).
    //   - unset, doc exists         → leave the admin-set flag untouched.
    const seedEnforced = process.env.SEED_ENFORCED;
    if (seedEnforced === "true" || seedEnforced === "false") {
        payload.enforced = seedEnforced === "true";
        console.log(
            `[seed] appConfig/subscription — explicitly setting enforced=${payload.enforced}` +
                (payload.enforced ? "  ⚠️  PAYWALL ON: plans are now gated" : "")
        );
    } else if (!existing.exists) {
        payload.enforced = false;
        payload.promoBanner = null;
        console.log("[seed] appConfig/subscription created in LAUNCH MODE (enforced=false)");
    } else {
        console.log("[seed] appConfig/subscription exists — refreshing currency/freePlanCode only, leaving enforced untouched");
    }
    await ref.set(payload, { merge: true });
}

async function main() {
    await seedPlans();
    await seedGlobalConfig();
    console.log("[seed] done.");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[seed] failed:", err);
        process.exit(1);
    });
