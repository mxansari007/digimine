"use client";

import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button, FormattedContent, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAttemptGate } from "@/hooks/useAttemptGate";
import { getQuizBySlug } from "@/lib/firestore/quizzes";
import { BookOpenIcon, CheckIcon, ClockIcon, LockIcon, TargetIcon, TrophyIcon, XIcon } from "@/components/icons/AppIcons";
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

type LinkedCourseSummary = {
    id: string;
    slug?: string;
    title?: string;
    accessType?: string;
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

type QuizResult = {
    score: number;
    rawScore: number;
    maxScore: number;
    percentage: number;
    correct: number;
    wrong: number;
    skipped: number;
    totalQuestions: number;
    passed: boolean | null;
    passingPercentage: number;
    questionResults: QuestionResult[];
};

type QuizRankingData = {
    totalParticipants: number;
    userRank: number | null;
    percentile: number;
    topScore: number;
    averageScore: number;
    rankedAttemptId: string | null;
    selectedAttemptId: string;
    selectedAttemptIsRanked: boolean;
};

type QuizMode = "intro" | "attempt" | "submitted";

type QuizAttemptSummary = {
    id: string;
    userId: string;
    quizId: string;
    title: string;
    status: "in_progress" | "completed" | "timed_out" | "abandoned";
    currentQuestionIndex: number;
    answers: Array<{ questionId: string; answer: string; timeSpent?: number }>;
    startedAt?: string;
    endTime?: string;
    remainingTime?: number;
    totalScore: number;
    maxPossibleScore: number;
    correctAnswers: number;
    wrongAnswers: number;
    skipped: number;
    percentage: number;
    passed?: boolean | null;
    passingPercentage?: number;
    questionResults?: QuestionResult[];
    createdAt?: string;
    updatedAt?: string;
};

type CachedQuizAttemptState = {
    answers: Record<string, string>;
    currentQuestionIndex: number;
    timeLeft?: number;
    savedAt: number;
};

const QUIZ_ATTEMPT_STORAGE_PREFIX = "digimine:quiz-attempt:";

function quizAttemptStorageKey(attemptId: string) {
    return `${QUIZ_ATTEMPT_STORAGE_PREFIX}${attemptId}`;
}

function readCachedAttemptState(attemptId: string): CachedQuizAttemptState | null {
    if (typeof window === "undefined") return null;

    try {
        const rawValue = window.localStorage.getItem(quizAttemptStorageKey(attemptId));
        if (!rawValue) return null;
        const value = JSON.parse(rawValue) as Partial<CachedQuizAttemptState>;
        if (!value || typeof value !== "object" || !value.answers || typeof value.answers !== "object") {
            return null;
        }

        return {
            answers: Object.entries(value.answers).reduce<Record<string, string>>((record, [questionId, answer]) => {
                record[questionId] = typeof answer === "string" ? answer : "";
                return record;
            }, {}),
            currentQuestionIndex: typeof value.currentQuestionIndex === "number" ? value.currentQuestionIndex : 0,
            timeLeft: typeof value.timeLeft === "number" ? value.timeLeft : undefined,
            savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
        };
    } catch {
        return null;
    }
}

function writeCachedAttemptState(attemptId: string, state: CachedQuizAttemptState) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(quizAttemptStorageKey(attemptId), JSON.stringify(state));
    } catch {
        // Local persistence is only a safety net; Firestore autosave still handles the canonical attempt.
    }
}

function clearCachedAttemptState(attemptId: string) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.removeItem(quizAttemptStorageKey(attemptId));
    } catch {
        // Ignore storage cleanup failures.
    }
}

/**
 * Resolve a quiz's `availableFrom` (Date | Timestamp | ISO string | null)
 * into `{ label, future }`. Returns `null` for unset / unparseable values.
 */
function formatQuizRelease(value: unknown): { label: string; future: boolean } | null {
    if (!value) return null;
    let date: Date;
    if (value instanceof Date) date = value;
    else if (
        typeof value === "object" &&
        value !== null &&
        "toDate" in value &&
        typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
        date = (value as { toDate: () => Date }).toDate();
    } else if (typeof value === "string" || typeof value === "number") {
        date = new Date(value);
    } else return null;
    if (Number.isNaN(date.getTime())) return null;
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const label = date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: sameYear ? undefined : "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
    return { label, future: date.getTime() > Date.now() };
}

function formatTime(seconds: number): string {
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function progressClass(status?: QuestionResult["status"], answered?: boolean) {
    if (status === "correct") return "border-emerald-300 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "wrong") return "border-red-300 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300";
    if (status === "skipped") return "border-slate-200 bg-slate-50 text-slate-400";
    if (answered) return "border-primary-300 dark:border-primary-500/25 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300";
    return "border-slate-200 bg-white text-slate-500";
}

// Mirrors the test attempt page's palette so contests / standalone quizzes
// show the same five states students are used to.
type QuizQuestionStatus =
    | "not_visited"
    | "visited"
    | "answered"
    | "marked_for_review"
    | "answered_and_marked";

function quizStatusClass(status: QuizQuestionStatus, isCurrent: boolean): string {
    if (isCurrent) return "on-dark border-[#020617] bg-[#020617] text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)]";
    switch (status) {
        case "answered_and_marked":
            return "border-purple-400 dark:border-purple-500/25 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-2 ring-purple-300 dark:ring-purple-500/25";
        case "marked_for_review":
            return "border-purple-300 dark:border-purple-500/25 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-2 ring-purple-200 dark:ring-purple-500/25";
        case "answered":
            return "border-emerald-300 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
        case "visited":
            return "border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300";
        default:
            return "border-slate-200 bg-white text-slate-500";
    }
}

export default function QuizDetailPage() {
    const router = useRouter();
    const params = useParams();
    const toast = useToast();
    const searchParams = useSearchParams();
    const slug = params.slug as string;
    const contestId = searchParams.get("contestId");
    const classroomTeacherId = searchParams.get("teacherId");
    // Class the student arrived from (e.g. /classroom/[classId]/quizzes). Needed
    // by the attempt-start endpoint to verify enrollment via
    // `classes/{classId}/students` — the legacy `teacher_enrollments` path
    // only works for pre-class-refactor data.
    const classroomClassId = searchParams.get("classId");
    const { firebaseUser, loading: authLoading } = useAuthContext();
    // Force signed-in-but-role-less users through /role-select first.
    useAttemptGate();

    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingQuestions, setLoadingQuestions] = useState(false);
    const [attempt, setAttempt] = useState<QuizAttemptSummary | null>(null);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [linkedCourses, setLinkedCourses] = useState<LinkedCourseSummary[]>([]);
    const [mode, setMode] = useState<QuizMode>("intro");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
    const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(new Set());
    const [timeLeft, setTimeLeft] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<QuizResult | null>(null);
    const [rankingData, setRankingData] = useState<QuizRankingData | null>(null);
    const [rankingLoading, setRankingLoading] = useState(false);
    const [rankingError, setRankingError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const timeLeftRef = useRef(0);

    useEffect(() => {
        timeLeftRef.current = timeLeft;
    }, [timeLeft]);

    useEffect(() => {
        document.body.classList.toggle("test-attempt-mode", mode === "attempt");
        return () => document.body.classList.remove("test-attempt-mode");
    }, [mode]);

    // Guard: prevent the quiz loader from racing against itself (React Strict
    // Mode + hook deps re-renders). Only re-run when the URL identity changes.
    const loadQuizOnceRef = useRef<string | null>(null);

    // Either a classId (new class-centric arrival) or a teacherId (legacy) is
    // enough to route through the server API — both signal that the quiz is
    // teacher-owned and the client Firestore rules will reject it.
    const isClassroomArrival = Boolean(classroomClassId || classroomTeacherId);

    useEffect(() => {
        const key = `${slug}|${classroomClassId || ""}|${classroomTeacherId || ""}|${firebaseUser?.uid || ""}|${authLoading ? "loading" : "ready"}`;
        if (loadQuizOnceRef.current === key) return;
        loadQuizOnceRef.current = key;

        async function loadQuiz() {
            setLoading(true);
            setAccessError(null);
            setQuestions([]);
            setAttempt(null);
            setLinkedCourses([]);
            setMode("intro");
            setAnswers({});
            setResult(null);
            setRankingData(null);
            setRankingError(null);
            setRankingLoading(false);
            setSaveStatus("idle");
            try {
                let quizData: Quiz | null = null;
                // Classroom path: skip client Firestore (it'd fail with permissions) and use server API.
                // The server endpoint accepts EITHER teacherId (legacy) or classId
                // (current class-centric path), or both.
                if (isClassroomArrival) {
                    if (authLoading) return;
                    if (!firebaseUser) {
                        const qs = new URLSearchParams();
                        if (classroomClassId) qs.set("classId", classroomClassId);
                        if (classroomTeacherId) qs.set("teacherId", classroomTeacherId);
                        router.push(`/login?redirect=${encodeURIComponent(`/quizzes/${slug}?${qs.toString()}`)}`);
                        return;
                    }
                    const token = await firebaseUser.getIdToken();
                    const apiQs = new URLSearchParams({ slug });
                    if (classroomTeacherId) apiQs.set("teacherId", classroomTeacherId);
                    if (classroomClassId) apiQs.set("classId", classroomClassId);
                    const res = await fetch(`/api/quizzes/data?${apiQs.toString()}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const serverData = await res.json();
                    if (!res.ok) throw new Error(serverData.error || "You do not have access to this classroom quiz.");
                    quizData = serverData.quiz || null;
                } else {
                    quizData = await getQuizBySlug(slug);
                }
                setQuiz(quizData);
            } catch (error) {
                console.error("Failed to load quiz:", error);
                // Surface the actual server error to the user. Previously this
                // was swallowed and the UI fell through to "Quiz not found",
                // making class-enrollment / access-denial bugs invisible.
                setAccessError(
                    error instanceof Error
                        ? error.message
                        : "We couldn't load this quiz. Please try again."
                );
            } finally {
                setLoading(false);
            }
        }

        loadQuiz();
    }, [authLoading, classroomClassId, classroomTeacherId, firebaseUser, router, slug, isClassroomArrival]);

    const applyAttemptPayload = useCallback((data: { attempt: QuizAttemptSummary | null; questions?: AttemptQuestion[] }) => {
        if (!data.attempt) {
            setAttempt(null);
            setQuestions([]);
            setAnswers({});
            setCurrentIndex(0);
            setTimeLeft((quiz?.timeLimitMinutes || 0) * 60);
            setSaveStatus("idle");
            setLastSavedAt(null);
            setRankingData(null);
            setRankingError(null);
            setRankingLoading(false);
            return;
        }

        const serverAnswers = (data.attempt.answers || []).reduce<Record<string, string>>((record, answer) => {
            record[answer.questionId] = answer.answer || "";
            return record;
        }, {});
        const parsedServerUpdatedAt = data.attempt.updatedAt ? new Date(data.attempt.updatedAt).getTime() : 0;
        const serverUpdatedAt = Number.isFinite(parsedServerUpdatedAt) ? parsedServerUpdatedAt : 0;
        const cachedState = readCachedAttemptState(data.attempt.id);
        const hasNewerCache = Boolean(cachedState && cachedState.savedAt > serverUpdatedAt);
        const nextAnswers = hasNewerCache && cachedState ? cachedState.answers : serverAnswers;
        const nextIndex = hasNewerCache && cachedState
            ? Math.min(Math.max(0, cachedState.currentQuestionIndex), Math.max(0, (data.questions || []).length - 1))
            : data.attempt.currentQuestionIndex || 0;
        const nextTimeLeft = data.attempt.endTime
            ? Math.max(0, Math.floor((new Date(data.attempt.endTime).getTime() - Date.now()) / 1000))
            : hasNewerCache && cachedState?.timeLeft !== undefined
                ? cachedState.timeLeft
                : data.attempt.remainingTime !== undefined
                    ? data.attempt.remainingTime
                    : (quiz?.timeLimitMinutes || 0) * 60;

        setAttempt(data.attempt);
        setQuestions(data.questions || []);
        setCurrentIndex(nextIndex);
        setAnswers(nextAnswers);
        // Reset palette state for a new (or resumed) attempt. Seed the
        // resumed question as visited so its tile shows the visited colour.
        setMarkedForReview(new Set());
        const initialVisited = new Set<string>();
        const resumeQuestion = (data.questions || [])[nextIndex];
        if (resumeQuestion) initialVisited.add(resumeQuestion.id);
        setVisitedQuestions(initialVisited);
        setTimeLeft(nextTimeLeft);
        setSaveStatus(hasNewerCache ? "saving" : "saved");
        setLastSavedAt(hasNewerCache && cachedState ? cachedState.savedAt : serverUpdatedAt || null);
        setRankingData(null);
        setRankingError(null);
        setRankingLoading(false);
    }, [quiz?.timeLimitMinutes]);

    // Guard: only fetch the active attempt once per (quiz, contestId, user).
    // Without this, the effect re-runs whenever applyAttemptPayload's identity
    // changes, causing redundant GETs.
    const loadActiveOnceRef = useRef<string | null>(null);

    useEffect(() => {
        if (!quiz || quiz.status !== "published" || authLoading || !firebaseUser) return;
        const key = `${quiz.id}|${contestId || ""}|${firebaseUser.uid}`;
        if (loadActiveOnceRef.current === key) return;
        loadActiveOnceRef.current = key;

        async function loadActiveAttempt() {
            if (!quiz || !firebaseUser) return;
            setLoadingQuestions(true);
            setAccessError(null);
            setLinkedCourses([]);
            try {
                const token = await firebaseUser.getIdToken();
                const response = await fetch(`/api/quizzes/${quiz.id}/attempts${contestId ? `?contestId=${contestId}` : ""}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await response.json();

                if (!response.ok) {
                    setAccessError(data.error || "You do not have access to this quiz.");
                    setLinkedCourses(data.courses || []);
                    return;
                }

                applyAttemptPayload(data);
                if (data.attempt && Array.isArray(data.questions) && data.questions.length > 0) {
                    setMode("attempt");
                    setResult(null);
                    setRankingData(null);
                    setRankingError(null);
                    setRankingLoading(false);
                }
            } catch (error) {
                console.error("Failed to load active quiz attempt:", error);
            } finally {
                setLoadingQuestions(false);
            }
        }

        loadActiveAttempt();
    }, [applyAttemptPayload, authLoading, contestId, firebaseUser, quiz]);

    const currentQuestion = questions[currentIndex];
    const answeredCount = useMemo(
        () => questions.filter((question) => Boolean(answers[question.id])).length,
        [answers, questions]
    );
    const resultByQuestionId = useMemo(() => {
        const map = new Map<string, QuestionResult>();
        result?.questionResults.forEach((item) => map.set(item.questionId, item));
        return map;
    }, [result]);
    const totalMarks = useMemo(
        () => questions.reduce((total, question) => total + Number(question.marks || 0), 0),
        [questions]
    );
    const completionPercentage = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

    const answerPayload = useCallback(() => (
        Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }))
    ), [answers]);

    const persistLocalAttempt = useCallback((nextAnswers: Record<string, string>, nextQuestionIndex: number) => {
        if (mode !== "attempt" || !attempt?.id || attempt.status !== "in_progress") return;

        writeCachedAttemptState(attempt.id, {
            answers: nextAnswers,
            currentQuestionIndex: nextQuestionIndex,
            timeLeft: timeLeftRef.current,
            savedAt: Date.now(),
        });
    }, [attempt?.id, attempt?.status, mode]);

    const selectAnswer = useCallback((questionId: string, value: string) => {
        setAnswers((current) => {
            const nextAnswers = { ...current, [questionId]: value };
            persistLocalAttempt(nextAnswers, currentIndex);
            return nextAnswers;
        });
    }, [currentIndex, persistLocalAttempt]);

    const goToQuestion = useCallback((index: number) => {
        const nextIndex = Math.min(Math.max(0, index), Math.max(0, questions.length - 1));
        persistLocalAttempt(answers, nextIndex);
        setCurrentIndex(nextIndex);
        const visitedQuestion = questions[nextIndex];
        if (visitedQuestion) {
            setVisitedQuestions((prev) => {
                if (prev.has(visitedQuestion.id)) return prev;
                const next = new Set(prev);
                next.add(visitedQuestion.id);
                return next;
            });
        }
    }, [answers, persistLocalAttempt, questions]);

    const toggleMarkForReview = useCallback((questionId: string) => {
        setMarkedForReview((prev) => {
            const next = new Set(prev);
            if (next.has(questionId)) next.delete(questionId);
            else next.add(questionId);
            return next;
        });
    }, []);

    const submitQuiz = useCallback(async (autoSubmitted = false) => {
        if (!attempt || submitting || result) return;

        setSubmitting(true);
        try {
            const token = firebaseUser ? await firebaseUser.getIdToken() : null;
            if (!token) {
                const query = new URLSearchParams();
                if (contestId) query.set("contestId", contestId);
                if (classroomTeacherId) query.set("teacherId", classroomTeacherId);
                const suffix = query.toString() ? `?${query.toString()}` : "";
                router.push(`/login?redirect=${encodeURIComponent(`/quizzes/${slug}${suffix}`)}`);
                return;
            }
            const response = await fetch(`/api/quiz-attempts/${attempt.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    answers: answerPayload(),
                    remainingTime: timeLeft,
                    currentQuestionIndex: currentIndex,
                    finalStatus: autoSubmitted ? "timed_out" : "completed",
                }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to submit quiz");
            }

            const submittedAttempt = data.attempt as QuizAttemptSummary;
            setResult(data.result as QuizResult);
            setAttempt(submittedAttempt);
            setMode("submitted");
            setCurrentIndex(0);
            setSaveStatus("saved");
            setLastSavedAt(Date.now());
            clearCachedAttemptState(attempt.id);
            window.scrollTo({ top: 0, behavior: "smooth" });

            setRankingLoading(true);
            setRankingError(null);
            setRankingData(null);
            try {
                const rankingResponse = await fetch(`/api/quizzes/ranking?attemptId=${submittedAttempt.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const rankingPayload = await rankingResponse.json().catch(() => ({}));
                if (!rankingResponse.ok) {
                    throw new Error(rankingPayload.error || "Failed to load quiz ranking");
                }
                setRankingData(rankingPayload as QuizRankingData);
            } catch (rankingError) {
                console.error("Failed to load quiz ranking:", rankingError);
                setRankingError(rankingError instanceof Error ? rankingError.message : "Failed to load quiz ranking");
            } finally {
                setRankingLoading(false);
            }
        } catch (error) {
            console.error("Failed to submit quiz:", error);
            toast.error(error instanceof Error ? error.message : "Failed to submit quiz");
        } finally {
            setSubmitting(false);
        }
    }, [answerPayload, attempt, classroomTeacherId, contestId, currentIndex, firebaseUser, result, router, slug, submitting, timeLeft]);

    useEffect(() => {
        if (mode !== "attempt" || (!quiz?.timeLimitMinutes && !attempt?.endTime) || result) return;
        const interval = window.setInterval(() => {
            setTimeLeft((current) => Math.max(0, current - 1));
        }, 1000);
        return () => window.clearInterval(interval);
    }, [attempt?.endTime, mode, quiz?.timeLimitMinutes, result]);

    useEffect(() => {
        if (mode === "attempt" && (quiz?.timeLimitMinutes || attempt?.endTime) && timeLeft === 0 && !result && !submitting) {
            submitQuiz(true);
        }
    }, [attempt?.endTime, mode, quiz?.timeLimitMinutes, result, submitQuiz, submitting, timeLeft]);

    useEffect(() => {
        if (mode !== "attempt" || !attempt?.id || attempt.status !== "in_progress") return;

        writeCachedAttemptState(attempt.id, {
            answers,
            currentQuestionIndex: currentIndex,
            timeLeft: timeLeftRef.current,
            savedAt: Date.now(),
        });
    }, [answers, attempt?.id, attempt?.status, currentIndex, mode]);

    useEffect(() => {
        if (mode !== "attempt" || !attempt?.id || attempt.status !== "in_progress" || !firebaseUser || submitting) return;

        const timeout = window.setTimeout(async () => {
            const saveStartedAt = Date.now();
            try {
                setSaveStatus("saving");
                const token = await firebaseUser.getIdToken();
                const response = await fetch(`/api/quiz-attempts/${attempt.id}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        answers: answerPayload(),
                        remainingTime: timeLeftRef.current,
                        currentQuestionIndex: currentIndex,
                    }),
                });
                if (!response.ok) throw new Error("Autosave failed");
                const cachedState = readCachedAttemptState(attempt.id);
                if (!cachedState || cachedState.savedAt <= saveStartedAt) {
                    clearCachedAttemptState(attempt.id);
                    setSaveStatus("saved");
                } else {
                    setSaveStatus("saving");
                }
                setLastSavedAt(Date.now());
            } catch (error) {
                console.error("Quiz autosave failed:", error);
                setSaveStatus("error");
            }
        }, 650);

        return () => window.clearTimeout(timeout);
    }, [answerPayload, attempt?.id, attempt?.status, currentIndex, firebaseUser, mode, submitting]);

    const startQuiz = async () => {
        if (!quiz) return;
        // Reject double-clicks on Start. The server is also race-safe, but
        // refusing the second click locally avoids spurious load spinners.
        if (loadingQuestions || mode === "attempt") return;
        if (!firebaseUser) {
            const query = new URLSearchParams();
            if (contestId) query.set("contestId", contestId);
            if (classroomTeacherId) query.set("teacherId", classroomTeacherId);
            const suffix = query.toString() ? `?${query.toString()}` : "";
            router.push(`/login?redirect=${encodeURIComponent(`/quizzes/${quiz.slug}${suffix}`)}`);
            return;
        }

        setLoadingQuestions(true);
        setAccessError(null);
        setRankingData(null);
        setRankingError(null);
        setRankingLoading(false);
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch(`/api/quizzes/${quiz.id}/attempts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    contestId,
                    teacherId: classroomTeacherId,
                    classId: classroomClassId,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                setAccessError(data.error || "You do not have access to this quiz.");
                setLinkedCourses(data.courses || []);
                return;
            }

            applyAttemptPayload(data);
            setMode("attempt");
            setResult(null);
            setRankingData(null);
            setRankingError(null);
            setRankingLoading(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
            console.error("Failed to start quiz:", error);
            setAccessError("Could not start this quiz. Please try again.");
        } finally {
            setLoadingQuestions(false);
        }
    };

    const retakeQuiz = () => {
        if (attempt?.id) clearCachedAttemptState(attempt.id);
        setAnswers({});
        setMarkedForReview(new Set());
        setVisitedQuestions(new Set());
        setAttempt(null);
        setQuestions([]);
        setResult(null);
        setRankingData(null);
        setRankingError(null);
        setRankingLoading(false);
        setMode("intro");
        setCurrentIndex(0);
        setTimeLeft((quiz?.timeLimitMinutes || 0) * 60);
        setSaveStatus("idle");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (loading || authLoading) {
        return (
            <div className="container-page py-16">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary-600" />
            </div>
        );
    }

    if (!quiz || quiz.status !== "published") {
        return (
            <div className="container-page py-16 text-center">
                <h1>Quiz not found</h1>
                <Link href="/quizzes">
                    <Button className="mt-5">Browse Quizzes</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {mode !== "attempt" ? (
                <section className="on-dark border-b border-white/70 bg-[#020617] text-white">
                    <div className="container-page py-10 lg:py-14">
                        <Link href="/quizzes" className="inline-flex items-center text-sm font-bold text-primary-200 hover:text-white">
                            <span aria-hidden="true">←</span>
                            <span className="ml-2">Back to quizzes</span>
                        </Link>

                        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
                            <div>
                                <div className="mb-4 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-primary-300/20 bg-primary-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-primary-100">
                                        {quiz.category || "Topic quiz"}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-200">
                                        {quiz.accessType === "free" ? <BookOpenIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
                                        {quiz.accessType === "free" ? "Free" : "Course quiz"}
                                    </span>
                                </div>
                                <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
                                    {quiz.title}
                                </h1>
                                <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
                                    {quiz.shortDescription || quiz.description}
                                </p>
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur">
                                <div className="grid grid-cols-3 gap-3">
                                    <StatCard label="Questions" value={questions.length || quiz.totalQuestions || 0} />
                                    <StatCard label="Marks" value={totalMarks || quiz.totalMarks || 0} />
                                    <StatCard label="Pass" value={`${quiz.passingPercentage || 0}%`} />
                                </div>
                                {quiz.timeLimitMinutes ? (
                                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white">
                                        <ClockIcon className="h-5 w-5 text-primary-200" />
                                        {quiz.timeLimitMinutes} minute timed quiz
                                    </div>
                                ) : (
                                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white">
                                        <TargetIcon className="h-5 w-5 text-primary-200" />
                                        Untimed practice mode
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            <main className={`container-page ${mode === "attempt" ? "py-4 lg:py-6" : "py-10"}`}>
                {(() => {
                    // Release-date gate: future-dated quizzes show the same
                    // LockedQuizCard used for unauthorised access, but with
                    // a "Releases on …" message. Replaces the entire intro/
                    // attempt panel until the release moment passes.
                    const release = formatQuizRelease(quiz.availableFrom);
                    if (release?.future) {
                        return (
                            <LockedQuizCard
                                message={`Releases on ${release.label}`}
                                courses={linkedCourses}
                                onSignIn={() => router.push(`/login?redirect=/quizzes/${quiz.slug}`)}
                            />
                        );
                    }
                    return null;
                })()}
                {(() => {
                    // If we already rendered the release-date panel above,
                    // skip the rest. Done as an IIFE so the existing
                    // ternary chain below stays readable.
                    return null;
                })()}
                {loadingQuestions ? (
                    <div className="surface-panel p-12 text-center text-slate-500">Preparing quiz environment...</div>
                ) : accessError ? (
                    <LockedQuizCard
                        message={accessError}
                        courses={linkedCourses}
                        onSignIn={() => router.push(`/login?redirect=/quizzes/${quiz.slug}`)}
                    />
                ) : formatQuizRelease(quiz.availableFrom)?.future ? (
                    // Already rendered the release card above; render nothing
                    // here to avoid duplicate panels.
                    null
                ) : mode === "intro" ? (
                    <IntroPanel
                        quiz={quiz}
                        questionCount={questions.length || quiz.totalQuestions || 0}
                        totalMarks={totalMarks || quiz.totalMarks || 0}
                        hasActiveAttempt={Boolean(attempt && questions.length > 0)}
                        onStart={startQuiz}
                    />
                ) : questions.length === 0 ? (
                    <div className="surface-panel p-12 text-center">
                        <h2 className="text-2xl font-black text-slate-950">No questions yet</h2>
                        <p className="mt-2 text-slate-500">This quiz is published, but questions are still being prepared.</p>
                    </div>
                ) : mode === "submitted" && result ? (
                    <ResultView
                        quiz={quiz}
                        questions={questions}
                        answers={answers}
                        result={result}
                        resultByQuestionId={resultByQuestionId}
                        rankingData={rankingData}
                        rankingLoading={rankingLoading}
                        rankingError={rankingError}
                        onRetake={retakeQuiz}
                        isPreviewAttempt={Boolean((attempt as any)?.isPreview)}
                    />
                ) : currentQuestion ? (
                    <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <AttemptTopBar
                            quiz={quiz}
                            answeredCount={answeredCount}
                            totalQuestions={questions.length}
                            timeLeft={timeLeft}
                            saveStatus={saveStatus}
                            lastSavedAt={lastSavedAt}
                            submitting={submitting}
                            onExit={() => router.push("/quizzes")}
                            onSubmit={() => submitQuiz(false)}
                        />
                        <QuestionCard
                            question={currentQuestion}
                            index={currentIndex}
                            total={questions.length}
                            selectedAnswer={answers[currentQuestion.id] || ""}
                            onAnswer={(value) => selectAnswer(currentQuestion.id, value)}
                        />

                        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                            <div className="surface-panel overflow-hidden">
                                <div className="on-dark border-b border-slate-100 bg-[#020617] p-5 text-white">
                                    <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-200">Progress</p>
                                    <div className="mt-2 flex items-end justify-between gap-3">
                                        <p className="text-3xl font-black text-white">{answeredCount}<span className="text-lg text-slate-400">/{questions.length}</span></p>
                                        <p className="text-sm font-bold text-slate-300">{completionPercentage}% done</p>
                                    </div>
                                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-primary-300 transition-all duration-300"
                                            style={{ width: `${completionPercentage}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="p-5">
                                    <div className="mb-4 grid grid-cols-2 gap-3">
                                        <ProgressMetric label="Current" value={`${currentIndex + 1}/${questions.length}`} />
                                        <ProgressMetric label="Left" value={questions.length - answeredCount} />
                                    </div>

                                    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <InlineAutoSaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />
                                        {quiz.timeLimitMinutes ? (
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${timeLeft <= 60 ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300" : "bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300"}`}>
                                                <ClockIcon className="h-3.5 w-3.5" />
                                                {formatTime(timeLeft)}
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="grid grid-cols-5 gap-2">
                                        {questions.map((question, index) => {
                                            const answered = Boolean(answers[question.id]);
                                            const marked = markedForReview.has(question.id);
                                            const visited = visitedQuestions.has(question.id) || index === currentIndex;
                                            let status: QuizQuestionStatus = "not_visited";
                                            if (marked && answered) status = "answered_and_marked";
                                            else if (marked) status = "marked_for_review";
                                            else if (answered) status = "answered";
                                            else if (visited) status = "visited";
                                            return (
                                                <button
                                                    key={question.id}
                                                    type="button"
                                                    onClick={() => goToQuestion(index)}
                                                    className={`h-10 rounded-xl border text-sm font-black transition ${quizStatusClass(status, index === currentIndex)}`}
                                                    aria-label={`Go to question ${index + 1}`}
                                                >
                                                    {index + 1}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Legend */}
                                    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded border border-emerald-300 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10" />
                                            <span>Answered ({questions.filter((q) => Boolean(answers[q.id]) && !markedForReview.has(q.id)).length})</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded border border-purple-300 dark:border-purple-500/25 bg-purple-50 dark:bg-purple-500/10 ring-1 ring-purple-200 dark:ring-purple-500/25" />
                                            <span>Marked ({Array.from(markedForReview).filter((id) => !answers[id]).length})</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded border border-purple-400 dark:border-purple-500/25 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-purple-300 dark:ring-purple-500/25" />
                                            <span>Marked & Answered ({Array.from(markedForReview).filter((id) => Boolean(answers[id])).length})</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded border border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10" />
                                            <span>Visited</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="surface-panel p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={`mb-2 w-full ${markedForReview.has(currentQuestion.id) ? "!border-purple-300 dark:!border-purple-500/25 !bg-purple-50 dark:!bg-purple-500/10 !text-purple-700 dark:!text-purple-300" : ""}`}
                                    onClick={() => toggleMarkForReview(currentQuestion.id)}
                                >
                                    {markedForReview.has(currentQuestion.id) ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <Check className="h-4 w-4" aria-hidden /> Marked for Review
                                        </span>
                                    ) : (
                                        "Mark for Review"
                                    )}
                                </Button>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1"
                                        disabled={currentIndex === 0}
                                        onClick={() => goToQuestion(currentIndex - 1)}
                                    >
                                        Previous
                                    </Button>
                                    {currentIndex < questions.length - 1 ? (
                                        <Button
                                            type="button"
                                            className="flex-1"
                                            onClick={() => goToQuestion(currentIndex + 1)}
                                        >
                                            Next
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            className="flex-1"
                                            isLoading={submitting}
                                            onClick={() => submitQuiz(false)}
                                        >
                                            Submit
                                        </Button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => submitQuiz(false)}
                                    disabled={submitting}
                                    className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-primary-200 dark:hover:border-primary-500/25 hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Submit now
                                </button>
                            </div>
                        </aside>
                    </div>
                ) : null}
            </main>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{value}</p>
        </div>
    );
}

function AttemptTopBar({
    quiz,
    answeredCount,
    totalQuestions,
    timeLeft,
    saveStatus,
    lastSavedAt,
    submitting,
    onExit,
    onSubmit,
}: {
    quiz: Quiz;
    answeredCount: number;
    totalQuestions: number;
    timeLeft: number;
    saveStatus: "idle" | "saving" | "saved" | "error";
    lastSavedAt: number | null;
    submitting: boolean;
    onExit: () => void;
    onSubmit: () => void;
}) {
    return (
        <div className="surface-panel sticky top-3 z-30 col-span-full overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between lg:px-5">
                <div className="min-w-0">
                    <button
                        type="button"
                        onClick={onExit}
                        className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary-700"
                    >
                        <span aria-hidden="true">←</span>
                        Quizzes
                    </button>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary-50 dark:bg-primary-500/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-primary-700 dark:text-primary-300">
                            {quiz.category || "Quiz"}
                        </span>
                        <h1 className="truncate text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                            {quiz.title}
                        </h1>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                        <TargetIcon className="h-4 w-4 text-primary-600" />
                        {answeredCount}/{totalQuestions}
                    </span>
                    {quiz.timeLimitMinutes ? (
                        <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${timeLeft <= 60 ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300" : "on-dark bg-[#020617] text-white"}`}>
                            <ClockIcon className="h-4 w-4" />
                            {formatTime(timeLeft)}
                        </span>
                    ) : null}
                    <InlineAutoSaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />
                    <Button type="button" size="sm" isLoading={submitting} onClick={onSubmit}>
                        Submit
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ProgressMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
    );
}

function LockedQuizCard({
    message,
    courses,
    onSignIn,
}: {
    message: string;
    courses: LinkedCourseSummary[];
    onSignIn: () => void;
}) {
    return (
        <div className="surface-panel mx-auto max-w-3xl p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <LockIcon className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-2xl font-black text-slate-950">Course access required</h2>
            <p className="mx-auto mt-2 max-w-xl text-slate-600">{message}</p>
            {courses.length > 0 && (
                <div className="mt-6 grid gap-3">
                    {courses.map((course) => (
                        <Link
                            key={course.id}
                            href={course.slug ? `/courses/${course.slug}` : "/courses"}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-primary-200 dark:hover:border-primary-500/25 hover:bg-primary-50 dark:hover:bg-primary-500/10"
                        >
                            <p className="font-black text-slate-950">{course.title || "Linked course"}</p>
                            <p className="text-sm text-slate-500">
                                {course.accessType === "free" ? "Enroll in this free course" : "Buy this course to unlock the quiz"}
                            </p>
                        </Link>
                    ))}
                </div>
            )}
            <Button className="mt-6" onClick={onSignIn}>Sign In</Button>
        </div>
    );
}

function IntroPanel({
    quiz,
    questionCount,
    totalMarks,
    hasActiveAttempt,
    onStart,
}: {
    quiz: Quiz;
    questionCount: number;
    totalMarks: number;
    hasActiveAttempt: boolean;
    onStart: () => void;
}) {
    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="surface-panel p-6 lg:p-8">
                <span className="section-eyebrow">Ready when you are</span>
                <h2 className="mt-3 text-3xl font-black text-slate-950">{hasActiveAttempt ? "Resume your quiz" : "Start this quiz"}</h2>
                <p className="mt-3 text-slate-600">
                    Your answers are saved as you go. You can move between questions before submitting, and the review will show explanations after completion.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <InfoTile icon={<TargetIcon />} label="Questions" value={questionCount} />
                    <InfoTile icon={<TrophyIcon />} label="Marks" value={totalMarks || quiz.totalMarks || 0} />
                    <InfoTile icon={<ClockIcon />} label="Time" value={quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} mins` : "Untimed"} />
                </div>
            </div>
            <div className="surface-panel p-6">
                <h3 className="text-xl font-black text-slate-950">Quiz settings</h3>
                <div className="mt-5 space-y-3 text-sm">
                    <SettingRow label="Passing score" value={`${quiz.passingPercentage || 0}%`} />
                    <SettingRow label="Question order" value={quiz.shuffleQuestions ? "Shuffled" : "Fixed"} />
                    <SettingRow label="Options" value={quiz.shuffleOptions ? "Shuffled" : "Fixed"} />
                    <SettingRow label="Review" value={quiz.showExplanations ? "Explanations shown" : "Score only"} />
                </div>
                <Button className="mt-6 w-full" onClick={onStart}>{hasActiveAttempt ? "Resume Quiz" : "Start Quiz"}</Button>
            </div>
        </div>
    );
}

function InlineAutoSaveStatus({ status, lastSavedAt }: { status: "idle" | "saving" | "saved" | "error"; lastSavedAt: number | null }) {
    if (status === "idle") return null;

    return (
        <div
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                status === "error"
                    ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
                    : status === "saving"
                        ? "bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300"
                        : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
            aria-live="polite"
            aria-atomic="true"
            title={lastSavedAt ? `Last saved at ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined}
        >
            {status === "saving" ? (
                <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" aria-hidden="true" />
                    <span>Saving...</span>
                </>
            ) : status === "error" ? (
                <>
                    <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                    <span>Save failed</span>
                </>
            ) : (
                <>
                    <CheckIcon className="h-3.5 w-3.5" />
                    <span>Auto-saved</span>
                </>
            )}
        </div>
    );
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm">
                {icon}
            </div>
            <p className="text-2xl font-black text-slate-950">{value}</p>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    );
}

function SettingRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="font-semibold text-slate-500">{label}</span>
            <span className="font-black text-slate-950">{value}</span>
        </div>
    );
}

function QuestionCard({
    question,
    index,
    total,
    selectedAnswer,
    onAnswer,
}: {
    question: AttemptQuestion;
    index: number;
    total: number;
    selectedAnswer: string;
    onAnswer: (value: string) => void;
}) {
    return (
        <article className="surface-panel overflow-hidden">
            <header className="border-b border-slate-100 bg-gradient-to-r from-white dark:from-surface via-primary-50/40 dark:via-primary-500/10 to-white dark:to-surface p-5 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <span className="on-dark flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#020617] text-lg font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]">
                            {index + 1}
                        </span>
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-700">
                                Question {index + 1} of {total}
                            </p>
                            <p className="mt-1 text-sm font-bold capitalize text-slate-500">
                                {question.type === "mcq" ? "Multiple choice" : "Text input"} · {question.difficulty || "medium"}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">
                            {question.marks} marks
                        </span>
                        {question.negativeMarks ? (
                            <span className="rounded-full border border-red-100 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 px-3 py-1 text-xs font-black text-red-700 dark:text-red-300">
                                -{question.negativeMarks}
                            </span>
                        ) : null}
                    </div>
                </div>
            </header>

            <div className="p-5 lg:p-8">
                {question.passage && (
                    <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/80 dark:bg-amber-500/10 p-4 shadow-inner">
                        <FormattedContent html={question.passage} />
                    </div>
                )}

                <div className="rounded-2xl border border-slate-100 bg-white p-4 lg:p-5">
                    <FormattedContent html={question.questionText} className="text-slate-800" />
                </div>

                {question.type === "mcq" && question.options && (
                    <div className="mt-5 grid gap-3">
                        {question.options.map((option, optionIndex) => {
                            const isSelected = selectedAnswer === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => onAnswer(option.id)}
                                    aria-pressed={isSelected}
                                    className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition duration-200 ${
                                        isSelected
                                            ? "border-[#020617] bg-[#020617] text-white shadow-[0_16px_32px_rgba(15,23,42,0.18)]"
                                            : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50/50 dark:hover:bg-primary-500/10 hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
                                    }`}
                                >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black transition ${
                                        isSelected ? "bg-white text-slate-950" : "bg-slate-100 text-slate-600 group-hover:bg-primary-100 dark:group-hover:bg-primary-500/15 group-hover:text-primary-700 dark:group-hover:text-primary-300"
                                    }`}>
                                        {String.fromCharCode(65 + optionIndex)}
                                    </span>
                                    <FormattedContent html={option.text} size="sm" className={`flex-1 ${isSelected ? "text-white [&_*]:text-white" : ""}`} />
                                    {isSelected ? <CheckIcon className="mt-1 h-5 w-5 shrink-0 text-primary-200" /> : null}
                                </button>
                            );
                        })}
                    </div>
                )}

                {question.type === "text_input" && (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                        <label className="mb-2 block text-sm font-bold text-slate-700">Your answer</label>
                        <input
                            value={selectedAnswer}
                            onChange={(event) => onAnswer(event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-100"
                            placeholder="Type your answer"
                        />
                    </div>
                )}
            </div>
        </article>
    );
}

function ResultView({
    quiz,
    questions,
    answers,
    result,
    resultByQuestionId,
    rankingData,
    rankingLoading,
    rankingError,
    onRetake,
    isPreviewAttempt = false,
}: {
    quiz: Quiz;
    questions: AttemptQuestion[];
    answers: Record<string, string>;
    result: QuizResult;
    resultByQuestionId: Map<string, QuestionResult>;
    rankingData: QuizRankingData | null;
    rankingLoading: boolean;
    rankingError: string | null;
    onRetake: () => void;
    isPreviewAttempt?: boolean;
}) {
    return (
        <div className="space-y-6">
            {isPreviewAttempt && (
                <div className="rounded-2xl border border-info-200 dark:border-info-500/25 bg-info-50 dark:bg-info-500/10 p-4 text-sm">
                    <p className="font-semibold text-info-700 dark:text-info-300">Preview attempt</p>
                    <p className="text-info-700/80 dark:text-info-300/80 mt-0.5">
                        You attempted this as a non-student (teacher / institute admin). Your score is visible here for
                        review but is excluded from public leaderboards and content analytics.
                    </p>
                </div>
            )}
            <div className="surface-panel overflow-hidden">
                <div className="grid gap-6 p-6 lg:grid-cols-[1fr_280px] lg:p-8">
                    <div>
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${
                            result.passed === false ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        }`}>
                            {result.passed === false ? <XIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
                            {result.passed === null ? "Quiz completed" : result.passed ? "Passed" : "Needs revision"}
                        </span>
                        <h2 className="mt-4 text-3xl font-black text-slate-950">Your quiz result</h2>
                        <p className="mt-2 text-slate-600">{quiz.showExplanations ? "Review every question below with the answer key and explanations." : "Your score is ready."}</p>
                    </div>
                    <div className="on-dark rounded-3xl bg-[#020617] p-5 text-white">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Score</p>
                        <p className="mt-2 text-4xl font-black">{result.score} / {result.maxScore}</p>
                        <p className="mt-1 text-primary-200">{result.percentage}%</p>
                    </div>
                </div>
                <div className="grid border-t border-slate-100 sm:grid-cols-4">
                    <ResultStat label="Correct" value={result.correct} tone="text-emerald-600" />
                    <ResultStat label="Wrong" value={result.wrong} tone="text-red-600" />
                    <ResultStat label="Skipped" value={result.skipped} tone="text-slate-500" />
                    <ResultStat label="Passing" value={`${result.passingPercentage || 0}%`} tone="text-primary-600" />
                </div>
            </div>

            <SubmittedRankingPanel
                rankingData={rankingData}
                rankingLoading={rankingLoading}
                rankingError={rankingError}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-2xl font-black text-slate-950">Question Review</h3>
                <div className="flex flex-wrap gap-2">
                    <Link href="/dashboard/quizzes">
                        <Button variant="outline">Attempt History</Button>
                    </Link>
                    <Button variant="outline" onClick={onRetake}>Retake Quiz</Button>
                </div>
            </div>

            <div className="space-y-4">
                {questions.map((question, index) => {
                    const questionResult = resultByQuestionId.get(question.id);
                    return (
                        <ReviewQuestion
                            key={question.id}
                            question={question}
                            index={index}
                            selectedAnswer={answers[question.id] || ""}
                            result={questionResult}
                            showExplanation={quiz.showExplanations}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function SubmittedRankingPanel({
    rankingData,
    rankingLoading,
    rankingError,
}: {
    rankingData: QuizRankingData | null;
    rankingLoading: boolean;
    rankingError: string | null;
}) {
    return (
        <section className="surface-panel overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-6">
                <div>
                    <span className="section-eyebrow">Live leaderboard</span>
                    <h3 className="mt-2 text-2xl font-black text-slate-950">Quiz Ranking</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Calculated from each participant&apos;s latest finalized attempt.
                    </p>
                </div>
                {rankingData?.userRank ? (
                    <div className="on-dark rounded-2xl bg-[#020617] px-5 py-4 text-right text-white">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Your Rank</p>
                        <p className="mt-1 text-4xl font-black">
                            #{rankingData.userRank}
                            <span className="text-lg text-slate-400"> / {rankingData.totalParticipants}</span>
                        </p>
                    </div>
                ) : null}
            </div>

            <div className="p-6">
                {rankingLoading ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-primary-100 dark:border-primary-500/25 bg-primary-50 dark:bg-primary-500/10 p-4 text-sm font-bold text-primary-700 dark:text-primary-300">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" aria-hidden="true" />
                        Calculating your ranking...
                    </div>
                ) : rankingError ? (
                    <div className="rounded-2xl border border-red-100 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
                        {rankingError}
                    </div>
                ) : !rankingData || !rankingData.userRank ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                        Ranking will appear here once finalized participant data is available.
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-4">
                            <RankingStat label="Percentile" value={`${rankingData.percentile}th`} tone="text-primary-700" />
                            <RankingStat label="Top score" value={rankingData.topScore} tone="text-slate-950" />
                            <RankingStat label="Average" value={rankingData.averageScore} tone="text-slate-950" />
                            <RankingStat label="Participants" value={rankingData.totalParticipants} tone="text-slate-950" />
                        </div>

                        {rankingData.selectedAttemptIsRanked ? null : (
                            <div className="mt-4 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm font-semibold text-amber-800 dark:text-amber-300">
                                Your displayed rank uses your latest finalized attempt for this quiz.
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

function RankingStat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
        </div>
    );
}

function ResultStat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
    return (
        <div className="border-t border-slate-100 p-5 sm:border-l sm:border-t-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
        </div>
    );
}

function ReviewQuestion({
    question,
    index,
    selectedAnswer,
    result,
    showExplanation,
}: {
    question: AttemptQuestion;
    index: number;
    selectedAnswer: string;
    result?: QuestionResult;
    showExplanation: boolean;
}) {
    return (
        <article className="surface-panel p-5 lg:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-2xl border font-black ${progressClass(result?.status)}`}>
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

            {question.passage && (
                <div className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-4">
                    <FormattedContent html={question.passage} />
                </div>
            )}

            <FormattedContent html={question.questionText} />

            {question.type === "mcq" && question.options && (
                <div className="mt-5 grid gap-3">
                    {question.options.map((option, optionIndex) => {
                        const isCorrect = Boolean(result?.correctOptionIds?.includes(option.id));
                        const isSelected = selectedAnswer === option.id;
                        return (
                            <div
                                key={option.id}
                                className={`flex items-start gap-3 rounded-2xl border p-4 ${
                                    isCorrect
                                        ? "border-emerald-300 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10"
                                        : isSelected
                                            ? "border-red-300 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10"
                                            : "border-slate-200 bg-white"
                                }`}
                            >
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                                    isCorrect ? "bg-emerald-600 text-white" : isSelected ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                                }`}>
                                    {String.fromCharCode(65 + optionIndex)}
                                </span>
                                <FormattedContent html={option.text} size="sm" className="flex-1" />
                                {isCorrect && <CheckIcon className="h-5 w-5 shrink-0 text-emerald-600" />}
                                {!isCorrect && isSelected && <XIcon className="h-5 w-5 shrink-0 text-red-600" />}
                            </div>
                        );
                    })}
                </div>
            )}

            {question.type === "text_input" && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Your answer</p>
                        <p className="mt-1 font-bold text-slate-950">{selectedAnswer || "Skipped"}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Correct answer</p>
                        <p className="mt-1 font-bold text-emerald-950">{result?.correctAnswer || "Not provided"}</p>
                    </div>
                </div>
            )}

            {showExplanation && result?.explanation && (
                <details className="group mt-5 rounded-2xl border border-primary-100 dark:border-primary-500/25 bg-primary-50 dark:bg-primary-500/10 p-4">
                    <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 text-xs font-black uppercase tracking-wide text-primary-700 dark:text-primary-300">
                        <span>Explanation</span>
                        <span className="text-[10px] font-bold normal-case tracking-normal text-primary-500/80 group-open:hidden">Tap to reveal</span>
                    </summary>
                    <div className="mt-2">
                        <FormattedContent html={result.explanation} size="sm" />
                    </div>
                </details>
            )}
        </article>
    );
}
