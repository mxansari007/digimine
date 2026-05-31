"use client";

/**
 * Interview TTS hook (server-backed).
 *
 * Kokoro now runs SERVER-side (/api/ai-interview/tts) and returns ready WAV
 * audio from our own origin — no esm.sh, no Hugging Face, no in-browser WASM.
 * That fixes Brave Shields / locked-down networks blocking the model and the
 * garbled/slow in-browser inference. If the server call fails for any reason we
 * fall back to the browser's speechSynthesis (forced to English).
 */
import { useCallback, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { teacherFetch } from "@/lib/api/teacherFetch";

const DEFAULT_VOICE = "af_heart";

export function useKokoroTts(user: User | null | undefined, sessionId?: string) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const [speaking, setSpeaking] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [usingFallback, setUsingFallback] = useState(false);

    const speakFallback = useCallback((text: string) => {
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        const synth = window.speechSynthesis;
        let ran = false;
        const run = () => {
            if (ran) return;
            ran = true;
            setGenerating(false);
            try {
                synth.cancel();
                const u = new SpeechSynthesisUtterance(text);
                // Force English so the OS default locale doesn't read English
                // text in another language.
                u.lang = "en-US";
                const voices = synth.getVoices() || [];
                const en =
                    voices.find((v) => /en[-_]US/i.test(v.lang)) ||
                    voices.find((v) => /^en\b/i.test(v.lang)) ||
                    voices.find((v) => /^en/i.test(v.lang)) ||
                    voices.find((v) => /english/i.test(v.name));
                if (en) u.voice = en;
                u.rate = 1.02;
                u.onstart = () => setSpeaking(true);
                u.onend = () => setSpeaking(false);
                u.onerror = () => setSpeaking(false);
                setUsingFallback(true);
                synth.speak(u);
            } catch {
                setSpeaking(false);
            }
        };
        // getVoices() is empty until 'voiceschanged' fires on first load; wait
        // for it (timeout safety net, guarded to run once) so we never speak
        // before an English voice is available.
        if ((synth.getVoices() || []).length > 0) {
            run();
        } else {
            const onVoices = () => {
                synth.removeEventListener("voiceschanged", onVoices);
                run();
            };
            synth.addEventListener("voiceschanged", onVoices);
            setTimeout(run, 300);
        }
    }, []);

    const stop = useCallback(() => {
        try {
            audioRef.current?.pause();
        } catch {
            /* noop */
        }
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setSpeaking(false);
        setGenerating(false);
    }, []);

    const speak = useCallback(
        async (text: string, voice: string = DEFAULT_VOICE) => {
            const clean = (text || "").trim();
            if (!clean) return;
            stop(); // interrupt anything currently playing
            if (!user) {
                speakFallback(clean);
                return;
            }
            setGenerating(true);
            try {
                const res = await teacherFetch(user, "/api/ai-interview/tts", {
                    method: "POST",
                    body: JSON.stringify({ text: clean, voice, sessionId }),
                });
                if (!res.ok) throw new Error(`tts ${res.status}`);
                const blob = await res.blob();
                if (!blob || blob.size < 64) throw new Error("empty audio");
                const url = URL.createObjectURL(blob);
                if (!audioRef.current) audioRef.current = new Audio();
                const el = audioRef.current;
                el.src = url;
                el.onplay = () => {
                    setGenerating(false);
                    setSpeaking(true);
                    setUsingFallback(false);
                };
                el.onended = () => {
                    setSpeaking(false);
                    URL.revokeObjectURL(url);
                };
                el.onerror = () => {
                    setSpeaking(false);
                    setGenerating(false);
                    URL.revokeObjectURL(url);
                };
                // Wire a Web Audio analyser to the element once so the
                // interviewer tile can render a waveform that matches the voice.
                try {
                    if (!ctxRef.current) {
                        const AC =
                            window.AudioContext || (window as any).webkitAudioContext;
                        if (AC) {
                            const ctx = new AC();
                            const srcNode = ctx.createMediaElementSource(el);
                            const analyser = ctx.createAnalyser();
                            analyser.fftSize = 64;
                            analyser.smoothingTimeConstant = 0.6;
                            srcNode.connect(analyser);
                            analyser.connect(ctx.destination);
                            ctxRef.current = ctx;
                            analyserRef.current = analyser;
                        }
                    }
                    ctxRef.current?.resume?.();
                } catch {
                    /* analyser is optional eye-candy */
                }
                await el.play();
            } catch {
                // Server TTS unavailable — use the browser voice so the
                // candidate still hears the interviewer.
                setGenerating(false);
                speakFallback(clean);
            }
        },
        [user, sessionId, stop, speakFallback]
    );

    return { speak, stop, speaking, generating, usingFallback, analyserRef };
}
