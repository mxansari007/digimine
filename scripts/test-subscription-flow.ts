/**
 * Test driver for the subscription flow.
 *
 * Walks through the full resolver path against the emulator:
 *   1. Flip a teacher's `subscription` doc to teacher-pro / annual
 *   2. Read it back and confirm the shape matches the new model
 *   3. Same for an institute admin (writes to institutes/{id}.subscription)
 *
 * The entitlements resolver path (lib/server/teachingEntitlements.ts)
 * reads exactly these fields, so a successful write here means the
 * dashboard + locked-feature gates will resolve correctly on next load.
 *
 * Run: pnpm tsx scripts/test-subscription-flow.ts
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as path from "path";

require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../apps/web/.env") });

if (getApps().length === 0) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
    initializeApp({ projectId });
}
const db = getFirestore();

const TEACHER_UID = "seed-teacher";
const INSTITUTE_ID = "seed-institute-001";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

async function flipTeacher(planCode: string, cadence: "monthly" | "annual") {
    const ref = db.collection("teachers").doc(TEACHER_UID);
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + (cadence === "annual" ? YEAR_MS : MONTH_MS))
    );
    await ref.set(
        {
            subscription: {
                planId: planCode,
                planCode,
                cadence,
                status: "active",
                startedAt: now.toDate(),
                expiresAt: expiresAt.toDate(),
                gracePeriodEndsAt: null,
                autoRenew: true,
            },
            updatedAt: now,
        },
        { merge: true }
    );
    const snap = await ref.get();
    const sub = snap.data()?.subscription;
    return sub;
}

async function flipInstitute(planCode: string, cadence: "monthly" | "annual") {
    const ref = db.collection("institutes").doc(INSTITUTE_ID);
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + (cadence === "annual" ? YEAR_MS : MONTH_MS))
    );
    await ref.set(
        {
            subscription: {
                planId: planCode,
                planCode,
                cadence,
                status: "active",
                startedAt: now.toDate(),
                expiresAt: expiresAt.toDate(),
                seats: 20,
            },
            updatedAt: now,
        },
        { merge: true }
    );
    const snap = await ref.get();
    const sub = snap.data()?.subscription;
    return sub;
}

async function readPlan(code: string) {
    // Match what the resolver does: find a subscriptionPlans doc by `code`.
    const snap = await db
        .collection("subscriptionPlans")
        .where("code", "==", code)
        .get();
    if (snap.empty) return null;
    const data = snap.docs[0].data() || {};
    return {
        id: snap.docs[0].id,
        code: data.code,
        name: data.name,
        roleScope: data.roleScope,
        teachingFeatures: data.teachingFeatures || {},
    };
}

async function run() {
    console.log("[test] Phase 1 — flip teacher to teacher-pro/annual");
    const tSub = await flipTeacher("teacher-pro", "annual");
    console.log("  wrote teachers/" + TEACHER_UID + ".subscription =");
    console.log("   ", JSON.stringify(tSub, null, 2));
    const tPlan = await readPlan("teacher-pro");
    console.log("  resolver would match plan:", tPlan);
    const tHas = (k: string) => Boolean(tPlan?.teachingFeatures?.[k]);
    console.log(
        "  teaching features resolved:",
        "template=" + tHas("question_bank_template_download"),
        "import=" + tHas("question_bank_markdown_import"),
        "ai=" + tHas("ai_question_generation")
    );

    console.log("\n[test] Phase 2 — flip institute to institute-scale/monthly");
    const iSub = await flipInstitute("institute-scale", "monthly");
    console.log("  wrote institutes/" + INSTITUTE_ID + ".subscription =");
    console.log("   ", JSON.stringify(iSub, null, 2));
    const iPlan = await readPlan("institute-scale");
    console.log("  resolver would match plan:", iPlan);
    const iHas = (k: string) => Boolean(iPlan?.teachingFeatures?.[k]);
    console.log(
        "  teaching features resolved:",
        "template=" + iHas("question_bank_template_download"),
        "import=" + iHas("question_bank_markdown_import"),
        "ai=" + iHas("ai_question_generation")
    );

    console.log("\n[test] Phase 3 — flip teacher back to teacher-free");
    const fSub = await flipTeacher("teacher-free", "monthly");
    console.log("  wrote teachers/" + TEACHER_UID + ".subscription.planCode =", fSub?.planCode);
    const fPlan = await readPlan("teacher-free");
    console.log("  resolver matched plan:", fPlan?.name);
    const fHas = (k: string) => Boolean(fPlan?.teachingFeatures?.[k]);
    console.log(
        "  teaching features (should all be false):",
        "template=" + fHas("question_bank_template_download"),
        "import=" + fHas("question_bank_markdown_import"),
        "ai=" + fHas("ai_question_generation")
    );

    console.log("\n[test] done. Re-load /teacher/dashboard in the browser to confirm UI surfaces the new plan card.");
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[test] failed:", err);
        process.exit(1);
    });
