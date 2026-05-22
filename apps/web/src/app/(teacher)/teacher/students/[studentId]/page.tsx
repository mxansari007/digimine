"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { ActivityHeatmap } from "@/components/teacher/ActivityHeatmap";
import { TrendLine } from "@/components/teacher/TrendLine";

type RiskBand = "low" | "medium" | "high";

type Analytics = {
    student: {
        id: string;
        studentName: string;
        studentEmail: string;
        rollNumber: string | null;
        status: string;
        enrolledAt: string | null;
        lastActiveAt: string | null;
    };
    risk: {
        score: number;
        band: RiskBand;
        reasons: string[];
        metrics: {
            averagePercentage: number | null;
            recentTrend: number;
            daysSinceLastActive: number | null;
            coveragePercent: number;
        };
    };
    headline: {
        studentAverage: number | null;
        classAverage: number | null;
        bestPercentage: number | null;
        completedAttempts: number;
        inProgressAttempts: number;
        totalAssignedContent: number;
        completedContentCount: number;
        coveragePercent: number;
        avgDurationSeconds: number | null;
        classAvgDurationSeconds: number | null;
        longestStreakDays: number;
        currentStreakDays: number;
    };
    trend: Array<{ attemptId: string; contentTitle: string; category: string; kind: "quiz" | "test"; percentage: number; completedAt: string | null }>;
    rollingAvg: Array<{ index: number; average: number }>;
    topicBreakdown: Array<{ category: string; studentAverage: number | null; classAverage: number | null; studentAttempts: number }>;
    sectionStrengths: Array<{ key: string; title: string; averagePercentage: number; attempts: number }>;
    daily: Array<{ date: string; count: number; avgPercentage: number | null }>;
    recent: Array<{ id: string; kind: "quiz" | "test"; contentTitle: string; category: string; status: string; percentage: number; durationSeconds: number; completedAt: string | null; correctAnswers: number; wrongAnswers: number }>;
};

const riskBg: Record<RiskBand, string> = {
    low: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    high: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function formatPct(n: number | null | undefined) {
    return n === null || n === undefined ? "-" : `${n}%`;
}

function formatDuration(sec: number | null) {
    if (sec === null || !sec) return "-";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDate(value?: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TeacherStudentDetailPage() {
    const params = useParams();
    const studentId = params.studentId as string;
    const { firebaseUser } = useAuthContext();

    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [noteBody, setNoteBody] = useState("");
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteSavedAt, setNoteSavedAt] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const [analyticsRes, notesRes] = await Promise.all([
                teacherFetch(
                    firebaseUser,
                    `/api/teacher/students/${encodeURIComponent(studentId)}/analytics?teacherId=${encodeURIComponent(firebaseUser.uid)}`
                ),
                teacherFetch(
                    firebaseUser,
                    `/api/teacher/students/${encodeURIComponent(studentId)}/notes?teacherId=${encodeURIComponent(firebaseUser.uid)}`
                ),
            ]);
            const analyticsData = await analyticsRes.json();
            const notesData = await notesRes.json();
            if (!analyticsRes.ok) throw new Error(analyticsData.error || "Failed to load student.");
            setData(analyticsData);
            if (notesRes.ok) {
                setNoteBody(notesData.note?.body || "");
                setNoteSavedAt(notesData.note?.updatedAt || null);
            }
        } catch (err: any) {
            setError(err.message || "Failed to load student.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, studentId]);

    useEffect(() => {
        load();
    }, [load]);

    const saveNote = async () => {
        if (!firebaseUser) return;
        setNoteSaving(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/students/${encodeURIComponent(studentId)}/notes?teacherId=${encodeURIComponent(firebaseUser.uid)}`,
                {
                    method: "PUT",
                    body: JSON.stringify({ body: noteBody }),
                }
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Failed to save note.");
            setNoteSavedAt(json.updatedAt || new Date().toISOString());
        } catch (err: any) {
            alert(err.message || "Failed to save note.");
        } finally {
            setNoteSaving(false);
        }
    };

    if (loading) return <div className="py-20 text-center text-gray-500">Loading...</div>;
    if (error || !data) {
        return (
            <Card className="p-8 text-center text-red-700">
                {error || "Student not found."}
                <Link href="/teacher/students" className="ml-2 text-primary-700 underline">
                    Back
                </Link>
            </Card>
        );
    }

    const { student, risk, headline, trend, rollingAvg, topicBreakdown, sectionStrengths, daily, recent } = data;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link href="/teacher/students" className="text-sm text-primary-700 hover:text-primary-800">
                        ← Back to students
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-gray-900">{student.studentName}</h1>
                    <p className="text-sm text-gray-500">{student.studentEmail || "No email"}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/teacher/students/compare?a=${encodeURIComponent(studentId)}`}>
                        <Button variant="outline">Compare with…</Button>
                    </Link>
                    <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                            student.status === "active"
                                ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                                : student.status === "banned"
                                ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                                : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                        }`}
                    >
                        {student.status}
                    </span>
                </div>
            </div>

            {/* Risk + headline */}
            <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                <Card className={`p-6 ${risk.band === "high" ? "border-red-200" : risk.band === "medium" ? "border-amber-200" : "border-emerald-200"}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Risk score</p>
                        <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskBg[risk.band]}`}>
                            {risk.band.toUpperCase()}
                        </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <p className="text-5xl font-bold text-gray-900">{risk.score}</p>
                        <p className="text-xs text-gray-500">/ 100</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                            className={`h-full ${risk.band === "high" ? "bg-red-500" : risk.band === "medium" ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${risk.score}%` }}
                        />
                    </div>
                    {risk.reasons.length > 0 ? (
                        <ul className="mt-4 space-y-1 text-xs text-gray-600">
                            {risk.reasons.map((r) => (
                                <li key={r}>• {r}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-4 text-xs text-gray-500">No risk factors detected.</p>
                    )}
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px] text-gray-500">
                        <div>
                            <dt>Avg</dt>
                            <dd className="font-semibold text-gray-900">{formatPct(risk.metrics.averagePercentage)}</dd>
                        </div>
                        <div>
                            <dt>Trend</dt>
                            <dd className={`font-semibold ${risk.metrics.recentTrend < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                {risk.metrics.recentTrend > 0 ? "+" : ""}
                                {risk.metrics.recentTrend}%
                            </dd>
                        </div>
                        <div>
                            <dt>Inactive</dt>
                            <dd className="font-semibold text-gray-900">
                                {risk.metrics.daysSinceLastActive === null
                                    ? "never seen"
                                    : `${risk.metrics.daysSinceLastActive}d`}
                            </dd>
                        </div>
                        <div>
                            <dt>Coverage</dt>
                            <dd className="font-semibold text-gray-900">{risk.metrics.coveragePercent}%</dd>
                        </div>
                    </dl>
                </Card>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Card className="p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Student vs class average</p>
                        <div className="mt-3 flex items-baseline gap-3">
                            <p className="text-4xl font-bold text-gray-900">{formatPct(headline.studentAverage)}</p>
                            <span
                                className={`text-sm font-semibold ${
                                    headline.studentAverage !== null && headline.classAverage !== null
                                        ? headline.studentAverage >= headline.classAverage
                                            ? "text-emerald-600"
                                            : "text-rose-600"
                                        : "text-gray-400"
                                }`}
                            >
                                {headline.studentAverage !== null && headline.classAverage !== null
                                    ? `${headline.studentAverage >= headline.classAverage ? "+" : ""}${headline.studentAverage - headline.classAverage}`
                                    : "-"}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500">Class avg: {formatPct(headline.classAverage)}</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Best score</p>
                        <p className="mt-3 text-4xl font-bold text-gray-900">{formatPct(headline.bestPercentage)}</p>
                        <p className="text-xs text-gray-500">
                            {headline.completedAttempts} attempts · {headline.inProgressAttempts} active
                        </p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Coverage</p>
                        <p className="mt-3 text-4xl font-bold text-gray-900">
                            {headline.completedContentCount}/{headline.totalAssignedContent}
                        </p>
                        <p className="text-xs text-gray-500">{headline.coveragePercent}% of content done</p>
                    </Card>
                    <Card className="p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Time per attempt</p>
                        <p className="mt-3 text-4xl font-bold text-gray-900">
                            {formatDuration(headline.avgDurationSeconds)}
                        </p>
                        <p className="text-xs text-gray-500">
                            Class avg {formatDuration(headline.classAvgDurationSeconds)}
                            {" · "}
                            streak {headline.currentStreakDays}d (best {headline.longestStreakDays}d)
                        </p>
                    </Card>
                </div>
            </div>

            {/* Trend chart */}
            <Card className="p-6">
                <div className="flex items-end justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Performance trend</h3>
                        <p className="text-xs text-gray-500">Score % across every completed attempt, oldest → newest.</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                            <span className="h-1 w-3 rounded bg-emerald-600" /> attempts
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="h-1 w-3 rounded border border-dashed border-slate-400" /> rolling 3-attempt avg
                        </span>
                    </div>
                </div>
                <div className="mt-3">
                    <TrendLine
                        points={trend.map((t, i) => ({ label: `${t.contentTitle} (${i + 1})`, value: t.percentage }))}
                        rolling={rollingAvg}
                    />
                </div>
            </Card>

            {/* Topic breakdown + activity heatmap */}
            <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                <Card className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Topic strengths vs class</h3>
                    <p className="text-xs text-gray-500">Each row shows this student against the class average for that topic.</p>
                    <div className="mt-4 space-y-3">
                        {topicBreakdown.length === 0 ? (
                            <p className="text-xs text-gray-500">No topic data yet.</p>
                        ) : (
                            topicBreakdown.map((t) => (
                                <div key={t.category}>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-700">{t.category}</span>
                                        <span className="text-gray-500">
                                            {t.studentAttempts} attempts · You {formatPct(t.studentAverage)} · Class {formatPct(t.classAverage)}
                                        </span>
                                    </div>
                                    <div className="mt-1 grid grid-cols-2 gap-2">
                                        <div className="h-2 overflow-hidden rounded bg-gray-100">
                                            <div
                                                className="h-full bg-primary-500"
                                                style={{ width: `${t.studentAverage ?? 0}%` }}
                                                title={`Student ${formatPct(t.studentAverage)}`}
                                            />
                                        </div>
                                        <div className="h-2 overflow-hidden rounded bg-gray-100">
                                            <div
                                                className="h-full bg-slate-400"
                                                style={{ width: `${t.classAverage ?? 0}%` }}
                                                title={`Class ${formatPct(t.classAverage)}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>

                <Card className="p-6">
                    <ActivityHeatmap daily={daily} />
                </Card>
            </div>

            {/* Section strengths */}
            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900">Section strengths</h3>
                <p className="text-xs text-gray-500">
                    Sub-section accuracy across the tests this student has attempted. Helpful for spotting topic-level gaps.
                </p>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {sectionStrengths.length === 0 ? (
                        <p className="text-xs text-gray-500">No test sections recorded yet.</p>
                    ) : (
                        sectionStrengths.map((s) => (
                            <div key={s.key} className="rounded-lg border border-gray-100 p-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="truncate font-medium text-gray-700" title={s.title}>
                                        {s.title}
                                    </span>
                                    <span
                                        className={`font-bold ${
                                            s.averagePercentage >= 70 ? "text-emerald-700" : s.averagePercentage >= 50 ? "text-amber-600" : "text-rose-600"
                                        }`}
                                    >
                                        {s.averagePercentage}%
                                    </span>
                                </div>
                                <div className="mt-1 h-2 overflow-hidden rounded bg-gray-100">
                                    <div
                                        className={`h-full ${
                                            s.averagePercentage >= 70 ? "bg-emerald-500" : s.averagePercentage >= 50 ? "bg-amber-500" : "bg-rose-500"
                                        }`}
                                        style={{ width: `${s.averagePercentage}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-[10px] text-gray-400">{s.attempts} attempts</p>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* Teacher's private notes */}
            <Card className="p-6">
                <div className="flex items-end justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Private notes</h3>
                        <p className="text-xs text-gray-500">
                            Only you can see this. Useful for jotting parent-teacher meeting notes, observations, follow-ups.
                        </p>
                    </div>
                    <span className="text-[10px] text-gray-400">
                        {noteSavedAt ? `Last saved ${formatDate(noteSavedAt)}` : "Not saved yet"}
                    </span>
                </div>
                <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={5}
                    maxLength={4000}
                    placeholder="Spoke with parent on 14 Jan, suggested extra practice for arrays..."
                    className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                />
                <div className="mt-3 flex justify-end">
                    <Button variant="primary" onClick={saveNote} isLoading={noteSaving}>
                        Save note
                    </Button>
                </div>
            </Card>

            {/* Recent attempts */}
            <Card className="p-0 overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3">
                    <h3 className="text-sm font-semibold text-gray-900">Recent attempts</h3>
                </div>
                {recent.length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-500">No attempts yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                                    <th className="px-5 py-3 text-left">Content</th>
                                    <th className="px-5 py-3 text-left">Status</th>
                                    <th className="px-5 py-3 text-left">Score</th>
                                    <th className="px-5 py-3 text-left">Duration</th>
                                    <th className="px-5 py-3 text-left">Completed</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-5 py-3">
                                            <div className="font-medium text-gray-900">{r.contentTitle}</div>
                                            <div className="text-xs text-gray-500">
                                                {r.kind === "quiz" ? "Quiz" : "Test"} · {r.category || "Uncategorised"}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ${
                                                    r.status === "completed"
                                                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                                        : r.status === "timed_out"
                                                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                                        : r.status === "in_progress"
                                                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                                                }`}
                                            >
                                                {r.status.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">
                                            <span className="font-semibold text-gray-900">{r.percentage}%</span>
                                            <span className="ml-2 text-xs text-gray-500">
                                                {r.correctAnswers}✓ {r.wrongAnswers}✗
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{formatDuration(r.durationSeconds)}</td>
                                        <td className="px-5 py-3 text-gray-500">{formatDate(r.completedAt)}</td>
                                        <td className="px-5 py-3 text-right">
                                            <Link
                                                href={
                                                    r.kind === "quiz"
                                                        ? `/dashboard/quizzes/results/${r.id}?teacherId=${encodeURIComponent(firebaseUser?.uid || "")}`
                                                        : `/dashboard/tests/results/${r.id}?teacherId=${encodeURIComponent(firebaseUser?.uid || "")}`
                                                }
                                                className="text-xs text-primary-700 hover:text-primary-800"
                                            >
                                                Result →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
