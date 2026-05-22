import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getEntitlements } from "@/lib/server/entitlements";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The caller's resolved entitlements (works anonymously too). */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const entitlements = await getEntitlements(userId);
        return NextResponse.json({ entitlements });
    } catch (error: any) {
        console.error("Subscription me failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
