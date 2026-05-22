"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button, FormattedContent } from "@digimine/ui";
import { PageLoading } from "@/components/common";
import { CheckIcon, ClockIcon, TargetIcon, XIcon } from "@/components/icons/AppIcons";
import { useAuthContext } from "@/contexts/AuthContext";
import { getQuizById } from "@/lib/firestore/quizzes";
import type { Quiz } from "@digimine/types";

type AttemptOption = {
    id: string;
    text: string;
};

type AttemptQuestion = {
    id: string;
    quizId: string;
    type: "mcq" | "text_input";
    questionText: string;
    options?: AttemptOption[];
    marks: number;
    negativeMarks?: number;
    difficulty?: string;
    order?: number;
    passageGroup?: string;
    passage?: string;
};

type QuestionResult = {
    questionId: string;
    status: "correct" | "wrong" | "skipped";
    selectedAnswer: string;
    correctOptionIds?: string[];
    correctAnswer?: string;
    explanation?: string;
    earnedMarks: number;
    questionMarks: number;
    negativeMarks: number;
};

type QuizAttemptResponse = {
    id: string;
    quizId: string;
    contestId?: string;
    contestTitle?: string;
    sourceType?: "quiz" | "contest";
    title: string;
    attemptNumber: number;
    status: "in_progress" | "completed" | "timed_out" | "abandoned";
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
    totalScore: number;
    maxPossibleScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    skipped: number;
    percentage: number;
    passed?: boolean | null;
    passingPercentage?: number;
    questionResults?: QuestionResult[];
    totalTimeSpent: number;
    remainingTime?: number;
};

type RankingEntry = {
    id: string;
    totalScore: number;
    maxPossibleScore: number;
    percentage: number;
    status: "completed" | "timed_out";
    completedAt: string | null;
    isCurrentUser: boolean;
    rank?: number;
};

type RankingData = {
    entries: RankingEntry[];
    totalParticipants: number;
    userRank: number | null;
    percentile: number;
    topScore: number;
    averageScore: number;
    rankedAttemptId: string | null;
    selectedAttemptId: string;
    selectedAttemptIsRanked: boolean;
};

function formatDate(value?: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds: number) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function statusTone(status?: QuestionResult["status"]) {
    if (status === "correct") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "wrong") return "border-red-200 bg-red-50 text-red-700";
    return "border-slate-200 bg-slate-50 text-slate-500";
}

export default function QuizResultPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const attemptId = params.id as string;
    const classroomTeacherId = searchParams.get("teacherId");
    const { firebaseUser } = useAuthContext();

    const [attempt, setAttempt] = useState<QuizAttemptResponse | null>(null);
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
    const [rankingData, setRankingData] = useState<RankingData | null>(null);
    const [rankingError, setRankingError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firebaseUser) return;

        async function loadResult() {
            setLoading(true);
            setRankingError(null);
            try {
                const token = await firebaseUser!.getIdToken();
                const response = await fetch(`/api/quiz-attempts/${attemptId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload.error || "Failed to load quiz result.");
                }

                const attemptPayload = payload.attempt as QuizAttemptResponse;
                setAttempt(attemptPayload);
                setQuestions(payload.questions || []);

                let quizData: Quiz | null = null;
                if (classroomTeacherId) {
                    try {
                        const quizRes = await fetch(`/api/quizzes/data?slug=${encodeURIComponent(attemptPayload.quizId)}&teacherId=${encodeURIComponent(classroomTeacherId)}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (quizRes.ok) {
                            const quizPayload = await quizRes.json().catch(() => ({}));
                            quizData = (quizPayload.quiz || null) as Quiz | null;
                        }
                    } catch { /* ignore */ }
                } else {
                    quizData = await getQuizById(attemptPayload.quizId).catch(() => null);
                }
                setQuiz(quizData);

                if (attemptPayload.status === "completed" || attemptPayload.status === "timed_out") {
                    const rankingResponse = await fetch(`/api/quizzes/ranking?attemptId=${attemptPayload.id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const rankingPayload = await rankingResponse.json().catch(() => ({}));
                    if (!rankingResponse.ok) {
                        throw new Error(rankingPayload.error || "Failed to load ranking.");
                    }
                    setRankingData(rankingPayload as RankingData);
                }
            } catch (error) {
                console.error("Failed to load quiz result:", error);
                if (error instanceof Error) setRankingError(error.message);
            } finally {
                setLoading(false);
            }
        }

        loadResult();
    }, [attemptId, firebaseUser, classroomTeacherId]);

    const resultByQuestionId = useMemo(() => {
        const map = new Map<string, QuestionResult>();
        attempt?.questionResults?.forEach((result) => map.set(result.questionId, result));
        return map;
    }, [attempt?.questionResults]);

    if (loading) return <PageLoading variant="inline" />;

    if (!attempt) {
        return (
            <div className="surface-panel mx-auto max-w-xl p-10 text-center">
                <h1 className="text-2xl font-black text-slate-950">Quiz result not found</h1>
                <p className="mt-2 text-slate-500">We could not find this quiz attempt.</p>
                <Link href="/dashboard/quizzes" className="mt-6 inline-flex">
                    <Button>Back to My Quizzes</Button>
                </Link>
            </div>
        );
    }

    const isPassed = attempt.passed !== false;
    const finalized = attempt.status === "completed" || attempt.status === "timed_out";
    const rankedAttemptIsSelected = rankingData?.selectedAttemptIsRanked !== false;
    const isContestResult = Boolean(attempt.contestId || attempt.sourceType === "contest");
    const backHref = classroomTeacherId
        ? `/classroom/${classroomTeacherId}/quizzes`
        : isContestResult ? "/dashboard/contests" : "/dashboard/quizzes";
    const backLabel = classroomTeacherId
        ? "Classroom Quizzes"
        : isContestResult ? "My Contests" : "My Quizzes";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={backHref} className="text-sm font-bold text-slate-500 hover:text-primary-700">
                    ← Back to {backLabel}
                </Link>
                {!isContestResult && quiz?.slug ? (
                    <Link href={`/quizzes/${quiz.slug}`}>
                        <Button variant="outline" size="sm">Open Quiz</Button>
                    </Link>
                ) : null}
            </div>

            <section className="surface-panel overflow-hidden">
                <div className={`grid gap-6 p-6 lg:grid-cols-[1fr_320px] lg:p-8 ${isPassed ? "bg-gradient-to-r from-slate-950 to-emerald-950" : "bg-gradient-to-r from-slate-950 to-red-950"} text-white`}>
                    <div>
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${isPassed ? "bg-emerald-400/15 text-emerald-100" : "bg-red-400/15 text-red-100"}`}>
                            {isPassed ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                            {attempt.status === "timed_out" ? "Timed out" : isPassed ? "Passed" : "Needs revision"}
                        </span>
                        <h1 className="mt-4 text-3xl font-black text-white lg:text-5xl">{attempt.contestTitle || quiz?.title || "Quiz Result"}</h1>
                        <p className="mt-3 max-w-2xl text-slate-300">
                            {isContestResult ? quiz?.title || "Contest quiz" : `Attempt ${attempt.attemptNumber || attempt.id.slice(0, 6)}`} completed on {formatDate(attempt.completedAt || attempt.updatedAt)}.
                        </p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">Score</p>
                        <p className="mt-2 text-5xl font-black text-white">{attempt.totalScore}<span className="text-2xl text-slate-400">/{attempt.maxPossibleScore}</span></p>
                        <p className="mt-2 text-lg font-bold text-primary-100">{attempt.percentage}%</p>
                    </div>
                </div>

                <div className="grid border-t border-slate-100 bg-white sm:grid-cols-4">
                    <ResultStat icon={<CheckIcon />} label="Correct" value={attempt.correctAnswers} tone="text-emerald-600" />
                    <ResultStat icon={<XIcon />} label="Wrong" value={attempt.wrongAnswers} tone="text-red-600" />
                    <ResultStat icon={<TargetIcon />} label="Skipped" value={attempt.skipped} tone="text-slate-500" />
                    <ResultStat icon={<ClockIcon />} label="Time" value={formatDuration(attempt.totalTimeSpent)} tone="text-primary-600" />
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="surface-panel p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-black text-slate-950">Ranking</h2>
                            <p className="mt-1 text-sm text-slate-500">Rank is calculated from each participant&apos;s latest finalized attempt.</p>
                        </div>
                        {rankingData?.userRank ? (
                            <div className="text-right">
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Your Rank</p>
                                <p className="text-4xl font-black text-primary-700">#{rankingData.userRank}<span className="text-lg text-slate-400"> / {rankingData.totalParticipants}</span></p>
                            </div>
                        ) : null}
                    </div>

                    {rankingError ? (
                        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                            {rankingError}
                        </div>
                    ) : !rankingData ? (
                        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                            Ranking appears after the quiz is submitted.
                        </div>
                    ) : (
                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                            <MiniResultStat label="Percentile" value={`${rankingData.percentile}th`} />
                            <MiniResultStat label="Top score" value={rankingData.topScore} />
                            <MiniResultStat label="Average" value={rankingData.averageScore} />
                        </div>
                    )}

                    {rankingData && !rankedAttemptIsSelected ? (
                        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                            This is an older attempt. The rank above is from your latest finalized attempt for this quiz.
                        </div>
                    ) : null}
                </div>

                <div className="surface-panel p-6">
                    <h3 className="text-xl font-black text-slate-950">Attempt details</h3>
                    <div className="mt-5 space-y-3 text-sm">
                        <DetailRow label="Status" value={attempt.status.replace("_", " ")} />
                        <DetailRow label="Passing score" value={`${attempt.passingPercentage || 0}%`} />
                        <DetailRow label="Created" value={formatDate(attempt.createdAt)} />
                        <DetailRow label="Result" value={finalized ? "Finalized" : "In progress"} />
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-950">Question Review</h2>
                    <p className="mt-1 text-sm text-slate-500">Review answer status, marks, and explanations where available.</p>
                </div>

                {questions.length === 0 ? (
                    <div className="surface-panel p-8 text-center text-slate-500">
                        Question review is unavailable for this attempt.
                    </div>
                ) : (
                    questions.map((question, index) => (
                        <ReviewQuestion
                            key={question.id}
                            question={question}
                            index={index}
                            result={resultByQuestionId.get(question.id)}
                            showExplanation={quiz?.showExplanations !== false}
                        />
                    ))
                )}
            </section>
        </div>
    );
}

function ResultStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
    return (
        <div className="border-t border-slate-100 p-5 sm:border-l sm:border-t-0">
            <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 ${tone}`}>{icon}</div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
        </div>
    );
}

function MiniResultStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="font-semibold text-slate-500">{label}</span>
            <span className="font-black capitalize text-slate-950">{value}</span>
        </div>
    );
}

function ReviewQuestion({
    question,
    index,
    result,
    showExplanation,
}: {
    question: AttemptQuestion;
    index: number;
    result?: QuestionResult;
    showExplanation: boolean;
}) {
    return (
        <article className="surface-panel p-5 lg:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border font-black ${statusTone(result?.status)}`}>
                        {index + 1}
                    </span>
                    <div>
                        <p className="font-black text-slate-950">Question {index + 1}</p>
                        <p className="text-sm font-semibold capitalize text-slate-500">{result?.status || "skipped"}</p>
                    </div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {result?.earnedMarks || 0} / {question.marks}
                </span>
            </div>

            {question.passage ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <FormattedContent html={question.passage} />
                </div>
            ) : null}

            <FormattedContent html={question.questionText} />

            {question.type === "mcq" && question.options ? (
                <div className="mt-5 grid gap-3">
                    {question.options.map((option, optionIndex) => {
                        const isCorrect = Boolean(result?.correctOptionIds?.includes(option.id));
                        const isSelected = result?.selectedAnswer === option.id;
                        return (
                            <div
                                key={option.id}
                                className={`flex items-start gap-3 rounded-2xl border p-4 ${
                                    isCorrect
                                        ? "border-emerald-300 bg-emerald-50"
                                        : isSelected
                                            ? "border-red-300 bg-red-50"
                                            : "border-slate-200 bg-white"
                                }`}
                            >
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                                    isCorrect ? "bg-emerald-600 text-white" : isSelected ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                                }`}>
                                    {String.fromCharCode(65 + optionIndex)}
                                </span>
                                <FormattedContent html={option.text} size="sm" className="flex-1" />
                                {isCorrect ? <CheckIcon className="h-5 w-5 shrink-0 text-emerald-600" /> : null}
                                {!isCorrect && isSelected ? <XIcon className="h-5 w-5 shrink-0 text-red-600" /> : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {question.type === "text_input" ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Your answer</p>
                        <p className="mt-1 font-bold text-slate-950">{result?.selectedAnswer || "Skipped"}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Correct answer</p>
                        <p className="mt-1 font-bold text-emerald-950">{result?.correctAnswer || "Not provided"}</p>
                    </div>
                </div>
            ) : null}

            {showExplanation && result?.explanation ? (
                <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50 p-4">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-primary-700">Explanation</p>
                    <FormattedContent html={result.explanation} size="sm" />
                </div>
            ) : null}
        </article>
    );
}
