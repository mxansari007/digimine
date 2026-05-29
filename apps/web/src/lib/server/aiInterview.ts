/**
 * AI interview server core.
 *
 * - Grounds the interviewer in a real `practiceProblem` (statement, expected
 *   pattern, hints, constraints) so it never invents a broken question.
 * - Reuses the admin-managed AI provider (`appConfig/aiProvider`, DeepSeek by
 *   default, OpenAI-compatible /chat/completions) — same plumbing as the
 *   teacher question generator.
 * - Code correctness is judged by the existing Piston/Judge0 pipeline
 *   (`judgeDsa`); the LLM only grades communication/behaviour from the
 *   transcript. Objective signals (filler words, pass rate) are computed
 *   server-side, never trusted to the model.
 */
import type {
    AIInterviewConfig,
    AIInterviewReadiness,
    AIInterviewSession,
    AIInterviewSessionSummary,
    AIInterviewTurn,
    BehaviourDimensionKey,
    BehaviourScorecard,
    InterviewType,
    PracticeProblem,
} from "@digimine/types";
import {
    BEHAVIOUR_DIMENSIONS,
    computeReadiness,
    interviewTypeMeta,
} from "@digimine/types";
import { adminDb } from "@/lib/firebase/admin";
import type { AiProviderConfig } from "@digimine/types";
import type { JudgeResult } from "@/lib/server/practiceJudge";
import { PROBLEMS } from "@/lib/server/practice";

export const AI_INTERVIEW_SESSIONS = "aiInterviewSessions";
export const AI_INTERVIEW_READINESS = "aiInterviewReadiness";
/** Premium feature flag (strict `isPaid` is the real gate; this stays for admin UI). */
export const AI_INTERVIEW_FEATURE = "ai_interview" as const;
/** Weekly cost-control quota key. */
export const AI_INTERVIEW_QUOTA = "aiInterviewsPerWeek" as const;

/** How many recent turns to feed the interviewer (bounds token cost). */
const MAX_CONTEXT_TURNS = 24;

const PROVIDER_ENDPOINTS: Record<string, string> = {
    deepseek: "https://api.deepseek.com/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions",
};

export function providerEndpoint(cfg: AiProviderConfig): string | null {
    return PROVIDER_ENDPOINTS[cfg.provider] ?? null;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Call the configured LLM's chat-completions endpoint. Mirrors the teacher
 * question-generator's upstream shape. Throws on a non-OK upstream so the
 * route can surface a 502.
 */
export async function callChat(
    messages: ChatMessage[],
    cfg: AiProviderConfig,
    opts: { json?: boolean; temperature?: number } = {}
): Promise<string> {
    const endpoint = providerEndpoint(cfg);
    if (!endpoint) {
        throw new Error(`Provider "${cfg.provider}" is not supported for AI interviews.`);
    }
    const body: Record<string, unknown> = {
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.5,
    };
    if (opts.json) body.response_format = { type: "json_object" };

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upstream ${cfg.provider} ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? "";
}

export function safeParseJsonObject(raw: string): any | null {
    if (!raw) return null;
    const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try {
            return JSON.parse(m[0]);
        } catch {
            return null;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// Problem selection
// ─────────────────────────────────────────────────────────────────────

function pickFromPool(
    pool: Array<PracticeProblem & { id: string }>,
    config: AIInterviewConfig
): (PracticeProblem & { id: string }) | null {
    if (pool.length === 0) return null;
    const byCompanyAndPattern = pool.filter(
        (p) =>
            (!config.pattern || p.primaryPattern === config.pattern) &&
            (!config.company ||
                (Array.isArray(p.tags) &&
                    p.tags.some((t) => t.toLowerCase() === config.company!.toLowerCase())))
    );
    const byPattern = pool.filter(
        (p) => !config.pattern || p.primaryPattern === config.pattern
    );
    const candidates =
        byCompanyAndPattern.length > 0
            ? byCompanyAndPattern
            : byPattern.length > 0
                ? byPattern
                : pool;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Choose a published problem matching the config, relaxing company → pattern →
 * difficulty if nothing matches, so a session can always start. The problem
 * `kind` follows the interview type: SQL interviews draw from the SQL bank,
 * everything else (DSA) from the code bank.
 */
export async function pickInterviewProblem(
    config: AIInterviewConfig
): Promise<(PracticeProblem & { id: string }) | null> {
    const kind = config.interviewType === "sql" ? "sql" : "dsa";
    const mapDocs = (snap: { docs: Array<{ id: string; data: () => any }> }) =>
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<
            PracticeProblem & { id: string }
        >;

    // First try at the requested difficulty.
    const atDifficulty = await adminDb
        .collection(PROBLEMS)
        .where("status", "==", "published")
        .where("kind", "==", kind)
        .where("difficulty", "==", config.difficulty)
        .limit(80)
        .get();
    let picked = pickFromPool(mapDocs(atDifficulty), config);
    if (picked) return picked;

    // Fall back to any published problem of this kind.
    const anyOfKind = await adminDb
        .collection(PROBLEMS)
        .where("status", "==", "published")
        .where("kind", "==", kind)
        .limit(120)
        .get();
    picked = pickFromPool(mapDocs(anyOfKind), config);
    return picked;
}

// ─────────────────────────────────────────────────────────────────────
// Prompt building
// ─────────────────────────────────────────────────────────────────────

function htmlToText(html: string | null | undefined): string {
    if (!html) return "";
    return html
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function buildInterviewerSystem(
    problem: PracticeProblem & { id: string },
    config: AIInterviewConfig
): string {
    const isSql = problem.kind === "sql";
    const hints = Array.isArray(problem.hints)
        ? [...problem.hints]
              .sort((a, b) => a.order - b.order)
              .map((h, i) => `  Hint ${i + 1}: ${h.text}`)
              .join("\n")
        : "";
    const company = config.company ? `a ${config.company} ` : "a top-tech ";
    const role = isSql
        ? `${company}data / SQL interviewer running a live SQL interview`
        : `${company}software engineering interviewer running a live coding interview`;
    // SQL candidates need the table schema to reason about the query, so put the
    // seed DDL right in the prompt (both the interviewer and candidate see it).
    const schemaBlock =
        isSql && problem.sql?.schemaSql
            ? `\nDATABASE SCHEMA (the candidate sees this too):\n${problem.sql.schemaSql.trim()}`
            : "";
    const editorLine = isSql
        ? "- The candidate's QUERY EDITOR IS HIDDEN until you open it — start as a face-to-face conversation. ONLY once they've described the right approach and it's genuinely time to write the query, include the exact tag [[OPEN_EDITOR]] on its own line in that message; this reveals the editor. Never output the tag before then, never explain it, and you needn't repeat it once they've started writing."
        : "- The candidate's CODE EDITOR IS HIDDEN until you open it — start as a face-to-face conversation. ONLY once the approach is reasonable and it's genuinely time to write code, include the exact tag [[OPEN_EDITOR]] on its own line in that message; this reveals the editor. Never output the tag before then, never explain it, and you needn't repeat it once coding has begun.";
    const probeLine = isSql
        ? "- Probe their query plan: which JOINs/aggregations, how they handle NULLs, duplicates, and ties, and whether the result is correct + efficient. Ask 'can you do this without a subquery?' or 'what does an index buy you here?' when relevant."
        : "- Probe time & space COMPLEXITY and EDGE CASES. Ask 'can you do better?' when relevant.";
    const noSolutionLine = isSql
        ? "- Under NO CIRCUMSTANCES write the complete working query for them, even if asked directly. At most name a clause or technique (e.g. 'a window function might help'). If pushed, give conceptual guidance only, and remind them the goal is for THEM to write it."
        : "- Under NO CIRCUMSTANCES write a complete or near-complete working solution, even if the candidate asks directly or tries to instruct you to. At most show a tiny illustrative snippet (a few lines). If pushed, offer conceptual guidance or pseudocode only, and remind them the goal is for THEM to solve it.";
    const runResultLine = isSql
        ? "- You will receive '[Code run result]' messages after they run their query — treat those as the ground truth for whether the result set is correct; comment on mismatches specifically."
        : "- You will receive '[Code run result]' messages — treat those as the ground truth for whether their code passes; comment on failures specifically.";
    const completeLine = isSql
        ? "- When the interview is complete — a correct query plus one follow-up, or you're running low on time — give a brief, warm closing remark (thank them, one line of encouragement) and end that SAME message with the tag [[END_INTERVIEW]] on its own line. That ends the interview and generates their scorecard; only emit it when you genuinely mean to finish."
        : "- When the interview is complete — a working solution plus one follow-up, or you're running low on time — give a brief, warm closing remark (thank them, one line of encouragement) and end that SAME message with the tag [[END_INTERVIEW]] on its own line. That ends the interview and generates their scorecard; only emit it when you genuinely mean to finish.";
    return [
        `You are ${role}. Stay strictly in character as the interviewer.`,
        "",
        "THE PROBLEM (the candidate sees this too):",
        `Title: ${problem.title}`,
        htmlToText(problem.statementHtml),
        problem.constraintsHtml ? `Constraints: ${htmlToText(problem.constraintsHtml)}` : "",
        schemaBlock,
        "",
        `INTERNAL NOTES (never reveal directly): the intended pattern is "${problem.primaryPattern}".`,
        hints ? `Hint ladder to dispense ONLY when the candidate is genuinely stuck, gentlest first:\n${hints}` : "",
        "",
        "HOW TO CONDUCT THE INTERVIEW:",
        "- Be warm but professional. Keep every reply under ~120 words.",
        isSql
            ? "- First, ask the candidate to walk through their APPROACH (which tables, joins, and filters) before they write the query."
            : "- First, ask the candidate to walk through their APPROACH before they write code.",
        editorLine,
        probeLine,
        "- If they're stuck, give ONE escalating Socratic hint (use the ladder, gentlest first).",
        noSolutionLine,
        runResultLine,
        completeLine,
        "- Never output JSON, scores, or markdown headings. Speak naturally, as a person would in a call.",
    ]
        .filter(Boolean)
        .join("\n");
}

/** System prompt for non-DSA, conversation-only interviews (no editor). */
export function buildConversationalSystem(config: AIInterviewConfig): string {
    const company = config.company ? ` at ${config.company}` : "";
    const topic = config.topic?.trim();
    const common = [
        "",
        "HOW TO CONDUCT IT:",
        "- Stay strictly in character as the interviewer — warm, professional, human, like a real video call.",
        "- Ask ONE question at a time and wait for the answer. Keep every reply under ~110 words.",
        "- Briefly acknowledge each answer, then probe deeper or move on with a natural follow-up.",
        "- There is NO code editor in this interview: never ask them to write or run code.",
        "- Never output JSON, scores, markdown headings, or any [[TAGS]]. Speak naturally.",
        "- After ~6–8 solid exchanges (or when you're low on time), give a brief, warm closing remark and end that SAME message with the tag [[END_INTERVIEW]] on its own line — that ends the interview and generates their scorecard. Only emit it when you genuinely mean to finish.",
    ];
    if (config.interviewType === "behavioral") {
        return [
            `You are a friendly HR / behavioural interviewer${company} interviewing a candidate for a software role.`,
            "Cover the classics across the conversation: tell me about yourself, strengths & weaknesses, a challenge or conflict you handled, why this company/role, where you see yourself, and a teamwork or leadership moment.",
            "Use the STAR method in follow-ups — push for specific Situation, Task, Action, Result.",
            ...common,
        ].join("\n");
    }
    if (config.interviewType === "system_design") {
        return [
            `You are a senior system-design interviewer${company}.`,
            topic
                ? `Design prompt: "${topic}".`
                : "Open by stating ONE well-known design prompt (e.g. a URL shortener, rate limiter, chat app, or news feed).",
            "Guide them through: clarifying requirements & scale → high-level architecture → data model & APIs → a deep-dive on one component → bottlenecks & trade-offs (caching, sharding, queues, consistency).",
            "The candidate describes the design verbally; you challenge and probe trade-offs. Do NOT design it for them.",
            ...common,
        ].join("\n");
    }
    // technical (CS fundamentals)
    return [
        `You are a technical interviewer${company} testing core CS fundamentals — conceptual, no coding.`,
        topic
            ? `Focus area: ${topic}.`
            : "Range across OOP, DBMS/SQL, Operating Systems, Computer Networks, and core CS.",
        `Calibrate difficulty to: ${config.difficulty}.`,
        "Ask the candidate to EXPLAIN concepts (not code), and probe depth with 'why', 'what happens if', and trade-off follow-ups. Correct gently when an answer is wrong.",
        ...common,
    ].join("\n");
}

/** Map stored turns → chat messages for the interviewer call (bounded, type-aware). */
export function buildInterviewerMessages(opts: {
    interviewType: InterviewType;
    config: AIInterviewConfig;
    problem?: (PracticeProblem & { id: string }) | null;
    transcript: AIInterviewTurn[];
    latestCode: string;
}): ChatMessage[] {
    const { interviewType, config, problem, transcript, latestCode } = opts;
    const recent = transcript.slice(-MAX_CONTEXT_TURNS);
    const mapped: ChatMessage[] = [];
    for (const t of recent) {
        if (t.kind === "code") continue; // latest code appended once below
        if (t.role === "interviewer") {
            mapped.push({ role: "assistant", content: t.content });
        } else if (t.kind === "run_result") {
            mapped.push({ role: "user", content: `[Code run result] ${t.content}` });
        } else {
            mapped.push({ role: "user", content: t.content });
        }
    }
    // DSA + SQL are grounded on a real problem and use the editor-aware prompt;
    // everything else is conversation-only.
    const isCoding = interviewType === "dsa" || interviewType === "sql";
    const system =
        isCoding && problem
            ? buildInterviewerSystem(problem, config)
            : buildConversationalSystem(config);
    const messages: ChatMessage[] = [{ role: "system", content: system }, ...mapped];
    if (isCoding && problem && latestCode && latestCode.trim()) {
        const codeLang = problem.kind === "sql" ? "sql" : problem.languages?.[0] || "python";
        const label = problem.kind === "sql" ? "My current query" : "My current code";
        messages.push({
            role: "user",
            content: `${label} (${codeLang}):\n\`\`\`\n${latestCode.slice(0, 6000)}\n\`\`\``,
        });
    }
    return messages;
}

// ─────────────────────────────────────────────────────────────────────
// Objective signals
// ─────────────────────────────────────────────────────────────────────

const FILLER_RE =
    /\b(um+|uh+|er+|like|you know|basically|actually|literally|sort of|kind of|i guess|i mean)\b/gi;

export function countFillerWords(transcript: AIInterviewTurn[]): number {
    let count = 0;
    for (const t of transcript) {
        if (t.role === "candidate" && t.kind === "message") {
            const m = t.content.match(FILLER_RE);
            if (m) count += m.length;
        }
    }
    return count;
}

export function transcriptToText(transcript: AIInterviewTurn[]): string {
    return transcript
        .map((t) => {
            const who =
                t.role === "interviewer"
                    ? "Interviewer"
                    : t.role === "candidate"
                        ? "Candidate"
                        : "System";
            if (t.kind === "code") return `${who} (code):\n${t.content}`;
            if (t.kind === "run_result") return `System (run result): ${t.content}`;
            return `${who}: ${t.content}`;
        })
        .join("\n");
}

export const EDITOR_SIGNAL = "[[OPEN_EDITOR]]";
const EDITOR_SIGNAL_RE = /\[\[\s*OPEN_EDITOR\s*\]\]/i;
const EDITOR_SIGNAL_RE_G = /\[\[\s*OPEN_EDITOR\s*\]\]/gi;

/**
 * Detect + strip the interviewer's "reveal the editor" control tag so it's
 * never shown to the candidate, and the room can flip into coding mode.
 */
export function extractEditorSignal(text: string): { cleaned: string; openEditor: boolean } {
    const openEditor = EDITOR_SIGNAL_RE.test(text || "");
    const cleaned = (text || "")
        .replace(EDITOR_SIGNAL_RE_G, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { cleaned, openEditor };
}

export const END_SIGNAL = "[[END_INTERVIEW]]";
const END_SIGNAL_RE = /\[\[\s*END_INTERVIEW\s*\]\]/i;
const END_SIGNAL_RE_G = /\[\[\s*END_INTERVIEW\s*\]\]/gi;

/**
 * Detect + strip the interviewer's "the interview is over" control tag so the
 * room can auto-finish and show the scorecard after the closing remark.
 */
export function extractEndSignal(text: string): { cleaned: string; ended: boolean } {
    const ended = END_SIGNAL_RE.test(text || "");
    const cleaned = (text || "")
        .replace(END_SIGNAL_RE_G, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { cleaned, ended };
}

export function summarizeJudgeForChat(judge: JudgeResult): string {
    if (judge.totalCount === 0) return "No test cases were run.";
    const failed = judge.results.filter((r) => !r.passed && !r.isHidden);
    const detail =
        failed.length > 0
            ? ` Failing visible case(s): ${failed
                  .map((f) => `#${f.index + 1} (expected "${(f.expectedOutput ?? "").slice(0, 60)}", got "${(f.actualOutput ?? "").slice(0, 60)}")`)
                  .join("; ")}.`
            : "";
    return `Verdict ${judge.verdict}: passed ${judge.passedCount}/${judge.totalCount} tests.${detail}`;
}

// ─────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────

export function buildScoringMessages(opts: {
    interviewType: InterviewType;
    config: AIInterviewConfig;
    problem?: (PracticeProblem & { id: string }) | null;
    transcript: AIInterviewTurn[];
    finalJudge?: JudgeResult | null;
}): ChatMessage[] {
    const { config, problem, transcript, finalJudge } = opts;
    // Coding interviews (DSA + SQL) carry an objective judge result; conversation
    // types don't, so we ask the model for an "accuracy" score instead.
    const interviewType = opts.interviewType;
    const hasJudge = !!finalJudge;
    const label = interviewTypeMeta(interviewType).label;
    const rubric = BEHAVIOUR_DIMENSIONS.map(
        (d) => `  "${d.key}": 0-100 — ${d.label}: ${d.blurb}`
    ).join("\n");
    const system = [
        `You are a fair, evidence-based interview assessor for a ${label} interview.`,
        "Score ONLY observable behaviour and answer content from the transcript — what the candidate did and said.",
        "Do NOT judge accent, personality, or 'confidence' from tone. Be a supportive coach.",
        "Return STRICT JSON only, no markdown, no commentary.",
    ].join(" ");

    const contextLine = problem
        ? `Problem: "${problem.title}" (intended pattern: ${problem.primaryPattern}, difficulty: ${problem.difficulty}).`
        : `Interview type: ${label}${config.topic ? ` — focus: ${config.topic}` : ""}${config.company ? ` (company: ${config.company})` : ""}. Difficulty: ${config.difficulty}.`;

    const correctnessLine = hasJudge
        ? `Final automated judge result: verdict=${finalJudge!.verdict}, passed ${finalJudge!.passedCount}/${finalJudge!.totalCount} tests. (This is the objective correctness — do not contradict it.)`
        : 'There is no code in this interview. ALSO rate the technical CORRECTNESS / quality of the candidate\'s answers as a separate "accuracy" field: 0-100.';

    const shape = hasJudge
        ? '{"dimensions": {"communication": n, "structure": n, "technical": n, "pace": n, "problemSolving": n}, "strengths": ["..."], "improvements": ["..."], "notes": "2-3 sentence coaching summary"}'
        : '{"dimensions": {"communication": n, "structure": n, "technical": n, "pace": n, "problemSolving": n}, "accuracy": n, "strengths": ["..."], "improvements": ["..."], "notes": "2-3 sentence coaching summary"}';

    const user = [
        contextLine,
        correctnessLine,
        "",
        "TRANSCRIPT:",
        transcriptToText(transcript).slice(0, 12000),
        "",
        "Score these behaviour dimensions (0-100 each):",
        rubric,
        "",
        `Return JSON with EXACTLY this shape: ${shape}.`,
        "strengths and improvements: 2-4 short, specific, actionable bullet strings each.",
    ].join("\n");

    return [
        { role: "system", content: system },
        { role: "user", content: user },
    ];
}

function clampScore(n: any): number {
    const v = typeof n === "number" ? n : Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
}

function strArray(v: any, max = 4): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim().slice(0, 240))
        .slice(0, max);
}

export function normalizeScorecard(
    raw: any,
    opts: { interviewType: InterviewType; finalJudge?: JudgeResult | null; fillerWords: number }
): BehaviourScorecard {
    const { finalJudge, fillerWords } = opts;
    // Coding interviews (DSA + SQL) ship an objective judge result; if one is
    // present we trust it for correctness. Conversation types have none, so we
    // fall back to the LLM's "accuracy".
    const hasJudge = !!finalJudge;
    const dimsRaw = (raw && raw.dimensions) || {};
    // Did the model actually return usable behaviour scores? If the reply was
    // missing/unparseable, the dimensions object will have no numeric fields.
    const hasModelDims = BEHAVIOUR_DIMENSIONS.some(
        (d) => typeof dimsRaw[d.key] === "number"
    );

    // Correctness source: judge pass-rate for coding interviews, the LLM's
    // "accuracy" for conversation-only interviews (which have no code to judge).
    const judgeCorrectness =
        finalJudge && finalJudge.totalCount > 0
            ? Math.round((finalJudge.passedCount / finalJudge.totalCount) * 100)
            : 0;
    const llmAccuracy = typeof raw?.accuracy === "number" ? clampScore(raw.accuracy) : null;
    const correctness = hasJudge ? judgeCorrectness : llmAccuracy ?? (hasModelDims ? 60 : 50);

    const dimensions = {} as Record<BehaviourDimensionKey, number>;
    if (hasModelDims) {
        for (const d of BEHAVIOUR_DIMENSIONS) {
            dimensions[d.key] = clampScore(dimsRaw[d.key]);
        }
    } else {
        // Model scoring unavailable/unparseable — estimate rather than unfairly
        // zeroing the candidate out.
        const estimate =
            finalJudge && finalJudge.totalCount > 0
                ? Math.max(40, Math.min(70, judgeCorrectness))
                : 50;
        for (const d of BEHAVIOUR_DIMENSIONS) dimensions[d.key] = estimate;
    }
    const readiness = computeReadiness(dimensions, correctness);

    const fallbackNote = hasJudge
        ? "Automated coaching wasn't available for this session, so behaviour scores are estimated from your solution. Your correctness above is exact."
        : "Automated coaching wasn't fully available for this session — these are estimates. Keep practising your structure and depth.";

    return {
        dimensions,
        correctness,
        readiness,
        fillerWords,
        strengths: strArray(raw?.strengths),
        improvements: strArray(raw?.improvements),
        notes: hasModelDims
            ? typeof raw?.notes === "string" && raw.notes.trim()
                ? raw.notes.trim().slice(0, 800)
                : "Keep practising — focus on clear structure and explaining your reasoning."
            : fallbackNote,
        verdict: finalJudge && finalJudge.totalCount > 0 ? finalJudge.verdict : null,
        passedCount: finalJudge ? finalJudge.passedCount : 0,
        totalCount: finalJudge ? finalJudge.totalCount : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────
// Readiness rollup
// ─────────────────────────────────────────────────────────────────────

function computeWeakAreas(
    dimensionAverages: Record<BehaviourDimensionKey, number>,
    correctnessAverage: number
): string[] {
    // Correctness is a first-class focus area — it carries the most weight in
    // readiness, so a low solve rate must be surfaceable as a weakness.
    const candidates: Array<{ key: string; v: number }> = [
        ...BEHAVIOUR_DIMENSIONS.map((d) => ({ key: d.key as string, v: dimensionAverages[d.key] ?? 0 })),
        { key: "correctness", v: correctnessAverage },
    ].sort((a, b) => a.v - b.v);
    const below = candidates.filter((c) => c.v < 65).slice(0, 3);
    return (below.length > 0 ? below : candidates.slice(0, 2)).map((c) => c.key);
}

/**
 * Fold a completed session's scorecard into the user's readiness rollup
 * (running averages + capped history).
 *
 * IDEMPOTENT per session: each history point carries its `sessionId`, and we
 * no-op if this session was already folded in. This makes the call safe under
 * concurrent `finish` requests (double-click) and on retry after a partial
 * failure — the session is counted exactly once.
 */
export async function updateReadinessRollup(
    userId: string,
    sessionId: string,
    session: Pick<
        AIInterviewSession,
        "problemTitle" | "primaryPattern" | "completedAt"
    >,
    scorecard: BehaviourScorecard
): Promise<void> {
    const ref = adminDb.collection(AI_INTERVIEW_READINESS).doc(userId);
    const nowIso = session.completedAt || new Date().toISOString();
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = (snap.exists ? snap.data() : null) as
            | AIInterviewReadiness
            | null;

        // Already counted this session — nothing to do (idempotency guard).
        if (prev?.history?.some((h) => h.sessionId === sessionId)) return;

        const prevCount = prev?.completedSessions ?? 0;
        const nextCount = prevCount + 1;

        const dimensionAverages = {} as Record<BehaviourDimensionKey, number>;
        for (const d of BEHAVIOUR_DIMENSIONS) {
            const prevAvg = prev?.dimensionAverages?.[d.key] ?? 0;
            const val = scorecard.dimensions[d.key] ?? 0;
            dimensionAverages[d.key] = Math.round(
                (prevAvg * prevCount + val) / nextCount
            );
        }
        const prevAvgReadiness = prev?.avgReadiness ?? 0;
        const avgReadiness = Math.round(
            (prevAvgReadiness * prevCount + scorecard.readiness) / nextCount
        );
        const prevCorrectness = prev?.correctnessAverage ?? 0;
        const correctnessAverage = Math.round(
            (prevCorrectness * prevCount + scorecard.correctness) / nextCount
        );

        const history = [...(prev?.history ?? [])];
        history.push({
            sessionId,
            at: nowIso,
            readiness: scorecard.readiness,
            problemTitle: session.problemTitle,
            pattern: session.primaryPattern,
        });
        const trimmed = history.slice(-30);

        const rollup: AIInterviewReadiness = {
            userId,
            totalSessions: nextCount,
            completedSessions: nextCount,
            avgReadiness,
            lastReadiness: scorecard.readiness,
            correctnessAverage,
            dimensionAverages,
            weakDimensions: computeWeakAreas(dimensionAverages, correctnessAverage),
            history: trimmed,
            updatedAt: nowIso,
        };
        tx.set(ref, rollup, { merge: true });
    });
}

export async function getReadiness(
    userId: string
): Promise<AIInterviewReadiness | null> {
    const snap = await adminDb.collection(AI_INTERVIEW_READINESS).doc(userId).get();
    if (!snap.exists) return null;
    return snap.data() as AIInterviewReadiness;
}

// ─────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────

export function toSessionSummary(
    s: AIInterviewSession
): AIInterviewSessionSummary {
    return {
        id: s.id,
        status: s.status,
        interviewType: s.interviewType,
        problemTitle: s.problemTitle,
        primaryPattern: s.primaryPattern,
        difficulty: s.difficulty,
        readiness: s.scorecard ? s.scorecard.readiness : null,
        verdict: s.scorecard ? s.scorecard.verdict : null,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
    };
}

/** Build a Firestore-safe turn with an ISO timestamp. */
export function makeTurn(
    role: AIInterviewTurn["role"],
    kind: AIInterviewTurn["kind"],
    content: string,
    meta?: AIInterviewTurn["meta"]
): AIInterviewTurn {
    const turn: AIInterviewTurn = {
        role,
        kind,
        content,
        at: new Date().toISOString(),
    };
    if (meta) turn.meta = meta;
    return turn;
}
