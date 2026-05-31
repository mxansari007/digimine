"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@digimine/ui";
import { AlertTriangle } from "lucide-react";
import type { User } from "firebase/auth";
import { teacherFetch } from "@/lib/api/teacherFetch";

type QuestionRow = {
    id: string;
    questionText: string;
    type: "mcq" | "text_input" | "code";
    marks: number;
    attempts: number;
    correct: number;
    wrong: number;
    skipped: number;
    correctRate: number | null;
    skipRate: number;
    avgTimeSeconds: number | null;
    difficulty: "easy" | "moderate" | "hard" | "n/a";
    commonWrong: {
        optionId: string;
        optionText: string;
        pickedCount: number;
        pickedPercent: number;
    } | null;
};

function difficultyBadge(d: QuestionRow["difficulty"]) {
    if (d === "easy") return "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-500/25";
    if (d === "moderate") return "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-500/25";
    if (d === "hard") return "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-500/25";
    return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
}

function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDuration(sec: number | null) {
    if (sec === null || !sec) return "-";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function QuestionQualityPanel({
    firebaseUser,
    contentId,
    kind,
    testId,
}: {
    firebaseUser: User | null;
    contentId: string;
    kind: "quiz" | "test";
    testId?: string | null;
}) {
    const [questions, setQuestions] = useState<QuestionRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showOnlyHard, setShowOnlyHard] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({
                teacherId: firebaseUser.uid,
                kind,
            });
            if (kind === "test" && testId) params.set("testId", testId);
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/content/${encodeURIComponent(contentId)}/question-analytics?${params.toString()}`
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Failed to load question analytics");
            setQuestions(json.questions || []);
            setTotal(json.totalAttempts || 0);
        } catch (err: any) {
            setError(err.message || "Failed to load question analytics");
            setQuestions([]);
        } finally {
            setLoading(false);
        }
    }, [contentId, kind, testId, firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = showOnlyHard ? questions.filter((q) => q.difficulty === "hard") : questions;

    if (loading) {
        return (
            <Card className="p-8 text-center text-sm text-gray-500">Crunching question analytics…</Card>
        );
    }
    if (error) {
        return <Card className="p-6 text-sm text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10">{error}</Card>;
    }
    if (total === 0) {
        return (
            <Card className="p-8 text-center text-sm text-gray-500">
                No completed attempts yet. Question stats appear once students start submitting.
            </Card>
        );
    }

    return (
        <Card className="p-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Question quality</h3>
                    <p className="text-xs text-gray-500">
                        Across {total} completed attempts. Sorted by lowest correct rate — the hardest questions first.
                    </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input
                        type="checkbox"
                        checked={showOnlyHard}
                        onChange={(e) => setShowOnlyHard(e.target.checked)}
                    />
                    Show only hard
                </label>
            </div>
            {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">No hard questions yet.</div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {filtered.map((q) => (
                        <div key={q.id} className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${difficultyBadge(q.difficulty)}`}>
                                            {q.difficulty}
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">
                                            {q.type}
                                        </span>
                                        <span className="text-[10px] text-gray-400">{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
                                    </div>
                                    <p className="mt-2 text-sm font-medium text-gray-900 line-clamp-2">
                                        {stripHtml(q.questionText)}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-2xl font-bold text-gray-900">
                                        {q.correctRate === null ? "-" : `${q.correctRate}%`}
                                    </p>
                                    <p className="text-[10px] text-gray-500">correct rate</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
                                <div>
                                    <p className="text-gray-500">Attempts</p>
                                    <p className="font-semibold text-gray-900">{q.attempts}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Correct</p>
                                    <p className="font-semibold text-emerald-700">{q.correct}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Wrong</p>
                                    <p className="font-semibold text-rose-700">{q.wrong}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Skipped</p>
                                    <p className="font-semibold text-gray-900">{q.skipped}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Avg time</p>
                                    <p className="font-semibold text-gray-900">{formatDuration(q.avgTimeSeconds)}</p>
                                </div>
                            </div>

                            {q.commonWrong && (
                                <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs ring-1 ring-rose-100 dark:ring-rose-500/25">
                                    <p className="font-semibold text-rose-900 dark:text-rose-300">
                                        Common misconception ({q.commonWrong.pickedPercent}% of wrong answers picked this)
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-rose-700 dark:text-rose-300">
                                        {stripHtml(q.commonWrong.optionText)}
                                    </p>
                                </div>
                            )}

                            {q.skipRate > 25 && (
                                <p className="flex items-start gap-1 text-[11px] text-amber-700">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" strokeWidth={2.5} aria-hidden />
                                    <span>High skip rate ({q.skipRate}%) — students may be running out of time or finding this confusing.</span>
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
