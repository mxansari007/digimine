"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, DataTable, PaginationControls, getPaginatedItems, type DataTableColumn } from "@digimine/ui";
import { PageLoading } from "@/components/common";
import { useAuthContext } from "@/contexts/AuthContext";
import { getContestById, getContestPhase } from "@/lib/firestore/contests";
import { getUserQuizAttempts } from "@/lib/firestore/quizzes";
import { getUserTestAttempts } from "@/lib/firestore/tests";
import type { Contest, QuizAttempt, TestAttempt } from "@digimine/types";

type ContestAttemptRow = {
    id: string;
    kind: "test" | "quiz";
    contestId: string;
    contest: Contest | null;
    title: string;
    paperTitle: string;
    status: TestAttempt["status"] | QuizAttempt["status"];
    totalScore: number;
    maxPossibleScore: number;
    percentage: number;
    createdAt: Date;
    completedAt?: Date;
    updatedAt?: Date;
    resultHref: string;
    resumeHref: string;
};

function isFinalized(status: ContestAttemptRow["status"]) {
    return status === "completed" || status === "timed_out";
}

function formatDate(value?: Date) {
    if (!value) return "-";
    return value.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: Date) {
    if (!value) return "-";
    return value.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getAttemptMillis(row: ContestAttemptRow) {
    return row.completedAt?.getTime?.()
        || row.updatedAt?.getTime?.()
        || row.createdAt.getTime();
}

function statusBadge(row: ContestAttemptRow) {
    if (row.status === "completed") {
        return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Completed</span>;
    }
    if (row.status === "timed_out") {
        return <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Timed out</span>;
    }
    if (row.status === "in_progress") {
        return <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">In progress</span>;
    }
    return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Closed</span>;
}

function phaseBadge(contest: Contest | null) {
    if (!contest) return <span className="text-xs font-semibold text-slate-400">Contest unavailable</span>;
    const phase = getContestPhase(contest);
    if (phase === "live") {
        return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Live</span>;
    }
    if (phase === "scheduled") {
        return <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Scheduled</span>;
    }
    return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Ended</span>;
}

function toRows(
    testAttempts: TestAttempt[],
    quizAttempts: QuizAttempt[],
    contests: Record<string, Contest | null>
): ContestAttemptRow[] {
    const testRows = testAttempts
        .filter((attempt) => Boolean(attempt.contestId))
        .map((attempt): ContestAttemptRow => {
            const contest = contests[attempt.contestId!];
            return {
                id: attempt.id,
                kind: "test",
                contestId: attempt.contestId!,
                contest,
                title: contest?.title || attempt.contestTitle || "Contest",
                paperTitle: contest?.testTitle || attempt.title || "Test contest",
                status: attempt.status,
                totalScore: attempt.totalScore || 0,
                maxPossibleScore: attempt.maxPossibleScore || 0,
                percentage: attempt.percentage || 0,
                createdAt: attempt.createdAt,
                completedAt: attempt.completedAt,
                updatedAt: attempt.updatedAt,
                resultHref: `/dashboard/tests/results/${attempt.id}`,
                resumeHref: contest ? `/contests/${contest.slug || contest.id}` : "/contests",
            };
        });

    const quizRows = quizAttempts
        .filter((attempt) => Boolean(attempt.contestId))
        .map((attempt): ContestAttemptRow => {
            const contest = contests[attempt.contestId!];
            return {
                id: attempt.id,
                kind: contest?.sourceType === "custom" ? "quiz" : "quiz",
                contestId: attempt.contestId!,
                contest,
                title: contest?.title || attempt.contestTitle || "Contest",
                paperTitle: contest?.quizTitle || attempt.title || "Quiz contest",
                status: attempt.status,
                totalScore: attempt.totalScore || 0,
                maxPossibleScore: attempt.maxPossibleScore || 0,
                percentage: attempt.percentage || 0,
                createdAt: attempt.createdAt,
                completedAt: attempt.completedAt,
                updatedAt: attempt.updatedAt,
                resultHref: `/dashboard/quizzes/results/${attempt.id}`,
                resumeHref: contest ? `/contests/${contest.slug || contest.id}` : "/contests",
            };
        });

    return [...testRows, ...quizRows].sort((a, b) => getAttemptMillis(b) - getAttemptMillis(a));
}

export default function MyContestsPage() {
    const { user } = useAuthContext();
    const [testAttempts, setTestAttempts] = useState<TestAttempt[]>([]);
    const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
    const [contests, setContests] = useState<Record<string, Contest | null>>({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        if (!user) return;

        async function loadData() {
            setLoading(true);
            try {
                const [rawTestAttempts, rawQuizAttempts] = await Promise.all([
                    getUserTestAttempts(user!.id).catch((error) => {
                        console.error("Error loading contest test attempts:", error);
                        return [];
                    }),
                    getUserQuizAttempts(user!.id).catch((error) => {
                        console.error("Error loading contest quiz attempts:", error);
                        return [];
                    }),
                ]);

                const contestTestAttempts = rawTestAttempts.filter((attempt) => Boolean(attempt.contestId));
                const contestQuizAttempts = rawQuizAttempts.filter((attempt) => Boolean(attempt.contestId));
                setTestAttempts(contestTestAttempts);
                setQuizAttempts(contestQuizAttempts);

                const contestIds = Array.from(new Set([
                    ...contestTestAttempts.map((attempt) => attempt.contestId),
                    ...contestQuizAttempts.map((attempt) => attempt.contestId),
                ].filter(Boolean))) as string[];

                const contestEntries = await Promise.all(
                    contestIds.map(async (contestId) => {
                        try {
                            return [contestId, await getContestById(contestId)] as const;
                        } catch (error) {
                            console.warn("Skipping inaccessible contest:", contestId, error);
                            return [contestId, null] as const;
                        }
                    })
                );
                setContests(Object.fromEntries(contestEntries));
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [user]);

    const rows = useMemo(
        () => toRows(testAttempts, quizAttempts, contests),
        [testAttempts, quizAttempts, contests]
    );

    const activeRows = useMemo(
        () => rows.filter((row) => row.status === "in_progress"),
        [rows]
    );

    const completedRows = useMemo(
        () => rows.filter((row) => isFinalized(row.status)),
        [rows]
    );

    const paginatedRows = useMemo(
        () => getPaginatedItems(rows, page, pageSize),
        [rows, page, pageSize]
    );

    useEffect(() => {
        setPage(1);
    }, [rows.length, pageSize]);

    if (loading) return <PageLoading />;

    const columns: DataTableColumn<ContestAttemptRow>[] = [
        {
            key: "contest",
            header: "Contest",
            render: (row) => (
                <div className="min-w-[240px]">
                    <div className="font-black text-slate-950">{row.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold uppercase text-slate-600">
                            {row.kind === "test" ? "Test" : row.contest?.sourceType === "custom" ? "Uploaded" : "Quiz"}
                        </span>
                        <span>{row.paperTitle}</span>
                    </div>
                </div>
            ),
        },
        {
            key: "window",
            header: "Window",
            render: (row) => (
                <div className="min-w-[180px]">
                    <div className="font-semibold text-slate-800">{formatDate(row.contest?.startTime || row.createdAt)}</div>
                    <div className="text-xs text-slate-400">
                        {row.contest ? `${formatDateTime(row.contest.startTime)} - ${formatDateTime(row.contest.endTime)}` : "Window unavailable"}
                    </div>
                </div>
            ),
        },
        {
            key: "score",
            header: "Score",
            render: (row) => isFinalized(row.status) ? (
                <div>
                    <div className="font-black text-slate-950">{row.totalScore} / {row.maxPossibleScore}</div>
                    <div className="text-xs text-slate-400">{row.percentage}%</div>
                </div>
            ) : (
                <span className="text-xs font-semibold text-slate-400">After submit</span>
            ),
        },
        {
            key: "phase",
            header: "Contest",
            render: (row) => phaseBadge(row.contest),
        },
        {
            key: "status",
            header: "Attempt",
            render: statusBadge,
        },
        {
            key: "action",
            header: "",
            className: "text-right",
            render: (row) => {
                if (row.status === "in_progress") {
                    return (
                        <Link href={row.resumeHref}>
                            <Button size="sm">Resume</Button>
                        </Link>
                    );
                }
                if (isFinalized(row.status)) {
                    return (
                        <Link href={row.resultHref}>
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
                    <span className="section-eyebrow">Live practice</span>
                    <h1 className="text-3xl font-black text-slate-950">My Contests</h1>
                    <p className="mt-2 text-slate-500">Contest attempts and results are kept separate from regular test series and quiz practice.</p>
                </div>
                <Link href="/contests">
                    <Button>Browse Contests</Button>
                </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Contest attempts</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{rows.length}</p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">In progress</p>
                    <p className="mt-2 text-3xl font-black text-primary-700">{activeRows.length}</p>
                </Card>
                <Card className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Results ready</p>
                    <p className="mt-2 text-3xl font-black text-emerald-700">{completedRows.length}</p>
                </Card>
            </div>

            {rows.length === 0 ? (
                <Card className="flex flex-col items-center justify-center border-2 border-dashed p-12 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-50 text-3xl font-black text-primary-700">
                        C
                    </div>
                    <h2 className="mt-5 text-2xl font-black text-slate-950">No contest attempts yet</h2>
                    <p className="mt-2 max-w-md text-slate-500">
                        Join a live contest to see your attempts, results, and leaderboard links here.
                    </p>
                    <Link href="/contests" className="mt-6">
                        <Button>Explore Contests</Button>
                    </Link>
                </Card>
            ) : (
                <DataTable
                    columns={columns}
                    data={paginatedRows}
                    keyExtractor={(row) => `${row.kind}-${row.id}`}
                    emptyState="No contest attempts found."
                    footer={
                        <PaginationControls
                            page={page}
                            pageSize={pageSize}
                            totalItems={rows.length}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                            pageSizeOptions={[5, 10, 20]}
                            itemLabel="attempts"
                        />
                    }
                />
            )}
        </div>
    );
}
