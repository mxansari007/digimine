/**
 * GET /api/credits/config — public view of the credit economy: whether
 * the system is on, per-task rates, and the active packs for the buy
 * page. No auth; nothing sensitive lives in this projection.
 */
import { NextResponse } from "next/server";
import { getAiCreditsConfig, toCreditsPublicView } from "@/lib/server/credits";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const cfg = await getAiCreditsConfig();
        return NextResponse.json(toCreditsPublicView(cfg));
    } catch (error) {
        console.error("[/api/credits/config] failed:", error);
        return NextResponse.json({ error: "Failed to load credit config" }, { status: 500 });
    }
}
