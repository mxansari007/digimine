/**
 * AI writing assistance for the resume editor — the "assistance" half of the
 * editor. Three actions, each a single structured LLM call over the configured
 * provider, all metered identically by the resume_ats gate:
 *
 *   - rewrite_bullet   → strong, quantified variants of a weak bullet
 *   - generate_summary → a professional summary derived from the resume
 *   - tailor           → keyword/phrasing edits to match a pasted JD
 *
 * As everywhere else, model output is parsed defensively and clamped.
 */
import type {
    AiProviderConfig,
    ResumeAssistResultRewrite,
    ResumeAssistResultSummary,
    ResumeAssistResultTailor,
    ResumeData,
    ResumeTailorSuggestion,
} from "@digimine/types";
import { callChat, safeParseJsonObject } from "@/lib/server/aiInterview";
import { resumeToPlainText } from "@/lib/server/resume/store";

function strArr(v: unknown, cap: number, maxLen = 400): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, maxLen))
        .slice(0, cap);
}

export async function rewriteBullet(
    opts: { bullet: string; role: string; context: string },
    cfg: AiProviderConfig
): Promise<ResumeAssistResultRewrite> {
    const bullet = opts.bullet.trim().slice(0, 600);
    const role = opts.role.trim().slice(0, 160);
    const context = opts.context.trim().slice(0, 600);

    const raw = await callChat(
        [
            {
                role: "system",
                content:
                    "You are an expert resume coach. You rewrite a single resume bullet into stronger versions: lead with a strong past-tense action verb, make the impact concrete and quantified (add a realistic metric placeholder like \"X%\" or \"N users\" ONLY if a number is clearly implied — never fabricate specific figures), cut filler, keep it to one line. Respond with STRICT JSON only.",
            },
            {
                role: "user",
                content: `${role ? `Role/title: ${role}\n` : ""}${context ? `Context: ${context}\n` : ""}Original bullet: "${bullet}"

Return JSON: { "variants": ["<rewrite 1, strongest>", "<rewrite 2>", "<rewrite 3>"] } — 2 to 3 distinct one-line variants, no leading "- ".`,
            },
        ],
        cfg,
        { json: true, temperature: 0.5 }
    );
    const parsed = safeParseJsonObject(raw) || {};
    let variants = strArr(parsed.variants, 3, 400);
    if (variants.length === 0 && bullet) variants = [bullet];
    return { action: "rewrite_bullet", variants };
}

export async function generateSummary(
    data: ResumeData,
    opts: { targetRole: string },
    cfg: AiProviderConfig
): Promise<ResumeAssistResultSummary> {
    const targetRole = opts.targetRole.trim().slice(0, 160);
    const resumeText = resumeToPlainText(data);

    const raw = await callChat(
        [
            {
                role: "system",
                content:
                    "You are an expert resume coach. Write a concise professional summary (2-3 sentences, ~40-60 words) for the TOP of a resume, in the third-person-implied resume voice (no \"I\"). Ground it ONLY in the resume content provided — do not invent experience. Lead with the candidate's level/role, then their strongest, most relevant skills and a signature achievement. Respond with STRICT JSON only.",
            },
            {
                role: "user",
                content: `${targetRole ? `Target role: ${targetRole}\n\n` : ""}RESUME:\n${resumeText || "(sparse resume — write a strong generic summary from whatever is present)"}

Return JSON: { "summary": "<the summary>" }`,
            },
        ],
        cfg,
        { json: true, temperature: 0.5 }
    );
    const parsed = safeParseJsonObject(raw) || {};
    const summary =
        typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 800) : "";
    return { action: "generate_summary", summary };
}

export async function tailorToJd(
    data: ResumeData,
    jobDescription: string,
    cfg: AiProviderConfig
): Promise<ResumeAssistResultTailor> {
    const jd = jobDescription.trim().slice(0, 6000);
    const resumeText = resumeToPlainText(data);

    const raw = await callChat(
        [
            {
                role: "system",
                content:
                    "You are an expert resume coach helping a candidate tailor their resume to a specific job. Identify keywords/skills the job wants that the resume lacks, and give specific, honest edits (where to add a keyword, what to re-emphasise, how to reword the summary). Never tell them to claim experience they don't have. Respond with STRICT JSON only.",
            },
            {
                role: "user",
                content: `JOB DESCRIPTION:\n${jd}\n\nCANDIDATE RESUME:\n${resumeText || "(empty)"}

Return JSON:
{
  "missingKeywords": ["<keyword the JD wants that's missing or weak in the resume>"],
  "suggestions": [ { "target": "<section, e.g. 'summary' | 'skills' | 'experience: <company>' | 'projects'>", "suggestion": "<one specific, honest edit>" } ]
}
At most 12 missingKeywords and 10 suggestions.`,
            },
        ],
        cfg,
        { json: true, temperature: 0.3 }
    );
    const parsed = safeParseJsonObject(raw) || {};
    const suggestions: ResumeTailorSuggestion[] = (
        Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    )
        .map((s: any) => ({
            target: typeof s?.target === "string" ? s.target.trim().slice(0, 120) : "",
            suggestion: typeof s?.suggestion === "string" ? s.suggestion.trim().slice(0, 500) : "",
        }))
        .filter((s: ResumeTailorSuggestion) => s.suggestion)
        .slice(0, 10);

    return {
        action: "tailor",
        missingKeywords: strArr(parsed.missingKeywords, 12, 60),
        suggestions,
    };
}
