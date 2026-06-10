/**
 * POST /api/teacher/ai/generate-questions
 *
 * Generates question drafts from a prompt. Two layers of gating:
 *
 *   1. GLOBAL kill-switch: if `appConfig/aiProvider.enabled === false`,
 *      returns 503 "AI question generation is currently unavailable".
 *      This is the lever an admin pulls to take the feature down
 *      without touching plans.
 *   2. PER-USER feature flag: caller's effective plan must include
 *      `ai_question_generation`. If not, returns 403 with a clear
 *      upgrade hint.
 *
 * The generated questions are RETURNED to the client only — we do
 * NOT auto-save them. Author reviews, edits, then saves through
 * the existing question-bank create flow.
 *
 * Body:
 *   {
 *     topic: string,              // required, e.g. "Binary trees"
 *     subject?: string,           // optional context, e.g. "DSA"
 *     difficulty: "easy"|"moderate"|"hard",
 *     type: "mcq"|"text_input"|"code",
 *     count: number,              // 1..maxQuestionsPerRequest
 *     extraContext?: string       // optional freeform addition
 *   }
 *
 * Returns:
 *   { questions: GeneratedQuestion[] }
 *
 * Provider: currently DeepSeek (OpenAI-compatible /chat/completions).
 * Switching providers would just need the appropriate endpoint URL
 * and auth header; the request shape is unified.
 */
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    getTeachingEntitlements,
    hasTeachingFeature,
} from "@/lib/server/teachingEntitlements";
import { getAiProviderConfig } from "@/lib/server/aiProvider";
import { commitAiUsage, getAiUsageToday, refundAiUsage } from "@/lib/server/aiUsage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GeneratedQuestion = {
    type: "mcq" | "text_input" | "code";
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
    correctAnswer: string | null;
    explanation: string;
    difficulty: "easy" | "moderate" | "hard";
    marks: number;
};

const PROVIDER_ENDPOINTS: Record<string, string> = {
    deepseek: "https://api.deepseek.com/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions",
};

function buildPrompt(input: {
    topic: string;
    subject: string;
    difficulty: string;
    type: string;
    count: number;
    extraContext: string;
}): { system: string; user: string } {
    const system = [
        "You are a question-bank author for an educational platform.",
        "Generate clean, pedagogically sound questions in valid JSON ONLY.",
        "Never include markdown fences or commentary outside the JSON.",
    ].join(" ");

    const typeRules =
        input.type === "mcq"
            ? [
                  "type=mcq: REQUIRED — `options` MUST be an array of EXACTLY 4 objects,",
                  "each `{ \"text\": \"...\", \"isCorrect\": true|false }`. EXACTLY ONE",
                  "option must have isCorrect=true. `correctAnswer` MUST be the 0-based",
                  "index (0-3) of the correct option as a string. Never return an empty",
                  "options array for an MCQ.",
              ].join(" ")
            : input.type === "code"
                ? "type=code: questionText describes the problem; options=[]; correctAnswer is null (the author will add test cases later)."
                : "type=text_input: open-ended; options=[]; correctAnswer is the expected canonical answer string.";

    const user = [
        `Generate exactly ${input.count} ${input.difficulty} ${input.type} questions about "${input.topic}"${input.subject ? ` (subject: ${input.subject})` : ""}.`,
        input.extraContext ? `Extra context: ${input.extraContext}` : "",
        typeRules,
        "Each question object MUST have these keys: type, questionText, options, correctAnswer, explanation, difficulty, marks (1-5).",
        "Return a SINGLE JSON object with shape: { \"questions\": [ ...the array... ] }. No markdown, no commentary.",
    ]
        .filter(Boolean)
        .join("\n");

    return { system, user };
}

function safeParseJsonObject(raw: string): any | null {
    if (!raw) return null;
    // Strip markdown fences if the model added them despite the
    // system prompt — defensive cleanup.
    const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        // Find the first { ... } block as a fallback.
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try {
            return JSON.parse(m[0]);
        } catch {
            return null;
        }
    }
}

function normalizeGenerated(raw: any): GeneratedQuestion[] {
    if (!raw) return [];
    const arr = Array.isArray(raw.questions)
        ? raw.questions
        : Array.isArray(raw)
            ? raw
            : [];
    return arr
        .map((q: any): GeneratedQuestion | null => {
            const type =
                q.type === "mcq" || q.type === "text_input" || q.type === "code"
                    ? q.type
                    : "mcq";
            const difficulty =
                q.difficulty === "easy" || q.difficulty === "hard"
                    ? q.difficulty
                    : "moderate";
            const questionText = typeof q.questionText === "string" ? q.questionText : "";
            if (!questionText.trim()) return null;
            const options = Array.isArray(q.options)
                ? q.options
                      .filter((o: any) => o && typeof o.text === "string")
                      .map((o: any) => ({
                          text: o.text,
                          isCorrect: Boolean(o.isCorrect),
                      }))
                : [];
            return {
                type,
                questionText,
                options,
                correctAnswer:
                    typeof q.correctAnswer === "string" || q.correctAnswer === null
                        ? q.correctAnswer
                        : null,
                explanation: typeof q.explanation === "string" ? q.explanation : "",
                difficulty,
                marks:
                    typeof q.marks === "number" && q.marks > 0
                        ? Math.min(5, Math.max(1, Math.round(q.marks)))
                        : 1,
            };
        })
        .filter(Boolean) as GeneratedQuestion[];
}

export async function POST(req: Request) {
    try {
        // Gate 0: signed in + email-verified.
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        // Gate 1: global kill-switch.
        const aiCfg = await getAiProviderConfig();
        if (!aiCfg.enabled) {
            return NextResponse.json(
                { error: "AI question generation is currently unavailable." },
                { status: 503 }
            );
        }
        if (!aiCfg.apiKey) {
            return NextResponse.json(
                {
                    error:
                        "AI question generation is not configured yet. Ask the admin to set the API key.",
                },
                { status: 503 }
            );
        }

        // Gate 2: caller's plan must include the feature.
        const entitlements = await getTeachingEntitlements(userId);
        if (!entitlements.ok) {
            return NextResponse.json(
                { error: "Only teachers and institute admins can generate questions." },
                { status: 403 }
            );
        }
        if (
            !hasTeachingFeature(
                entitlements.resolved.teachingFeatures,
                "ai_question_generation"
            )
        ) {
            return NextResponse.json(
                {
                    error:
                        "Your plan doesn't include AI question generation. Upgrade to unlock.",
                    upgradeHref:
                        entitlements.resolved.scope === "teacher"
                            ? "/pricing/teacher"
                            : "/pricing/institute",
                },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const topic = typeof body.topic === "string" ? body.topic.trim() : "";
        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const difficulty =
            body.difficulty === "easy" || body.difficulty === "hard"
                ? body.difficulty
                : "moderate";
        const type =
            body.type === "text_input" || body.type === "code" ? body.type : "mcq";
        const rawCount =
            typeof body.count === "number" ? body.count : Number(body.count) || 0;
        const count = Math.min(
            aiCfg.maxQuestionsPerRequest,
            Math.max(1, Math.floor(rawCount))
        );
        const extraContext =
            typeof body.extraContext === "string" ? body.extraContext.trim() : "";

        if (!topic) {
            return NextResponse.json({ error: "topic is required" }, { status: 400 });
        }

        // Gate 3: daily question cap from the plan. Reserve the count
        // up-front so two parallel requests can't over-spend the cap.
        const dailyCap = entitlements.resolved.aiQuestionsPerDay;
        const reservation = await commitAiUsage(userId, count, dailyCap);
        if (!reservation.ok) {
            const today = await getAiUsageToday(userId);
            return NextResponse.json(
                {
                    error:
                        reservation.cap === 0
                            ? "Your plan doesn't include any AI question generations. Upgrade to unlock daily quota."
                            : `Daily AI quota exceeded. You've used ${reservation.used} of ${reservation.cap} questions today — quota resets at midnight IST.`,
                    quota: {
                        used: today.used,
                        cap: reservation.cap,
                        resetsAtMidnightIST: true,
                    },
                    upgradeHref:
                        entitlements.resolved.scope === "teacher"
                            ? "/pricing/teacher"
                            : "/pricing/institute",
                },
                { status: 429 }
            );
        }

        const endpoint = PROVIDER_ENDPOINTS[aiCfg.provider];
        if (!endpoint) {
            return NextResponse.json(
                {
                    error: `Provider "${aiCfg.provider}" is not supported by the server yet.`,
                },
                { status: 503 }
            );
        }

        const { system, user } = buildPrompt({
            topic,
            subject,
            difficulty,
            type,
            count,
            extraContext,
        });

        const upstream = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${aiCfg.apiKey}`,
            },
            body: JSON.stringify({
                model: aiCfg.model,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                response_format: { type: "json_object" },
                temperature: 0.4,
            }),
        });

        // Refund helper that logs failures structurally so admins can
        // manually reconcile if the refund Firestore write itself errors.
        // The previous `.catch(() => {})` silently dropped the failure,
        // which meant the user paid for questions they didn't get.
        const safeRefund = async (n: number, reason: string) => {
            if (n <= 0) return;
            try {
                await refundAiUsage(userId, n);
            } catch (refundErr) {
                console.error(
                    "[ai/generate-questions] refund failed — manual reconcile needed",
                    {
                        userId,
                        count: n,
                        reason,
                        error:
                            refundErr instanceof Error
                                ? refundErr.message
                                : String(refundErr),
                    }
                );
            }
        };

        if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            console.error(
                "[ai/generate-questions] upstream error",
                upstream.status,
                text.slice(0, 500)
            );
            await safeRefund(count, "upstream_error");
            return NextResponse.json(
                {
                    error: `Upstream ${aiCfg.provider} returned ${upstream.status}.`,
                },
                { status: 502 }
            );
        }

        const json = await upstream.json();
        const content = json?.choices?.[0]?.message?.content;
        const parsed = safeParseJsonObject(content);
        const questions = normalizeGenerated(parsed);

        // Unified refund: whatever the model returned (0..count), refund
        // the diff so quota and actual delivery stay in lockstep. 0 is
        // still a hard failure (we surface 502) — fewer-than-requested
        // is a partial success (200 with the questions we got).
        const missing = count - questions.length;
        if (missing > 0) {
            await safeRefund(missing, questions.length === 0 ? "zero_returned" : "partial_returned");
        }

        if (questions.length === 0) {
            return NextResponse.json(
                {
                    error: "AI returned no usable questions. Try a more specific topic.",
                    raw: typeof content === "string" ? content.slice(0, 500) : null,
                },
                { status: 502 }
            );
        }

        const usageAfter = await getAiUsageToday(userId).catch(() => null);
        return NextResponse.json({
            questions,
            provider: aiCfg.provider,
            model: aiCfg.model,
            quota: usageAfter
                ? {
                      used: usageAfter.used,
                      cap: dailyCap,
                      resetsAtMidnightIST: true,
                  }
                : null,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/teacher/ai/generate-questions] failed:", e);
        return NextResponse.json(
            { error: e.message || "Generation failed" },
            { status: 500 }
        );
    }
}
