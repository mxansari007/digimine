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
import { getAiTaskUsage } from "@/lib/server/aiTaskUsage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const [entitlements, aiCfg] = await Promise.all([
            getTeachingEntitlements(userId),
            getAiProviderConfig(),
        ]);

        if (!entitlements.ok) {
            return NextResponse.json({
                scope: null,
                planCode: null,
                planName: null,
                teachingFeatures: {},
                teachingLimits: null,
                ai: toPublicView(aiCfg),
                aiQuota: { used: 0, cap: 0, period: "day" },
                aiAllowances: null,
            });
        }

        const r = entitlements.resolved;
        // Current usage for each metered AI task in its plan's period.
        const [qUsage, peUsage] = await Promise.all([
            getAiTaskUsage(userId, "ai_question_generation", r.aiAllowances.ai_question_generation),
            getAiTaskUsage(userId, "project_evaluation", r.aiAllowances.project_evaluation),
        ]);
        return NextResponse.json({
            scope: r.scope,
            planCode: r.planCode,
            planName: r.planName,
            teachingFeatures: r.teachingFeatures,
            teachingLimits: r.teachingLimits,
            ai: toPublicView(aiCfg),
            // Back-compat: the question-generation allowance, used by the
            // AiQuestionGenerator badge. The badge's contract is cap=null for
            // unlimited (the allowance uses -1), so map it. `period` is new.
            aiQuota: {
                used: qUsage.used,
                cap:
                    r.aiAllowances.ai_question_generation.limit < 0
                        ? null
                        : r.aiAllowances.ai_question_generation.limit,
                period: r.aiAllowances.ai_question_generation.period,
            },
            // Full per-task allowance view (limit + period + current usage).
            aiAllowances: {
                ai_question_generation: {
                    ...r.aiAllowances.ai_question_generation,
                    used: qUsage.used,
                },
                project_evaluation: {
                    ...r.aiAllowances.project_evaluation,
                    used: peUsage.used,
                },
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
