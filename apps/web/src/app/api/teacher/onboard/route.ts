import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getBearerUserId } from "@/lib/server/classroomAccess";

export async function POST(req: Request) {
    try {
        const tokenUserId = await getBearerUserId(req).catch(() => null);
        if (!tokenUserId) {
            return NextResponse.json({ error: "Sign in to complete onboarding." }, { status: 401 });
        }

        const body = await req.json();
        const { step, phone, uid } = body;

        if (!step || !uid) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (tokenUserId !== uid) {
            return NextResponse.json(
                { error: "You can only complete onboarding for your own account." },
                { status: 403 }
            );
        }

        if (step === "phone") {
            if (!phone) {
                return NextResponse.json({ error: "Phone number required" }, { status: 400 });
            }

            // Check if phone already exists on another active/trial teacher
            const teachersSnap = await adminDb
                .collection("teachers")
                .where("profile.phone", "==", phone)
                .where("subscription.status", "in", ["trial", "active", "expired"])
                .limit(1)
                .get();

            if (!teachersSnap.empty) {
                const existing = teachersSnap.docs[0];
                if (existing.id !== uid) {
                    return NextResponse.json(
                        { error: "This phone number is already registered with another teacher account." },
                        { status: 409 }
                    );
                }
            }

            // Persist the verified phone on the user doc (not just the step) so
            // a resume — e.g. logging back in mid-onboarding, which lands on the
            // profile page without the ?phone= query param — can recover it
            // instead of saving an empty phone on the teacher profile.
            await adminDb.collection("users").doc(uid).set(
                {
                    phoneNumber: phone,
                    phoneVerifiedAt: new Date(),
                    onboardingStep: "teacher:profile",
                    updatedAt: new Date(),
                },
                { merge: true }
            );
            return NextResponse.json({ success: true });
        }

        if (step === "profile") {
            const { name, institute, subjects, bio, avatarUrl, phone, inviteCode } = body;

            if (!name || !institute || !inviteCode) {
                return NextResponse.json({ error: "Name, institute and invite code are required" }, { status: 400 });
            }

            const now = Timestamp.now();
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 7);

            // Atomic batch: create teacher doc + flip user role
            const batch = adminDb.batch();

            batch.set(adminDb.collection("teachers").doc(uid), {
                userId: uid,
                profile: {
                    name,
                    institute,
                    phone: phone || "",
                    bio: bio || "",
                    avatarUrl: avatarUrl || null,
                    subjects: Array.isArray(subjects) ? subjects : [],
                },
                inviteCode,
                paymentFingerprint: null,
                subscription: {
                    // Legacy snake_case `subscription_plans` doc id (used by
                    // checkPlanLimits middleware).
                    planId: "starter",
                    // Camel-case `subscriptionPlans` doc code (used by the
                    // teachingEntitlements resolver / pricing UI). Without
                    // this, the pricing page can't match the teacher's
                    // current plan and never shows the "Current plan" pill.
                    planCode: "teacher-starter",
                    status: "trial",
                    startedAt: now,
                    expiresAt: Timestamp.fromDate(trialEnd),
                    gracePeriodEndsAt: null,
                    autoRenew: false,
                    planPrice: 50,
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
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    } catch (error: any) {
        console.error("Onboard API error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
