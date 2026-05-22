"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { QuestionQualityPanel } from "@/components/teacher/QuestionQualityPanel";

export type AttemptRow = {
    id: string;
    kind: "quiz" | "test";
    userId: string;
    studentName: string;
    studentEmail: string;
    rollNumber: string | null;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    totalScore: number;
    maxPossibleScore: number;
    percentage: number;
    correctAnswers: number;
    wrongAnswers: number;
    unattempted: number;
    durationSeconds: number;
    passed: boolean | null;
    attemptNumber?: number;
    testId?: string;
};

type Detail = {
    content: {
        id: string;
        kind: "quiz" | "test";
        title: string;
        status: string;
        isDeleted: boolean;
        childTests?: { id: string; title: string }[];
        currentTestId?: string | null;
    };
    stats: {
        totalAttempts: number;
        completedAttempts: number;
        inProgressAttempts: number;
        studentsWhoAttempted: number;
        totalEnrolledStudents: number;
        averagePercentage: number | null;
        topPercentage: number | null;
        passRate: number | null;
        averageDurationSeconds: number;
    };
    attempts: AttemptRow[];
    leaderboard: (AttemptRow & { rank: number })[];
    histogram: number[];
    studentsNotAttempted: {
        id: string;
        studentId: string;
        studentName: string;
        studentEmail: string;
        rollNumber: string | null;
    }[];
};

function formatDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds: number) {
    if (!seconds || seconds <= 0) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
}

function statusBadge(status: string) {
    if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    if (status === "timed_out") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    if (status === "in_progress") return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
    return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
}

export function ContentAttemptsView({
    contentId,
    kind,
    backHref,
}: {
    contentId: string;
    kind: "quiz" | "test";
    backHref: string;
}) {
    const { firebaseUser } = useAuthContext();
    const [detail, setDetail] = useState<Detail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                teacherId: firebaseUser.uid,
                kind,
            });
            if (kind === "test" && selectedTestId) params.set("testId", selectedTestId);
            const res = await teacherFetch(
                firebaseUser,
                `/api/teacher/content/${encodeURIComponent(contentId)}/attempts?${params.toString()}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load attempts.");
            setDetail(data as Detail);
        } catch (err: any) {
            setError(err.message || "Failed to load attempts.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, contentId, kind, selectedTestId]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return <div className="py-20 text-center text-gray-500">Loading attempts...</div>;
    }

    if (error || !detail) {
        return (
            <div className="space-y-4">
                <Link href={backHref} className="text-sm text-primary-700 hover:text-primary-800">
                    ← Back
                </Link>
                <Card className="p-8 text-center text-red-700">{error || "No data."}</Card>
            </div>
        );
    }

    const { content, stats, attempts, leaderboard, histogram, studentsNotAttempted } = detail;
    const maxBucket = Math.max(1, ...histogram);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link href={backHref} className="text-sm text-primary-700 hover:text-primary-800">
                        ← Back to content
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold text-gray-900">{content.title}</h1>
                    <p className="text-sm text-gray-500">
                        {content.kind === "quiz" ? "Quiz" : "Test series"} attempts ·{" "}
                        <span className="capitalize">{content.status}</span>
                    </p>
                </div>
            </div>

            {/* Question-quality panel: surfaces hard questions and common misconceptions. */}
            <QuestionQualityPanel
                firebaseUser={firebaseUser}
                contentId={contentId}
                kind={kind}
                testId={selectedTestId}
            />

            {content.kind === "test" && content.childTests && content.childTests.length > 0 && (
                <Card className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="mr-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                            Test in series
                        </span>
                        <button
                            onClick={() => setSelectedTestId(null)}
                            className={`rounded-lg px-3 py-1 text-xs font-medium ${
                                !selectedTestId
                                    ? "bg-primary-600 text-white"
                                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                        >
                            All tests
                        </button>
                        {content.childTests.map((ct) => (
                            <button
                                key={ct.id}
                                onClick={() => setSelectedTestId(ct.id)}
                                className={`rounded-lg px-3 py-1 text-xs font-medium ${
                                    selectedTestId === ct.id
                                        ? "bg-primary-600 text-white"
                                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                {ct.title}
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reach</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {stats.studentsWhoAttempted}/{stats.totalEnrolledStudents}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Students attempted</p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Attempts</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{stats.totalAttempts}</p>
                    <p className="mt-1 text-xs text-gray-500">
                        {stats.completedAttempts} done · {stats.inProgressAttempts} active
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Average / Top</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {stats.averagePercentage === null ? "-" : `${stats.averagePercentage}%`}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                        Top {stats.topPercentage === null ? "-" : `${stats.topPercentage}%`} · Pass{" "}
                        {stats.passRate === null ? "-" : `${stats.passRate}%`}
                    </p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Avg Duration</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {formatDuration(stats.averageDurationSeconds)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Across completed attempts</p>
                </Card>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900">Score distribution</h3>
                <p className="text-xs text-gray-500">Completed attempts grouped into 10% bands</p>
                <div className="mt-4 flex h-32 items-end gap-2">
                    {histogram.map((count, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center">
                            <div className="flex h-full w-full items-end">
                                <div
                                    className="w-full rounded-t bg-primary-500"
                                    style={{ height: `${(count / maxBucket) * 100}%`, minHeight: count > 0 ? 4 : 0 }}
                                    title={`${i * 10}-${(i + 1) * 10}%: ${count} attempts`}
                                />
                            </div>
                            <div className="mt-1 text-[10px] text-gray-500">
                                {i * 10}–{i === 9 ? 100 : (i + 1) * 10}
                            </div>
                            <div className="text-[10px] font-semibold text-gray-700">{count}</div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="p-0 overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3">
                    <h3 className="text-sm font-semibold text-gray-900">Leaderboard</h3>
                    <p className="text-xs text-gray-500">Best score per student. Ties broken by duration.</p>
                </div>
                {leaderboard.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">
                        No completed attempts yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Rank</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Student</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Score</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Percent</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Duration</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Submitted</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.slice(0, 20).map((row) => (
                                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-5 py-3 font-bold text-slate-900">#{row.rank}</td>
                                        <td className="px-5 py-3">
                                            <Link
                                                href={`/teacher/students/${encodeURIComponent(row.userId)}`}
                                                className="font-medium text-gray-900 hover:text-primary-700"
                                            >
                                                {row.studentName}
                                            </Link>
                                            <div className="text-xs text-gray-500">{row.studentEmail}</div>
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-gray-900">
                                            {row.totalScore} <span className="font-normal text-gray-400">/ {row.maxPossibleScore}</span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">{row.percentage}%</td>
                                        <td className="px-5 py-3 text-gray-600">{formatDuration(row.durationSeconds)}</td>
                                        <td className="px-5 py-3 text-gray-500">{formatDate(row.completedAt)}</td>
                                        <td className="px-5 py-3 text-right">
                                            <Link
                                                href={
                                                    kind === "quiz"
                                                        ? `/dashboard/quizzes/results/${row.id}?teacherId=${encodeURIComponent(firebaseUser?.uid || "")}`
                                                        : `/dashboard/tests/results/${row.id}?teacherId=${encodeURIComponent(firebaseUser?.uid || "")}`
                                                }
                                                className="text-xs font-medium text-primary-700 hover:text-primary-800"
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

            <Card className="p-0 overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3">
                    <h3 className="text-sm font-semibold text-gray-900">All attempts ({attempts.length})</h3>
                </div>
                {attempts.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">No attempts yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Student</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Score</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Correct / Wrong</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Duration</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Submitted</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {attempts.map((row) => (
                                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-5 py-3">
                                            <Link
                                                href={`/teacher/students/${encodeURIComponent(row.userId)}`}
                                                className="font-medium text-gray-900 hover:text-primary-700"
                                            >
                                                {row.studentName}
                                            </Link>
                                            <div className="text-xs text-gray-500">
                                                {row.studentEmail}
                                                {row.attemptNumber ? ` · Attempt #${row.attemptNumber}` : ""}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>
                                                {row.status.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">
                                            <div className="font-semibold text-gray-900">
                                                {row.totalScore} <span className="font-normal text-gray-400">/ {row.maxPossibleScore}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">{row.percentage}%</div>
                                        </td>
                                        <td className="px-5 py-3 text-gray-700">
                                            <span className="text-emerald-600">{row.correctAnswers}</span>
                                            <span className="text-gray-400"> · </span>
                                            <span className="text-rose-600">{row.wrongAnswers}</span>
                                            <span className="text-gray-400"> · </span>
                                            <span className="text-gray-500">{row.unattempted} skipped</span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{formatDuration(row.durationSeconds)}</td>
                                        <td className="px-5 py-3 text-gray-500">{formatDate(row.completedAt || row.startedAt)}</td>
                                        <td className="px-5 py-3 text-right">
                                            <Link
                                                href={
                                                    kind === "quiz"
                                                        ? `/dashboard/quizzes/results/${row.id}?teacherId=${encodeURIComponent(firebaseUser?.uid || "")}`
                                                        : `/dashboard/tests/results/${row.id}?teacherId=${encodeURIComponent(firebaseUser?.uid || "")}`
                                                }
                                                className="text-xs font-medium text-primary-700 hover:text-primary-800"
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

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900">Not attempted ({studentsNotAttempted.length})</h3>
                <p className="text-xs text-gray-500">Active classroom students who have not started this yet.</p>
                {studentsNotAttempted.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">Every active student has at least started.</p>
                ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {studentsNotAttempted.map((s) => (
                            <Link
                                key={s.id}
                                href={`/teacher/students/${encodeURIComponent(s.studentId)}`}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-primary-300 hover:bg-primary-50"
                                title={s.studentEmail}
                            >
                                {s.studentName}
                            </Link>
                        ))}
                    </div>
                )}
            </Card>

            <div className="flex justify-end">
                <Button variant="outline" onClick={load}>Refresh</Button>
            </div>
        </div>
    );
}
