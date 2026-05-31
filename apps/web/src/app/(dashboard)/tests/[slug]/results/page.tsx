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
    const [selectedSectionId, setSelectedSectionId] = useState('all');

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
                    <Button>Browse Tests</Button>
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
                        <Button>Back to Series</Button>
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
    const answerByQuestion = new Map<string, any>(
        (attempt.answers || []).map((answer: any) => [answer.questionId, answer])
    );
    const questionNumberById = new Map(questions.map((question, index) => [question.id, index + 1]));
    const sectionResultById = new Map((attempt.sectionResults || []).map((section) => [section.sectionId || '__unsectioned', section]));
    const testSectionById = new Map((test.sections || []).map((section) => [section.id, section]));
    const getQuestionStatus = (question: Question) => {
        const answer = answerByQuestion.get(question.id) || { answer: null, isCorrect: false, marksObtained: 0, testCaseResults: [] };
        const isSkipped = !answer.answer;
        const isCorrect = !isSkipped && !!answer.isCorrect;
        return { answer, isSkipped, isCorrect };
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
    const visibleReviewSections = reviewSections.filter((section) => effectiveSectionId === 'all' || section.id === effectiveSectionId);
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
    const renderQuestionCard = (q: Question) => {
        const { answer, isCorrect, isSkipped } = getQuestionStatus(q);
        const questionSection = q.sectionId ? testSectionById.get(q.sectionId) : undefined;

        return (
            <Card key={q.id} className={`overflow-hidden border-l-4 ${isCorrect ? 'border-l-green-500' : isSkipped ? 'border-l-gray-300' : 'border-l-red-500'}`}>
                <div className="p-5 sm:p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                isCorrect ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300' : isSkipped ? 'bg-gray-100 text-gray-500' : 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300'
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
                                <div className="font-bold text-gray-400 text-sm">Question {questionNumberById.get(q.id) || 0}</div>
                                {hasRealSections && (
                                    <div className="text-xs font-semibold text-indigo-600 mt-0.5">{questionSection?.title || 'Unsectioned'}</div>
                                )}
                            </div>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            isCorrect ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300' : isSkipped ? 'bg-gray-100 text-gray-600' : 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300'
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
                                        <pre className="on-dark p-3 bg-[#111827] text-gray-100 text-xs font-mono overflow-x-auto">{codeData.code}</pre>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No code submitted</p>
                                );
                            })()}

                            {(answer as any)?.testCaseResults && (answer as any).testCaseResults.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-bold text-gray-700">Test Case Results</h4>
                                    {(answer as any).testCaseResults.map((tc: any, tcIdx: number) => (
                                        <div key={tcIdx} className={`p-3 rounded-lg border text-sm ${tc.passed ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25'}`}>
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
                                                ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25 text-green-800 dark:text-green-300'
                                                : isSelected && !isOptCorrect
                                                    ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 text-red-800 dark:text-red-300'
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
                                <div className="mt-3 p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/25">
                                    <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase mb-1">Explanation</h4>
                                    <FormattedContent html={q.explanation} size="sm" className="text-indigo-900 dark:text-indigo-300" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        );
    };

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
                        <div className="p-4 bg-green-50 dark:bg-green-500/10 rounded-xl border border-green-100 dark:border-green-500/25">
                            <div className="text-2xl font-bold text-green-600">{attempt.correctAnswers}</div>
                            <div className="text-xs text-green-700 dark:text-green-300 font-medium uppercase tracking-wider">Correct</div>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/25">
                            <div className="text-2xl font-bold text-red-600">{attempt.wrongAnswers}</div>
                            <div className="text-xs text-red-700 dark:text-red-300 font-medium uppercase tracking-wider">Wrong</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="text-2xl font-bold text-gray-600">{attempt.unattempted}</div>
                            <div className="text-xs text-gray-700 font-medium uppercase tracking-wider">Skipped</div>
                        </div>
                        <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/25">
                            <div className="text-2xl font-bold text-blue-600">{Math.floor(timeTaken / 60)}m</div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 font-medium uppercase tracking-wider">Time Taken</div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                            <span className="text-gray-500">Accuracy:</span>
                            <span className="font-bold text-gray-900">{accuracy}%</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                            <span className="text-gray-500">Passing Marks:</span>
                            <span className="font-bold text-gray-900">{test.passingMarks} / {attempt.maxPossibleScore || test.totalMarks}</span>
                        </div>
                    </div>
                </Card>

                {attempt.sectionResults && attempt.sectionResults.length > 1 && (
                    <Card className="p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Section Scores</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {attempt.sectionResults.map((section) => (
                                <div key={section.sectionId || section.title} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-gray-700">{section.title}</span>
                                        <span className="font-bold text-gray-900">{section.score} / {section.maxScore}</span>
                                    </div>
                                    {section.cutoffMarks !== undefined && (
                                        <div className={`mt-1 text-xs font-medium ${section.passed ? 'text-green-700' : 'text-red-700'}`}>
                                            Cutoff {section.cutoffMarks} {section.passed ? 'met' : 'not met'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

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

                    {hasRealSections && (
                        <Card className="p-4 sm:p-5">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-900">Browse by section</h4>
                                        <p className="text-xs text-gray-500 mt-0.5">Filter the review to one section or keep all sections grouped below.</p>
                                    </div>
                                    <span className="text-xs font-semibold text-gray-500">{visibleQuestionCount} shown</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSectionId('all')}
                                        className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                                            effectiveSectionId === 'all'
                                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-900 dark:text-indigo-300'
                                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">All sections</div>
                                        <div className="text-[11px] text-gray-500">{questions.length} questions</div>
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
                                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-900 dark:text-indigo-300'
                                                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold truncate">{section.title}</span>
                                                    <span className="text-[11px] font-bold text-gray-400">{section.questions.length}</span>
                                                </div>
                                                <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                                                    <span className="text-green-600">{counts.correct} correct</span>
                                                    <span className="text-red-600">{counts.wrong} wrong</span>
                                                    <span>{counts.skipped} skipped</span>
                                                </div>
                                                {section.score !== undefined && section.maxScore !== undefined && (
                                                    <div className="mt-1 text-[11px] font-semibold text-gray-500">
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

                    {visibleReviewSections.map((section) => {
                        const counts = getSectionCounts(section.questions);
                        return (
                            <div key={section.id} className="space-y-3">
                                {hasRealSections && (
                                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div>
                                                <h4 className="font-bold text-gray-900">{section.title}</h4>
                                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                                                    <span>{section.questions.length} question{section.questions.length === 1 ? '' : 's'}</span>
                                                    <span className="text-green-600">{counts.correct} correct</span>
                                                    <span className="text-red-600">{counts.wrong} wrong</span>
                                                    <span>{counts.skipped} skipped</span>
                                                </div>
                                            </div>
                                            {section.score !== undefined && section.maxScore !== undefined && (
                                                <div className="text-sm font-bold text-gray-900 tabular-nums">
                                                    {section.score} / {section.maxScore}
                                                    {section.cutoffMarks !== undefined && (
                                                        <span className={`ml-2 text-xs ${section.passed ? 'text-green-700' : 'text-red-700'}`}>
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
                    <Link href={`/tests/${series.slug}`}><Button variant="outline" className="w-full sm:w-auto">Back to Series</Button></Link>
                    {test.allowRetake && (
                        <Link href={`/tests/${series.slug}/attempt?testId=${test.id}`}><Button className="w-full sm:w-auto">Retake Test</Button></Link>
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
