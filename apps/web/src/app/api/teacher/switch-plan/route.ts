/**
 * POST /api/teacher/switch-plan
 *
 * No-payment plan switch. Used by the subscribe page for FREE-plan
 * transitions (free→free, paid→free downgrade) so we don't have to
 * forge a Razorpay payload through /api/teacher/webhook/payment —
 * which would fail signature verification in prod.
 *
 * Body: { planCode: string, cadence?: "monthly" | "annual" }
 * Caller must be authenticated; the planCode must resolve to a
 * teacher-scoped, active, free plan in `subscriptionPlans`.
 */
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        const body = await req.json().catch(() => ({}));
        const planCode = typeof body.planCode === "string" ? body.planCode : "";
        const cadence: "monthly" | "annual" =
            body.cadence === "annual" ? "annual" : "monthly";

        if (!planCode) {
            return NextResponse.json({ error: "planCode required" }, { status: 400 });
        }

        const planSnap = await adminDb
            .collection("subscriptionPlans")
            .where("code", "==", planCode)
            .limit(1)
            .get();
        if (planSnap.empty) {
            return NextResponse.json({ error: "Plan not found" }, { status: 404 });
        }
        const plan = planSnap.docs[0].data() || {};
        if (plan.isActive === false) {
            return NextResponse.json({ error: "Plan is inactive" }, { status: 400 });
        }
        if (plan.roleScope !== "teacher") {
            return NextResponse.json(
                { error: "Only teacher-scoped plans can be switched here." },
                { status: 400 }
            );
        }
        // This endpoint only handles zero-cost transitions. Any paid plan
        // must go through Razorpay so we capture the payment intent.
        const monthly = typeof plan.monthlyPriceINR === "number" ? plan.monthlyPriceINR : plan.priceINR ?? 0;
        const annual = typeof plan.annualPriceINR === "number" ? plan.annualPriceINR : null;
        const amount = cadence === "annual" && annual != null ? annual : monthly;
        if (!plan.isFree && amount > 0) {
            return NextResponse.json(
                { error: "Use the Razorpay checkout for paid plans." },
                { status: 400 }
            );
        }

        const now = Timestamp.now();
        const expiresAt = Timestamp.fromDate(
            new Date(Date.now() + (cadence === "annual" ? YEAR_MS : MONTH_MS))
        );
        const subscription = {
            planId: planCode,
            planCode,
            cadence,
            status: "active" as const,
            startedAt: now.toDate(),
            expiresAt: expiresAt.toDate(),
            gracePeriodEndsAt: null,
            autoRenew: false,
        };

        await adminDb
            .collection("teachers")
            .doc(userId)
            .set(
                {
                    subscription: JSON.parse(JSON.stringify(subscription)),
                    updatedAt: now,
                },
                { merge: true }
            );

        return NextResponse.json({ success: true, planCode, cadence });
    } catch (error: any) {
        console.error("[/api/teacher/switch-plan] failed:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Failed to switch plan" },
            { status: 500 }
        );
    }
}
