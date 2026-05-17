"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, FormattedContent } from "@digimine/ui";
import { getTestAttempt, getTestById, getTestSeries, getTestQuestions, getLatestAttemptsForTest } from "@/lib/firestore/tests";
import type { TestAttempt, Test, TestSeries, Question } from "@digimine/types";
import Link from "next/link";

function CircularProgress({ percentage, size = 180, strokeWidth = 14, color, trackColor = "rgba(255,255,255,0.15)", label }: { percentage: number; size?: number; strokeWidth?: number; color: string; trackColor?: string; label?: string }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90" width={size} height={size}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl sm:text-5xl font-bold tabular-nums" style={{ color }}>{percentage}<span className="text-2xl">%</span></span>
                {label && <span className="text-xs uppercase tracking-widest opacity-70 mt-1" style={{ color }}>{label}</span>}
            </div>
        </div>
    );
}

type QuestionFilter = 'all' | 'correct' | 'wrong' | 'skipped';

export default function TestResultPage() {
    const params = useParams();
    const attemptId = params.id as string;

    const [attempt, setAttempt] = useState<TestAttempt | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [series, setSeries] = useState<TestSeries | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedExplanation, setExpandedExplanation] = useState<string | null>(null);
    const [filter, setFilter] = useState<QuestionFilter>('all');
    const [allAttempts, setAllAttempts] = useState<TestAttempt[]>([]);
    const [rankingLoading, setRankingLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const attemptData = await getTestAttempt(attemptId);
                if (!attemptData) return;

                setAttempt(attemptData);

                const [testData, seriesData, questionsData] = await Promise.all([
                    getTestById(attemptData.seriesId, attemptData.testId),
                    getTestSeries(attemptData.seriesId),
                    getTestQuestions(attemptData.seriesId, attemptData.testId)
                ]);

                setTest(testData);
                setSeries(seriesData);
                setQuestions(questionsData);

                // Fetch ranking data (latest attempt per user) in parallel
                getLatestAttemptsForTest(attemptData.testId)
                    .then(setAllAttempts)
                    .catch((err) => console.error("Failed to load ranking data:", err))
                    .finally(() => setRankingLoading(false));
            } catch (error) {
                console.error("Error loading results:", error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [attemptId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading your results...</p>
                </div>
            </div>
        );
    }

    if (!attempt || !test) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Card className="p-8 text-center max-w-md">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Result Not Found</h2>
                <p className="text-gray-500 mb-6">We couldn&apos;t find the test result you&apos;re looking for.</p>
                <Link href="/dashboard/tests">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Back to My Tests</Button>
                </Link>
            </Card>
        </div>
    );

    if (!test.instantResults) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Card className="p-8 text-center max-w-md">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Result Not Available Yet</h2>
                    <p className="text-gray-500 mb-6">Your test was submitted successfully. Results will be shown once the admin enables instant results.</p>
                    <Link href={`/tests/${series?.slug}`}>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Back to Series</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const scorePercentage = Math.round(attempt.percentage);
    const isPassed = attempt.passed;
    const timeTaken = test.duration * 60 - (attempt.remainingTime || 0);

    // Build a map of answers keyed by questionId so we can derive accurate per-question status.
    // The precomputed counts on the attempt may not include skipped questions or treat
    // wrong-answer-without-negative-marks as wrong consistently.
    const answerByQuestion = new Map<string, any>(
        (attempt.answers || []).map((a: any) => [a.questionId, a])
    );
    const derived = questions.reduce(
        (acc, q) => {
            const a = answerByQuestion.get(q.id);
            const hasAnswer = !!(a && a.answer);
            if (!hasAnswer) acc.skipped++;
            else if (a.isCorrect) acc.correct++;
            else acc.wrong++;
            return acc;
        },
        { correct: 0, wrong: 0, skipped: 0 }
    );
    const totalAnswered = derived.correct + derived.wrong;
    const accuracy = totalAnswered > 0
        ? Math.round((derived.correct / totalAnswered) * 100)
        : 0;
    const submittedAt = attempt.completedAt instanceof Date ? attempt.completedAt : null;
    const formatDateTime = (d: Date) => {
        try {
            return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        } catch {
            return d.toString();
        }
    };
    const accentClasses = isPassed
        ? { ring: 'ring-emerald-200', icon: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-700', heroBg: 'from-slate-900 via-slate-800 to-emerald-900', accentColor: '#34d399' }
        : { ring: 'ring-rose-200', icon: 'bg-rose-50 text-rose-700', text: 'text-rose-700', heroBg: 'from-slate-900 via-slate-800 to-rose-900', accentColor: '#fb7185' };

    // === Ranking computation ===
    // Use latest attempt per user (already filtered by getLatestAttemptsForTest).
    // Replace this attempt's userId entry with the current attempt to ensure freshness.
    const rankingAttempts = (() => {
        if (!allAttempts.length) return [] as TestAttempt[];
        const filtered = allAttempts.filter((a) => a.userId !== attempt.userId);
        return [...filtered, attempt].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    })();
    const totalParticipants = rankingAttempts.length;
    const userRank = rankingAttempts.findIndex((a) => a.id === attempt.id) + 1;
    const percentile = totalParticipants > 1
        ? Math.round(((totalParticipants - userRank) / (totalParticipants - 1)) * 100)
        : 100;
    const topScore = rankingAttempts[0]?.totalScore ?? attempt.totalScore;
    const averageScore = totalParticipants > 0
        ? Math.round((rankingAttempts.reduce((s, a) => s + (a.totalScore || 0), 0) / totalParticipants) * 100) / 100
        : 0;

    // Build histogram of % scores in 10 buckets (0-10, 10-20, ..., 90-100)
    const BUCKET_COUNT = 10;
    const buckets = Array.from({ length: BUCKET_COUNT }, () => 0);
    rankingAttempts.forEach((a) => {
        const pct = Math.max(0, Math.min(100, a.percentage || 0));
        const idx = Math.min(BUCKET_COUNT - 1, Math.floor(pct / (100 / BUCKET_COUNT)));
        buckets[idx]++;
    });
    const maxBucket = Math.max(1, ...buckets);
    const userBucketIndex = Math.min(
        BUCKET_COUNT - 1,
        Math.floor(Math.max(0, Math.min(100, attempt.percentage || 0)) / (100 / BUCKET_COUNT))
    );
    const passingPercent = test.totalMarks > 0 ? (test.passingMarks / test.totalMarks) * 100 : 0;

    return (
        <div className="min-h-screen bg-slate-50 py-6 sm:py-10">
            <div className="max-w-5xl mx-auto px-4 space-y-6">
                {/* Breadcrumb / Back */}
                <div className="flex items-center justify-between">
                    <Link href="/dashboard/tests" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        My Tests
                    </Link>
                    {submittedAt && (
                        <span className="text-xs text-gray-400 hidden sm:inline">Submitted {formatDateTime(submittedAt)}</span>
                    )}
                </div>

                {/* Hero Card */}
                <Card className="overflow-hidden border-none shadow-xl">
                    <div className={`relative bg-gradient-to-br ${accentClasses.heroBg} text-white px-6 py-10 sm:px-12 sm:py-12`}>
                        {/* Decorative blobs */}
                        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 blur-3xl" style={{ background: accentClasses.accentColor }} />
                        <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full opacity-10 blur-3xl bg-white" />

                        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                            {/* Left: status & title */}
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-bold uppercase tracking-widest mb-5">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                                    Result Summary
                                </div>
                                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
                                    {test.title}
                                </h1>
                                <p className="text-white/70 text-base">
                                    {series?.title || 'Test Series'}
                                </p>

                                <div className="mt-6 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-xs font-medium">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {Math.floor(timeTaken / 60)}m {timeTaken % 60}s
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-xs font-medium">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                        Cut-off: {test.passingMarks} / {test.totalMarks}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-xs font-medium">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                        {questions.length} questions
                                    </span>
                                    {totalParticipants > 0 && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur-sm text-xs font-bold">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                                            Rank #{userRank} of {totalParticipants}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Right: score circle */}
                            <div className="flex items-center justify-center lg:justify-end">
                                <CircularProgress
                                    percentage={scorePercentage}
                                    color={"white"}
                                    trackColor="rgba(255,255,255,0.12)"
                                    label={`${attempt.totalScore} / ${attempt.maxPossibleScore} marks`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Stat strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white">
                        <div className="p-5 text-center">
                            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Correct</div>
                            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{derived.correct}</div>
                        </div>
                        <div className="p-5 text-center">
                            <div className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Wrong</div>
                            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{derived.wrong}</div>
                        </div>
                        <div className="p-5 text-center">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Skipped</div>
                            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{derived.skipped}</div>
                        </div>
                        <div className="p-5 text-center">
                            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Accuracy</div>
                            <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{accuracy}<span className="text-base">%</span></div>
                        </div>
                    </div>
                </Card>

                {/* Performance + Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 p-6 sm:p-7">
                        <h3 className="text-base font-bold text-slate-900 mb-5">Performance Breakdown</h3>
                        <div className="space-y-5">
                            <div>
                                <div className="flex justify-between items-center text-sm mb-2">
                                    <span className="text-slate-500">Your score</span>
                                    <span className="font-bold text-slate-900 tabular-nums">{attempt.totalScore} <span className="text-slate-400 font-normal">/ {attempt.maxPossibleScore}</span></span>
                                </div>
                                <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-1000" style={{ width: `${scorePercentage}%` }} />
                                    {/* Pass marker */}
                                    {test.totalMarks > 0 && (
                                        <div
                                            className="absolute inset-y-0 w-0.5 bg-slate-400"
                                            style={{ left: `${(test.passingMarks / test.totalMarks) * 100}%` }}
                                            title={`Passing mark at ${test.passingMarks}`}
                                        />
                                    )}
                                </div>
                                <div className="mt-1 text-xs text-slate-400 flex justify-between">
                                    <span>0</span>
                                    <span>Passing: {test.passingMarks}</span>
                                    <span>{test.totalMarks}</span>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center text-sm mb-2">
                                    <span className="text-slate-500">Accuracy <span className="text-slate-400">(of attempted)</span></span>
                                    <span className="font-bold text-slate-900 tabular-nums">{accuracy}%</span>
                                </div>
                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-1000" style={{ width: `${accuracy}%` }} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">Time taken</div>
                                    <div className="font-bold text-slate-900">{Math.floor(timeTaken / 60)}m {timeTaken % 60}s</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">Total duration</div>
                                    <div className="font-bold text-slate-900">{test.duration} mins</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">Attempted</div>
                                    <div className="font-bold text-slate-900">{questions.length - derived.skipped} / {questions.length}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">Rank</div>
                                    <div className="font-bold text-slate-900">
                                        {totalParticipants > 0 ? (
                                            <>#{userRank} <span className="text-slate-400 font-normal">/ {totalParticipants}</span></>
                                        ) : (
                                            <span className="text-slate-400 font-normal">—</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 sm:p-7 flex flex-col gap-3">
                        <h3 className="text-base font-bold text-slate-900">What’s next?</h3>
                        <p className="text-sm text-slate-500">
                            {isPassed
                                ? 'Great work! Keep practicing to maintain your edge.'
                                : 'Review the questions below and try again to improve your score.'}
                        </p>
                        <div className="mt-auto flex flex-col gap-2.5 pt-2">
                            {test.allowRetake && (
                                <Link href={`/tests/${series?.slug}/attempt?testId=${test.id}`}>
                                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                                        Retake Test
                                    </Button>
                                </Link>
                            )}
                            <Link href={`/tests/${series?.slug}`}>
                                <Button variant="outline" className="w-full">
                                    Back to Series
                                </Button>
                            </Link>
                            <Link href="/dashboard/tests">
                                <Button variant="ghost" className="w-full text-slate-600">
                                    My Tests
                                </Button>
                            </Link>
                        </div>
                    </Card>
                </div>

                {/* Score Distribution / Ranking */}
                <Card className="p-6 sm:p-7">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Score Distribution &amp; Ranking</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Based on the latest attempt of each participant.
                            </p>
                        </div>
                        {!rankingLoading && totalParticipants > 0 && (
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Your rank</div>
                                    <div className="text-2xl font-bold text-slate-900 tabular-nums">
                                        #{userRank} <span className="text-sm font-medium text-slate-400">/ {totalParticipants}</span>
                                    </div>
                                </div>
                                <div className="text-right border-l border-slate-200 pl-3">
                                    <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Percentile</div>
                                    <div className="text-2xl font-bold text-indigo-600 tabular-nums">{percentile}<span className="text-sm">th</span></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {rankingLoading ? (
                        <div className="py-12 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : totalParticipants <= 1 ? (
                        <div className="py-10 text-center">
                            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
                            </div>
                            <p className="text-sm font-bold text-slate-700">You&apos;re the first to complete this test.</p>
                            <p className="text-xs text-slate-500 mt-1">Ranking and distribution will appear once more participants finish.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Histogram */}
                            <div>
                                <div className="relative h-48 sm:h-56">
                                    {/* Cut-off line */}
                                    <div
                                        className="absolute top-0 bottom-6 w-px bg-amber-500"
                                        style={{ left: `${passingPercent}%` }}
                                    >
                                        <div className="absolute -top-1 -translate-x-1/2 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold whitespace-nowrap shadow">
                                            Cut-off {Math.round(passingPercent)}%
                                        </div>
                                    </div>

                                    {/* Bars */}
                                    <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5 pb-6">
                                        {buckets.map((count, i) => {
                                            const heightPct = (count / maxBucket) * 100;
                                            const isUserBucket = i === userBucketIndex;
                                            return (
                                                <div key={i} className="flex-1 relative group">
                                                    {isUserBucket && count > 0 && (
                                                        <div
                                                            className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold whitespace-nowrap shadow z-10"
                                                            style={{ bottom: `${heightPct}%` }}
                                                        >
                                                            You
                                                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-indigo-600 rotate-45 -mt-1" />
                                                        </div>
                                                    )}
                                                    <div
                                                        className={`w-full rounded-t-md transition-all duration-700 ${
                                                            isUserBucket
                                                                ? 'bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-lg shadow-indigo-200'
                                                                : 'bg-slate-200 group-hover:bg-slate-300'
                                                        }`}
                                                        style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%`, minHeight: count > 0 ? 4 : 0 }}
                                                    />
                                                    {/* Tooltip on hover */}
                                                    {count > 0 && (
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-900 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap z-20">
                                                            {count} {count === 1 ? 'student' : 'students'}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* X-axis labels */}
                                    <div className="absolute bottom-0 inset-x-0 flex gap-1 sm:gap-1.5">
                                        {buckets.map((_, i) => (
                                            <div key={i} className="flex-1 text-center text-[10px] text-slate-400 font-medium">
                                                {i * 10}
                                            </div>
                                        ))}
                                        <div className="text-[10px] text-slate-400 font-medium">100</div>
                                    </div>
                                </div>
                                <div className="mt-3 text-center text-xs text-slate-500">Score percentage</div>
                            </div>

                            {/* Legend & summary */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                                <div>
                                    <div className="text-xs text-slate-500">Top score</div>
                                    <div className="font-bold text-slate-900 tabular-nums">{topScore} / {attempt.maxPossibleScore}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Average</div>
                                    <div className="font-bold text-slate-900 tabular-nums">{averageScore}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Your score</div>
                                    <div className="font-bold text-indigo-600 tabular-nums">{attempt.totalScore}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500">Participants</div>
                                    <div className="font-bold text-slate-900 tabular-nums">{totalParticipants}</div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 pt-1">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm bg-gradient-to-t from-indigo-600 to-indigo-400"></span>
                                    Your bucket
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm bg-slate-200"></span>
                                    Other students
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 bg-amber-500"></span>
                                    Cut-off line
                                </span>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Questions Review */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Question Review</h2>
                            <p className="text-slate-500 text-sm mt-1">Walk through every question and learn from your mistakes.</p>
                        </div>
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm w-fit">
                            {([
                                { key: 'all', label: 'All', count: questions.length },
                                { key: 'correct', label: 'Correct', count: derived.correct },
                                { key: 'wrong', label: 'Wrong', count: derived.wrong },
                                { key: 'skipped', label: 'Skipped', count: derived.skipped },
                            ] as { key: QuestionFilter; label: string; count: number }[]).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setFilter(opt.key)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                        filter === opt.key
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    {opt.label}
                                    <span className={`ml-1.5 ${filter === opt.key ? 'text-white/70' : 'text-slate-400'}`}>{opt.count}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {(() => {
                        const visibleCount = questions.filter((q) => {
                            const a = answerByQuestion.get(q.id);
                            const isSkipped = !a || !a.answer;
                            const isCorrect = !!a?.isCorrect;
                            if (filter === 'all') return true;
                            if (filter === 'skipped') return isSkipped;
                            if (filter === 'correct') return !isSkipped && isCorrect;
                            if (filter === 'wrong') return !isSkipped && !isCorrect;
                            return true;
                        }).length;
                        if (visibleCount === 0) {
                            return (
                                <Card className="p-10 text-center text-slate-500 text-sm">
                                    No questions match this filter.
                                </Card>
                            );
                        }
                        return null;
                    })()}

                    {questions.map((question, idx) => {
                        const userAnswer = answerByQuestion.get(question.id) || { answer: null, isCorrect: false, marksObtained: 0, testCaseResults: [] };
                        const isSkipped = !userAnswer.answer;
                        const isCorrect = !isSkipped && !!userAnswer.isCorrect;

                        if (filter === 'correct' && (isSkipped || !isCorrect)) return null;
                        if (filter === 'wrong' && (isSkipped || isCorrect)) return null;
                        if (filter === 'skipped' && !isSkipped) return null;

                        return (
                            <Card key={idx} className={`overflow-hidden border-l-4 ${isCorrect ? 'border-l-green-500' : isSkipped ? 'border-l-gray-300' : 'border-l-red-500'}`}>
                                <div className="p-5 sm:p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                                isCorrect ? 'bg-green-100 text-green-700' : isSkipped ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {isCorrect ? '✓' : isSkipped ? '—' : '✗'}
                                            </span>
                                            <span className="font-bold text-gray-400 text-sm">Question {idx + 1}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                                isCorrect ? 'bg-green-100 text-green-700' : isSkipped ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {isCorrect ? `+${userAnswer.marksObtained || question.marks}` : `${userAnswer.marksObtained || 0}`} Marks
                                            </span>
                                        </div>
                                    </div>
                                    <FormattedContent html={question.questionText} className="mb-4 text-gray-800 font-medium" />

                                    {question.type === 'code' ? (
                                        <div className="space-y-3">
                                            {/* Submitted Code */}
                                            {(() => {
                                                let codeData: { code: string; language: string } | null = null;
                                                try { codeData = JSON.parse(userAnswer.answer); } catch { /* ignore */ }
                                                return codeData ? (
                                                    <div className="border rounded-lg overflow-hidden">
                                                        <div className="bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 flex justify-between">
                                                            <span>Your Solution ({codeData.language})</span>
                                                        </div>
                                                        <pre className="p-3 bg-gray-900 text-gray-100 text-xs font-mono overflow-x-auto">{codeData.code}</pre>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-gray-500 italic">No code submitted</p>
                                                );
                                            })()}

                                            {/* Test Case Results */}
                                            {userAnswer.testCaseResults && userAnswer.testCaseResults.length > 0 && (
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-bold text-gray-700">Test Case Results</h4>
                                                    {userAnswer.testCaseResults.map((tc: any, tcIdx: number) => (
                                                        <div key={tcIdx} className={`p-3 rounded-lg border text-sm ${tc.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-medium">{tc.isHidden ? 'Hidden Test Case' : `Test Case ${tcIdx + 1}`}</span>
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tc.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                                                    {tc.passed ? 'Passed' : 'Failed'}
                                                                </span>
                                                            </div>
                                                            {!tc.isHidden && (
                                                                <div className="mt-2 space-y-1 text-xs font-mono">
                                                                    <div><span className="text-gray-500">Input:</span> <span className="text-gray-700">{tc.input || '(empty)'}</span></div>
                                                                    <div><span className="text-gray-500">Expected:</span> <span className="text-gray-700">{tc.expectedOutput || '(empty)'}</span></div>
                                                                    <div><span className="text-gray-500">Actual:</span> <span className={tc.passed ? 'text-green-700' : 'text-red-700'}>{tc.actualOutput || '(empty)'}</span></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {question.options?.map((option) => {
                                                const isSelected = option.id === userAnswer.answer;
                                                const isOptCorrect = option.isCorrect;
                                                return (
                                                    <div
                                                        key={option.id}
                                                        className={`p-3 rounded-lg text-sm flex items-center justify-between border ${
                                                            isOptCorrect
                                                                ? 'bg-green-50 border-green-200 text-green-800'
                                                                : isSelected && !isOptCorrect
                                                                    ? 'bg-red-50 border-red-200 text-red-800'
                                                                    : 'bg-gray-50 border-gray-100 text-gray-600'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                                                isOptCorrect ? 'bg-green-500 text-white' : isSelected ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'
                                                            }`}>
                                                                {isOptCorrect ? '✓' : isSelected ? '✗' : ''}
                                                            </span>
                                                            <FormattedContent html={option.text} size="sm" className="flex-1" />
                                                        </div>
                                                        {isOptCorrect && <span className="text-xs font-bold text-green-700">Correct Answer</span>}
                                                        {isSelected && !isOptCorrect && <span className="text-xs font-bold text-red-700">Your Choice</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {question.explanation && (
                                        <div className="mt-4">
                                            <button
                                                onClick={() => setExpandedExplanation(expandedExplanation === question.id ? null : question.id)}
                                                className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                                            >
                                                <svg className={`w-4 h-4 transition-transform ${expandedExplanation === question.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                                {expandedExplanation === question.id ? 'Hide Explanation' : 'Show Explanation'}
                                            </button>
                                            {expandedExplanation === question.id && (
                                                <div className="mt-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                                    <h4 className="text-xs font-bold text-indigo-700 uppercase mb-1">Explanation</h4>
                                                    <FormattedContent html={question.explanation} size="sm" className="text-indigo-900" />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-4 pb-8">
                    <Link href={`/tests/${series?.slug}`}>
                        <Button variant="outline" className="w-full sm:w-auto">Back to Series</Button>
                    </Link>
                    {test.allowRetake && (
                        <Link href={`/tests/${series?.slug}/attempt?testId=${test.id}`}>
                            <Button className="w-full sm:w-auto bg-indigo-600 text-white">Retake Test</Button>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
