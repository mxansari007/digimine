import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { validatePromo } from "@/lib/server/promo";

export const dynamic = "force-dynamic";

/** Body: { code, planCode?, priceINR? } */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        const body = await req.json().catch(() => ({}));
        const code = String(body.code || "");
        if (!code.trim()) return NextResponse.json({ valid: false, reason: "Enter a code." });

        const target =
            body.planCode && typeof body.priceINR === "number"
                ? { planCode: String(body.planCode), priceINR: Number(body.priceINR) }
                : undefined;

        const result = await validatePromo(code, target, userId);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Promo validate failed:", error);
        return NextResponse.json({ valid: false, reason: "Validation failed." });
    }
}
