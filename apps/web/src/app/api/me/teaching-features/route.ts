/**
 * GET /api/me/teaching-features
 *
 * Returns the caller's effective teaching-feature map so the
 * client can render lock states on template download / markdown
 * import / AI generation buttons.
 *
 * Also returns the AI provider's PUBLIC view (without the
 * apiKey) so the client knows whether the AI feature is enabled
 * globally — if disabled, the UI shows "currently unavailable"
 * even when the user's plan includes the feature.
 *
 * Access: any authenticated teaching-role user (teacher or
 * institute admin). Other roles get 200 with empty map.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getTeachingEntitlements } from "@/lib/server/teachingEntitlements";
import { getAiProviderConfig, toPublicView } from "@/lib/server/aiProvider";
import { getAiUsageToday } from "@/lib/server/aiUsage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const [entitlements, aiCfg, usage] = await Promise.all([
            getTeachingEntitlements(userId),
            getAiProviderConfig(),
            getAiUsageToday(userId).catch(() => ({ date: "", used: 0 })),
        ]);

        if (!entitlements.ok) {
            return NextResponse.json({
                scope: null,
                planCode: null,
                planName: null,
                teachingFeatures: {},
                teachingLimits: null,
                ai: toPublicView(aiCfg),
                aiQuota: { used: usage.used, cap: 0 },
            });
        }

        const r = entitlements.resolved;
        return NextResponse.json({
            scope: r.scope,
            planCode: r.planCode,
            planName: r.planName,
            teachingFeatures: r.teachingFeatures,
            teachingLimits: r.teachingLimits,
            ai: toPublicView(aiCfg),
            aiQuota: {
                used: usage.used,
                cap: r.aiQuestionsPerDay,
            },
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/me/teaching-features] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to resolve teaching features" },
            { status: 500 }
        );
    }
}
