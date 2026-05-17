"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, DataTable, PaginationControls, getPaginatedItems } from "@digimine/ui";
import { deleteContest, getAllContests, updateContestStatus } from "@/lib/firestore/contests";
import { EditIcon, TrashIcon } from "@/components/icons/AppIcons";
import type { Contest, TestStatus } from "@digimine/types";

type StatusFilter = TestStatus | "all";

function formatDateTime(value: Date) {
    return value.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getContestPhase(contest: Contest) {
    const now = Date.now();
    if (now < contest.startTime.getTime()) return "scheduled";
    if (now <= contest.endTime.getTime()) return "live";
    return "ended";
}

function statusBadge(status: TestStatus) {
    const styles = {
        draft: "bg-slate-100 text-slate-700",
        published: "bg-emerald-100 text-emerald-700",
        archived: "bg-amber-100 text-amber-700",
    };
    return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${styles[status]}`}>{status}</span>;
}

function phaseBadge(phase: string) {
    const styles: Record<string, string> = {
        scheduled: "bg-blue-50 text-blue-700",
        live: "bg-red-50 text-red-700",
        ended: "bg-slate-100 text-slate-700",
    };
    return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${styles[phase]}`}>{phase}</span>;
}

export default function ContestsPage() {
    const [contests, setContests] = useState<Contest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        loadContests();
    }, []);

    async function loadContests() {
        setLoading(true);
        try {
            setContests(await getAllContests());
        } catch (error) {
            console.error("Failed to load contests:", error);
            alert("Failed to load contests.");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(contest: Contest) {
        if (!confirm(`Delete "${contest.title}"? Contest attempts will remain for audit, but the schedule will be removed.`)) return;
        try {
            await deleteContest(contest.id);
            setContests((current) => current.filter((item) => item.id !== contest.id));
        } catch (error) {
            console.error("Failed to delete contest:", error);
            alert("Failed to delete contest.");
        }
    }

    async function handlePublish(contest: Contest) {
        try {
            await updateContestStatus(contest.id, "published");
            setContests((current) => current.map((item) => item.id === contest.id ? { ...item, status: "published" } : item));
        } catch (error) {
            console.error("Failed to publish contest:", error);
            alert("Failed to publish contest.");
        }
    }

    const filteredContests = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return contests
            .filter((contest) => {
                const matchesSearch = !q
                    || contest.title.toLowerCase().includes(q)
                    || (contest.seriesTitle || "").toLowerCase().includes(q)
                    || (contest.testTitle || "").toLowerCase().includes(q)
                    || (contest.category || "").toLowerCase().includes(q);
                const matchesStatus = statusFilter === "all" || contest.status === statusFilter;
                return matchesSearch && matchesStatus;
            })
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }, [contests, searchQuery, statusFilter]);

    const paginatedContests = getPaginatedItems(filteredContests, page, pageSize);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Contests</h1>
                    <p className="mt-1 text-slate-500">Schedule one live test with one common clock and final leaderboard.</p>
                </div>
                <Link href="/contests/create">
                    <Button variant="primary">+ Create Contest</Button>
                </Link>
            </div>

            <div className="admin-panel p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Search contests, series, or tests..."
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            setStatusFilter(event.target.value as StatusFilter);
                            setPage(1);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    >
                        <option value="all">All status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
            </div>

            <DataTable
                data={paginatedContests}
                isLoading={loading}
                keyExtractor={(contest) => contest.id}
                emptyState="No contests found."
                columns={[
                    {
                        key: "contest",
                        header: "Contest",
                        render: (contest) => (
                            <div>
                                <p className="font-bold text-slate-950">{contest.title}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {contest.sourceType === "test"
                                        ? `${contest.seriesTitle} · ${contest.testTitle}`
                                        : `${contest.sourceType === "custom" ? "Uploaded paper" : "Quiz"} · ${contest.quizTitle || contest.testTitle || "Untitled"}`}
                                </p>
                            </div>
                        ),
                    },
                    {
                        key: "schedule",
                        header: "Schedule",
                        render: (contest) => (
                            <div className="text-sm">
                                <p className="font-semibold text-slate-700">{formatDateTime(contest.startTime)}</p>
                                <p className="text-xs text-slate-500">Ends {formatDateTime(contest.endTime)}</p>
                            </div>
                        ),
                    },
                    {
                        key: "status",
                        header: "Status",
                        render: (contest) => (
                            <div className="flex flex-wrap gap-2">
                                {statusBadge(contest.status)}
                                {phaseBadge(getContestPhase(contest))}
                            </div>
                        ),
                    },
                    {
                        key: "paper",
                        header: "Paper",
                        render: (contest) => (
                            <div className="font-semibold text-slate-700">
                                {contest.totalQuestions} questions
                                <span className="ml-1 text-xs font-normal text-slate-400">/ {contest.totalMarks} marks</span>
                            </div>
                        ),
                    },
                    {
                        key: "actions",
                        header: "Actions",
                        className: "text-right",
                        render: (contest) => (
                            <div className="flex justify-end gap-2">
                                {contest.status !== "published" ? (
                                    <Button variant="outline" size="sm" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => handlePublish(contest)}>
                                        Publish
                                    </Button>
                                ) : null}
                                <Link href={`/contests/${contest.id}/edit`}>
                                    <Button variant="outline" size="sm">
                                        <EditIcon className="mr-1 h-4 w-4" />
                                        Edit
                                    </Button>
                                </Link>
                                <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDelete(contest)}>
                                    <TrashIcon className="mr-1 h-4 w-4" />
                                    Delete
                                </Button>
                            </div>
                        ),
                    },
                ]}
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={filteredContests.length}
                        onPageChange={setPage}
                        onPageSizeChange={(next) => {
                            setPageSize(next);
                            setPage(1);
                        }}
                        itemLabel="contests"
                    />
                }
            />
        </div>
    );
}
