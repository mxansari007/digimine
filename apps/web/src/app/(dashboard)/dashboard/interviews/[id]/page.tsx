"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
    Mic,
    Square,
    Hand,
    Video,
    VideoOff,
    Volume2,
    VolumeX,
    Captions,
    MessageSquare,
    PhoneOff,
    Play,
    Clock,
    X,
    ScanSearch,
    Terminal,
    ChevronDown,
    CheckCircle2,
    AlertTriangle,
} from "lucide-react";
import { Button, Badge, FormattedContent, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { useKokoroTts } from "@/components/interview/useKokoroTts";
import { InterviewTypeIcon } from "@/components/interview/InterviewTypeIcon";
import { interviewTypeMeta } from "@digimine/types";
import type {
    AIInterviewSession,
    AIInterviewTurn,
    InterviewLanguage,
    InterviewType,
} from "@digimine/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const MONACO_LANG: Record<InterviewLanguage, string> = {
    python: "python",
    javascript: "javascript",
    cpp: "cpp",
    java: "java",
    sql: "sql",
};
const LANG_LABEL: Record<InterviewLanguage, string> = {
    python: "Python",
    javascript: "JavaScript",
    cpp: "C++",
    java: "Java",
    sql: "SQL",
};

/** Shape of the judge result the /turn run action returns — what the console renders. */
interface RunOutput {
    verdict: string;
    passedCount: number;
    totalCount: number;
    runtimeMs?: number;
    compileOutput?: string;
    stderr?: string;
    stdout?: string;
    results?: Array<{
        index: number;
        passed: boolean;
        isHidden: boolean;
        input?: string;
        expectedOutput?: string;
        actualOutput?: string;
    }>;
}

/** A labelled, monospaced key/value block for the console (input/expected/output). */
function ConsoleKV({ k, v, tone }: { k: string; v: string; tone?: "amber" }) {
    return (
        <div className="mt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
            <pre className={`mt-0.5 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-1.5 text-[11px] leading-relaxed ${tone === "amber" ? "text-amber-200" : "text-slate-200"}`}>
                {v || "(empty)"}
            </pre>
        </div>
    );
}

export default function InterviewRoomPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const sessionId = params.id;
    const kokoro = useKokoroTts(firebaseUser, sessionId);

    const [loading, setLoading] = useState(true);
    const [sessionReady, setSessionReady] = useState(false);
    // The room renders as a full-screen takeover. It must be PORTALED to
    // <body>: the dashboard shell's content wrapper is `relative z-0`, which
    // creates a stacking context that would paint any in-tree `fixed z-50`
    // overlay BELOW the z-40 sidebar.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const fullscreen = (node: ReactNode) =>
        mounted && typeof document !== "undefined" ? createPortal(node, document.body) : null;
    const [problem, setProblem] = useState<any>(null);
    const [interviewType, setInterviewType] = useState<InterviewType>("dsa");
    const [interviewTitle, setInterviewTitle] = useState("");
    const [interviewMeta, setInterviewMeta] = useState("");
    const [transcript, setTranscript] = useState<AIInterviewTurn[]>([]);
    const [language, setLanguage] = useState<InterviewLanguage>("python");
    const [codeByLang, setCodeByLang] = useState<Record<string, string>>({});
    const [availableLangs, setAvailableLangs] = useState<InterviewLanguage[]>(["python"]);
    const [codingUnlocked, setCodingUnlocked] = useState(false);
    const isSql = interviewType === "sql";
    // DSA + SQL both reveal a live editor on the interviewer's cue.
    const isCoding = interviewType === "dsa" || isSql;

    const [joined, setJoined] = useState(false);
    const [cameraOn, setCameraOn] = useState(false);
    const [videoOn, setVideoOn] = useState(true);
    const [voiceOn, setVoiceOn] = useState(true);
    const [captionsOn, setCaptionsOn] = useState(true);
    const [chatOpen, setChatOpen] = useState(false);
    const [handsFree, setHandsFree] = useState(true);

    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [running, setRunning] = useState(false);
    const [ending, setEnding] = useState(false);
    // Last run's judge result, rendered in the console panel so the candidate
    // can see compile/runtime errors and per-test expected-vs-actual output.
    const [lastRun, setLastRun] = useState<RunOutput | null>(null);
    const [consoleOpen, setConsoleOpen] = useState(true);
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [remainingMs, setRemainingMs] = useState<number | null>(null);
    const [pendingEnd, setPendingEnd] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);
    const videoElRef = useRef<HTMLVideoElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    // Mic level meter (candidate tile)
    const micCtxRef = useRef<AudioContext | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const micBarRef = useRef<HTMLSpanElement | null>(null);
    // Interviewer voice-matched equalizer bars
    const eqRefs = useRef<Array<HTMLSpanElement | null>>([]);
    // Auto-end + hands-free (VAD)
    const startedAtRef = useRef<number | null>(null);
    const endedRef = useRef(false);
    // Set once a graceful wrap-up has been initiated (by the timer, the AI's own
    // end-signal, or the close button) so the closing can't fire twice.
    const wrapUpRef = useRef(false);
    const blockedRef = useRef(false);
    // Live mirrors of volatile state. The countdown interval (and its timer-driven
    // wrap-up) is set up once when the candidate joins, so a plain closure would
    // capture the join-time code/language/voice. Reading these refs instead means
    // the wrap-up POSTs the candidate's CURRENT code and respects the CURRENT
    // voice/sending state — same pattern as blockedRef in the VAD loop.
    const currentCodeRef = useRef("");
    const languageRef = useRef<InterviewLanguage>("python");
    const voiceOnRef = useRef(true);
    const sendingRef = useRef(false);
    useEffect(() => {
        currentCodeRef.current = codeByLang[language] ?? "";
        languageRef.current = language;
        voiceOnRef.current = voiceOn;
        sendingRef.current = sending;
    });
    const recStartRef = useRef(0);

    const micSupported =
        typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined";

    // ── Camera (local self-view only — never uploaded) ──
    const attachVideo = useCallback((el: HTMLVideoElement | null) => {
        videoElRef.current = el;
        if (el && streamRef.current) el.srcObject = streamRef.current;
    }, []);

    const startCamera = useCallback(async () => {
        if (streamRef.current) {
            setCameraOn(true);
            if (videoElRef.current) videoElRef.current.srcObject = streamRef.current;
            return;
        }
        try {
            // Request audio too — for the live mic-level meter + recording-based
            // speech-to-text (Whisper). Video may be denied while audio works.
            const audioConstraints: MediaTrackConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            };
            const stream = await navigator.mediaDevices
                .getUserMedia({ video: true, audio: audioConstraints })
                .catch(() => navigator.mediaDevices.getUserMedia({ audio: audioConstraints }));
            streamRef.current = stream;
            setCameraOn(stream.getVideoTracks().length > 0);
            if (videoElRef.current) videoElRef.current.srcObject = stream;
            setupMicMeter(stream);
        } catch {
            setCameraOn(false);
        }
    }, []);

    // Live mic level → drives the meter on the candidate tile.
    function setupMicMeter(stream: MediaStream) {
        try {
            if (stream.getAudioTracks().length === 0) return;
            if (micCtxRef.current) return;
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const src = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            micCtxRef.current = ctx;
            micAnalyserRef.current = analyser;
            const data = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
                const a = micAnalyserRef.current;
                if (!a) return;
                a.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const level = Math.min(100, (sum / data.length) * 1.6);
                if (micBarRef.current) micBarRef.current.style.height = `${Math.max(8, level)}%`;
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        } catch {
            /* meter is optional */
        }
    }

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    }, []);

    // ── Load the session ──
    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const res = await teacherFetch(firebaseUser, `/api/ai-interview/session/${sessionId}`);
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't load the interview");
                router.push("/dashboard/interviews");
                return;
            }
            let session = data.session as AIInterviewSession;
            let problemData = data.problem;
            if (session.status === "completed") {
                router.replace(`/dashboard/interviews/${sessionId}/results`);
                return;
            }
            // A booked (scheduled) session is activated on entry — this flips it
            // to in_progress, picks the grounding problem, and seeds the opening
            // line. The /start route enforces the join window + global capacity.
            if (session.status === "scheduled") {
                const begin = await teacherFetch(firebaseUser, "/api/ai-interview/start", {
                    method: "POST",
                    body: JSON.stringify({ sessionId }),
                });
                const bd = await begin.json().catch(() => ({}));
                if (!begin.ok) {
                    toast.error(bd.error || "Couldn't start this interview yet.");
                    router.push("/dashboard/interviews");
                    return;
                }
                session = bd.session as AIInterviewSession;
                problemData = bd.problem;
            }
            const itype = (session.interviewType || "dsa") as InterviewType;
            startedAtRef.current = Date.parse(session.startedAt) || Date.now();
            setInterviewType(itype);
            setInterviewTitle(session.problemTitle || interviewTypeMeta(itype).label);
            setInterviewMeta(
                (itype === "dsa" || itype === "sql") && session.primaryPattern
                    ? `${String(session.primaryPattern).replace(/-/g, " ")} · ${session.difficulty}`
                    : `${interviewTypeMeta(itype).label} · ${session.difficulty}`
            );
            setProblem(problemData);
            setTranscript(Array.isArray(session.transcript) ? session.transcript : []);
            setLanguage(session.language);
            setCodingUnlocked(Boolean(session.codingUnlocked));

            // SQL interviews always use the single "sql" editor mode; DSA offers
            // the problem's executable languages.
            const langs: InterviewLanguage[] =
                itype === "sql"
                    ? ["sql"]
                    : (problemData?.languages as InterviewLanguage[]) || [session.language];
            setAvailableLangs(langs.length ? langs : [session.language]);

            const map: Record<string, string> = {};
            if (Array.isArray(problemData?.starters)) {
                for (const s of problemData.starters) map[s.language] = s.code;
            }
            map[session.language] = session.latestCode ?? map[session.language] ?? "";
            setCodeByLang(map);
            setSessionReady(true);
        } catch {
            toast.error("Couldn't load the interview");
            router.push("/dashboard/interviews");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, sessionId, router, toast]);

    useEffect(() => {
        if (!authLoading && firebaseUser) load();
    }, [authLoading, firebaseUser, load]);

    // Camera preview on mount; clean everything up on unmount.
    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
            kokoro.stop();
            try {
                mediaRecorderRef.current?.stop();
            } catch {
                /* noop */
            }
            micCtxRef.current?.close?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [transcript]);

    // Voice-matched equalizer: drive the interviewer bars from the live audio
    // analyser while it speaks (falls back to a gentle bounce if no analyser).
    useEffect(() => {
        if (!kokoro.speaking) {
            eqRefs.current.forEach((b) => {
                if (b) b.style.height = "12%";
            });
            return;
        }
        let raf = 0;
        const data = new Uint8Array(64);
        const tick = () => {
            const a = kokoro.analyserRef.current;
            const n = eqRefs.current.length;
            if (a) {
                // `data` reads the LOWEST 64 of the analyser's bins (≈0–12 kHz
                // at fftSize 256). Speech energy sits low in that range, so
                // spread the bars over the bottom half on a perceptual curve —
                // a linear sweep of the full spectrum parks the upper bars in
                // silent frequencies and only the first few ever move.
                a.getByteFrequencyData(data);
                for (let i = 0; i < n; i++) {
                    const frac = Math.pow(i / Math.max(1, n - 1), 1.5);
                    const idx = Math.min(data.length - 1, Math.round(frac * data.length * 0.5));
                    const v = data[idx] / 255;
                    const el = eqRefs.current[i];
                    if (el) el.style.height = `${Math.max(12, 12 + v * 88)}%`;
                }
            } else {
                const t = Date.now() / 110;
                for (let i = 0; i < n; i++) {
                    const el = eqRefs.current[i];
                    if (el) el.style.height = `${30 + 45 * Math.abs(Math.sin(t + i * 0.6))}%`;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [kokoro.speaking, kokoro.analyserRef]);

    // Keep a ref of "is the candidate's turn blocked" so the VAD loop (set up
    // once) can read live state without re-subscribing.
    useEffect(() => {
        blockedRef.current = sending || transcribing || kokoro.speaking || kokoro.generating;
    }, [sending, transcribing, kokoro.speaking, kokoro.generating]);

    // Auto-end #1: the interviewer signalled the end — finish once its closing
    // line has finished speaking.
    useEffect(() => {
        if (!pendingEnd) return;
        if (sending || kokoro.generating || kokoro.speaking) return;
        // A spoken closing finishes promptly once speech ends. With voice off,
        // hold the closing remark on screen long enough to read before routing
        // to results, so the wrap-up doesn't feel abrupt.
        const delay = voiceOnRef.current ? 600 : 4000;
        const t = setTimeout(() => endInterview(), delay);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingEnd, sending, kokoro.generating, kokoro.speaking]);

    // Time cap per interview type, with a live countdown. Instead of cutting off
    // at zero, the interviewer is asked to wrap up warmly ~70s before the cap;
    // a hard fallback a little past zero guarantees the room never hangs open.
    useEffect(() => {
        if (!joined) return;
        const durationMs = interviewTypeMeta(interviewType).durationMin * 60_000;
        const WRAP_UP_AT_MS = 70_000; // ask the AI to close ~70s before the cap
        const HARD_STOP_MS = 25_000;  // absolute fallback past the cap
        const id = setInterval(() => {
            const start = startedAtRef.current;
            if (!start) return;
            const left = start + durationMs - Date.now();
            setRemainingMs(Math.max(0, left));
            if (endedRef.current) return;
            // Graceful close: have the interviewer sign off warmly as time runs
            // low. Skip while a candidate turn is in flight so the closing can't
            // collide with that reply into a duplicate exchange.
            if (left <= WRAP_UP_AT_MS && !wrapUpRef.current && !sendingRef.current) {
                requestWrapUp();
            }
            // Absolute safety net: if the wrap-up never completed, end the room.
            if (left <= -HARD_STOP_MS) endInterview();
        }, 1000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [joined, interviewType]);

    // Hands-free voice detection (VAD), ADAPTIVE: instead of a fixed threshold,
    // it continuously learns your room's noise floor and detects speech as
    // energy clearly above it (with hysteresis so it starts/stops cleanly).
    // Uses time-domain RMS (real loudness) and is paused while the interviewer
    // speaks so its own voice can't trigger it. Set up once; reads live state
    // via refs.
    useEffect(() => {
        if (!handsFree || !joined) return;
        // End-of-turn after a real, human-length pause — so a moment of thinking
        // doesn't cut you off. Because it's one continuous recording, anything
        // you say after the pause is part of the SAME turn (the audio adds up);
        // only a full ~1.8s of quiet ends the turn and sends.
        const SILENCE_MS = 1800;
        const MIN_SPEECH_MS = 150; // quick to start once you begin speaking
        const MAX_RECORD_MS = 120_000;
        const buf = new Uint8Array(2048);

        let noiseFloor = 6; // running estimate of ambient RMS (0-100 scale)
        let speechStart = 0;
        let lastVoice = 0;
        let raf = 0;

        const loop = () => {
            const a = micAnalyserRef.current;
            if (a) {
                // Time-domain RMS → a true loudness measure (0..~100).
                const n = Math.min(buf.length, a.fftSize);
                a.getByteTimeDomainData(buf);
                let sumSq = 0;
                for (let i = 0; i < n; i++) {
                    const v = (buf[i] - 128) / 128;
                    sumSq += v * v;
                }
                const level = Math.sqrt(sumSq / n) * 100;

                const now = Date.now();
                const isRec = mediaRecorderRef.current?.state === "recording";
                // Adaptive thresholds, relative to the learned noise floor, with
                // hysteresis (trigger higher than release) + sane minimums.
                const trigger = Math.max(noiseFloor * 2.2, noiseFloor + 5, 3.5);
                const release = Math.max(noiseFloor * 1.5, noiseFloor + 2.5, 2.5);

                if (!isRec) {
                    // Learn the noise floor only when idle + not blocked + quiet.
                    if (!blockedRef.current && level < trigger) {
                        noiseFloor = noiseFloor * 0.95 + level * 0.05;
                    }
                    if (!blockedRef.current && level > trigger) {
                        if (!speechStart) speechStart = now;
                        else if (now - speechStart > MIN_SPEECH_MS) {
                            startRecording();
                            lastVoice = now;
                        }
                    } else {
                        speechStart = 0;
                    }
                } else {
                    // While recording, any energy above the (lower) release
                    // threshold counts as still-speaking; stop after a clear pause.
                    if (level > release) lastVoice = now;
                    if (now - lastVoice > SILENCE_MS || now - recStartRef.current > MAX_RECORD_MS) {
                        stopRecording();
                        speechStart = 0;
                    }
                }
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handsFree, joined]);

    const currentCode = codeByLang[language] ?? "";

    // ── Join (the user gesture that unlocks audio autoplay) ──
    function join() {
        setJoined(true);
        startCamera();
        // The mic AudioContext is created on page load and can be suspended
        // until a user gesture — resume it here so the VAD analyser produces
        // real data (otherwise it reads silence and never detects speech).
        micCtxRef.current?.resume?.().catch(() => {});
        if (voiceOn) {
            const lastInterviewer = [...transcript].reverse().find((t) => t.role === "interviewer");
            if (lastInterviewer) kokoro.speak(lastInterviewer.content);
        }
    }

    function toggleVoice() {
        setVoiceOn((on) => {
            if (on) kokoro.stop();
            return !on;
        });
    }

    function toggleCamera() {
        const tracks = streamRef.current?.getVideoTracks?.() || [];
        if (tracks.length === 0) return;
        const next = !tracks[0].enabled;
        tracks.forEach((t) => (t.enabled = next));
        setVideoOn(next);
    }

    // ── Speech-to-text: record the mic, transcribe via self-hosted Whisper ──
    // (Web Speech API isn't usable — Brave blocks it — so we record + upload.)

    /** Decode a recorded blob → 16 kHz mono Float32 PCM for Whisper. */
    async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
        const ab = await blob.arrayBuffer();
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const decodeCtx = new AC();
        const decoded = await decodeCtx.decodeAudioData(ab);
        decodeCtx.close();
        const offline = new OfflineAudioContext(
            1,
            Math.ceil(decoded.duration * 16000),
            16000
        );
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start();
        const rendered = await offline.startRendering();
        return rendered.getChannelData(0);
    }

    async function transcribeAndFill(blob: Blob) {
        if (!firebaseUser || blob.size < 1000) return;
        setTranscribing(true);
        try {
            const pcm = await blobToPcm16k(blob);
            const res = await teacherFetch(firebaseUser, `/api/ai-interview/stt?sessionId=${encodeURIComponent(sessionId)}`, {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: pcm.buffer.slice(
                    pcm.byteOffset,
                    pcm.byteOffset + pcm.byteLength
                ) as ArrayBuffer,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error || "Couldn't transcribe your audio");
                return;
            }
            const text = (data.text || "").trim();
            if (text) {
                // Auto-send so it flows like a real conversation (combine with
                // anything already typed in the chat box).
                const combined = input.trim() ? `${input.trim()} ${text}` : text;
                setInput("");
                await sendMessageText(combined);
            } else {
                toast.info("Didn't catch that — tap the mic and speak again, or type.");
            }
        } catch {
            toast.error("Microphone transcription failed. You can type instead.");
        } finally {
            setTranscribing(false);
        }
    }

    function startRecording(): boolean {
        if (mediaRecorderRef.current?.state === "recording") return true;
        const stream = streamRef.current;
        const audioTracks = stream?.getAudioTracks() || [];
        if (!stream || audioTracks.length === 0) return false;
        try {
            const audioStream = new MediaStream(audioTracks);
            const rec = new MediaRecorder(audioStream);
            recordedChunksRef.current = [];
            rec.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
            };
            rec.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, {
                    type: rec.mimeType || "audio/webm",
                });
                transcribeAndFill(blob);
            };
            mediaRecorderRef.current = rec;
            recStartRef.current = Date.now();
            rec.start();
            setRecording(true);
            return true;
        } catch {
            return false;
        }
    }

    function stopRecording() {
        try {
            mediaRecorderRef.current?.stop();
        } catch {
            /* noop */
        }
        setRecording(false);
    }

    function toggleMic() {
        if (recording) {
            stopRecording();
            return;
        }
        if (!startRecording()) {
            toast.error("No microphone available. Check the mic permission and reload.");
        }
    }

    // ── Server interactions ──
    // Core send, shared by the typed composer and the auto-send-after-speech
    // flow so talking to the interviewer feels like a real conversation.
    async function sendMessageText(text: string): Promise<boolean> {
        const clean = text.trim();
        // Once the interview is wrapping up / ending, stop accepting new turns so
        // a late message can't race the closing into a duplicate exchange.
        if (!clean || !firebaseUser || sending || wrapUpRef.current || endedRef.current) return false;
        if (recording) {
            try {
                mediaRecorderRef.current?.stop();
            } catch {
                /* noop */
            }
            setRecording(false);
        }
        setSending(true);
        const candidateTurn: AIInterviewTurn = {
            role: "candidate",
            kind: "message",
            content: clean,
            at: new Date().toISOString(),
        };
        setTranscript((t) => [...t, candidateTurn]);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/turn", {
                method: "POST",
                body: JSON.stringify({
                    sessionId,
                    action: "message",
                    message: clean,
                    code: currentCode,
                    language,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setTranscript((t) => t.filter((x) => x !== candidateTurn));
                toast.error(data.error || "The interviewer couldn't respond");
                return false;
            }
            const turn = data.turn as AIInterviewTurn;
            setTranscript((t) => [...t, turn]);
            if (data.codingUnlocked) setCodingUnlocked(true);
            if (voiceOn) kokoro.speak(turn.content);
            // The interviewer signalled the interview is over — finish once the
            // closing line has finished speaking (see the pendingEnd effect).
            // Mark wrapUpRef so the countdown timer doesn't also fire a wrap-up.
            if (data.ended) {
                wrapUpRef.current = true;
                setPendingEnd(true);
            }
            return true;
        } catch {
            setTranscript((t) => t.filter((x) => x !== candidateTurn));
            toast.error("Network error — message not sent");
            return false;
        } finally {
            setSending(false);
        }
    }

    async function sendMessage() {
        const text = input.trim();
        if (!text) return;
        const ok = await sendMessageText(text);
        if (ok) setInput("");
    }

    async function runCode() {
        if (!firebaseUser || running) return;
        setRunning(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/turn", {
                method: "POST",
                body: JSON.stringify({ sessionId, action: "run", code: currentCode, language }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't run your code");
                return;
            }
            setTranscript((t) => [...t, data.turn as AIInterviewTurn]);
            const judge = data.judge;
            if (judge) {
                setLastRun(judge as RunOutput);
                setConsoleOpen(true);
            }
            if (judge?.verdict === "accepted") {
                toast.success(isSql ? "Query matched the expected result" : `Passed ${judge.passedCount}/${judge.totalCount} visible tests`);
            } else if (isSql) {
                toast.warning(
                    judge?.results?.[0]?.actualOutput
                        ? `Not quite — ${String(judge.results[0].actualOutput).slice(0, 120)}`
                        : "Query didn't match the expected result yet"
                );
            } else {
                toast.warning(`${judge?.passedCount ?? 0}/${judge?.totalCount ?? 0} visible tests passed`);
            }
        } catch {
            toast.error("Network error while running code");
        } finally {
            setRunning(false);
        }
    }

    // As the clock runs out, ask the interviewer to deliver a warm closing
    // (a system-initiated "wrapup" turn) instead of the room cutting off — this
    // also covers a candidate who's gone quiet near the end. The closing is
    // shown + spoken, then the pendingEnd effect finishes the room.
    async function requestWrapUp() {
        if (!firebaseUser || endedRef.current || wrapUpRef.current) return;
        wrapUpRef.current = true;
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/turn", {
                method: "POST",
                body: JSON.stringify({
                    sessionId,
                    action: "wrapup",
                    // Read from refs (not the join-time closure) so the final
                    // judge sees the candidate's CURRENT code, not the starter.
                    code: currentCodeRef.current,
                    language: languageRef.current,
                }),
            });
            const data = await res.json();
            if (res.ok && data.turn) {
                const turn = data.turn as AIInterviewTurn;
                setTranscript((t) => [...t, turn]);
                if (voiceOnRef.current) kokoro.speak(turn.content);
                setPendingEnd(true);
            } else {
                // Couldn't generate a closing — finish the room directly.
                endInterview();
            }
        } catch {
            endInterview();
        }
    }

    async function endInterview() {
        // Guard so the timer, the AI end-signal, and the button can't all fire.
        if (!firebaseUser || endedRef.current) return;
        endedRef.current = true;
        setEnding(true);
        try {
            mediaRecorderRef.current?.stop();
        } catch {
            /* noop */
        }
        kokoro.stop();
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/finish", {
                method: "POST",
                body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't finish the interview");
                endedRef.current = false;
                setEnding(false);
                return;
            }
            stopCamera();
            router.push(`/dashboard/interviews/${sessionId}/results`);
        } catch {
            toast.error("Network error while finishing");
            endedRef.current = false;
            setEnding(false);
        }
    }

    // Latest interviewer line, shown as a caption so the candidate can READ
    // what's being said even if the synthesized voice is unclear.
    const lastInterviewerText =
        [...transcript].reverse().find((t) => t.role === "interviewer" && t.kind === "message")
            ?.content || "";

    // A single, always-visible status so nothing happens silently.
    const phase: { label: string; spin: boolean; live?: boolean } = sending
        ? { label: "Interviewer is thinking…", spin: true }
        : transcribing
            ? { label: "Transcribing your answer…", spin: true }
            : recording
                ? {
                      label: handsFree
                          ? "Recording your answer — pause to think, I'll wait"
                          : "Recording — tap the mic to stop",
                      spin: false,
                      live: true,
                  }
                : kokoro.generating
                    ? { label: "Generating the interviewer's voice…", spin: true }
                    : kokoro.speaking
                        ? { label: "Interviewer is speaking", spin: false, live: true }
                        : running
                            ? { label: "Running your code…", spin: true }
                            : {
                                  label: handsFree
                                      ? "Listening — just start speaking"
                                      : "Your turn — speak or type your answer",
                                  spin: false,
                              };

    const remainingLabel =
        remainingMs != null
            ? `${Math.floor(remainingMs / 60000)}:${String(
                  Math.floor((remainingMs % 60000) / 1000)
              ).padStart(2, "0")}`
            : null;

    // ── Render helpers ──
    const EQ_BARS = 9;

    // The interviewer "person" — fills the call stage. A breathing teal
    // spotlight sits behind the avatar (stronger while speaking) so the room
    // visibly reacts to the interviewer's voice; equalizer bars are driven by
    // the live audio analyser.
    const interviewerStage = (compact: boolean) => (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4">
            {/* Voice-reactive spotlight */}
            <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
                    kokoro.speaking ? "opacity-100" : "opacity-50"
                }`}
                style={{
                    background:
                        "radial-gradient(ellipse 55% 45% at 50% 42%, rgba(20,184,166,0.16), transparent 70%)",
                }}
            />
            <div className="relative">
                {kokoro.speaking && (
                    <>
                        <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary-400/20" />
                        <span className="absolute inset-0 -m-1.5 rounded-full ring-2 ring-primary-400/40" />
                    </>
                )}
                <div
                    className={`relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 font-display font-bold text-white shadow-2xl shadow-primary-950/60 ${
                        compact ? "h-16 w-16 text-xl" : "h-28 w-28 text-4xl sm:h-32 sm:w-32"
                    } ${kokoro.speaking ? "ring-4 ring-primary-400/50" : "ring-1 ring-white/15"}`}
                >
                    AI
                </div>
            </div>
            <div className={`relative flex items-end gap-1 ${compact ? "h-6" : "h-10"}`} aria-hidden>
                {Array.from({ length: EQ_BARS }).map((_, i) => (
                    <span
                        key={i}
                        ref={(el) => {
                            eqRefs.current[i] = el;
                        }}
                        className="w-1.5 rounded-full bg-gradient-to-t from-primary-500 to-primary-300 transition-[height] duration-75"
                        style={{ height: "12%" }}
                    />
                ))}
            </div>
            {!compact && (
                <p className="relative font-display text-sm font-semibold tracking-wide text-slate-200">
                    AI Interviewer
                </p>
            )}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                <span
                    className={`h-1.5 w-1.5 rounded-full ${
                        kokoro.speaking ? "animate-pulse bg-emerald-400" : "bg-slate-400"
                    }`}
                />
                Interviewer
            </div>
            {(kokoro.generating || kokoro.usingFallback) && (
                <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium text-slate-200 backdrop-blur">
                    {kokoro.generating ? "generating voice…" : "browser voice"}
                </div>
            )}
        </div>
    );

    // Candidate self-view — small floating thumbnail (Meet PiP).
    const selfPiP = () => (
        <div className="on-dark absolute bottom-3 right-3 z-10 w-28 overflow-hidden rounded-xl bg-[#0b1120] shadow-2xl shadow-black/50 ring-1 ring-white/15 sm:w-44">
            <div className="relative aspect-video">
                <video
                    ref={attachVideo}
                    autoPlay
                    muted
                    playsInline
                    className={`h-full w-full object-cover ${cameraOn && videoOn ? "" : "hidden"}`}
                    style={{ transform: "scaleX(-1)" }}
                />
                {!(cameraOn && videoOn) && (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="on-dark flex h-10 w-10 items-center justify-center rounded-full bg-[#334155] text-sm font-bold text-slate-200">
                            You
                        </div>
                    </div>
                )}
                <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {recording && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />}
                    You
                </div>
                <div className="absolute bottom-1 right-1 flex h-6 w-2 items-end overflow-hidden rounded-full bg-black/50 p-0.5">
                    <span
                        ref={micBarRef}
                        className="w-full rounded-full bg-emerald-400 transition-[height] duration-75"
                        style={{ height: "8%" }}
                    />
                </div>
            </div>
        </div>
    );

    // Live captions (Meet-style) — read what the interviewer just said.
    const captionsOverlay = () => {
        if (!lastInterviewerText) return null;
        return (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
                <div className="max-w-2xl rounded-2xl bg-black/70 px-4 py-2.5 text-center ring-1 ring-white/10 backdrop-blur-md">
                    <p className="text-sm leading-relaxed text-white sm:text-base">{lastInterviewerText}</p>
                </div>
            </div>
        );
    };

    const composer = () => (
        <div className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2">
                <textarea
                    className="field-input flex-1 resize-none"
                    rows={2}
                    placeholder="Type a message (or use the mic on the call)…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                />
                <Button variant="primary" size="md" isLoading={sending} onClick={sendMessage}>
                    Send
                </Button>
            </div>
        </div>
    );

    // Chat as a Meet-style slide-in panel — deliberately a light "paper" panel
    // over the dark room (same move Meet makes), which also keeps the problem
    // statement and transcript maximally readable.
    const chatDrawer = () => (
        <div className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-sm flex-col bg-white shadow-2xl shadow-black/40 sm:my-3 sm:mr-3 sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-3">
                <h3 className="font-semibold">In-call messages</h3>
                <button
                    onClick={() => setChatOpen(false)}
                    className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200"
                    aria-label="Close chat"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            {isCoding && problem && (
                <details className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-semibold text-slate-700">Problem statement</summary>
                    <div className="mt-2 max-h-52 overflow-auto pr-1">
                        <FormattedContent html={problem.statementHtml} size="sm" />
                        {problem.constraintsHtml && (
                            <div className="mt-2">
                                <p className="font-semibold text-slate-700">Constraints</p>
                                <FormattedContent html={problem.constraintsHtml} size="sm" />
                            </div>
                        )}
                        {isSql && problem.sql?.schemaSql && (
                            <div className="mt-2">
                                <p className="font-semibold text-slate-700">Schema</p>
                                <pre className="on-dark mt-1 overflow-auto rounded-md bg-[#0f172a] p-2 text-[11px] leading-relaxed text-slate-100">
                                    {problem.sql.schemaSql}
                                </pre>
                            </div>
                        )}
                    </div>
                </details>
            )}
            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
                {transcript.map((t, i) => {
                    if (t.kind === "run_result") {
                        const ok = t.meta?.verdict === "accepted";
                        return (
                            <div key={`${t.at}-${i}`} className="flex justify-center">
                                <Badge variant={ok ? "success" : "warning"} size="sm">{t.content}</Badge>
                            </div>
                        );
                    }
                    const isInterviewer = t.role === "interviewer";
                    return (
                        <div key={`${t.at}-${i}`} className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}>
                            <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                                    isInterviewer
                                        ? "bg-primary-50 dark:bg-primary-500/10 text-slate-800 border border-primary-100 dark:border-primary-500/25"
                                        : "on-dark bg-[#1e293b] text-white"
                                }`}
                            >
                                {isInterviewer && (
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 mb-1">
                                        Interviewer
                                    </p>
                                )}
                                {t.content}
                            </div>
                        </div>
                    );
                })}
                {sending && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/25 px-3.5 py-2.5 text-sm text-slate-400">
                            Interviewer is thinking…
                        </div>
                    </div>
                )}
            </div>
            {composer()}
        </div>
    );

    // Floating glass control dock (Meet-style). Sits over the dark room, so
    // buttons are white-glass with a primary fill for "on" toggles and rose
    // for recording / leave.
    const controlBtn = (
        icon: ReactNode,
        label: string,
        onClick: () => void,
        opts: { active?: boolean; danger?: boolean; busy?: boolean } = {}
    ) => (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            aria-pressed={opts.active}
            className="group flex flex-col items-center gap-1"
        >
            <span
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 active:scale-95 sm:h-12 sm:w-12 ${
                    opts.danger
                        ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40 hover:bg-rose-500"
                        : opts.active
                            ? "bg-primary-500 text-white shadow-lg shadow-primary-950/40 hover:bg-primary-400"
                            : "bg-white/[0.08] text-slate-200 ring-1 ring-inset ring-white/10 hover:bg-white/[0.16] hover:text-white"
                }`}
            >
                {opts.busy ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
                ) : (
                    icon
                )}
            </span>
            <span className="text-[10px] font-medium text-slate-400 transition-colors group-hover:text-slate-300">
                {label}
            </span>
        </button>
    );

    const controlBar = () => (
        <div className="flex flex-wrap items-end justify-center gap-2.5 rounded-[28px] border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:gap-4 sm:px-6">
            {micSupported &&
                controlBtn(
                    recording ? <Square className="h-5 w-5 fill-current" /> : <Mic className="h-5 w-5" />,
                    recording ? "Stop" : "Speak",
                    toggleMic,
                    { active: recording, danger: recording, busy: transcribing }
                )}
            {micSupported &&
                controlBtn(<Hand className="h-5 w-5" />, handsFree ? "Auto-listen" : "Manual", () => setHandsFree((v) => !v), {
                    active: handsFree,
                })}
            {controlBtn(
                videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />,
                videoOn ? "Camera" : "Cam off",
                toggleCamera,
                { active: videoOn }
            )}
            {controlBtn(
                voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />,
                "Voice",
                toggleVoice,
                { active: voiceOn }
            )}
            {controlBtn(<Captions className="h-5 w-5" />, "Captions", () => setCaptionsOn((v) => !v), { active: captionsOn })}
            {controlBtn(<MessageSquare className="h-5 w-5" />, "Chat", () => setChatOpen((v) => !v), { active: chatOpen })}
            <button onClick={endInterview} disabled={ending} title="End interview" aria-label="End interview" className="group flex flex-col items-center gap-1">
                <span className="flex h-11 w-16 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-950/40 transition-all duration-200 hover:bg-rose-500 active:scale-95 disabled:opacity-70 sm:h-12 sm:w-[72px]">
                    {ending ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                        <PhoneOff className="h-5 w-5" />
                    )}
                </span>
                <span className="text-[10px] font-medium text-rose-300/80 transition-colors group-hover:text-rose-300">Leave</span>
            </button>
        </div>
    );

    // One continuous dark chrome: toolbar / editor / console — reads as a
    // single instrument panel inside the room rather than stacked cards.
    const editorPanel = () => (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-[#0b1120] ring-1 ring-white/[0.08] lg:flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                <select
                    className="rounded-lg border-0 bg-white/[0.07] px-2.5 py-1.5 text-sm font-medium text-slate-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary-400/60 [&>option]:bg-[#0b1120]"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
                    aria-label="Editor language"
                >
                    {availableLangs.map((l) => (
                        <option key={l} value={l}>{LANG_LABEL[l]}</option>
                    ))}
                </select>
                <div className="flex items-center gap-2">
                    {/* Cue the interviewer to read the live editor and give feedback.
                        The current code is already attached to every message, so this
                        just sends an explicit "please review" prompt. */}
                    <button
                        type="button"
                        disabled={sending || running || !currentCode.trim()}
                        onClick={() =>
                            sendMessageText(
                                isSql
                                    ? "Could you take a look at my current query in the editor and give me quick feedback?"
                                    : "Could you take a look at my current code in the editor and give me quick feedback on what to fix?"
                            )
                        }
                        title="Ask the interviewer to review what's in your editor"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 py-1.5 text-sm font-semibold text-slate-200 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {sending ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
                        ) : (
                            <ScanSearch className="h-4 w-4" />
                        )}
                        Review my code
                    </button>
                    <button
                        type="button"
                        disabled={running}
                        onClick={runCode}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-lg shadow-primary-950/40 transition-colors hover:bg-primary-500 disabled:opacity-60"
                    >
                        {running ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        ) : (
                            <Play className="h-4 w-4 fill-current" />
                        )}
                        {isSql ? "Run query" : "Run"}
                    </button>
                </div>
            </div>
            {isSql && problem?.sql?.schemaSql && (
                <details className="border-b border-white/[0.06] px-3 py-2 text-xs" open>
                    <summary className="cursor-pointer font-semibold text-slate-300">Table schema</summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/30 p-2 text-[11px] leading-relaxed text-slate-100">
                        {problem.sql.schemaSql}
                    </pre>
                </details>
            )}
            <div className="h-[42vh] min-h-[280px] lg:h-auto lg:min-h-[300px] lg:flex-1">
                <MonacoEditor
                    key={language}
                    height="100%"
                    language={MONACO_LANG[language] || "plaintext"}
                    value={currentCode}
                    onChange={(v) => setCodeByLang((m) => ({ ...m, [language]: v ?? "" }))}
                    theme="vs-dark"
                    loading={
                        <div className="flex h-full items-center justify-center bg-[#0b1120] text-sm text-slate-400">
                            Loading editor…
                        </div>
                    }
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 12 },
                    }}
                />
            </div>
            {consolePanel()}
        </div>
    );

    // ── Console: run output + compile/runtime errors + failing cases ──
    const consolePanel = () => {
        const v = lastRun?.verdict;
        const accepted = v === "accepted";
        const tone = accepted
            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
            : v === "compile_error" || v === "runtime_error"
                ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                : "bg-amber-500/15 text-amber-300 ring-amber-500/30";
        const verdictLabel = (v || "").replace(/_/g, " ") || "—";
        const visibleFails = (lastRun?.results || []).filter((r) => !r.passed && !r.isHidden);
        return (
            <div className="border-t border-white/[0.06] bg-black/20 text-slate-100">
                <button
                    type="button"
                    onClick={() => setConsoleOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/5"
                >
                    <span className="flex items-center gap-2">
                        <Terminal className="h-3.5 w-3.5" aria-hidden />
                        Console
                        {lastRun && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${tone}`}>
                                {accepted ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                {verdictLabel}
                            </span>
                        )}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${consoleOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {consoleOpen && (
                    <div className="max-h-72 space-y-3 overflow-auto border-t border-white/10 px-3 py-3 text-xs">
                        {!lastRun ? (
                            <p className="text-slate-400">
                                {isSql ? "Run your query" : "Run your code"} to see output and errors here.
                            </p>
                        ) : (
                            <>
                                <p className="text-slate-300">
                                    {isSql
                                        ? accepted
                                            ? "Your result set matched the expected output."
                                            : "Your result set didn't match yet."
                                        : `Passed ${lastRun.passedCount}/${lastRun.totalCount} visible tests`}
                                    {typeof lastRun.runtimeMs === "number" ? ` · ${lastRun.runtimeMs} ms` : ""}
                                </p>

                                {lastRun.compileOutput && (
                                    <div>
                                        <p className="mb-1 font-semibold text-rose-300">Compile error</p>
                                        <pre className="overflow-auto rounded-md bg-rose-950/40 p-2 text-[11px] leading-relaxed text-rose-200 ring-1 ring-inset ring-rose-500/20">{lastRun.compileOutput}</pre>
                                    </div>
                                )}

                                {!lastRun.compileOutput && v === "runtime_error" && lastRun.stderr && (
                                    <div>
                                        <p className="mb-1 font-semibold text-rose-300">Runtime error</p>
                                        <pre className="overflow-auto rounded-md bg-rose-950/40 p-2 text-[11px] leading-relaxed text-rose-200 ring-1 ring-inset ring-rose-500/20">{lastRun.stderr}</pre>
                                    </div>
                                )}

                                {!lastRun.compileOutput && visibleFails.length > 0 && (
                                    <div className="space-y-2">
                                        {visibleFails.map((c) => (
                                            <div key={c.index} className="rounded-md bg-white/5 p-2 ring-1 ring-inset ring-white/10">
                                                <p className="mb-1 font-semibold text-amber-300">{isSql ? "Result mismatch" : `Test #${c.index + 1} failed`}</p>
                                                {c.input ? <ConsoleKV k="Input" v={c.input} /> : null}
                                                <ConsoleKV k="Expected" v={c.expectedOutput ?? ""} />
                                                <ConsoleKV k="Your output" v={c.actualOutput ?? ""} tone="amber" />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {accepted && (
                                    <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
                                        <CheckCircle2 className="h-4 w-4" /> All visible tests passed.
                                    </p>
                                )}

                                {lastRun.stdout && !lastRun.compileOutput && (
                                    <details className="text-slate-300">
                                        <summary className="cursor-pointer text-slate-400">stdout (your print output)</summary>
                                        <pre className="mt-1 overflow-auto rounded-md bg-black/40 p-2 text-[11px] leading-relaxed text-slate-200">{lastRun.stdout}</pre>
                                    </details>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // A read-only problem brief for the approach-discussion phase, so the
    // candidate can actually read the question — and, for SQL, the table schema
    // the interviewer keeps referring to — BEFORE the editor opens. (Once coding
    // is unlocked the editor panel + chat carry this, so it's only shown while
    // discussing the approach.)
    // The problem statement as a white "handout" — a sheet of paper in the
    // dark room. Collapsible so the stage stays the focus once it's been read.
    const problemBrief = () => {
        if (!(isCoding && problem)) return null;
        return (
            <details
                open
                className="rounded-2xl bg-white px-4 py-3 text-sm shadow-2xl shadow-black/40 ring-1 ring-white/10"
            >
                <summary className="cursor-pointer font-semibold text-slate-700">
                    {isSql ? "Problem & schema" : "Problem"}
                </summary>
                <div className="mt-2 max-h-60 overflow-auto pr-1">
                    <FormattedContent html={problem.statementHtml} size="sm" />
                    {problem.constraintsHtml && (
                        <div className="mt-2">
                            <p className="font-semibold text-slate-700">Constraints</p>
                            <FormattedContent html={problem.constraintsHtml} size="sm" />
                        </div>
                    )}
                    {isSql && problem.sql?.schemaSql && (
                        <div className="mt-2">
                            <p className="font-semibold text-slate-700">Schema</p>
                            <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[#0b1120] p-2 text-[11px] leading-relaxed text-slate-100">
                                {problem.sql.schemaSql}
                            </pre>
                        </div>
                    )}
                </div>
            </details>
        );
    };

    // ── Loading: a dark splash so entering the room never flashes white ──
    if (authLoading || loading) {
        return fullscreen(
            <div className="on-dark fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#070b14]">
                <div className="relative">
                    <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary-400/20" />
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 font-display text-2xl font-bold text-white ring-1 ring-white/15">
                        AI
                    </div>
                </div>
                <p className="text-sm font-medium text-slate-400">Preparing your interview room…</p>
            </div>
        );
    }
    if (!sessionReady) return null;

    // ── Green room: device check + session ticket before stepping in ──
    if (!joined) {
        return fullscreen(
            <div className="on-dark fixed inset-0 z-50 overflow-y-auto bg-[#070b14]">
                <div
                    aria-hidden
                    className="pointer-events-none fixed inset-0"
                    style={{
                        background:
                            "radial-gradient(ellipse 50% 40% at 70% 0%, rgba(20,184,166,0.08), transparent 70%), radial-gradient(ellipse 40% 35% at 10% 100%, rgba(20,184,166,0.05), transparent 70%)",
                    }}
                />
                <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-4 py-10">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-400">
                        AI mock interview
                    </p>
                    <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
                        Ready when you are.
                    </h1>
                    <div className="mt-7 grid items-stretch gap-5 lg:grid-cols-[1.25fr_1fr]">
                        {/* Camera check. `aspect-video` only below lg: combined
                            with the stretched row height it would compute the
                            card's WIDTH from the ticket's height and overflow
                            into the ticket column — on lg the card fills the
                            row and the video covers it instead. */}
                        <div className="relative aspect-video min-w-0 overflow-hidden rounded-3xl bg-[#0b1120] ring-1 ring-white/10 lg:aspect-auto lg:h-full lg:min-h-[340px]">
                            <video
                                ref={attachVideo}
                                autoPlay
                                muted
                                playsInline
                                className={`h-full w-full object-cover ${cameraOn ? "" : "hidden"}`}
                                style={{ transform: "scaleX(-1)" }}
                            />
                            {!cameraOn && (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1e293b] text-xl font-bold text-slate-200">
                                        You
                                    </div>
                                    <p className="text-xs">Camera off — you can still join</p>
                                </div>
                            )}
                            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur">
                                <span className="flex h-4 w-1.5 items-end overflow-hidden rounded-full bg-white/20">
                                    <span
                                        ref={micBarRef}
                                        className="w-full rounded-full bg-emerald-400 transition-[height] duration-75"
                                        style={{ height: "8%" }}
                                    />
                                </span>
                                Mic check — say something
                            </div>
                            <p className="absolute bottom-3 right-3 max-w-[55%] rounded-full bg-black/50 px-3 py-1.5 text-right text-[10px] text-slate-300 backdrop-blur">
                                Video never leaves your device
                            </p>
                        </div>

                        {/* Session ticket — a solid panel so it stays readable
                            over the ambient glow (no see-through glass). */}
                        <div className="flex min-w-0 flex-col rounded-3xl border border-white/10 bg-[#0c1424] p-6 shadow-2xl shadow-black/40">
                            <div className="flex items-center gap-3">
                                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-300 ring-1 ring-primary-400/25">
                                    <InterviewTypeIcon type={interviewType} className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="truncate font-display text-lg font-bold text-white">{interviewTitle}</h2>
                                    <p className="truncate text-xs capitalize text-slate-400">{interviewMeta}</p>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                                <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/10">
                                    ~{interviewTypeMeta(interviewType).durationMin} min
                                </span>
                                {isCoding && (
                                    <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/10">
                                        Live code editor
                                    </span>
                                )}
                                <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-inset ring-white/10">
                                    Scorecard at the end
                                </span>
                            </div>
                            <ul className="mt-5 space-y-2.5 border-t border-white/[0.07] pt-5 text-sm text-slate-300">
                                <li className="flex gap-2.5">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                                    Speak naturally — the room listens hands-free and waits while you think.
                                </li>
                                {isCoding ? (
                                    <li className="flex gap-2.5">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                                        Talk through your approach first; the editor unlocks on the interviewer&apos;s cue.
                                    </li>
                                ) : (
                                    <li className="flex gap-2.5">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                                        Structure your answers out loud — that&apos;s what gets scored.
                                    </li>
                                )}
                                <li className="flex gap-2.5">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                                    You&apos;ll get a readiness scorecard with coaching notes when it ends.
                                </li>
                            </ul>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={voiceOn}
                                onClick={() => setVoiceOn((v) => !v)}
                                className="mt-5 flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-left ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.08]"
                            >
                                <span className="text-sm font-medium text-slate-200">Interviewer speaks aloud</span>
                                <span
                                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                                        voiceOn ? "bg-primary-500" : "bg-white/15"
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${
                                            voiceOn ? "left-[18px]" : "left-0.5"
                                        }`}
                                    />
                                </span>
                            </button>
                            <Button variant="primary" size="lg" onClick={join} className="mt-4 w-full">
                                Join interview
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── In-call: a full-screen room (covers the dashboard chrome) ──
    return fullscreen(
        <div className="on-dark fixed inset-0 z-50 flex flex-col bg-[#070b14]">
            {/* Top status rail */}
            <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300 ring-1 ring-primary-400/25">
                        <InterviewTypeIcon type={interviewType} className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-sm font-bold text-white sm:text-base">
                            {interviewTitle}
                        </h1>
                        <p className="truncate text-[11px] capitalize text-slate-400">
                            {interviewMeta}
                            {isCoding && !codingUnlocked && " · discussing approach"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {recording && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 ring-1 ring-inset ring-rose-400/30">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                            REC
                        </span>
                    )}
                    {remainingLabel && (
                        <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${
                                (remainingMs ?? 0) < 60_000
                                    ? "animate-pulse bg-rose-500/15 text-rose-300 ring-rose-400/30"
                                    : (remainingMs ?? 0) < 5 * 60_000
                                        ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                                        : "bg-white/[0.06] text-slate-300 ring-white/10"
                            }`}
                            title="Time remaining"
                        >
                            <Clock className="h-3.5 w-3.5" aria-hidden /> {remainingLabel}
                        </span>
                    )}
                    <span
                        className={`inline-flex max-w-[260px] items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                            phase.live
                                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25"
                                : "bg-white/[0.06] text-slate-300 ring-white/10"
                        }`}
                    >
                        {phase.spin ? (
                            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-primary-400" />
                        ) : (
                            <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    phase.live ? "animate-pulse bg-emerald-400" : "bg-primary-400"
                                }`}
                            />
                        )}
                        <span className="truncate">{phase.label}</span>
                    </span>
                </div>
            </header>

            {/* Stage */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                {!(codingUnlocked && isCoding) ? (
                    // ── Conversation: a real 1:1 video-call stage ──
                    <div className="flex h-full min-h-[480px] flex-col gap-3">
                        <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-3xl bg-gradient-to-b from-[#0d1626] via-[#0a101d] to-[#070b14] ring-1 ring-white/[0.06]">
                            {interviewerStage(false)}
                            {selfPiP()}
                            {captionsOn && captionsOverlay()}
                        </div>
                        {problemBrief()}
                    </div>
                ) : (
                    // ── Coding: instrument panel + a compact call stage beside it ──
                    <div className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[1fr_380px]">
                        <div className="flex min-h-0 flex-col">{editorPanel()}</div>
                        <div className="relative min-h-[300px] overflow-hidden rounded-2xl bg-gradient-to-b from-[#0d1626] via-[#0a101d] to-[#070b14] ring-1 ring-white/[0.06]">
                            {interviewerStage(true)}
                            {selfPiP()}
                            {captionsOn && captionsOverlay()}
                        </div>
                    </div>
                )}
            </div>

            {/* Floating control dock (mic is the primary action) */}
            <footer className="flex justify-center px-3 pb-3 sm:pb-4">
                {controlBar()}
            </footer>

            {/* Slide-in chat (secondary) */}
            {chatOpen && chatDrawer()}
        </div>
    );
}
