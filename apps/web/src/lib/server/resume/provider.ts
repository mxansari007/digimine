/**
 * Resolve the AI provider for Resume Maker features.
 *
 * Mirrors project-eval's `resolveEvalProvider`: the admin-saved key in
 * Firestore (`appConfig/aiProvider`) wins; otherwise we fall back to the
 * `DEEPSEEK_API_KEY` env var so the resume features work on a fresh deploy /
 * local dev without an admin touching the panel. DeepSeek is already the
 * default provider with an endpoint registered in `aiInterview.ts`.
 */
import type { AiProviderConfig } from "@digimine/types";
import { getAiProviderConfig } from "@/lib/server/aiProvider";

export async function resolveResumeProvider(): Promise<AiProviderConfig> {
    const cfg = await getAiProviderConfig();
    if (cfg.apiKey) return cfg;
    const envKey = process.env.DEEPSEEK_API_KEY || "";
    if (envKey) {
        return {
            ...cfg,
            enabled: true,
            provider: "deepseek",
            apiKey: envKey,
            model: cfg.provider === "deepseek" && cfg.model ? cfg.model : "deepseek-chat",
        };
    }
    return cfg;
}

/** Standard "AI not configured" message for resume routes. */
export const RESUME_AI_UNCONFIGURED =
    "AI features aren't configured yet. Set the provider key in Admin → Settings → AI Provider, or set DEEPSEEK_API_KEY.";
