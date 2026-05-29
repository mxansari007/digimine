"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Badge, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ScorecardView } from "@/components/interview/ScorecardView";
import type { AIInterviewSession } from "@digimine/types";

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

    return (
        <div className="space-y-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link href="/dashboard/interviews" className="text-sm text-primary-600 hover:underline">
                        ← All interviews
                    </Link>
                    <h1 className="text-3xl font-bold mt-1">Interview results</h1>
                    <p className="text-sm text-slate-500 capitalize mt-1">
                        {session.problemTitle}
                        {session.primaryPattern ? ` · ${session.primaryPattern.replace(/-/g, " ")}` : ""} ·{" "}
                        {session.difficulty}
                    </p>
                </div>
                <div className="flex gap-2">
                    {session.primaryPattern && (
                        <Link href="/practice">
                            <Button variant="outline" size="md">Practice this pattern</Button>
                        </Link>
                    )}
                    <Link href="/dashboard/interviews">
                        <Button variant="primary" size="md">New interview</Button>
                    </Link>
                </div>
            </div>

            <ScorecardView scorecard={session.scorecard} />

            {/* Transcript review */}
            <Card padding="lg">
                <button
                    className="flex w-full items-center justify-between"
                    onClick={() => setShowTranscript((v) => !v)}
                >
                    <h2 className="text-lg font-bold">Interview transcript</h2>
                    <Badge variant="outline" size="sm">{showTranscript ? "Hide" : "Show"}</Badge>
                </button>
                {showTranscript && (
                    <div className="mt-4 space-y-3">
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
                            return (
                                <div key={`${t.at}-${i}`} className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}>
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                                            isInterviewer
                                                ? "bg-primary-50 text-slate-800 border border-primary-100"
                                                : "bg-slate-800 text-white"
                                        }`}
                                    >
                                        {t.content}
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
