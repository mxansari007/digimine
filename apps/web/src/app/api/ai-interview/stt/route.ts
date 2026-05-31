/**
 * POST /api/ai-interview/stt
 *
 * Speech-to-text. The browser records the candidate's mic, decodes + resamples
 * to 16 kHz mono Float32 PCM, and POSTs the raw bytes here; we proxy to the
 * self-hosted Whisper service on the Azure VM (WHISPER_STT_URL). This works in
 * every browser — Brave blocks the Web Speech API, so client-side recognition
 * isn't an option.
 *
 * Premium-gated, same as the rest of the AI interview.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getEntitlements } from "@/lib/server/entitlements";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/server/ratelimit";

const AI_INTERVIEW_SESSIONS = "aiInterviewSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Wrap mono Float32 PCM as a 16-bit WAV (what Azure STT short-audio expects). */
function floatPcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const dataSize = samples.length * 2;
    const ab = new ArrayBuffer(44 + dataSize);
    const view = new DataView(ab);
    const wStr = (o: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    wStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    wStr(8, "WAVE");
    wStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    wStr(36, "data");
    view.setUint32(40, dataSize, true);
    let o = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
    }
    return ab;
}

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

        // Bind transcription to the caller's own LIVE interview (sessionId via
        // query string, since the POST body is raw audio bytes) + rate-limit,
        // so the paid Whisper/Azure STT provider can't be abused.
        const sessionId = new URL(req.url).searchParams.get("sessionId") || "";
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId required" }, { status: 400 });
        }
        const rl = await rateLimit("aiStt", userId, { limit: 40, windowSeconds: 60 });
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

        const audio = await req.arrayBuffer();
        if (!audio || audio.byteLength < 1600) {
            return NextResponse.json({ text: "" });
        }

        // Fastest path: Azure AI Speech STT (~sub-second vs several seconds on
        // the CPU Whisper VM). The body is raw Float32 PCM @16kHz mono — wrap it
        // in a 16-bit WAV and post it. Falls back to Whisper on any failure.
        const azKey = process.env.AZURE_SPEECH_KEY;
        const azRegion = process.env.AZURE_SPEECH_REGION;
        if (azKey && azRegion) {
            try {
                const wav = floatPcmToWav(new Float32Array(audio), 16000);
                const az = await fetch(
                    `https://${azRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
                    {
                        method: "POST",
                        headers: {
                            "Ocp-Apim-Subscription-Key": azKey,
                            "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
                            Accept: "application/json",
                        },
                        body: wav,
                    }
                );
                if (az.ok) {
                    const j = await az.json().catch(() => ({}));
                    return NextResponse.json({
                        text:
                            j?.RecognitionStatus === "Success" && typeof j.DisplayText === "string"
                                ? j.DisplayText
                                : "",
                    });
                }
                console.error(
                    "[/api/ai-interview/stt] Azure STT error",
                    az.status,
                    (await az.text().catch(() => "")).slice(0, 200)
                );
            } catch (azErr) {
                console.error("[/api/ai-interview/stt] Azure STT threw:", azErr);
            }
            // fall through to Whisper
        }

        const url = process.env.WHISPER_STT_URL;
        if (!url) {
            return NextResponse.json(
                { error: "Speech-to-text isn't configured." },
                { status: 503 }
            );
        }

        const upstream = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                ...(process.env.WHISPER_STT_SECRET
                    ? { "x-stt-secret": process.env.WHISPER_STT_SECRET }
                    : {}),
            },
            body: audio,
        });
        if (!upstream.ok) {
            const detail = await upstream.text().catch(() => "");
            throw new Error(`STT service ${upstream.status}: ${detail.slice(0, 200)}`);
        }
        const data = await upstream.json().catch(() => ({ text: "" }));
        return NextResponse.json({ text: typeof data.text === "string" ? data.text : "" });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/stt] failed:", e);
        return NextResponse.json({ error: e.message || "STT failed" }, { status: 500 });
    }
}
