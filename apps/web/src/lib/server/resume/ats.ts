/**
 * AI ATS scoring for a resume.
 *
 * One LLM call (DeepSeek by default) over the configured provider — same
 * plumbing as project-eval / AI interviews (`callChat` + `safeParseJsonObject`).
 * The model returns per-dimension subscores against a FIXED rubric
 * (`ATS_DIMENSIONS`); the overall score is recomputed server-side from the
 * weighted subscores, so the model can never inflate the headline number.
 * Every field is clamped/normalized — model JSON is never trusted.
 */
import type { AiProviderConfig, AtsScore, AtsSubscore, ResumeData } from "@digimine/types";
import { ATS_DIMENSIONS } from "@digimine/types";
import { callChat, safeParseJsonObject } from "@/lib/server/aiInterview";
import { resumeToPlainText } from "@/lib/server/resume/store";

function clamp100(n: unknown): number {
    const v = typeof n === "number" ? n : Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
}

function strArr(v: unknown, cap: number, maxLen = 280): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, maxLen))
        .slice(0, cap);
}

const rubricBlock = ATS_DIMENSIONS.map(
    (d) => `  "${d.key}" (${d.label}, weight ${d.weight}): ${d.blurb}`
).join("\n");

export async function scoreResumeAts(
    data: ResumeData,
    jobDescription: string | null,
    cfg: AiProviderConfig,
    nowIso: string
): Promise<AtsScore> {
    const resumeText = resumeToPlainText(data);
    const jd = (jobDescription || "").trim().slice(0, 6000);
    const hasJd = jd.length > 0;

    const system = [
        "You are an expert technical recruiter and ATS (applicant tracking system) auditor.",
        "You evaluate a candidate's resume the way a real ATS + recruiter would: parseability, keyword coverage, quantified impact, completeness, clarity, and length.",
        hasJd
            ? "A target JOB DESCRIPTION is provided — judge keyword match and tailoring against THAT role specifically."
            : "No job description is provided — judge keyword coverage against a strong general resume for the candidate's apparent target role.",
        "Be honest and specific; cite concrete gaps. Respond with STRICT JSON only, no markdown.",
    ].join(" ");

    const user = `RESUME (plain text, as an ATS would parse it):
${resumeText || "(empty resume)"}

${hasJd ? `TARGET JOB DESCRIPTION:\n${jd}\n` : ""}
Score the resume on each rubric dimension from 0 to 100:
${rubricBlock}

Return JSON with EXACTLY this shape:
{
  "summary": "<2-3 sentences, plain language for the candidate: the overall verdict>",
  "subscores": [
    { "key": "<one of: ${ATS_DIMENSIONS.map((d) => d.key).join(", ")}>", "score": <0-100>, "summary": "<one sentence why>", "suggestions": ["<concrete fix>", "..."] }
  ],
  "matchedKeywords": ["<relevant skill/keyword found in the resume>"],
  "missingKeywords": ["<important keyword the resume is missing${hasJd ? " vs. the job description" : ""}>"],
  "topFixes": ["<the single highest-impact fix>", "<next>", "<next>"]
}
Include every dimension exactly once in "subscores". Keep each suggestion to one actionable sentence. At most 5 suggestions per dimension, 15 matched/missing keywords, 6 topFixes.`;

    const raw = await callChat(
        [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        cfg,
        { json: true, temperature: 0.2 }
    );
    const parsed = safeParseJsonObject(raw) || {};

    const byKey = new Map<string, any>();
    (Array.isArray(parsed.subscores) ? parsed.subscores : []).forEach((s: any) => {
        if (s && typeof s.key === "string") byKey.set(s.key, s);
    });

    // One row per rubric dimension, in canonical order. A dimension the model
    // skipped scores 0 with a "review manually" note rather than disappearing.
    const subscores: AtsSubscore[] = ATS_DIMENSIONS.map((d) => {
        const s = byKey.get(d.key) || {};
        return {
            key: d.key,
            label: d.label,
            score: clamp100(s.score),
            summary:
                typeof s.summary === "string" && s.summary.trim()
                    ? s.summary.trim().slice(0, 400)
                    : "The model did not assess this dimension.",
            suggestions: strArr(s.suggestions, 5),
        };
    });

    // Overall = weighted average of subscores (server-computed; model never
    // sets the headline number).
    const totalWeight = ATS_DIMENSIONS.reduce((a, d) => a + d.weight, 0);
    const overall = Math.round(
        subscores.reduce((acc, s) => {
            const w = ATS_DIMENSIONS.find((d) => d.key === s.key)?.weight ?? 0;
            return acc + s.score * w;
        }, 0) / (totalWeight || 1)
    );

    return {
        overall,
        summary:
            typeof parsed.summary === "string" && parsed.summary.trim()
                ? parsed.summary.trim().slice(0, 1200)
                : "Your resume was scored across six ATS dimensions. See the breakdown below for specific fixes.",
        subscores,
        matchedKeywords: strArr(parsed.matchedKeywords, 15, 60),
        missingKeywords: strArr(parsed.missingKeywords, 15, 60),
        topFixes: strArr(parsed.topFixes, 6, 280),
        hasJobDescription: hasJd,
        gradedAt: nowIso,
    };
}
