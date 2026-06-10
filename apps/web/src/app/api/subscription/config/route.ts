import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getGlobalConfig } from "@/lib/server/entitlements";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public: the active plans + global config for the membership page. */
export async function GET() {
    try {
        const [config, plansSnap] = await Promise.all([
            getGlobalConfig(),
            adminDb.collection("subscriptionPlans").where("isActive", "==", true).get(),
        ]);

        const plans = plansSnap.docs
            // Hidden plans (isPublic === false) still resolve for current
            // subscribers but are not offered publicly.
            .filter((d) => (d.data() || {}).isPublic !== false)
            .map((d) => {
                const r = d.data() || {};
                return {
                    id: d.id,
                    code: r.code || "",
                    name: r.name || "",
                    tagline: r.tagline || "",
                    highlights: Array.isArray(r.highlights) ? r.highlights : [],
                    priceINR: r.priceINR ?? 0,
                    compareAtINR: r.compareAtINR ?? null,
                    interval: r.interval || "monthly",
                    features: r.features || {},
                    quotas: r.quotas || {},
                    isFree: Boolean(r.isFree),
                    recommended: Boolean(r.recommended),
                    badge: r.badge ?? null,
                    sortOrder: r.sortOrder ?? 0,
                };
            })
            .sort((a, b) => a.sortOrder - b.sortOrder || a.priceINR - b.priceINR);

        return NextResponse.json({
            enforced: config.enforced,
            freePlanCode: config.freePlanCode,
            promoBanner: config.promoBanner,
            plans,
        });
    } catch (error: any) {
        console.error("Subscription config failed:", error);
        return NextResponse.json({ enforced: false, plans: [] });
    }
}
