/**
 * GET /api/subscription/plans?roleScope=teacher|institute|student
 *
 * Public read of published subscription plans, optionally filtered by
 * role scope. Used by the per-role pricing pages (/pricing/teacher,
 * /pricing/institute) and by the student membership page.
 *
 * Only returns plans where `isActive !== false`. The "isFree" plan
 * for each role is always included so the page can render the
 * "Free baseline" tier.
 */
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const ALLOWED_SCOPES = new Set(["student", "teacher", "institute"]);

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const roleScope = url.searchParams.get("roleScope");

        const snap = await adminDb.collection("subscriptionPlans").get();
        const plans = snap.docs
            .map((d) => {
                const data = d.data() || {};
                const rs = data.roleScope;
                const scope =
                    rs === "teacher" || rs === "institute" ? rs : "student";
                const monthlyPriceINR =
                    typeof data.monthlyPriceINR === "number"
                        ? data.monthlyPriceINR
                        : (data.priceINR ?? 0);
                const annualPriceINR =
                    typeof data.annualPriceINR === "number" ? data.annualPriceINR : null;
                return {
                    id: d.id,
                    code: data.code || "",
                    name: data.name || "",
                    tagline: data.tagline || "",
                    highlights: Array.isArray(data.highlights) ? data.highlights : [],
                    priceINR: monthlyPriceINR,
                    monthlyPriceINR,
                    annualPriceINR,
                    compareAtINR: data.compareAtINR ?? null,
                    interval: data.interval || "monthly",
                    roleScope: scope,
                    seatCap: typeof data.seatCap === "number" ? data.seatCap : null,
                    aiQuestionsPerDay:
                        typeof data.aiQuestionsPerDay === "number"
                            ? data.aiQuestionsPerDay
                            : null,
                    isFree: Boolean(data.isFree),
                    isActive: data.isActive !== false,
                    recommended: Boolean(data.recommended),
                    badge: data.badge ?? null,
                    sortOrder: data.sortOrder ?? 0,
                };
            })
            .filter((p) => p.isActive)
            .filter((p) => {
                if (!roleScope) return true;
                if (!ALLOWED_SCOPES.has(roleScope)) return false;
                return p.roleScope === roleScope;
            })
            .sort((a, b) => a.sortOrder - b.sortOrder || a.monthlyPriceINR - b.monthlyPriceINR);

        return NextResponse.json({ plans });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/subscription/plans] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to list plans" },
            { status: 500 }
        );
    }
}
