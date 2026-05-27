"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, DataTable, PaginationControls, getPaginatedItems, type DataTableColumn } from "@digimine/ui";
import { PageLoading } from "@/components/common";
import { useAuthContext } from "@/contexts/AuthContext";
import { getQuizById, getUserQuizAttempts } from "@/lib/firestore/quizzes";
import type { Quiz, QuizAttempt } from "@digimine/types";

type QuizRankingData = {
    totalParticipants: number;
    userRank: number | null;
    percentile: number;
    rankedAttemptId: string | null;
    selectedAttemptIsRanked: boolean;
};

function isFinalizedAttempt(attempt: QuizAttempt) {
    return attempt.status === "completed" || attempt.status === "timed_out";
}

function getAttemptMillis(attempt: QuizAttempt) {
    return attempt.completedAt?.getTime?.()
        || attempt.updatedAt?.getTime?.()
        || attempt.createdAt?.getTime?.()
        || 0;
}

function formatDate(value?: Date) {
    if (!value) return "-";
    return value.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(attempt: QuizAttempt) {
    if (attempt.status === "completed") {
        const passed = attempt.passed !== false;
        return (
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {passed ? "Completed" : "Needs revision"}
            </span>
        );
    }
    if (attempt.status === "timed_out") {
        return <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Timed out</span>;
    }
    if (attempt.status === "in_progress") {
        return <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">In progress</span>;
    }
    return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Closed</span>;
}

export default function MyQuizzesPage() {
    const { user, firebaseUser } = useAuthContext();
    const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
    const [quizzes, setQuizzes] = useState<Record<string, Quiz>>({});
    const [rankings, setRankings] = useState<Record<string, QuizRankingData>>({});
    const [loading, setLoading] = useState(true);
    const [rankingLoading, setRankingLoading] = useState(false);
    const [attemptPage, setAttemptPage] = useState(1);
    const [attemptPageSize, setAttemptPageSize] = useState(10);

    useEffect(() => {
        if (!user) return;

        async function loadData() {
            setLoading(true);
            try {
                const attemptData = await getUserQuizAttempts(user!.id);
                const regularAttempts = attemptData.filter((attempt) => !attempt.contestId);

                const uniqueQuizIds = Array.from(new Set(regularAttempts.map((attempt) => attempt.quizId).filter(Boolean)));
                const quizEntries = await Promise.all(
                    uniqueQuizIds.map(async (quizId) => {
                        try {
                            const quiz = await getQuizById(quizId);
                            if (!quiz) return null;
                            // Teacher-classroom quizzes (anything with a teacherId)
                            // surface under /student/classrooms — keep this page
                            // limited to the PUBLIC catalog.
                            const teacherId = (quiz as Quiz & { teacherId?: string | null }).teacherId;
                            if (teacherId) return null;
                            return [quizId, quiz] as const;
                        } catch (error) {
                            console.warn("Skipping inaccessible quiz:", quizId, error);
                            return null;
                        }
                    })
                );

                const quizMap = Object.fromEntries(
                    quizEntries.filter(Boolean) as Array<readonly [string, Quiz]>
                );
                setQuizzes(quizMap);
                // Drop attempts whose underlying quiz didn't make it past the
                // public-catalog filter — otherwise the table would render
                // mystery "Quiz" rows the user can't open from here anyway.
                setAttempts(regularAttempts.filter((a) => quizMap[a.quizId]));
            } catch (error) {
                console.error("Failed to load quiz attempts:", error);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [user]);

    useEffect(() => {
        setAttemptPage(1);
    }, [attempts.length, attemptPageSize]);

    const latestFinalizedByQuiz = useMemo(() => {
        const latest = new Map<string, QuizAttempt>();
        attempts
            .filter(isFinalizedAttempt)
            .forEach((attempt) => {
                const existing = latest.get(attempt.quizId);
                if (!existing || getAttemptMillis(attempt) > getAttemptMillis(existing)) {
                    latest.set(attempt.quizId, attempt);
                }
            });
        return latest;
    }, [attempts]);

    const latestFinalizedAttempts = useMemo(
        () => Array.from(latestFinalizedByQuiz.values()),
        [latestFinalizedByQuiz]
    );

    useEffect(() => {
        if (!firebaseUser || latestFinalizedAttempts.length === 0) {
            setRankings({});
            return;
        }

        let cancelled = false;

        async function loadRankings() {
            setRankingLoading(true);
            try {
                const token = await firebaseUser!.getIdToken();
                const rankingEntries = await Promise.all(
                    latestFinalizedAttempts.map(async (attempt) => {
                        const response = await fetch(`/api/quizzes/ranking?attemptId=${attempt.id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        const payload = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            throw new Error(payload.error || "Failed to load quiz ranking.");
                        }
                        return [attempt.quizId, payload as QuizRankingData] as const;
                    })
                );
                if (!cancelled) {
                    setRankings(Object.fromEntries(rankingEntries));
                }
            } catch (error) {
                console.error("Failed to load quiz rankings:", error);
                if (!cancelled) setRankings({});
            } finally {
                if (!cancelled) setRankingLoading(false);
            }
        }

        loadRankings();

        return () => {
            cancelled = true;
        };
    }, [firebaseUser, latestFinalizedAttempts]);

    const quizCards = useMemo(() => {
        const byQuiz = new Map<string, QuizAttempt[]>();
        attempts.forEach((attempt) => {
            byQuiz.set(attempt.quizId, [...(byQuiz.get(attempt.quizId) || []), attempt]);
        });
        return Array.from(byQuiz.entries())
            .map(([quizId, quizAttempts]) => ({
                quizId,
                quiz: quizzes[quizId],
                attempts: quizAttempts,
                latestFinalized: latestFinalizedByQuiz.get(quizId),
                activeAttempt: quizAttempts.find((attempt) => attempt.status === "in_progress"),
            }))
            .sort((a, b) => {
                const aLatest = a.attempts[0]?.createdAt?.getTime?.() || 0;
                const bLatest = b.attempts[0]?.createdAt?.getTime?.() || 0;
                return bLatest - aLatest;
            });
    }, [attempts, latestFinalizedByQuiz, quizzes]);

    const paginatedAttempts = useMemo(
        () => getPaginatedItems(attempts, attemptPage, attemptPageSize),
        [attemptPage, attemptPageSize, attempts]
    );

    if (loading) return <PageLoading variant="inline" />;

    const attemptColumns: DataTableColumn<QuizAttempt>[] = [
        {
            key: "quiz",
            header: "Quiz",
            render: (attempt) => {
                const quiz = quizzes[attempt.quizId];
                return (
                    <div className="min-w-[220px]">
                        <div className="font-bold text-slate-950">{quiz?.title || "Quiz"}</div>
                        <div className="text-xs text-slate-400">Attempt {attempt.attemptNumber || attempt.id.slice(0, 6)}</div>
                    </div>
                );
            },
        },
        {
            key: "date",
            header: "Date",
            render: (attempt) => formatDate(attempt.completedAt || attempt.createdAt),
        },
        {
            key: "score",
            header: "Score",
            render: (attempt) => (
                <div>
                    <div className="font-black text-slate-950">{attempt.totalScore} / {attempt.maxPossibleScore}</div>
                    <div className="text-xs text-slate-400">{attempt.percentage}%</div>
                </div>
            ),
        },
        {
            key: "rank",
            header: "Rank",
            render: (attempt) => {
                if (!isFinalizedAttempt(attempt)) {
                    return <span className="text-xs font-semibold text-slate-400">After submit</span>;
                }

                const latest = latestFinalizedByQuiz.get(attempt.quizId);
                if (latest?.id !== attempt.id) {
                    return <span className="text-xs font-semibold text-slate-400">Older attempt</span>;
                }

                const ranking = rankings[attempt.quizId];
                if (rankingLoading && !ranking) {
                    return <span className="text-xs font-semibold text-slate-400">Loading...</span>;
                }
                if (!ranking?.userRank) {
                    return <span className="text-xs font-semibold text-slate-400">No rank yet</span>;
                }

                return (
                    <div>
                        <div className="font-black text-primary-700">#{ranking.userRank} <span className="font-semibold text-slate-400">/ {ranking.totalParticipants}</span></div>
                        <div className="text-xs text-slate-400">{ranking.percentile}th percentile</div>
                    </div>
                );
            },
        },
        {
            key: "status",
            header: "Status",
            render: statusBadge,
        },
        {
            key: "action",
            header: "",
            className: "text-right",
            render: (attempt) => {
                const quiz = quizzes[attempt.quizId];
                if (attempt.status === "in_progress" && quiz?.slug) {
                    return (
                        <Link href={`/quizzes/${quiz.slug}`}>
                            <Button size="sm">Continue</Button>
                        </Link>
                    );
                }
                if (isFinalizedAttempt(attempt)) {
                    return (
                        <Link href={`/dashboard/quizzes/results/${attempt.id}`}>
                            <Button variant="ghost" size="sm" className="font-bold text-primary-700">
                                View Result
                            </Button>
                        </Link>
                    );
                }
                return <span className="text-xs text-slate-400">Unavailable</span>;
            },
        },
    ];

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <span className="section-eyebrow">Quiz practice</span>
                    <h1 className="text-3xl font-black text-slate-950">My Quizzes</h1>
                    <p className="mt-2 text-slate-500">Review previous quiz attempts and see the rank from your latest finalized attempt.</p>
                </div>
                <Link href="/quizzes">
                    <Button>Browse Quizzes</Button>
                </Link>
            </div>

            {attempts.length === 0 ? (
                <div className="surface-panel flex flex-col items-center justify-center border-dashed p-12 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-50 text-primary-700">
                        <span className="text-3xl font-black">Q</span>
                    </div>
                    <h2 className="mt-5 text-2xl font-black text-slate-950">No quiz attempts yet</h2>
                    <p className="mt-2 max-w-md text-slate-500">Start a quiz from the catalog. Your attempts, scores, and latest-attempt rank will appear here.</p>
                    <Link href="/quizzes" className="mt-6">
                        <Button>Explore Quizzes</Button>
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 lg:grid-cols-3">
                        {quizCards.slice(0, 6).map(({ quizId, quiz, attempts: quizAttempts, latestFinalized, activeAttempt }) => {
                            const ranking = rankings[quizId];
                            return (
                                <div key={quizId} className="surface-panel overflow-hidden">
                                    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white">
                                        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-200">{quiz?.category || "Quiz"}</p>
                                        <h2 className="mt-2 line-clamp-2 text-xl font-black text-white">{quiz?.title || "Quiz"}</h2>
                                    </div>
                                    <div className="p-5">
                                        <div className="grid grid-cols-3 gap-2">
                                            <MiniStat label="Attempts" value={quizAttempts.length} />
                                            <MiniStat label="Best" value={Math.max(...quizAttempts.map((attempt) => attempt.percentage || 0)) + "%"} />
                                            <MiniStat label="Rank" value={ranking?.userRank ? `#${ranking.userRank}` : "-"} />
                                        </div>
                                        <p className="mt-4 text-sm text-slate-500">
                                            Ranking uses your latest finalized attempt
                                            {latestFinalized ? ` from ${formatDate(latestFinalized.completedAt || latestFinalized.updatedAt)}.` : "."}
                                        </p>
                                        <div className="mt-5 flex gap-2">
                                            {activeAttempt && quiz?.slug ? (
                                                <Link href={`/quizzes/${quiz.slug}`} className="flex-1">
                                                    <Button className="w-full" size="sm">Continue</Button>
                                                </Link>
                                            ) : quiz?.slug ? (
                                                <Link href={`/quizzes/${quiz.slug}`} className="flex-1">
                                                    <Button className="w-full" size="sm" variant="outline">Open</Button>
                                                </Link>
                                            ) : null}
                                            {latestFinalized ? (
                                                <Link href={`/dashboard/quizzes/results/${latestFinalized.id}`} className="flex-1">
                                                    <Button className="w-full" size="sm" variant="outline">Latest Result</Button>
                                                </Link>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div>
                        <div className="mb-4 flex items-end justify-between gap-3">
                            <div>
                                <h2 className="text-2xl font-black text-slate-950">Previous Attempts</h2>
                                <p className="mt-1 text-sm text-slate-500">Older attempts stay visible, but quiz rank is calculated from the latest finalized attempt only.</p>
                            </div>
                        </div>
                        <DataTable
                            columns={attemptColumns}
                            data={paginatedAttempts}
                            keyExtractor={(attempt) => attempt.id}
                            emptyState="No quiz attempts found."
                            footer={
                                <PaginationControls
                                    page={attemptPage}
                                    pageSize={attemptPageSize}
                                    totalItems={attempts.length}
                                    onPageChange={setAttemptPage}
                                    onPageSizeChange={setAttemptPageSize}
                                    pageSizeOptions={[5, 10, 20]}
                                    itemLabel="attempts"
                                />
                            }
                        />
                    </div>
                </>
            )}
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
    );
}
