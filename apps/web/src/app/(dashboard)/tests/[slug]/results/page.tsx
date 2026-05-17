"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, FormattedContent } from "@digimine/ui";
import { getTestAttempt, getTestSeriesBySlug, getTestById, getTestQuestions } from "@/lib/firestore/tests";
import { useAuthContext } from "@/contexts/AuthContext";
import { CheckIcon, MinusIcon, TrophyIcon, XIcon } from "@/components/icons/AppIcons";
import type { TestSeries, Test, TestAttempt, Question } from "@digimine/types";

function CircularProgress({ percentage, size = 140, strokeWidth = 10, color }: { percentage: number; size?: number; strokeWidth?: number; color: string }) {
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
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    className="text-gray-100"
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
                <span className="text-3xl font-bold" style={{ color }}>{percentage}%</span>
            </div>
        </div>
    );
}

function ResultsContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuthContext();
    const slug = params.slug as string;
    const attemptId = searchParams.get("attemptId");

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [attempt, setAttempt] = useState<TestAttempt | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedExplanation, setExpandedExplanation] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            router.push(`/login?redirect=/tests/${slug}/results?attemptId=${attemptId}`);
            return;
        }
        loadResults();
    }, [user, slug, attemptId]);

    async function loadResults() {
        try {
            setLoading(true);

            if (!attemptId) {
                router.push(`/tests/${slug}`);
                return;
            }

            const attemptData = await getTestAttempt(attemptId);
            if (!attemptData || attemptData.userId !== user?.id) {
                router.push(`/tests/${slug}`);
                return;
            }
            setAttempt(attemptData);

            const seriesData = await getTestSeriesBySlug(slug);
            if (!seriesData) {
                router.push("/tests");
                return;
            }
            setSeries(seriesData);

            const testData = await getTestById(seriesData.id, attemptData.testId);
            if (!testData) {
                router.push(`/tests/${slug}`);
                return;
            }
            setTest(testData);

            const questionsData = await getTestQuestions(seriesData.id, attemptData.testId);
            setQuestions(questionsData);
        } catch (error) {
            console.error("Error loading results:", error);
        } finally {
            setLoading(false);
        }
    }

    const getScoreHex = (p: number) => p >= 80 ? "#10B981" : p >= 60 ? "#F59E0B" : "#EF4444";

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

    if (!attempt || !series || !test) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Card className="p-8 text-center max-w-md">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Result Not Found</h2>
                <p className="text-gray-500 mb-6">We couldn&apos;t find the test result you&apos;re looking for.</p>
                <Link href="/tests">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Browse Tests</Button>
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
                    <Link href={`/tests/${series.slug}`}>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Back to Series</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const scorePercentage = attempt.percentage;
    const isPassed = attempt.passed;
    const timeTaken = test.duration * 60 - (attempt.remainingTime || 0);
    const accuracy = attempt.correctAnswers + attempt.wrongAnswers > 0
        ? Math.round((attempt.correctAnswers / (attempt.correctAnswers + attempt.wrongAnswers)) * 100)
        : 0;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 space-y-8">
                <div className="text-center mb-2">
                    <h1 className="text-3xl font-bold text-gray-900">Results: {test.title}</h1>
                    <p className="text-gray-500">{series.title}</p>
                </div>

                {/* Score Card */}
                <Card className="p-8 text-center border-none shadow-xl">
                    <div className="flex flex-col items-center">
                        <CircularProgress percentage={scorePercentage} color={getScoreHex(scorePercentage)} />
                        <h2 className="text-2xl font-bold mt-6 mb-1">
                            {isPassed ? (
                                <span className="inline-flex items-center gap-2 text-green-600">
                                    You Passed!
                                    <TrophyIcon className="h-6 w-6" />
                                </span>
                            ) : (
                                <span className="text-red-600">Keep Practicing!</span>
                            )}
                        </h2>
                        <p className="text-gray-600">Scored {attempt.totalScore} / {attempt.maxPossibleScore}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                        <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                            <div className="text-2xl font-bold text-green-600">{attempt.correctAnswers}</div>
                            <div className="text-xs text-green-700 font-medium uppercase tracking-wider">Correct</div>
                        </div>
                        <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                            <div className="text-2xl font-bold text-red-600">{attempt.wrongAnswers}</div>
                            <div className="text-xs text-red-700 font-medium uppercase tracking-wider">Wrong</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="text-2xl font-bold text-gray-600">{attempt.unattempted}</div>
                            <div className="text-xs text-gray-700 font-medium uppercase tracking-wider">Skipped</div>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                            <div className="text-2xl font-bold text-blue-600">{Math.floor(timeTaken / 60)}m</div>
                            <div className="text-xs text-blue-700 font-medium uppercase tracking-wider">Time Taken</div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                            <span className="text-gray-500">Accuracy:</span>
                            <span className="font-bold text-gray-900">{accuracy}%</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                            <span className="text-gray-500">Passing Marks:</span>
                            <span className="font-bold text-gray-900">{test.passingMarks} / {test.totalMarks}</span>
                        </div>
                    </div>
                </Card>

                {/* Question Review */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-gray-900">Question Review</h3>
                        <div className="hidden sm:flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-green-500"></span> Correct
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-red-500"></span> Wrong
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-gray-300"></span> Skipped
                            </span>
                        </div>
                    </div>

                    {questions.map((q, idx) => {
                        const answer = attempt.answers.find(a => a.questionId === q.id);
                        const isCorrect = answer?.isCorrect;
                        const isSkipped = !answer?.answer;

                        return (
                            <Card key={q.id} className={`overflow-hidden border-l-4 ${isCorrect ? 'border-l-green-500' : isSkipped ? 'border-l-gray-300' : 'border-l-red-500'}`}>
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
                                            <span className="font-bold text-gray-400 text-sm">Question {idx + 1}</span>
                                        </div>
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                            isCorrect ? 'bg-green-100 text-green-700' : isSkipped ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {isCorrect ? `+${answer?.marksObtained || q.marks}` : `${answer?.marksObtained || 0}`} Marks
                                        </span>
                                    </div>
                                    <FormattedContent html={q.questionText} className="mb-4 text-gray-800 font-medium" />

                                    {q.type === 'code' ? (
                                        <div className="space-y-3">
                                            {(() => {
                                                let codeData: { code: string; language: string } | null = null;
                                                try { codeData = JSON.parse(answer?.answer || ''); } catch { /* ignore */ }
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

                                            {(answer as any)?.testCaseResults && (answer as any).testCaseResults.length > 0 && (
                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-bold text-gray-700">Test Case Results</h4>
                                                    {(answer as any).testCaseResults.map((tc: any, tcIdx: number) => (
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
                                            {q.options?.map(opt => {
                                                const isSelected = answer?.answer === opt.id;
                                                const isOptCorrect = opt.isCorrect;
                                                return (
                                                    <div
                                                        key={opt.id}
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
                                                            <FormattedContent html={opt.text} size="sm" className="flex-1" />
                                                        </div>
                                                        {isOptCorrect && <span className="text-xs font-bold text-green-700">Correct</span>}
                                                        {isSelected && !isOptCorrect && <span className="text-xs font-bold text-red-700">Your Answer</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {q.explanation && (
                                        <div className="mt-4">
                                            <button
                                                onClick={() => setExpandedExplanation(expandedExplanation === q.id ? null : q.id)}
                                                className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                                            >
                                                <svg className={`w-4 h-4 transition-transform ${expandedExplanation === q.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                                {expandedExplanation === q.id ? 'Hide Explanation' : 'Show Explanation'}
                                            </button>
                                            {expandedExplanation === q.id && (
                                                <div className="mt-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                                    <h4 className="text-xs font-bold text-indigo-700 uppercase mb-1">Explanation</h4>
                                                    <FormattedContent html={q.explanation} size="sm" className="text-indigo-900" />
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
                    <Link href={`/tests/${series.slug}`}><Button variant="outline" className="w-full sm:w-auto">Back to Series</Button></Link>
                    {test.allowRetake && (
                        <Link href={`/tests/${series.slug}/attempt?testId=${test.id}`}><Button className="w-full sm:w-auto bg-indigo-600 text-white">Retake Test</Button></Link>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function TestResultsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading...</p>
                </div>
            </div>
        }>
            <ResultsContent />
        </Suspense>
    );
}
