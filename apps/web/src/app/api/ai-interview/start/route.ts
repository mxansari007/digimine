/**
 * POST /api/ai-interview/start
 *
 * Starts a premium AI coding interview. Gating, strongest-first:
 *   1. Auth (401)
 *   2. Strict premium check `ent.isPaid` (402) — stays locked even in launch
 *      mode, exactly like premium practice problems.
 *   3. AI provider configured + enabled (503) — fail early so the user never
 *      starts an interview they can't continue.
 *   4. A matching published problem exists (404).
 *   5. Daily interview quota (402/429) — consumed only once the above pass.
 *
 * The opening interviewer line is templated (no LLM call) so starting is fast
 * and can't fail on the model; the LLM kicks in on the first candidate turn.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getEntitlements, checkQuota } from "@/lib/server/entitlements";
import { getAiProviderConfig } from "@/lib/server/aiProvider";
import { serializeProblemPublic } from "@/lib/server/practice";
import {
    AI_INTERVIEW_SESSIONS,
    AI_INTERVIEW_QUOTA,
    pickInterviewProblem,
    providerEndpoint,
    makeTurn,
} from "@/lib/server/aiInterview";
import {
    normalizePatternSlug,
    type AIInterviewConfig,
    type AIInterviewSession,
    type InterviewLanguage,
    type InterviewType,
    type PracticeDifficulty,
} from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        // Premium gate — strict paid flag, independent of the launch kill switch.
        const ent = await getEntitlements(userId);
        if (!ent.isPaid) {
            return NextResponse.json(
                {
                    error: "AI mock interviews are a Premium feature. Upgrade to start.",
                    code: "premium_required",
                    upgradeUrl: "/membership",
                },
                { status: 402 }
            );
        }

        // Provider must be live so the interview can actually run its turns.
        const aiCfg = await getAiProviderConfig();
        if (!aiCfg.enabled || !aiCfg.apiKey) {
            return NextResponse.json(
                { error: "AI interviews are temporarily unavailable. Try again later." },
                { status: 503 }
            );
        }
        // Fail before starting if the configured provider has no chat endpoint
        // here (e.g. anthropic) — otherwise turns would fail mid-interview.
        if (!providerEndpoint(aiCfg)) {
            return NextResponse.json(
                { error: `The configured AI provider (${aiCfg.provider}) isn't supported for interviews yet.` },
                { status: 503 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const interviewType: InterviewType =
            body.interviewType === "sql" ||
            body.interviewType === "technical" ||
            body.interviewType === "behavioral" ||
            body.interviewType === "system_design"
                ? body.interviewType
                : "dsa";
        const difficulty: PracticeDifficulty =
            body.difficulty === "easy" || body.difficulty === "hard"
                ? body.difficulty
                : "medium";
        const pattern = normalizePatternSlug(
            typeof body.pattern === "string" ? body.pattern : null
        );
        const company =
            typeof body.company === "string" && body.company.trim()
                ? body.company.trim().toLowerCase()
                : null;
        const topic =
            typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : null;

        const config: AIInterviewConfig = { interviewType, company, pattern, topic, difficulty };

        // DSA + SQL ground on a real problem + reveal an editor; other types are
        // conversation-only (no problem, no editor, no judge).
        const isCoding = interviewType === "dsa" || interviewType === "sql";
        let problem: Awaited<ReturnType<typeof pickInterviewProblem>> = null;
        if (isCoding) {
            problem = await pickInterviewProblem(config);
            if (!problem) {
                return NextResponse.json(
                    {
                        error:
                            interviewType === "sql"
                                ? "No SQL interview problems are available yet. Please try again later."
                                : "No interview problems are available yet. Please try again later.",
                    },
                    { status: 404 }
                );
            }
        }

        // Daily quota — consumed only once we know we can start the session.
        const quota = await checkQuota(userId, AI_INTERVIEW_QUOTA, { consume: true });
        if (!quota.allowed) {
            return NextResponse.json(
                {
                    error:
                        quota.limit === 0
                            ? "Your plan doesn't include AI interviews. Upgrade to unlock."
                            : `You've used today's ${quota.limit} AI interviews. Come back tomorrow or upgrade.`,
                    code: "quota_exceeded",
                    upgradeUrl: "/membership",
                },
                { status: 429 }
            );
        }

        const nowIso = new Date().toISOString();
        const id = crypto.randomUUID();
        let session: AIInterviewSession;
        let publicProblem: any = null;

        if (isCoding && problem) {
            const isSql = problem.kind === "sql";
            // SQL interviews use the single "sql" editor mode; DSA picks the
            // problem's first executable language.
            const language: InterviewLanguage = isSql
                ? "sql"
                : (Array.isArray(problem.languages) && problem.languages[0]) || "python";
            const starter = isSql
                ? "-- Write your SQL query here\n"
                : (Array.isArray(problem.starters) &&
                      problem.starters.find((s) => s.language === language)?.code) ||
                  "";
            const opening = makeTurn(
                "interviewer",
                "message",
                isSql
                    ? `Hi! Thanks for joining. Today we'll work through "${problem.title}". Take a minute to read it and the table schema, then — before you write any SQL — walk me through your approach: which tables you'll touch, the joins, and how you'll filter and group.`
                    : `Hi! Thanks for joining. Today we'll work through "${problem.title}". Take a minute to read it, then — before you write any code — walk me through your high-level approach and the time/space complexity you're aiming for.`
            );
            session = {
                id,
                userId,
                status: "in_progress",
                interviewType,
                config,
                problemId: problem.id,
                problemSlug: problem.slug,
                problemTitle: problem.title,
                primaryPattern: problem.primaryPattern,
                difficulty: problem.difficulty,
                language,
                transcript: [opening],
                latestCode: starter,
                codingUnlocked: false,
                scorecard: null,
                startedAt: nowIso,
                completedAt: null,
                createdAt: nowIso,
                updatedAt: nowIso,
            };
            publicProblem = serializeProblemPublic(problem.id, problem);
        } else {
            // Conversation-only interview (technical / behavioral / system design).
            const title =
                interviewType === "behavioral"
                    ? company
                        ? `HR / Behavioral — ${company}`
                        : "HR / Behavioral"
                    : interviewType === "system_design"
                        ? topic
                            ? `System Design — ${topic}`
                            : "System Design"
                        : topic
                            ? `Technical — ${topic}`
                            : "Technical (CS Fundamentals)";
            const openingText =
                interviewType === "behavioral"
                    ? "Hi, great to meet you! Let's begin the way most interviews do — tell me a little about yourself and what you're looking for in your next role."
                    : interviewType === "system_design"
                        ? `Hi! Welcome to your system design round. Here's the prompt: design ${topic || "a URL shortener"}. Take a moment, then start by clarifying the requirements and the scale we should target.`
                        : `Hi! Welcome to your technical fundamentals round${topic ? ` on ${topic}` : ""}. To warm up, tell me which areas of CS you're most comfortable with and we'll go from there.`;
            const opening = makeTurn("interviewer", "message", openingText);
            session = {
                id,
                userId,
                status: "in_progress",
                interviewType,
                config,
                problemId: "",
                problemSlug: "",
                problemTitle: title,
                primaryPattern: null,
                difficulty,
                language: "python",
                transcript: [opening],
                latestCode: "",
                codingUnlocked: false,
                scorecard: null,
                startedAt: nowIso,
                completedAt: null,
                createdAt: nowIso,
                updatedAt: nowIso,
            };
        }

        await adminDb.collection(AI_INTERVIEW_SESSIONS).doc(id).set(session);
        return NextResponse.json({ session, problem: publicProblem });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/start] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to start interview" },
            { status: 500 }
        );
    }
}
