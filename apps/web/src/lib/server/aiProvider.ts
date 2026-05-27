/**
 * Server-side accessor for the admin-managed AI provider config
 * stored at `appConfig/aiProvider`. The apiKey lives here and is
 * NEVER returned from a public endpoint — only this server-side
 * resolver reads it, then talks to the upstream LLM API.
 */
import { adminDb } from "@/lib/firebase/admin";
import type {
    AiProvider,
    AiProviderConfig,
    AiProviderPublicView,
} from "@digimine/types";
import { DEFAULT_AI_PROVIDER_CONFIG } from "@digimine/types";

export async function getAiProviderConfig(): Promise<AiProviderConfig> {
    const snap = await adminDb.collection("appConfig").doc("aiProvider").get();
    if (!snap.exists) return DEFAULT_AI_PROVIDER_CONFIG;
    const d = snap.data() || {};
    const provider: AiProvider =
        d.provider === "openai" || d.provider === "anthropic"
            ? d.provider
            : "deepseek";
    return {
        enabled: Boolean(d.enabled),
        provider,
        apiKey: typeof d.apiKey === "string" ? d.apiKey : "",
        model: typeof d.model === "string" && d.model ? d.model : "deepseek-chat",
        maxQuestionsPerRequest:
            typeof d.maxQuestionsPerRequest === "number" && d.maxQuestionsPerRequest > 0
                ? d.maxQuestionsPerRequest
                : 10,
        updatedAt:
            d.updatedAt?.toDate?.() instanceof Date ? d.updatedAt.toDate() : new Date(0),
        updatedBy: d.updatedBy ?? null,
    };
}

export function toPublicView(c: AiProviderConfig): AiProviderPublicView {
    return {
        enabled: c.enabled,
        provider: c.provider,
        model: c.model,
        maxQuestionsPerRequest: c.maxQuestionsPerRequest,
    };
}
