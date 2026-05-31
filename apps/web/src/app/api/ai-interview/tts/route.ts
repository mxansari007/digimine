/**
 * POST /api/ai-interview/tts
 *
 * Server-side Kokoro text-to-speech. The interview room posts the interviewer's
 * line and gets back WAV audio from our own origin — so it works behind Brave
 * Shields / restrictive networks and needs no in-browser model download.
 *
 * Premium-gated (same as the rest of the AI interview). The first request after
 * a cold start loads the model and may take longer; subsequent calls are fast.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getEntitlements } from "@/lib/server/entitlements";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/server/ratelimit";
// Collection name inlined (not imported from aiInterview.ts) to keep this
// onnx-size-sensitive function's module trace minimal — see the note below.
const AI_INTERVIEW_SESSIONS = "aiInterviewSessions";
// NOTE: do NOT import "@/lib/server/kokoroTts" (in-process Kokoro) here. It
// pulls in kokoro-js → onnxruntime-node (~405 MB of GPU/CUDA/TensorRT .so
// files), which Next's file-tracer would bundle into this serverless function
// and blow past Vercel's 250 MB limit (failing every deploy). Production
// synthesizes via Azure AI Speech (primary) or the self-hosted Kokoro VM
// (KOKORO_TTS_URL); the browser falls back to native speechSynthesis if both
// are unavailable. The in-process path remains in kokoroTts.ts for local
// experiments but is intentionally not wired into the deployed route.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const ent = await getEntitlements(userId);
        if (!ent.features.ai_interview) {
            return NextResponse.json({ error: "Premium feature" }, { status: 402 });
        }

        // Bind synthesis to the caller's own LIVE interview — otherwise any
        // premium user could pipe arbitrary text through the paid Azure/Kokoro
        // TTS provider. Plus a per-user rate limit to bound cost per session.
        const body = await req.json().catch(() => ({}));
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId required" }, { status: 400 });
        }
        const rl = await rateLimit("aiTts", userId, { limit: 40, windowSeconds: 60 });
        if (!rl.success) {
            return NextResponse.json({ error: "Too many requests." }, { status: 429 });
        }
        const sSnap = await adminDb.collection(AI_INTERVIEW_SESSIONS).doc(sessionId).get();
        const sData = sSnap.exists ? (sSnap.data() as { userId?: string; status?: string }) : null;
        if (!sData || sData.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (sData.status !== "in_progress") {
            return NextResponse.json({ error: "Interview is not live." }, { status: 409 });
        }

        const text =
            typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 1200) : "";
        const voice = typeof body.voice === "string" ? body.voice : "af_heart";
        if (!text) {
            return NextResponse.json({ error: "text required" }, { status: 400 });
        }

        // Fastest path: Azure AI Speech neural TTS (~sub-second vs ~12s on the
        // CPU VM). Server-side, so the browser still never talks to a third
        // party. Falls through to Kokoro/in-process if it fails or isn't set.
        const azKey = process.env.AZURE_SPEECH_KEY;
        const azRegion = process.env.AZURE_SPEECH_REGION;
        if (azKey && azRegion) {
            try {
                const azVoice = process.env.AZURE_SPEECH_VOICE || "en-US-AriaNeural";
                const esc = text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&apos;");
                const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${azVoice}">${esc}</voice></speak>`;
                const az = await fetch(
                    `https://${azRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
                    {
                        method: "POST",
                        headers: {
                            "Ocp-Apim-Subscription-Key": azKey,
                            "Content-Type": "application/ssml+xml",
                            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                            "User-Agent": "digimine",
                        },
                        body: ssml,
                    }
                );
                if (az.ok) {
                    const audio = await az.arrayBuffer();
                    return new Response(audio, {
                        status: 200,
                        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
                    });
                }
                console.error(
                    "[/api/ai-interview/tts] Azure Speech error",
                    az.status,
                    (await az.text().catch(() => "")).slice(0, 200)
                );
            } catch (azErr) {
                console.error("[/api/ai-interview/tts] Azure Speech threw:", azErr);
            }
            // fall through to Kokoro / in-process below
        }

        // Fallback: the self-hosted Kokoro model on the Azure VM (KOKORO_TTS_URL),
        // or in-process generation for local dev.
        const ttsUrl = process.env.KOKORO_TTS_URL;
        if (ttsUrl) {
            const upstream = await fetch(ttsUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.KOKORO_TTS_SECRET
                        ? { "x-tts-secret": process.env.KOKORO_TTS_SECRET }
                        : {}),
                },
                body: JSON.stringify({ text, voice }),
            });
            if (!upstream.ok) {
                const detail = await upstream.text().catch(() => "");
                throw new Error(`TTS service ${upstream.status}: ${detail.slice(0, 200)}`);
            }
            const audio = await upstream.arrayBuffer();
            return new Response(audio, {
                status: 200,
                headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
            });
        }

        // Neither Azure Speech nor the Kokoro VM is configured/reachable. We
        // don't synthesize in-process in the deployed build (see the import
        // note above), so signal the client to fall back to browser TTS.
        return NextResponse.json(
            { error: "Voice synthesis isn't configured. Set AZURE_SPEECH_KEY or KOKORO_TTS_URL." },
            { status: 503 }
        );
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/tts] failed:", e);
        return NextResponse.json({ error: e.message || "TTS failed" }, { status: 500 });
    }
}
