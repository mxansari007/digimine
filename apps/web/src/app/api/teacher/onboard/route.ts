import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveOrCreateUniversity } from "@/lib/server/universities";

export async function POST(req: Request) {
    try {
        // Must be signed in AND email-verified to provision a teacher account.
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const tokenUserId = auth.userId;

        const body = await req.json();
        const { step, uid } = body;

        if (!step || !uid) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (tokenUserId !== uid) {
            return NextResponse.json(
                { error: "You can only complete onboarding for your own account." },
                { status: 403 }
            );
        }

        // The "phone" step was removed — email verification is the only
        // identity gate. Onboarding is now the single "profile" step.
        if (step === "profile") {
            const { name, institute, subjects, bio, avatarUrl, phone, inviteCode } = body;

            if (!name || !institute || !inviteCode) {
                return NextResponse.json({ error: "Name, institute and invite code are required" }, { status: 400 });
            }

            // Resolve the typed institute to a canonical University directory
            // entry so duplicates ("CU" / "Chandigarh University" / "chandigarh
            // university") collapse to ONE shared row that sections + classes
            // can be scoped to. This is the server-side safety net — it runs
            // even when the client didn't pick from the dropdown. If it fails
            // for any reason we fall back to the raw text so onboarding never
            // breaks on a directory hiccup.
            let canonicalInstitute = String(institute).trim();
            let universityId: string | null =
                (typeof body.universityId === "string" && body.universityId) || null;
            try {
                const resolved = await resolveOrCreateUniversity(canonicalInstitute, uid);
                canonicalInstitute = resolved.university.name;
                universityId = resolved.university.id;
            } catch (e) {
                console.warn("[teacher/onboard] university resolve failed, using raw input:", e);
            }

            const now = Timestamp.now();
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 7);

            // The 7-day trial runs on the Starter plan. Resolve the actual
            // plan doc the admin authored so the recorded subscription always
            // points at a REAL plan code with its REAL price — previously this
            // hardcoded planId "starter" (a code that exists in no plan doc)
            // and planPrice 50 (the actual Starter plan is priced differently),
            // so what teachers were granted could drift from the plan maker.
            const TRIAL_PLAN_CODE = "teacher-starter";
            let trialPlanPrice = 0;
            try {
                const planSnap = await adminDb
                    .collection("subscriptionPlans")
                    .where("code", "==", TRIAL_PLAN_CODE)
                    .limit(1)
                    .get();
                const planData = planSnap.docs[0]?.data();
                if (typeof planData?.monthlyPriceINR === "number") {
                    trialPlanPrice = planData.monthlyPriceINR;
                }
            } catch (e) {
                console.warn("[teacher/onboard] trial plan lookup failed:", e);
            }

            // Atomic batch: create teacher doc + flip user role
            const batch = adminDb.batch();

            batch.set(adminDb.collection("teachers").doc(uid), {
                userId: uid,
                profile: {
                    name,
                    institute: canonicalInstitute,
                    universityId,
                    phone: phone || "",
                    bio: bio || "",
                    avatarUrl: avatarUrl || null,
                    subjects: Array.isArray(subjects) ? subjects : [],
                },
                inviteCode,
                paymentFingerprint: null,
                subscription: {
                    // planId mirrors planCode — both must be a code that exists
                    // in `subscriptionPlans` (the teachingEntitlements resolver
                    // reads planCode first, planId as legacy fallback, and the
                    // pricing page's "Current plan" pill matches on planCode).
                    planId: TRIAL_PLAN_CODE,
                    planCode: TRIAL_PLAN_CODE,
                    status: "trial",
                    startedAt: now,
                    expiresAt: Timestamp.fromDate(trialEnd),
                    gracePeriodEndsAt: null,
                    autoRenew: false,
                    planPrice: trialPlanPrice,
                    cadence: "monthly",
                },
                stats: { totalStudents: 0, totalQuizzes: 0, totalTests: 0, totalContests: 0, totalCourses: 0 },
                isVerified: false,
                createdAt: now,
                updatedAt: now,
            });

            batch.set(adminDb.collection("users").doc(uid), {
                role: "teacher",
                onboardingStep: "complete",
                updatedAt: now,
            }, { merge: true });

            await batch.commit();
            return NextResponse.json({ success: true, universityId });
        }

        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    } catch (error: any) {
        console.error("Onboard API error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
