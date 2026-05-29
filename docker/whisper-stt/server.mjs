/**
 * Whisper speech-to-text HTTP service.
 *
 * Runs on the Azure VM next to Piston + Kokoro. The digimine web app's
 * /api/ai-interview/stt route proxies to this. The browser records the
 * candidate's mic, decodes + resamples to 16 kHz mono Float32 PCM, and POSTs
 * the raw bytes here — so this works in every browser (Brave blocks the Web
 * Speech API) without any third-party requests from the client.
 *
 * Endpoints:
 *   GET  /health → { ok, ready }
 *   POST /stt    → { text }   body: raw Float32 PCM @16kHz mono   header: x-stt-secret
 *
 * Env: PORT (2002), WHISPER_STT_SECRET, WHISPER_MODEL (default whisper-tiny.en)
 */
import http from "node:http";
import { pipeline } from "@huggingface/transformers";

const PORT = Number(process.env.PORT) || 2002;
const SECRET = process.env.WHISPER_STT_SECRET || "";
const MODEL_ID = process.env.WHISPER_MODEL || "onnx-community/whisper-tiny.en";
const SAMPLE_RATE = 16000;

let asrPromise = null;
let ready = false;
function getAsr() {
    if (!asrPromise) {
        asrPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
            dtype: "q8",
            device: "cpu",
        })
            .then((p) => {
                ready = true;
                return p;
            })
            .catch((e) => {
                asrPromise = null;
                throw e;
            });
    }
    return asrPromise;
}

function readBinary(req, limit = 40_000_000) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let n = 0;
        req.on("data", (c) => {
            n += c.length;
            if (n > limit) {
                reject(new Error("payload too large"));
                req.destroy();
            } else {
                chunks.push(c);
            }
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-stt-secret");
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

    if (req.method === "POST" && req.url === "/stt") {
        if (SECRET && req.headers["x-stt-secret"] !== SECRET) {
            res.writeHead(401, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "unauthorized" }));
            return;
        }
        try {
            const buf = await readBinary(req);
            // Body is raw Float32 PCM @16kHz mono. Copy into an aligned buffer.
            const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            const f32 = new Float32Array(ab);
            if (f32.length < SAMPLE_RATE * 0.2) {
                // < 0.2s — nothing meaningful to transcribe.
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ text: "" }));
                return;
            }
            const asr = await getAsr();
            const out = await asr(f32);
            const text = ((out && out.text) || "").trim();
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ text }));
        } catch (e) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: String((e && e.message) || "stt failed") }));
        }
        return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
    console.log(`[whisper-stt] listening on :${PORT} (model ${MODEL_ID})`);
    getAsr()
        .then(() => console.log("[whisper-stt] model warm + ready"))
        .catch((e) => console.error("[whisper-stt] warm failed:", e?.message || e));
});
