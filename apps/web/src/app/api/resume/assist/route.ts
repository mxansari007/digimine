/**
 * POST /api/resume/assist  → AI writing assistance for the editor.
 *
 * Metered by the AI-limits system (same gate as the ATS check). Body:
 *   { action: "rewrite_bullet", bullet, role?, context? }
 *   { action: "generate_summary", data: ResumeData, targetRole? }
 *   { action: "tailor", data: ResumeData, jobDescription }
 */
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveResumeProvider, RESUME_AI_UNCONFIGURED } from "@/lib/server/resume/provider";
import { enforceResumeAiQuota } from "@/lib/server/resume/gate";
import { generateSummary, rewriteBullet, tailorToJd } from "@/lib/server/resume/assist";
import { sanitizeResumeData } from "@/lib/server/resume/store";
import type { ResumeAssistAction } from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIONS: ResumeAssistAction[] = ["rewrite_bullet", "generate_summary", "tailor"];
const LABELS: Record<ResumeAssistAction, string> = {
    rewrite_bullet: "a bullet rewrite",
    generate_summary: "a summary generation",
    tailor: "a JD tailoring",
};

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const action = body.action as ResumeAssistAction;
        if (!ACTIONS.includes(action)) {
            return NextResponse.json({ error: "Unknown assist action." }, { status: 400 });
        }

        // Validate per-action inputs BEFORE consuming any allowance.
        const bullet = typeof body.bullet === "string" ? body.bullet.trim() : "";
        const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
        if (action === "rewrite_bullet" && !bullet) {
            return NextResponse.json({ error: "Nothing to rewrite — the bullet is empty." }, { status: 400 });
        }
        if (action === "tailor" && jobDescription.length < 40) {
            return NextResponse.json(
                { error: "Paste the full job description (at least a few lines) to tailor against it." },
                { status: 400 }
            );
        }

        const cfg = await resolveResumeProvider();
        if (!cfg.enabled || !cfg.apiKey) {
            return NextResponse.json({ error: RESUME_AI_UNCONFIGURED, code: "ai_unconfigured" }, { status: 503 });
        }

        const gate = await enforceResumeAiQuota(userId, LABELS[action]);
        if (!gate.ok) return gate.response;

        let result;
        try {
            if (action === "rewrite_bullet") {
                result = await rewriteBullet(
                    {
                        bullet,
                        role: typeof body.role === "string" ? body.role : "",
                        context: typeof body.context === "string" ? body.context : "",
                    },
                    cfg
                );
            } else if (action === "generate_summary") {
                result = await generateSummary(
                    sanitizeResumeData(body.data),
                    { targetRole: typeof body.targetRole === "string" ? body.targetRole : "" },
                    cfg
                );
            } else {
                result = await tailorToJd(sanitizeResumeData(body.data), jobDescription, cfg);
            }
        } catch (err) {
            await gate.refundOnFailure();
            console.error("[/api/resume/assist] AI call failed:", err);
            return NextResponse.json(
                { error: "The AI assistant is busy right now. Please try again.", code: "ai_failed" },
                { status: 502 }
            );
        }

        return NextResponse.json({ result, creditsCharged: gate.creditsCharged });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/assist] failed:", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
