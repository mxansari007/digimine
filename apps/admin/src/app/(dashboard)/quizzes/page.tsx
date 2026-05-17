"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, DataTable, PaginationControls, getPaginatedItems } from "@digimine/ui";
import { deleteQuiz, getAllQuizzes } from "@/lib/firestore/quizzes";
import { EditIcon, FileTextIcon, TrashIcon } from "@/components/icons/AppIcons";
import type { Quiz, QuizStatus } from "@digimine/types";

type SortOption = "newest" | "oldest" | "title" | "questions";

function statusBadge(status: QuizStatus) {
    const styles = {
        draft: "bg-slate-100 text-slate-700",
        published: "bg-emerald-100 text-emerald-700",
        archived: "bg-amber-100 text-amber-700",
    };
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${styles[status]}`}>
            {status}
        </span>
    );
}

export default function QuizzesPage() {
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<QuizStatus | "all">("all");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        fetchQuizzes();
    }, []);

    async function fetchQuizzes() {
        setLoading(true);
        try {
            const data = await getAllQuizzes();
            setQuizzes(data);
        } catch (error) {
            console.error("Error loading quizzes:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(quiz: Quiz) {
        if (!confirm(`Delete "${quiz.title}" and all its questions?`)) return;
        try {
            await deleteQuiz(quiz.id);
            setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
        } catch (error) {
            console.error("Error deleting quiz:", error);
            alert("Failed to delete quiz.");
        }
    }

    const filteredQuizzes = useMemo(() => {
        const q = searchQuery.toLowerCase();
        let list = quizzes.filter((quiz) => {
            const matchesSearch =
                quiz.title.toLowerCase().includes(q) ||
                (quiz.description || "").toLowerCase().includes(q) ||
                (quiz.category || "").toLowerCase().includes(q);
            const matchesStatus = statusFilter === "all" || quiz.status === statusFilter;
            return matchesSearch && matchesStatus;
        });

        switch (sortBy) {
            case "oldest":
                list = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                break;
            case "title":
                list = [...list].sort((a, b) => a.title.localeCompare(b.title));
                break;
            case "questions":
                list = [...list].sort((a, b) => (b.totalQuestions || 0) - (a.totalQuestions || 0));
                break;
            case "newest":
            default:
                list = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        return list;
    }, [quizzes, searchQuery, sortBy, statusFilter]);

    const paginatedQuizzes = getPaginatedItems(filteredQuizzes, page, pageSize);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-950">Quizzes</h1>
                    <p className="mt-1 text-slate-500">Create short topic quizzes for courses, notes, and practice paths.</p>
                </div>
                <Link href="/quizzes/create">
                    <Button variant="primary">+ Create Quiz</Button>
                </Link>
            </div>

            <div className="admin-panel p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Search quizzes..."
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            setStatusFilter(event.target.value as QuizStatus | "all");
                            setPage(1);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    >
                        <option value="all">All status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortOption)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="title">Title</option>
                        <option value="questions">Most questions</option>
                    </select>
                </div>
            </div>

            <DataTable
                data={paginatedQuizzes}
                isLoading={loading}
                keyExtractor={(quiz) => quiz.id}
                emptyState="No quizzes found."
                columns={[
                    {
                        key: "quiz",
                        header: "Quiz",
                        render: (quiz) => (
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 overflow-hidden rounded-xl bg-slate-100">
                                    {quiz.thumbnailURL ? (
                                        <img src={quiz.thumbnailURL} alt={quiz.title} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                                            <FileTextIcon className="h-6 w-6" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-bold text-slate-950">{quiz.title}</p>
                                    <p className="truncate text-xs text-slate-500">{quiz.shortDescription}</p>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "status",
                        header: "Status",
                        render: (quiz) => (
                            <div className="space-y-1">
                                {statusBadge(quiz.status)}
                                <p className="text-xs capitalize text-slate-500">{quiz.accessType.replace("_", " ")}</p>
                            </div>
                        ),
                    },
                    {
                        key: "questions",
                        header: "Questions",
                        render: (quiz) => (
                            <div className="font-semibold text-slate-700">
                                {quiz.totalQuestions || 0}
                                <span className="ml-1 text-xs font-normal text-slate-400">/ {quiz.totalMarks || 0} marks</span>
                            </div>
                        ),
                    },
                    {
                        key: "category",
                        header: "Category",
                        render: (quiz) => quiz.category || "Uncategorized",
                    },
                    {
                        key: "actions",
                        header: "Actions",
                        className: "text-right",
                        render: (quiz) => (
                            <div className="flex justify-end gap-2">
                                <Link href={`/quizzes/${quiz.id}/questions`}>
                                    <Button variant="outline" size="sm">Questions</Button>
                                </Link>
                                <Link href={`/quizzes/${quiz.id}/edit`}>
                                    <Button variant="outline" size="sm">
                                        <EditIcon className="mr-1 h-4 w-4" />
                                        Edit
                                    </Button>
                                </Link>
                                <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDelete(quiz)}>
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
                        totalItems={filteredQuizzes.length}
                        onPageChange={setPage}
                        onPageSizeChange={(nextPageSize) => {
                            setPageSize(nextPageSize);
                            setPage(1);
                        }}
                        itemLabel="quizzes"
                    />
                }
            />
        </div>
    );
}
