"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { getContestBySlug, getContestPhase } from "@/lib/firestore/contests";
import {
    enrollInFreeTestSeries,
    getTestById,
    getTestSeries,
    getUserTestAttempts,
    hasUserPurchasedTest,
} from "@/lib/firestore/tests";
import { getQuizById, getUserQuizAttempts } from "@/lib/firestore/quizzes";
import { useAuthContext } from "@/contexts/AuthContext";
import { CalendarIcon, CheckIcon, ClockIcon, FileTextIcon, LockIcon, TargetIcon, TrophyIcon } from "@/components/icons/AppIcons";
import type { Contest, Quiz, QuizAttempt, Test, TestAttempt, TestSeries } from "@digimine/types";

function formatDateTime(value: Date) {
    return value.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function secondsUntil(value: Date) {
    return Math.max(0, Math.floor((value.getTime() - Date.now()) / 1000));
}

function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function toDate(value: any): Date {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    return new Date(value);
}

function hydrateDateFields<T extends Record<string, any>>(value: T | null | undefined): T | null {
    if (!value) return null;
    return {
        ...value,
        startTime: value.startTime ? toDate(value.startTime) : value.startTime,
        endTime: value.endTime ? toDate(value.endTime) : value.endTime,
        createdAt: value.createdAt ? toDate(value.createdAt) : value.createdAt,
        updatedAt: value.updatedAt ? toDate(value.updatedAt) : value.updatedAt,
    };
}

async function fetchClassroomJson<T>(url: string, token: string): Promise<T> {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "You do not have access to this classroom content.");
    }
    return data;
}

export default function ContestDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const slug = params.slug as string;
    const classroomTeacherId = searchParams.get("teacherId");
    const { user, firebaseUser, loading: authLoading } = useAuthContext();
    const userId = user?.id || firebaseUser?.uid;

    const [contest, setContest] = useState<Contest | null>(null);
    const [series, setSeries] = useState<TestSeries | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [attempts, setAttempts] = useState<TestAttempt[]>([]);
    const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
    const [hasAccess, setHasAccess] = useState(false);
    const [loading, setLoading] = useState(true);
    const [enrolling, setEnrolling] = useState(false);

    // Guard against duplicate load runs (React Strict Mode, hook re-renders).
    const loadOnceRef = useRef<string | null>(null);

    useEffect(() => {
        const loadKey = `${slug}|${classroomTeacherId || ""}|${userId || ""}|${authLoading ? "loading" : "ready"}`;
        if (loadOnceRef.current === loadKey) return;
        loadOnceRef.current = loadKey;

        async function loadContest() {
            if (classroomTeacherId && authLoading) return;

            try {
                setLoading(true);
                let classroomToken: string | null = null;
                let contestData: Contest | null = null;

                if (classroomTeacherId) {
                    if (!firebaseUser) {
                        router.push(`/login?redirect=${encodeURIComponent(`/contests/${slug}?teacherId=${classroomTeacherId}`)}`);
                        return;
                    }

                    classroomToken = await firebaseUser.getIdToken();
                    const data = await fetchClassroomJson<{ content?: Contest }>(
                        `/api/content/data?type=contest&slug=${encodeURIComponent(slug)}&teacherId=${encodeURIComponent(classroomTeacherId)}`,
                        classroomToken
                    );
                    contestData = hydrateDateFields(data.content);
                } else {
                    contestData = await getContestBySlug(slug);
                }

                if (!contestData) {
                    router.push("/contests");
                    return;
                }

                setContest(contestData);
                setSeries(null);
                setTest(null);
                setQuiz(null);
                setAttempts([]);
                setQuizAttempts([]);

                if (contestData.sourceType === "test") {
                    if (!contestData.seriesId || !contestData.testId) {
                        router.push("/contests");
                        return;
                    }

                    let seriesData: TestSeries | null = null;
                    let testData: Test | null = null;

                    if (classroomTeacherId && classroomToken) {
                        const [seriesRes, testRes] = await Promise.all([
                            fetchClassroomJson<{ content?: TestSeries }>(
                                `/api/content/data?type=test&slug=${encodeURIComponent(contestData.seriesId)}&teacherId=${encodeURIComponent(classroomTeacherId)}`,
                                classroomToken
                            ),
                            fetchClassroomJson<{ test?: Test }>(
                                `/api/content/data?type=test&parentId=${encodeURIComponent(contestData.seriesId)}&childId=${encodeURIComponent(contestData.testId)}&teacherId=${encodeURIComponent(classroomTeacherId)}`,
                                classroomToken
                            ),
                        ]);
                        seriesData = hydrateDateFields(seriesRes.content);
                        testData = hydrateDateFields(testRes.test);
                    } else {
                        [seriesData, testData] = await Promise.all([
                            getTestSeries(contestData.seriesId),
                            getTestById(contestData.seriesId, contestData.testId),
                        ]);
                    }

                    if (!seriesData || !testData) {
                        router.push("/contests");
                        return;
                    }
                    setSeries(seriesData);
                    setTest(testData);
                    if (userId) {
                        const userAttempts = await getUserTestAttempts(userId, contestData.seriesId, contestData.testId);
                        if (classroomTeacherId) {
                            setHasAccess(true);
                        } else {
                            const access = await hasUserPurchasedTest(userId, contestData.seriesId);
                            let hasClassroomAccess = false;
                            try {
                                const accessRes = await fetch(`/api/classroom/content-access?userId=${userId}&teacherId=${(seriesData as any).teacherId || ""}`);
                                hasClassroomAccess = (await accessRes.json())?.hasAccess || false;
                            } catch { /* ignore */ }
                            setHasAccess(access || hasClassroomAccess);
                        }
                        setAttempts(userAttempts.filter((attempt) => attempt.contestId === contestData.id));
                    } else {
                        setHasAccess(false);
                    }
                } else {
                    if (!contestData.quizId) {
                        router.push("/contests");
                        return;
                    }
                    let quizData: Quiz | null = null;
                    if (classroomTeacherId && classroomToken) {
                        const quizRes = await fetchClassroomJson<{ quiz?: Quiz }>(
                            `/api/quizzes/data?slug=${encodeURIComponent(contestData.quizId)}&teacherId=${encodeURIComponent(classroomTeacherId)}`,
                            classroomToken
                        );
                        quizData = hydrateDateFields(quizRes.quiz);
                    } else {
                        quizData = await getQuizById(contestData.quizId);
                    }
                    if (!quizData) {
                        router.push("/contests");
                        return;
                    }
                    setQuiz(quizData);
                    let quizHasAccess = Boolean(classroomTeacherId) || quizData.accessType === "free" || contestData.sourceType === "custom";
                    if (userId && !quizHasAccess && (quizData as any).teacherId) {
                        try {
                            const accessRes = await fetch(`/api/classroom/content-access?userId=${userId}&teacherId=${(quizData as any).teacherId}`);
                            quizHasAccess = (await accessRes.json())?.hasAccess || false;
                        } catch { /* ignore */ }
                    }
                    setHasAccess(quizHasAccess);
                    if (userId) {
                        const userAttempts = await getUserQuizAttempts(userId, quizData.id);
                        setQuizAttempts(userAttempts.filter((attempt) => attempt.contestId === contestData.id));
                    }
                }
            } catch (error) {
                console.error("Failed to load contest:", error);
                setContest(null);
            } finally {
                setLoading(false);
            }
        }
        loadContest();
    }, [authLoading, classroomTeacherId, firebaseUser, router, slug, userId]);

    const latestAttempt = useMemo(
        () => attempts.find((attempt) => attempt.status !== "abandoned") || null,
        [attempts]
    );
    const latestQuizAttempt = useMemo(
        () => quizAttempts.find((attempt) => attempt.status !== "abandoned") || null,
        [quizAttempts]
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 py-12">
                <div className="container-page">
                    <Card className="h-96 animate-pulse bg-white">
                        <span className="sr-only">Loading contest</span>
                    </Card>
                </div>
            </div>
        );
    }

    if (!contest) return null;

    const phase = getContestPhase(contest);
    const isLive = phase === "live";
    const isUpcoming = phase === "scheduled";
    const isEnded = phase === "ended";
    const isTestContest = contest.sourceType === "test";
    const activeAttempt = isTestContest ? latestAttempt : latestQuizAttempt;
    const isFreeSeries = Boolean(series?.accessType === "free");
    const canStart = Boolean(userId && hasAccess && isLive && !activeAttempt);
    const currentContestPath = `/contests/${contest.slug || contest.id}${classroomTeacherId ? `?teacherId=${encodeURIComponent(classroomTeacherId)}` : ""}`;
    const startHref = (() => {
        if (isTestContest && series && contest.testId) {
            const query = new URLSearchParams({
                testId: contest.testId,
                contestId: contest.id,
            });
            if (classroomTeacherId) query.set("teacherId", classroomTeacherId);
            return `/tests/${series.slug}/attempt?${query.toString()}`;
        }
        if (quiz) {
            const query = new URLSearchParams({ contestId: contest.id });
            if (classroomTeacherId) query.set("teacherId", classroomTeacherId);
            return `/quizzes/${quiz.slug || quiz.id}?${query.toString()}`;
        }
        return currentContestPath;
    })();
    const resultSuffix = classroomTeacherId ? `?teacherId=${encodeURIComponent(classroomTeacherId)}` : "";
    const resultHref = isTestContest
        ? latestAttempt ? `/dashboard/tests/results/${latestAttempt.id}${resultSuffix}` : ""
        : latestQuizAttempt ? `/dashboard/quizzes/results/${latestQuizAttempt.id}${resultSuffix}` : "";
    const resumeHref = isTestContest && latestAttempt
        ? `${startHref}${startHref.includes("?") ? "&" : "?"}attemptId=${latestAttempt.id}`
        : startHref;
    const quizAccessHref = quiz
        ? `/quizzes/${quiz.slug || quiz.id}${classroomTeacherId ? `?teacherId=${encodeURIComponent(classroomTeacherId)}` : ""}`
        : "/quizzes";
    const paperMinutes = test?.duration || quiz?.timeLimitMinutes || Math.max(1, Math.ceil((contest.endTime.getTime() - contest.startTime.getTime()) / 60000));
    const passingMark = test?.passingMarks || contest.passingMarks || 0;
    const contestStatusText = isLive
        ? `${formatDuration(secondsUntil(contest.endTime))} left`
        : isUpcoming
            ? `Starts in ${formatDuration(secondsUntil(contest.startTime))}`
            : "Contest ended";

    const handleFreeEnroll = async () => {
        if (!userId || enrolling || !series) return;
        try {
            setEnrolling(true);
            await enrollInFreeTestSeries(userId, series.id);
            setHasAccess(true);
        } catch (error) {
            alert(error instanceof Error ? error.message : "Could not enroll.");
        } finally {
            setEnrolling(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12">
            <div className="container-page">
                <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
                    <Link href="/" className="hover:text-slate-900">Home</Link>
                    <span>/</span>
                    <Link href="/contests" className="hover:text-slate-900">Contests</Link>
                    <span>/</span>
                    <span className="font-semibold text-slate-900">{contest.title}</span>
                </nav>

                <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
                    <div className="space-y-6">
                        <Card className="overflow-hidden">
                            <div className="relative h-72 bg-slate-950">
                                {contest.thumbnailURL ? (
                                    <img src={contest.thumbnailURL} alt={contest.title} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white/30">
                                        <TrophyIcon className="h-20 w-20" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                                <div className="absolute bottom-6 left-6 right-6 text-white">
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur">
                                            {phase === "live" ? "Live now" : phase}
                                        </span>
                                        {contest.category && (
                                            <span className="rounded-full bg-primary-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-100 backdrop-blur">
                                                {contest.category}
                                            </span>
                                        )}
                                    </div>
                                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{contest.title}</h1>
                                    <p className="mt-3 max-w-2xl text-white/80">{contest.shortDescription}</p>
                                </div>
                            </div>
                            <div className="p-6">
                                <p className="text-lg leading-8 text-slate-700">{contest.description}</p>
                            </div>
                        </Card>

                        <Card className="p-6">
                            <h2 className="text-xl font-bold text-slate-950">Contest Paper</h2>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-2xl bg-slate-50 p-4">
                                    <FileTextIcon className="h-5 w-5 text-primary-600" />
                                    <div className="mt-3 text-2xl font-bold text-slate-950">{contest.totalQuestions}</div>
                                    <div className="text-sm text-slate-500">Questions</div>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                    <TargetIcon className="h-5 w-5 text-primary-600" />
                                    <div className="mt-3 text-2xl font-bold text-slate-950">{contest.totalMarks}</div>
                                    <div className="text-sm text-slate-500">Marks</div>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                    <ClockIcon className="h-5 w-5 text-primary-600" />
                                    <div className="mt-3 text-2xl font-bold text-slate-950">{paperMinutes}</div>
                                    <div className="text-sm text-slate-500">Paper minutes</div>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                    <TrophyIcon className="h-5 w-5 text-primary-600" />
                                    <div className="mt-3 text-2xl font-bold text-slate-950">{passingMark}</div>
                                    <div className="text-sm text-slate-500">Cut-off marks</div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <aside className="space-y-4">
                        <Card className="sticky top-24 p-6">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Live window</div>
                                <div className="mt-3 space-y-3 text-sm text-slate-700">
                                    <div className="flex items-start gap-2">
                                        <CalendarIcon className="mt-0.5 h-4 w-4 text-primary-600" />
                                        <span>Starts {formatDateTime(contest.startTime)}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <ClockIcon className="mt-0.5 h-4 w-4 text-primary-600" />
                                        <span>Ends {formatDateTime(contest.endTime)}</span>
                                    </div>
                                </div>
                                <div className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${
                                    isLive ? "bg-red-50 text-red-700" : isUpcoming ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                                }`}>
                                    {contestStatusText}
                                </div>
                            </div>

                            <div className="mt-5 space-y-3">
                                {activeAttempt?.status === "in_progress" ? (
                                    <Link href={resumeHref}>
                                        <Button className="w-full">Resume Contest</Button>
                                    </Link>
                                ) : activeAttempt && (activeAttempt.status === "completed" || activeAttempt.status === "timed_out") && resultHref ? (
                                    <Link href={resultHref}>
                                        <Button className="w-full">View Result & Leaderboard</Button>
                                    </Link>
                                ) : !userId ? (
                                    <Link href={`/login?redirect=${encodeURIComponent(currentContestPath)}`}>
                                        <Button className="w-full">Login to Join</Button>
                                    </Link>
                                ) : isTestContest && !hasAccess && isFreeSeries ? (
                                    <Button onClick={handleFreeEnroll} isLoading={enrolling} className="w-full">
                                        Enroll Free Series
                                    </Button>
                                ) : isTestContest && !hasAccess && series ? (
                                    <Link href={`/tests/${series.slug}/purchase`}>
                                        <Button className="w-full">Unlock Series to Join</Button>
                                    </Link>
                                ) : !hasAccess ? (
                                    <Link href={quizAccessHref}>
                                        <Button className="w-full">Open Quiz Access</Button>
                                    </Link>
                                ) : canStart ? (
                                    <Link href={startHref}>
                                        <Button className="w-full">Enter Live Contest</Button>
                                    </Link>
                                ) : isUpcoming ? (
                                    <Button className="w-full" disabled>Not Started Yet</Button>
                                ) : isEnded ? (
                                    <Button className="w-full" disabled>Contest Closed</Button>
                                ) : (
                                    <Button className="w-full" disabled>Unavailable</Button>
                                )}
                            </div>

                            <div className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm text-slate-600">
                                <div className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-emerald-600" /> Same end time for everyone</div>
                                <div className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-emerald-600" /> One attempt per participant</div>
                                <div className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-emerald-600" /> Final ranking after contest ends</div>
                                {!hasAccess && (
                                    <div className="flex items-center gap-2 text-slate-500"><LockIcon className="h-4 w-4" /> Requires series access</div>
                                )}
                            </div>
                        </Card>
                    </aside>
                </div>
            </div>
        </div>
    );
}
