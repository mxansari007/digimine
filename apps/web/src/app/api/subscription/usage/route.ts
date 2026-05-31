/**
 * GET /api/subscription/usage
 *
 * The caller's plan + per-quota usage this period (limit, used, remaining) so
 * the student "My Plan" page can show how much of each allowance is left.
 * Owner-scoped — reads only the signed-in user's counters.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getEntitlements, getQuotaUsage } from "@/lib/server/entitlements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const [entitlements, usage] = await Promise.all([
            getEntitlements(userId),
            getQuotaUsage(userId),
        ]);
        return NextResponse.json({ entitlements, usage });
    } catch (error) {
        const e = error as Error;
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
