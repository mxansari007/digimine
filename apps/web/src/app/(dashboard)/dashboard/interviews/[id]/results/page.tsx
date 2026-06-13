"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button, Card, Badge, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ScorecardView } from "@/components/interview/ScorecardView";
import { ReadinessRing } from "@/components/interview/ReadinessRing";
import { InterviewTypeIcon } from "@/components/interview/InterviewTypeIcon";
import { interviewTypeMeta, type InterviewType } from "@digimine/types";
import type { AIInterviewSession } from "@digimine/types";

/** "14 min" from the session's start/finish stamps, or null if unknowable. */
function sessionDuration(s: AIInterviewSession): string | null {
    if (!s.startedAt || !s.completedAt) return null;
    const ms = Date.parse(s.completedAt) - Date.parse(s.startedAt);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

function turnTime(at: string): string | null {
    const t = Date.parse(at);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function InterviewResultsPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const sessionId = params.id;

    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<AIInterviewSession | null>(null);
    const [showTranscript, setShowTranscript] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const res = await teacherFetch(firebaseUser, `/api/ai-interview/session/${sessionId}`);
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't load results");
                router.push("/dashboard/interviews");
                return;
            }
            const s = data.session as AIInterviewSession;
            if (s.status !== "completed" || !s.scorecard) {
                // Not finished yet — send them back into the room.
                router.replace(`/dashboard/interviews/${sessionId}`);
                return;
            }
            setSession(s);
        } catch {
            toast.error("Couldn't load results");
            router.push("/dashboard/interviews");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, sessionId, router, toast]);

    useEffect(() => {
        if (!authLoading && firebaseUser) load();
    }, [authLoading, firebaseUser, load]);

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }
    if (!session || !session.scorecard) return null;

    const itype = (session.interviewType || "dsa") as InterviewType;
    const duration = sessionDuration(session);
    const completedOn = session.completedAt
        ? new Date(session.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
        : null;

    const chip = (content: React.ReactNode, key: string) => (
        <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium capitalize text-white/85 ring-1 ring-inset ring-white/10"
        >
            {content}
        </span>
    );

    return (
        <div className="space-y-7">
            <Link href="/dashboard/interviews" className="text-sm text-primary-600 hover:underline">
                ← All interviews
            </Link>

            {/* Debrief hero — inherits the room's dark environment, then hands
                over to light coaching cards below. */}
            <div className="on-dark relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#020617] via-[#0f172a] to-primary-950 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:p-8">
                <div
                    className="absolute inset-0 opacity-25"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
                        backgroundSize: "36px 36px",
                    }}
                />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-300/70 to-transparent" />
                <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center">
                    <div className="shrink-0 self-center md:self-auto">
                        <ReadinessRing
                            value={session.scorecard.readiness}
                            size={150}
                            tone="dark"
                            label="Interview readiness"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-300">
                            Interview debrief
                        </p>
                        <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
                            {session.problemTitle}
                        </h1>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {chip(
                                <>
                                    <InterviewTypeIcon type={itype} className="h-3.5 w-3.5" />
                                    {interviewTypeMeta(itype).label}
                                </>,
                                "type"
                            )}
                            {session.primaryPattern &&
                                chip(session.primaryPattern.replace(/-/g, " "), "pattern")}
                            {chip(session.difficulty, "difficulty")}
                            {duration && chip(duration, "duration")}
                            {completedOn && chip(completedOn, "date")}
                        </div>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 md:w-auto md:flex-col">
                        <Link href="/dashboard/interviews" className="flex-1 md:flex-none">
                            <Button variant="primary" size="md" className="w-full">
                                New interview
                            </Button>
                        </Link>
                        {session.primaryPattern && (
                            <Link href="/practice" className="flex-1 md:flex-none">
                                <button
                                    type="button"
                                    className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:border-white/40 hover:bg-white/10"
                                >
                                    Practice this pattern
                                </button>
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <ScorecardView scorecard={session.scorecard} showReadiness={false} />

            {/* Transcript review */}
            <Card padding="lg">
                <button
                    className="flex w-full items-center justify-between"
                    onClick={() => setShowTranscript((v) => !v)}
                    aria-expanded={showTranscript}
                >
                    <div className="text-left">
                        <h2 className="text-lg font-bold">Interview transcript</h2>
                        <p className="text-xs text-slate-500">
                            Re-read the whole conversation, turn by turn.
                        </p>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <ChevronDown
                            className={`h-4 w-4 transition-transform ${showTranscript ? "rotate-180" : ""}`}
                            aria-hidden
                        />
                    </span>
                </button>
                {showTranscript && (
                    <div className="mt-5 space-y-4">
                        {session.transcript.map((t, i) => {
                            if (t.kind === "run_result") {
                                const ok = t.meta?.verdict === "accepted";
                                return (
                                    <div key={`${t.at}-${i}`} className="flex justify-center">
                                        <Badge variant={ok ? "success" : "warning"} size="sm">{t.content}</Badge>
                                    </div>
                                );
                            }
                            const isInterviewer = t.role === "interviewer";
                            const time = turnTime(t.at);
                            return (
                                <div
                                    key={`${t.at}-${i}`}
                                    className={`flex items-end gap-2.5 ${isInterviewer ? "" : "flex-row-reverse"}`}
                                >
                                    <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                            isInterviewer
                                                ? "bg-gradient-to-br from-primary-400 to-primary-600 text-white"
                                                : "bg-slate-700 text-white"
                                        }`}
                                        aria-hidden
                                    >
                                        {isInterviewer ? "AI" : "You"}
                                    </span>
                                    <div className={`max-w-[80%] ${isInterviewer ? "" : "text-right"}`}>
                                        <div
                                            className={`inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-sm ${
                                                isInterviewer
                                                    ? "rounded-bl-md border border-primary-100 bg-primary-50 text-slate-800 dark:border-primary-500/25 dark:bg-primary-500/10"
                                                    : "on-dark rounded-br-md bg-[#1e293b] text-white"
                                            }`}
                                        >
                                            {t.content}
                                        </div>
                                        {time && (
                                            <p className="mt-1 px-1 text-[10px] tabular-nums text-slate-400">{time}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
