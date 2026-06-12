/**
 * LLM analysis pipeline for project evaluation.
 *
 * Three stages over the admin-configured provider (`appConfig/aiProvider`,
 * DeepSeek by default — same plumbing as AI interviews / the teacher
 * question generator):
 *
 *   A. overview  — file tree + manifests → detected stack + summary
 *   B. analysis  — selected file contents (chunked) → per-file observations
 *                  targeted at the teacher's parameters
 *   C. scoring   — brief + parameters + observations → per-parameter scores
 *                  with verdicts, confidence, and file-cited evidence
 *
 * The model never sees more than one chunk of code at a time, so repos of
 * any size fit; scores are always clamped server-side to the teacher's
 * maxScore — the model cannot inflate totals.
 */
import type {
    AiProviderConfig,
    ProjectEvalParameter,
    ProjectOverview,
    ProjectParameterScore,
    ProjectParameterVerdict,
} from "@digimine/types";
import { getAiProviderConfig } from "@/lib/server/aiProvider";
import { callChat, safeParseJsonObject } from "@/lib/server/aiInterview";
import type { FileSelection } from "./select";

/** Per-analysis-call content budget (~30K tokens of code). */
const CHUNK_CHAR_BUDGET = 120_000;
const MAX_ANALYSIS_CHUNKS = 2;

export interface EvalContext {
    title: string;
    brief: string;
    techStack: string | null;
    parameters: ProjectEvalParameter[];
}

export interface PipelineResult {
    detectedStack: string;
    overview: ProjectOverview;
    scores: ProjectParameterScore[];
}

/**
 * Resolve the provider config, letting a DEEPSEEK_API_KEY env var stand in
 * when the admin hasn't saved a key in `appConfig/aiProvider` yet. The
 * env path keeps local dev and fresh deploys working without touching the
 * admin panel.
 */
export async function resolveEvalProvider(): Promise<AiProviderConfig> {
    const cfg = await getAiProviderConfig();
    if (cfg.apiKey) return cfg;
    const envKey = process.env.DEEPSEEK_API_KEY || "";
    if (envKey) {
        return { ...cfg, enabled: true, provider: "deepseek", apiKey: envKey, model: cfg.provider === "deepseek" && cfg.model ? cfg.model : "deepseek-chat" };
    }
    return cfg;
}

function parametersBlock(parameters: ProjectEvalParameter[]): string {
    return parameters
        .map(
            (p) =>
                `- id: ${p.id} | "${p.title}" (max ${p.maxScore} marks)\n  Teacher's expectation: ${p.description}`
        )
        .join("\n");
}

function asStringArray(value: unknown, cap: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().slice(0, 500))
        .slice(0, cap);
}

// ─────────────────────────────────────────────────────────────────────
// Stage A — overview
// ─────────────────────────────────────────────────────────────────────

interface OverviewStage {
    detectedStack: string;
    firstImpression: string;
}

async function runOverviewStage(
    cfg: AiProviderConfig,
    ctx: EvalContext,
    selection: FileSelection
): Promise<OverviewStage> {
    const manifests = selection.files
        .filter((f) => /(^|\/)(package\.json|requirements\.txt|pom\.xml|readme(\.md|\.txt)?)$/i.test(f.path))
        .map((f) => `=== ${f.path} ===\n${f.content.slice(0, 6000)}`)
        .join("\n\n");
    const tree = selection.tree.map((t) => `${t.path} (${t.size}b)`).join("\n");

    const raw = await callChat(
        [
            {
                role: "system",
                content:
                    "You are a senior engineer triaging a student's fullstack project for a teacher. Respond with strict JSON only.",
            },
            {
                role: "user",
                content: `The assignment: "${ctx.title}"
${ctx.techStack ? `Expected stack: ${ctx.techStack}` : ""}

FILE TREE:
${tree.slice(0, 30_000)}

KEY MANIFESTS:
${manifests.slice(0, 30_000) || "(none found)"}

Return JSON: {"detectedStack": "<one line, e.g. 'MERN — React (Vite) + Express + MongoDB'>", "firstImpression": "<2-3 sentences: what kind of project this looks like and how it is organized>"}`,
            },
        ],
        cfg,
        { json: true, temperature: 0.2 }
    );
    const parsed = safeParseJsonObject(raw) || {};
    return {
        detectedStack:
            typeof parsed.detectedStack === "string" && parsed.detectedStack
                ? parsed.detectedStack.slice(0, 200)
                : "Unknown",
        firstImpression:
            typeof parsed.firstImpression === "string" ? parsed.firstImpression.slice(0, 1000) : "",
    };
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — per-chunk analysis
// ─────────────────────────────────────────────────────────────────────

interface Observation {
    file: string;
    note: string;
    parameterIds: string[];
}

function chunkFiles(selection: FileSelection): Array<FileSelection["files"]> {
    const chunks: Array<FileSelection["files"]> = [];
    let current: FileSelection["files"] = [];
    let used = 0;
    for (const f of selection.files) {
        if (used + f.content.length > CHUNK_CHAR_BUDGET && current.length > 0) {
            chunks.push(current);
            current = [];
            used = 0;
            if (chunks.length >= MAX_ANALYSIS_CHUNKS) break;
        }
        current.push(f);
        used += f.content.length;
    }
    if (current.length > 0 && chunks.length < MAX_ANALYSIS_CHUNKS) chunks.push(current);
    return chunks;
}

async function runAnalysisStage(
    cfg: AiProviderConfig,
    ctx: EvalContext,
    selection: FileSelection
): Promise<Observation[]> {
    const chunks = chunkFiles(selection);
    const observations: Observation[] = [];

    for (const chunk of chunks) {
        const body = chunk
            .map((f) => `=== FILE: ${f.path}${f.truncated ? " (truncated)" : ""} ===\n${f.content}`)
            .join("\n\n");
        const raw = await callChat(
            [
                {
                    role: "system",
                    content:
                        "You are a senior engineer reading a student's project source code on behalf of their teacher. Record concrete, file-cited observations. Never invent code you have not seen. Respond with strict JSON only.",
                },
                {
                    role: "user",
                    content: `The teacher will grade this project on these parameters:
${parametersBlock(ctx.parameters)}

Read the files below. For each meaningful finding (positive or negative) record an observation citing the file. Focus on findings relevant to the parameters; also note general code-quality signals (structure, error handling, secrets committed, copy-pasted boilerplate, dead code).

${body}

Return JSON: {"observations": [{"file": "<path>", "note": "<one concrete sentence>", "parameterIds": ["p1"]}]} — parameterIds may be empty for general observations. At most 40 observations.`,
                },
            ],
            cfg,
            { json: true, temperature: 0.2 }
        );
        const parsed = safeParseJsonObject(raw);
        const rows = Array.isArray(parsed?.observations) ? parsed.observations : [];
        for (const row of rows.slice(0, 40)) {
            if (typeof row?.note !== "string" || !row.note.trim()) continue;
            observations.push({
                file: typeof row.file === "string" ? row.file.slice(0, 300) : "",
                note: row.note.trim().slice(0, 500),
                parameterIds: asStringArray(row.parameterIds, 12),
            });
        }
    }
    return observations;
}

// ─────────────────────────────────────────────────────────────────────
// Stage C — scoring
// ─────────────────────────────────────────────────────────────────────

const VERDICTS: ProjectParameterVerdict[] = ["met", "partial", "not_met"];

async function runScoringStage(
    cfg: AiProviderConfig,
    ctx: EvalContext,
    stageA: OverviewStage,
    observations: Observation[],
    selection: FileSelection
): Promise<{ overview: ProjectOverview; scores: ProjectParameterScore[] }> {
    const observationsBlock = observations
        .map((o) => `- [${o.file || "general"}] ${o.note}${o.parameterIds.length ? ` (relates to: ${o.parameterIds.join(",")})` : ""}`)
        .join("\n");

    const raw = await callChat(
        [
            {
                role: "system",
                content:
                    "You score a student's fullstack project against the teacher's own parameters. You are writing FOR THE TEACHER — your scores are a reference they will review, so be honest, specific, and cite files. Score strictly from the recorded observations; if there is no evidence for a parameter, it was not met. Respond with strict JSON only.",
            },
            {
                role: "user",
                content: `ASSIGNMENT BRIEF (what the teacher asked students to build):
${ctx.brief.slice(0, 6000)}

SCORING PARAMETERS:
${parametersBlock(ctx.parameters)}

DETECTED STACK: ${stageA.detectedStack}
FIRST IMPRESSION: ${stageA.firstImpression}
FILES ANALYZED: ${selection.files.map((f) => f.path).join(", ").slice(0, 4000)}

OBSERVATIONS FROM SOURCE CODE REVIEW:
${observationsBlock.slice(0, 60_000) || "(no observations recorded)"}

Return JSON:
{
  "overview": {
    "summary": "<3-5 sentences: what the project is and does, plain language for the teacher>",
    "architecture": "<2-4 sentences: how the code is organized, frontend/backend/database layers>",
    "strengths": ["<specific strength>"],
    "improvements": ["<specific, actionable improvement>"],
    "redFlags": ["<suspicious signal, e.g. committed secrets, wholesale boilerplate — empty array if none>"]
  },
  "scores": [
    {
      "parameterId": "<id from the list>",
      "score": <number 0..maxScore for that parameter>,
      "verdict": "met" | "partial" | "not_met",
      "confidence": "high" | "medium" | "low",
      "reasoning": "<2-4 sentences for the teacher explaining the score>",
      "evidence": ["<file path: what was found there>"]
    }
  ]
}
Every parameter must appear exactly once in "scores".`,
            },
        ],
        cfg,
        { json: true, temperature: 0.1 }
    );

    const parsed = safeParseJsonObject(raw) || {};
    const ov = parsed.overview || {};
    const overview: ProjectOverview = {
        summary: typeof ov.summary === "string" ? ov.summary.slice(0, 2000) : "",
        architecture: typeof ov.architecture === "string" ? ov.architecture.slice(0, 2000) : "",
        strengths: asStringArray(ov.strengths, 8),
        improvements: asStringArray(ov.improvements, 8),
        redFlags: asStringArray(ov.redFlags, 8),
    };

    const byId = new Map<string, any>();
    (Array.isArray(parsed.scores) ? parsed.scores : []).forEach((s: any) => {
        if (typeof s?.parameterId === "string") byId.set(s.parameterId, s);
    });

    // One row per teacher parameter, model output clamped and defaulted —
    // a parameter the model skipped scores 0 with low confidence rather
    // than disappearing from the report.
    const scores: ProjectParameterScore[] = ctx.parameters.map((p) => {
        const s = byId.get(p.id) || {};
        const rawScore = typeof s.score === "number" && Number.isFinite(s.score) ? s.score : 0;
        const score = Math.max(0, Math.min(p.maxScore, Math.round(rawScore * 10) / 10));
        const verdict: ProjectParameterVerdict = VERDICTS.includes(s.verdict)
            ? s.verdict
            : score >= p.maxScore * 0.7
              ? "met"
              : score > 0
                ? "partial"
                : "not_met";
        return {
            parameterId: p.id,
            title: p.title,
            score,
            maxScore: p.maxScore,
            verdict,
            confidence: ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "low",
            reasoning:
                typeof s.reasoning === "string" && s.reasoning.trim()
                    ? s.reasoning.trim().slice(0, 2000)
                    : "The model did not return a score for this parameter — review manually.",
            evidence: asStringArray(s.evidence, 8),
        };
    });

    return { overview, scores };
}

// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────

export async function runEvaluationPipeline(
    ctx: EvalContext,
    selection: FileSelection
): Promise<PipelineResult> {
    const cfg = await resolveEvalProvider();
    if (!cfg.enabled || !cfg.apiKey) {
        throw new Error(
            "AI evaluation is not configured. Set the provider key in Admin → Settings → AI Provider, or set DEEPSEEK_API_KEY."
        );
    }

    const stageA = await runOverviewStage(cfg, ctx, selection);
    const observations = await runAnalysisStage(cfg, ctx, selection);
    const { overview, scores } = await runScoringStage(cfg, ctx, stageA, observations, selection);

    if (!overview.summary) {
        overview.summary = stageA.firstImpression || "The model did not produce a summary.";
    }
    return { detectedStack: stageA.detectedStack, overview, scores };
}
