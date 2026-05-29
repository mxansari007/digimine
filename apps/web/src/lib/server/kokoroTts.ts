/**
 * Server-side Kokoro TTS.
 *
 * Runs Kokoro-82M on the Node server via kokoro-js (onnxruntime-node, CPU), so
 * the browser only ever fetches finished audio from our own origin — no
 * third-party requests (esm.sh / Hugging Face), which Brave Shields and
 * locked-down campus networks block, and no slow in-browser WASM inference.
 *
 * The model is loaded ONCE per server process (module-level singleton) and the
 * weights are fetched server-side on first use (the server isn't behind the
 * user's browser shields), then cached to disk by transformers.js.
 */
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let ttsPromise: Promise<any> | null = null;

async function getTts(): Promise<any> {
    if (!ttsPromise) {
        ttsPromise = (async () => {
            const { KokoroTTS } = await import("kokoro-js");
            return KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" });
        })().catch((e) => {
            // Reset so a transient failure (e.g. first-load network blip) can retry.
            ttsPromise = null;
            throw e;
        });
    }
    return ttsPromise;
}

/** Encode mono Float32 PCM samples as a 16-bit WAV buffer. */
function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample; // mono
    const dataSize = samples.length * bytesPerSample;
    const buf = Buffer.alloc(44 + dataSize);
    let o = 0;
    buf.write("RIFF", o); o += 4;
    buf.writeUInt32LE(36 + dataSize, o); o += 4;
    buf.write("WAVE", o); o += 4;
    buf.write("fmt ", o); o += 4;
    buf.writeUInt32LE(16, o); o += 4; // PCM chunk size
    buf.writeUInt16LE(1, o); o += 2; // audio format = PCM
    buf.writeUInt16LE(1, o); o += 2; // channels = mono
    buf.writeUInt32LE(sampleRate, o); o += 4;
    buf.writeUInt32LE(sampleRate * blockAlign, o); o += 4; // byte rate
    buf.writeUInt16LE(blockAlign, o); o += 2;
    buf.writeUInt16LE(16, o); o += 2; // bits per sample
    buf.write("data", o); o += 4;
    buf.writeUInt32LE(dataSize, o); o += 4;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, o);
        o += 2;
    }
    return buf;
}

const VALID_VOICE = /^[a-z]{2}_[a-z]+$/i;

/** Generate speech for `text` and return WAV bytes. */
export async function generateSpeechWav(text: string, voice = "af_heart"): Promise<Uint8Array> {
    const tts = await getTts();
    const safeVoice = VALID_VOICE.test(voice) ? voice : "af_heart";
    const audio = await tts.generate(text, { voice: safeVoice });
    // RawAudio exposes the raw samples + sampling rate; encode to WAV ourselves
    // so we don't depend on a particular RawAudio.toWav()/toBlob() availability.
    const samples: Float32Array = audio.audio;
    const sampleRate: number = audio.sampling_rate || 24000;
    return encodeWav(samples, sampleRate);
}
