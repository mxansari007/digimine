"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useParams } from "next/navigation";
import { Button, Card, FormattedContent } from "@digimine/ui";
import { getTestAttempt, getTestById, getTestSeries, getTestQuestions } from "@/lib/firestore/tests";
import { useAuthContext } from "@/contexts/AuthContext";
import type { TestAttempt, Test, TestSeries, Question } from "@digimine/types";
import Link from "next/link";
import { CheckIcon, MinusIcon, XIcon } from "@/components/icons/AppIcons";

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

function clamp(value: number, min = 0, max = 100): number {
    return Math.min(max, Math.max(min, value));
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    const smoothing = 0.18;
    const controlPoint = (
        current: { x: number; y: number },
        previous: { x: number; y: number } | undefined,
        next: { x: number; y: number } | undefined,
        reverse = false
    ) => {
        const p = previous || current;
        const n = next || current;
        const angle = Math.atan2(n.y - p.y, n.x - p.x) + (reverse ? Math.PI : 0);
        const length = Math.hypot(n.x - p.x, n.y - p.y) * smoothing;
        return {
            x: current.x + Math.cos(angle) * length,
            y: current.y + Math.sin(angle) * length,
        };
    };

    return points.reduce((path, point, index, allPoints) => {
        if (index === 0) {
            return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        }

        const previous = allPoints[index - 1];
        const controlStart = controlPoint(previous, allPoints[index - 2], point);
        const controlEnd = controlPoint(point, previous, allPoints[index + 1], true);
        return `${path} C ${controlStart.x.toFixed(2)} ${controlStart.y.toFixed(2)}, ${controlEnd.x.toFixed(2)} ${controlEnd.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }, "");
}

interface RankingEntry {
    id: string;
    totalScore: number;
    maxPossibleScore: number;
    percentage: number;
    status: "completed" | "timed_out";
    completedAt: string | null;
    isCurrentUser: boolean;
    rank?: number;
}

interface RankingData {
    entries: RankingEntry[];
    totalParticipants: number;
    userRank: number | null;
    percentile: number;
    topScore: number;
    averageScore: number;
}

interface DistributionHover {
    left: number;
    top: number;
    percentage: number;
    curveX: number;
    curveY: number;
    density: number;
    nearest: RankingEntry | null;
}

export default function TestResultPage() {
    const params = useParams();
    const attemptId = params.id as string;
    const { firebaseUser } = useAuthContext();

    const [attempt, setAttempt] = useState<TestAttempt | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [series, setSeries] = useState<TestSeries | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedExplanation, setExpandedExplanation] = useState<string | null>(null);
    const [filter, setFilter] = useState<QuestionFilter>('all');
    const [selectedSectionId, setSelectedSectionId] = useState('all');
    const [rankingData, setRankingData] = useState<RankingData | null>(null);
    const [rankingLoading, setRankingLoading] = useState(true);
    const [rankingError, setRankingError] = useState<string | null>(null);
    const [distributionHover, setDistributionHover] = useState<DistributionHover | null>(null);

    useEffect(() => {
        if (!firebaseUser) return;
        const currentFirebaseUser = firebaseUser;

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

                setRankingLoading(true);
                setRankingError(null);
                const token = await currentFirebaseUser.getIdToken();
                const rankingResponse = await fetch(`/api/tests/ranking?attemptId=${attemptData.id}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                const rankingPayload = await rankingResponse.json().catch(() => ({}));
                if (!rankingResponse.ok) {
                    throw new Error(rankingPayload.error || "Failed to load ranking data.");
                }
                setRankingData(rankingPayload as RankingData);
            } catch (error) {
                console.error("Error loading results:", error);
                if (error instanceof Error) {
                    setRankingError(error.message);
                }
            } finally {
                setLoading(false);
                setRankingLoading(false);
            }
        }
        loadData();
    }, [attemptId, firebaseUser]);

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

    const rankingEntries = rankingData?.entries || [];
    const totalParticipants = rankingData?.totalParticipants || 0;
    const userRank = rankingData?.userRank || 0;
    const percentile = rankingData?.percentile ?? 100;
    const topScore = rankingData?.topScore ?? attempt.totalScore;
    const averageScore = rankingData?.averageScore ?? attempt.totalScore;
    const chart = {
        left: 5,
        right: 97,
        top: 22,
        bottom: 82,
    };
    const chartWidth = chart.right - chart.left;
    const chartHeight = chart.bottom - chart.top;
    const toChartX = (percentage: number) => chart.left + (clamp(percentage) / 100) * chartWidth;
    const normalDensityAt = (percentage: number, mean: number, deviation: number) => {
        const z = (percentage - mean) / deviation;
        return Math.exp(-0.5 * z * z);
    };
    const rankingPercentages = rankingEntries.map((entry) => clamp(entry.percentage || 0));
    const averagePercentage = rankingPercentages.length > 0
        ? rankingPercentages.reduce((sum, value) => sum + value, 0) / rankingPercentages.length
        : scorePercentage;
    const variance = rankingPercentages.length > 1
        ? rankingPercentages.reduce((sum, value) => sum + Math.pow(value - averagePercentage, 2), 0) / rankingPercentages.length
        : 0;
    const standardDeviation = Math.max(7, Math.sqrt(variance) || 12);
    const normalCurve = Array.from({ length: 161 }, (_, index) => {
        const percentage = (index / 160) * 100;
        const density = normalDensityAt(percentage, averagePercentage, standardDeviation);
        const x = toChartX(percentage);
        return { x, density };
    });
    const peakDensity = Math.max(...normalCurve.map((point) => point.density), 1);
    const curvePoints = normalCurve.map((point) => ({
        x: point.x,
        y: chart.bottom - (point.density / peakDensity) * chartHeight,
    }));
    const normalPath = buildSmoothPath(curvePoints);
    const normalAreaPath = `${normalPath} L ${chart.right} ${chart.bottom} L ${chart.left} ${chart.bottom} Z`;
    const participantMarkers = rankingEntries
        .map((entry) => ({ ...entry, percentage: clamp(entry.percentage || 0) }))
        .sort((a, b) => a.percentage - b.percentage)
        .map((entry, index, sortedEntries) => {
            const nearbyBefore = sortedEntries
                .slice(0, index)
                .filter((previous) => Math.abs(previous.percentage - entry.percentage) < 2.4)
                .length;
            return {
                ...entry,
                x: toChartX(entry.percentage),
                row: nearbyBefore % 3,
            };
        });
    const maxScore = attempt.maxPossibleScore || test.totalMarks;
    const passingPercent = maxScore > 0 ? (test.passingMarks / maxScore) * 100 : 0;
    const clampedPassingPercent = clamp(passingPercent);
    const currentScorePercent = clamp(attempt.percentage || 0);
    const averageLineX = toChartX(averagePercentage);
    const currentLineX = toChartX(currentScorePercent);
    const cutoffLineX = toChartX(clampedPassingPercent);
    const labelLeft = (x: number) => `${clamp(x, chart.left + 3, chart.right - 3)}%`;
    const handleDistributionMove = (event: MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const relativeX = clamp(((event.clientX - rect.left) / rect.width) * 100);
        const percentage = clamp(((relativeX - chart.left) / chartWidth) * 100);
        const density = normalDensityAt(percentage, averagePercentage, standardDeviation);
        const curveY = chart.bottom - (density / peakDensity) * chartHeight;
        const nearest = rankingEntries.reduce<RankingEntry | null>((closest, entry) => {
            if (!closest) return entry;
            return Math.abs((entry.percentage || 0) - percentage) < Math.abs((closest.percentage || 0) - percentage)
                ? entry
                : closest;
        }, null);

        setDistributionHover({
            left: event.clientX - rect.left,
            top: event.clientY - rect.top,
            percentage,
            curveX: toChartX(percentage),
            curveY,
            density: (density / peakDensity) * 100,
            nearest,
        });
    };
    const hoverNearestDelta = distributionHover?.nearest
        ? Math.abs((distributionHover.nearest.percentage || 0) - distributionHover.percentage)
        : null;
    const questionNumberById = new Map(questions.map((question, index) => [question.id, index + 1]));
    const sectionResultById = new Map((attempt.sectionResults || []).map((section) => [section.sectionId || '__unsectioned', section]));
    const testSectionById = new Map((test.sections || []).map((section) => [section.id, section]));
    const getQuestionStatus = (question: Question) => {
        const answer = answerByQuestion.get(question.id) || { answer: null, isCorrect: false, marksObtained: 0, testCaseResults: [] };
        const isSkipped = !answer.answer;
        const isCorrect = !isSkipped && !!answer.isCorrect;
        return { answer, isSkipped, isCorrect };
    };
    const matchesStatusFilter = (question: Question) => {
        const { isSkipped, isCorrect } = getQuestionStatus(question);
        if (filter === 'skipped') return isSkipped;
        if (filter === 'correct') return !isSkipped && isCorrect;
        if (filter === 'wrong') return !isSkipped && !isCorrect;
        return true;
    };
    const sectionGroups = questions.reduce((groups, question) => {
        const configuredSection = question.sectionId ? testSectionById.get(question.sectionId) : undefined;
        const rawSectionId = configuredSection?.id || question.sectionId || '__unsectioned';
        const groupId = rawSectionId || '__unsectioned';
        const sectionResult = sectionResultById.get(groupId) || sectionResultById.get(question.sectionId || '__unsectioned');
        const existing = groups.get(groupId) || {
            id: groupId,
            title: configuredSection?.title || sectionResult?.title || (question.sectionId ? 'Other Section' : 'Unsectioned'),
            order: configuredSection?.order ?? groups.size,
            questions: [] as Question[],
            score: sectionResult?.score,
            maxScore: sectionResult?.maxScore,
            cutoffMarks: sectionResult?.cutoffMarks,
            passed: sectionResult?.passed,
        };
        existing.questions.push(question);
        groups.set(groupId, existing);
        return groups;
    }, new Map<string, {
        id: string;
        title: string;
        order: number;
        questions: Question[];
        score?: number;
        maxScore?: number;
        cutoffMarks?: number;
        passed?: boolean;
    }>());
    const reviewSections = Array.from(sectionGroups.values()).sort((a, b) => a.order - b.order);
    const hasRealSections = reviewSections.some((section) => section.id !== '__unsectioned');
    const selectedSectionExists = selectedSectionId === 'all' || reviewSections.some((section) => section.id === selectedSectionId);
    const effectiveSectionId = selectedSectionExists ? selectedSectionId : 'all';
    const visibleReviewSections = reviewSections
        .filter((section) => effectiveSectionId === 'all' || section.id === effectiveSectionId)
        .map((section) => ({
            ...section,
            questions: section.questions.filter(matchesStatusFilter),
        }))
        .filter((section) => section.questions.length > 0);
    const visibleQuestionCount = visibleReviewSections.reduce((sum, section) => sum + section.questions.length, 0);
    const getSectionCounts = (sectionQuestions: Question[]) => sectionQuestions.reduce(
        (acc, question) => {
            const { isSkipped, isCorrect } = getQuestionStatus(question);
            if (isSkipped) acc.skipped++;
            else if (isCorrect) acc.correct++;
            else acc.wrong++;
            return acc;
        },
        { correct: 0, wrong: 0, skipped: 0 }
    );
    const renderQuestionCard = (question: Question) => {
        const { answer: userAnswer, isSkipped, isCorrect } = getQuestionStatus(question);
        const questionSection = question.sectionId ? testSectionById.get(question.sectionId) : undefined;

        return (
            <Card key={question.id} className={`overflow-hidden border-l-4 ${isCorrect ? 'border-l-green-500' : isSkipped ? 'border-l-gray-300' : 'border-l-red-500'}`}>
                <div className="p-5 sm:p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                isCorrect ? 'bg-green-100 text-green-700' : isSkipped ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'
                            }`}>
                                {isCorrect ? (
                                    <CheckIcon className="h-4 w-4" />
                                ) : isSkipped ? (
                                    <MinusIcon className="h-4 w-4" />
                                ) : (
                                    <XIcon className="h-4 w-4" />
                                )}
                            </span>
                            <div className="min-w-0">
                                <div className="font-bold text-gray-400 text-sm">Question {questionNumberById.get(question.id) || 0}</div>
                                {hasRealSections && (
                                    <div className="text-xs font-semibold text-indigo-600 mt-0.5">{questionSection?.title || 'Unsectioned'}</div>
                                )}
                            </div>
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
                                                {isOptCorrect ? (
                                                    <CheckIcon className="h-3 w-3" />
                                                ) : isSelected ? (
                                                    <XIcon className="h-3 w-3" />
                                                ) : null}
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
    };

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
                                        Cut-off: {test.passingMarks} / {maxScore}
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
                                    {maxScore > 0 && (
                                        <div
                                            className="absolute inset-y-0 w-0.5 bg-slate-400"
                                            style={{ left: `${passingPercent}%` }}
                                            title={`Passing mark at ${test.passingMarks}`}
                                        />
                                    )}
                                </div>
                                <div className="mt-1 text-xs text-slate-400 flex justify-between">
                                    <span>0</span>
                                    <span>Passing: {test.passingMarks}</span>
                                    <span>{maxScore}</span>
                                </div>
                            </div>

                            {attempt.sectionResults && attempt.sectionResults.length > 1 && (
                                <div className="space-y-3">
                                    <div className="text-sm font-bold text-slate-700">Section Scores</div>
                                    {attempt.sectionResults.map((section) => (
                                        <div key={section.sectionId || section.title} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="font-semibold text-slate-700">{section.title}</span>
                                                <span className="font-bold text-slate-900 tabular-nums">{section.score} / {section.maxScore}</span>
                                            </div>
                                            {section.cutoffMarks !== undefined && (
                                                <div className={`mt-1 text-xs font-medium ${section.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    Cutoff {section.cutoffMarks} {section.passed ? 'met' : 'not met'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

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
                                Your selected attempt compared with each participant&apos;s latest finalized attempt.
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
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="relative h-64 sm:h-72 overflow-hidden rounded-lg bg-white animate-pulse">
                                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                    {[25, 50, 75].map((x) => (
                                        <line key={x} x1={toChartX(x)} x2={toChartX(x)} y1={chart.top} y2={chart.bottom} stroke="#e2e8f0" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                                    ))}
                                    {[chart.top, chart.top + chartHeight / 3, chart.top + (chartHeight * 2) / 3, chart.bottom].map((y) => (
                                        <line key={y} x1={chart.left} x2={chart.right} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                                    ))}
                                    <path d={`M ${chart.left} ${chart.bottom - 12} C 25 20, 42 20, 58 ${chart.bottom - 28} S 82 ${chart.bottom - 18}, ${chart.right} ${chart.bottom - 34}`} fill="none" stroke="#c7d2fe" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                                    <line x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} stroke="#cbd5e1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-slate-500 shadow-sm ring-1 ring-slate-100">
                                        Loading ranking curve...
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : rankingError ? (
                        <div className="py-10 text-center">
                            <p className="text-sm font-bold text-slate-700">Ranking could not be loaded.</p>
                            <p className="text-xs text-slate-500 mt-1">{rankingError}</p>
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
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                <div
                                    className="relative h-64 sm:h-72 overflow-hidden rounded-lg bg-white"
                                    onMouseMove={handleDistributionMove}
                                    onMouseLeave={() => setDistributionHover(null)}
                                >
                                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                        <defs>
                                            <linearGradient id="rankingNormalFill" x1="0" x2="0" y1="0" y2="1">
                                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
                                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                                            </linearGradient>
                                        </defs>
                                        {[25, 50, 75].map((x) => (
                                            <line key={x} x1={toChartX(x)} x2={toChartX(x)} y1={chart.top} y2={chart.bottom} stroke="#e2e8f0" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                                        ))}
                                        {[chart.top, chart.top + chartHeight / 3, chart.top + (chartHeight * 2) / 3, chart.bottom].map((y) => (
                                            <line key={y} x1={chart.left} x2={chart.right} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                                        ))}
                                        <line x1={averageLineX} x2={averageLineX} y1={chart.top} y2={chart.bottom} stroke="#10b981" strokeWidth="1" opacity="0.42" vectorEffect="non-scaling-stroke" />
                                        <line x1={cutoffLineX} x2={cutoffLineX} y1={chart.top} y2={chart.bottom} stroke="#d97706" strokeWidth="1.2" opacity="0.9" vectorEffect="non-scaling-stroke" />
                                        <line x1={currentLineX} x2={currentLineX} y1={chart.top} y2={chart.bottom} stroke="#4f46e5" strokeWidth="1.25" opacity="0.95" vectorEffect="non-scaling-stroke" />
                                        <path d={normalAreaPath} fill="url(#rankingNormalFill)" />
                                        <path d={normalPath} fill="none" stroke="#4f46e5" strokeWidth="1.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} stroke="#cbd5e1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                        {distributionHover && (
                                            <>
                                                <line x1={distributionHover.curveX} x2={distributionHover.curveX} y1={chart.top} y2={chart.bottom} stroke="#0f172a" strokeWidth="1" strokeDasharray="4 5" opacity="0.28" vectorEffect="non-scaling-stroke" />
                                            </>
                                        )}
                                    </svg>

                                    {distributionHover && (
                                        <div
                                            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 ring-2 ring-white shadow-sm"
                                            style={{
                                                left: `${distributionHover.curveX}%`,
                                                top: `${distributionHover.curveY}%`,
                                            }}
                                        />
                                    )}

                                    <div
                                        className="absolute top-4 -translate-x-1/2 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow whitespace-nowrap"
                                        style={{ left: labelLeft(cutoffLineX) }}
                                    >
                                        Cut-off {Math.round(passingPercent)}%
                                    </div>

                                    <div
                                        className="absolute top-9 -translate-x-1/2 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 whitespace-nowrap"
                                        style={{ left: labelLeft(averageLineX) }}
                                    >
                                        Avg {Math.round(averagePercentage)}%
                                    </div>

                                    <div
                                        className="absolute top-1.5 -translate-x-1/2 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow"
                                        style={{ left: labelLeft(currentLineX) }}
                                    >
                                        You
                                    </div>

                                    {participantMarkers.map((marker) => (
                                        <div
                                            key={marker.id}
                                            className="absolute -translate-x-1/2 group"
                                            style={{
                                                left: `${marker.x}%`,
                                                bottom: `${44 + marker.row * 12}px`,
                                            }}
                                        >
                                            <div className={`rounded-full border-2 border-white shadow ${
                                                marker.isCurrentUser
                                                    ? 'h-4 w-4 bg-indigo-600'
                                                    : 'h-3 w-3 bg-slate-400'
                                            }`} />
                                            <div className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow group-hover:block whitespace-nowrap">
                                                {marker.isCurrentUser ? 'Your score' : 'Participant'}: {Math.round(marker.percentage)}%
                                            </div>
                                        </div>
                                    ))}

                                    {distributionHover && (
                                        <div
                                            className={`pointer-events-none absolute z-30 rounded-lg bg-slate-950 px-3 py-2 text-[11px] text-white shadow-xl ${
                                                distributionHover.left > 360 ? '-translate-x-full -ml-3' : 'translate-x-3'
                                            }`}
                                            style={{
                                                left: `${distributionHover.left}px`,
                                                top: `${Math.max(16, distributionHover.top - 8)}px`,
                                            }}
                                        >
                                            <div className="font-bold tabular-nums">{Math.round(distributionHover.percentage)}% score</div>
                                            <div className="mt-0.5 text-white/70 tabular-nums">Curve density {Math.round(distributionHover.density)}%</div>
                                            {distributionHover.nearest && hoverNearestDelta !== null && hoverNearestDelta <= 6 && (
                                                <div className="mt-1 border-t border-white/10 pt-1 text-white/80 tabular-nums">
                                                    Nearest: {distributionHover.nearest.isCurrentUser ? 'you' : 'participant'} at {Math.round(distributionHover.nearest.percentage)}%
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="absolute bottom-1 inset-x-4 flex justify-between text-[10px] font-medium text-slate-400">
                                        <span>0%</span>
                                        <span>25%</span>
                                        <span>50%</span>
                                        <span>75%</span>
                                        <span>100%</span>
                                    </div>
                                </div>
                                <div className="mt-3 text-center text-xs text-slate-500">
                                    Normal distribution curve based on finalized participant score percentages
                                </div>
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
                                    <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
                                    Your score
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-slate-400"></span>
                                    Other participants
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-sm bg-indigo-500/20 border border-indigo-400"></span>
                                    Normal curve
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

                    {hasRealSections && (
                        <Card className="p-4 sm:p-5">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Browse by section</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Filter the review to one section or keep the full paper grouped by section.</p>
                                    </div>
                                    <span className="text-xs font-semibold text-slate-500">{visibleQuestionCount} shown</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSectionId('all')}
                                        className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                                            effectiveSectionId === 'all'
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">All sections</div>
                                        <div className="text-[11px] text-slate-500">{questions.length} questions</div>
                                    </button>
                                    {reviewSections.map((section) => {
                                        const counts = getSectionCounts(section.questions);
                                        return (
                                            <button
                                                key={section.id}
                                                type="button"
                                                onClick={() => setSelectedSectionId(section.id)}
                                                className={`min-w-[180px] shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                                                    effectiveSectionId === section.id
                                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold truncate">{section.title}</span>
                                                    <span className="text-[11px] font-bold text-slate-400">{section.questions.length}</span>
                                                </div>
                                                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                                                    <span className="text-emerald-600">{counts.correct} correct</span>
                                                    <span className="text-rose-600">{counts.wrong} wrong</span>
                                                    <span>{counts.skipped} skipped</span>
                                                </div>
                                                {section.score !== undefined && section.maxScore !== undefined && (
                                                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                                                        Score {section.score} / {section.maxScore}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </Card>
                    )}

                    {visibleQuestionCount === 0 && (
                        <Card className="p-10 text-center text-slate-500 text-sm">
                            No questions match this filter.
                        </Card>
                    )}

                    {visibleReviewSections.map((section) => {
                        const counts = getSectionCounts(section.questions);
                        return (
                            <div key={section.id} className="space-y-3">
                                {hasRealSections && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <h3 className="font-bold text-slate-900">{section.title}</h3>
                                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                                    <span>{section.questions.length} question{section.questions.length === 1 ? '' : 's'}</span>
                                                    <span className="text-emerald-600">{counts.correct} correct</span>
                                                    <span className="text-rose-600">{counts.wrong} wrong</span>
                                                    <span>{counts.skipped} skipped</span>
                                                </div>
                                            </div>
                                            {section.score !== undefined && section.maxScore !== undefined && (
                                                <div className="text-sm font-bold text-slate-900 tabular-nums">
                                                    {section.score} / {section.maxScore}
                                                    {section.cutoffMarks !== undefined && (
                                                        <span className={`ml-2 text-xs ${section.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                            Cutoff {section.cutoffMarks}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {section.questions.map(renderQuestionCard)}
                            </div>
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
