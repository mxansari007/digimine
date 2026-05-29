/**
 * Kokoro-82M text-to-speech HTTP service.
 *
 * Runs on the Azure VM next to Piston. The digimine web app's
 * /api/ai-interview/tts route proxies to this (KOKORO_TTS_URL), so the browser
 * only ever talks to our own origin and the heavy ONNX model lives here.
 *
 * Endpoints:
 *   GET  /health  → { ok, ready }
 *   POST /tts     → audio/wav   body: { text, voice? }   header: x-tts-secret
 *
 * Env:
 *   PORT               (default 2001)
 *   KOKORO_TTS_SECRET  shared secret; if set, /tts requires header x-tts-secret
 *   KOKORO_DTYPE       model dtype (default "q8")
 */
import http from "node:http";
import { KokoroTTS } from "kokoro-js";

const PORT = Number(process.env.PORT) || 2001;
const SECRET = process.env.KOKORO_TTS_SECRET || "";
const DTYPE = process.env.KOKORO_DTYPE || "q8";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VALID_VOICE = /^[a-z]{2}_[a-z]+$/i;

let ttsPromise = null;
let ready = false;
function getTts() {
    if (!ttsPromise) {
        ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, { dtype: DTYPE, device: "cpu" })
            .then((t) => {
                ready = true;
                return t;
            })
            .catch((e) => {
                ttsPromise = null; // allow retry on next request
                throw e;
            });
    }
    return ttsPromise;
}

/** Encode mono Float32 PCM as a 16-bit WAV buffer. */
function encodeWav(samples, sampleRate) {
    const dataSize = samples.length * 2;
    const buf = Buffer.alloc(44 + dataSize);
    let o = 0;
    buf.write("RIFF", o); o += 4;
    buf.writeUInt32LE(36 + dataSize, o); o += 4;
    buf.write("WAVE", o); o += 4;
    buf.write("fmt ", o); o += 4;
    buf.writeUInt32LE(16, o); o += 4;
    buf.writeUInt16LE(1, o); o += 2;
    buf.writeUInt16LE(1, o); o += 2;
    buf.writeUInt32LE(sampleRate, o); o += 4;
    buf.writeUInt32LE(sampleRate * 2, o); o += 4;
    buf.writeUInt16LE(2, o); o += 2;
    buf.writeUInt16LE(16, o); o += 2;
    buf.write("data", o); o += 4;
    buf.writeUInt32LE(dataSize, o); o += 4;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, o);
        o += 2;
    }
    return buf;
}

function readBody(req, limit = 200_000) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (c) => {
            body += c;
            if (body.length > limit) {
                reject(new Error("payload too large"));
                req.destroy();
            }
        });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    // Basic CORS (the web server proxies, but allow direct health checks).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-tts-secret");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, ready }));
        return;
    }

    if (req.method === "POST" && req.url === "/tts") {
        if (SECRET && req.headers["x-tts-secret"] !== SECRET) {
            res.writeHead(401, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "unauthorized" }));
            return;
        }
        try {
            const raw = await readBody(req);
            const { text, voice } = JSON.parse(raw || "{}");
            const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
            if (!clean) {
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "text required" }));
                return;
            }
            const tts = await getTts();
            const safeVoice = VALID_VOICE.test(voice || "") ? voice : "af_heart";
            const audio = await tts.generate(clean, { voice: safeVoice });
            const wav = encodeWav(audio.audio, audio.sampling_rate || 24000);
            res.writeHead(200, { "content-type": "audio/wav", "content-length": wav.length });
            res.end(wav);
        } catch (e) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: String((e && e.message) || "tts failed") }));
        }
        return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
    console.log(`[kokoro-tts] listening on :${PORT}`);
    // Warm the model at boot so the first real request is fast.
    getTts()
        .then(() => console.log("[kokoro-tts] model warm + ready"))
        .catch((e) => console.error("[kokoro-tts] warm failed:", e?.message || e));
});
