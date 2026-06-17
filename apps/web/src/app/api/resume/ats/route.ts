/**
 * POST /api/resume/ats  → run an AI ATS check on a resume.
 *
 * Metered by the AI-limits system (feature `resume_ats` + monthly quota +
 * credit overflow) via `enforceResumeAiQuota`. Body:
 *   { data: ResumeData, jobDescription?: string, resumeId?: string }
 * If `resumeId` is an owned resume, the resulting score is cached on it.
 */
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveResumeProvider, RESUME_AI_UNCONFIGURED } from "@/lib/server/resume/provider";
import { enforceResumeAiQuota } from "@/lib/server/resume/gate";
import { scoreResumeAts } from "@/lib/server/resume/ats";
import {
    getResumeDoc,
    sanitizeResumeData,
    resumeHasContent,
    updateResume,
} from "@/lib/server/resume/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        // Validate inputs BEFORE consuming any allowance.
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const data = sanitizeResumeData(body.data);
        if (!resumeHasContent(data)) {
            return NextResponse.json(
                { error: "Add some resume content before running an ATS check." },
                { status: 400 }
            );
        }
        const jobDescription =
            typeof body.jobDescription === "string" ? body.jobDescription : null;
        const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";

        // AI provider must be configured (admin key or DEEPSEEK_API_KEY).
        const cfg = await resolveResumeProvider();
        if (!cfg.enabled || !cfg.apiKey) {
            return NextResponse.json({ error: RESUME_AI_UNCONFIGURED, code: "ai_unconfigured" }, { status: 503 });
        }

        // If persisting to a resume, confirm ownership now (before metering).
        let ownsResume = false;
        if (resumeId) {
            const snap = await getResumeDoc(resumeId);
            ownsResume = !!snap && snap.data()?.userId === userId;
            if (!ownsResume) {
                return NextResponse.json({ error: "Resume not found." }, { status: 404 });
            }
        }

        const gate = await enforceResumeAiQuota(userId, "an ATS check");
        if (!gate.ok) return gate.response;

        let score;
        try {
            score = await scoreResumeAts(data, jobDescription, cfg, new Date().toISOString());
        } catch (err) {
            await gate.refundOnFailure();
            console.error("[/api/resume/ats] scoring failed:", err);
            return NextResponse.json(
                { error: "The AI scorer is busy right now. Please try again in a moment.", code: "ai_failed" },
                { status: 502 }
            );
        }

        // Cache the latest score on the resume (best-effort; never blocks the
        // response — the score is already computed and charged).
        if (ownsResume) {
            try {
                await updateResume(resumeId, { lastAts: score });
            } catch (err) {
                console.error("[/api/resume/ats] failed to cache score:", err);
            }
        }

        return NextResponse.json({ score, creditsCharged: gate.creditsCharged });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/ats] failed:", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
