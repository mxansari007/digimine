"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { getAllTests, deleteTest } from "@/lib/firestore/tests";
import { BookOpenIcon, EditIcon, FileTextIcon, TrashIcon } from "@/components/icons/AppIcons";
import type { TestSeries, TestStatus } from "@digimine/types";

type SortOption = "newest" | "oldest" | "title" | "questions";

export default function TestsPage() {
    const [tests, setTests] = useState<TestSeries[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<TestStatus | "all">("all");
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchTests();
    }, []);

    async function fetchTests() {
        try {
            setLoading(true);
            const filters: { status?: TestStatus } = {};
            if (statusFilter !== "all") {
                filters.status = statusFilter;
            }
            const data = await getAllTests(filters);
            setTests(data);
        } catch (error) {
            console.error("Error fetching tests:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirmDelete() {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await deleteTest(pendingDelete.id);
            setTests(tests.filter((t) => t.id !== pendingDelete.id));
            setPendingDelete(null);
        } catch (error) {
            console.error("Error deleting test:", error);
            alert("Failed to delete test. Please try again.");
        } finally {
            setDeleting(false);
        }
    }

    const filteredTests = (() => {
        const q = searchQuery.toLowerCase();
        let list = tests.filter((test) => {
            return (
                test.title.toLowerCase().includes(q) ||
                (test.description || "").toLowerCase().includes(q)
            );
        });
        switch (sortBy) {
            case "oldest":
                list = [...list].sort((a, b) => {
                    const aT = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
                    const bT = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
                    return aT - bT;
                });
                break;
            case "title":
                list = [...list].sort((a, b) => a.title.localeCompare(b.title));
                break;
            case "questions":
                list = [...list].sort((a, b) => (b.totalQuestions || 0) - (a.totalQuestions || 0));
                break;
            case "newest":
            default:
                list = [...list].sort((a, b) => {
                    const aT = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
                    const bT = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
                    return bT - aT;
                });
        }
        return list;
    })();

    const counts = {
        total: tests.length,
        published: tests.filter(t => t.status === "published").length,
        draft: tests.filter(t => t.status === "draft").length,
        archived: tests.filter(t => t.status === "archived").length,
    };

    const getStatusBadge = (status: TestStatus) => {
        const styles = {
            draft: { bg: "bg-gray-100", text: "text-gray-700" },
            published: { bg: "bg-green-100", text: "text-green-700" },
            archived: { bg: "bg-yellow-100", text: "text-yellow-700" },
        };
        const style = styles[status];
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Test Series</h1>
                    <p className="text-gray-500 mt-1">Manage your test series and questions</p>
                </div>
                <Link href="/tests/create">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <span className="mr-2">+</span>
                        Create Test
                    </Button>
                </Link>
            </div>

            {/* Stats Row */}
            {!loading && tests.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
                        <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-xs text-green-600 uppercase tracking-wider">Published</p>
                        <p className="text-2xl font-bold text-gray-900">{counts.published}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Draft</p>
                        <p className="text-2xl font-bold text-gray-900">{counts.draft}</p>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-xs text-yellow-600 uppercase tracking-wider">Archived</p>
                        <p className="text-2xl font-bold text-gray-900">{counts.archived}</p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <Card className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="search"
                            placeholder="Search by title or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Search tests"
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value as TestStatus | "all");
                            fetchTests();
                        }}
                        aria-label="Filter by status"
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                        <option value="all">All Status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        aria-label="Sort tests"
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="title">Title (A–Z)</option>
                        <option value="questions">Most Questions</option>
                    </select>
                </div>
                {!loading && (
                    <p className="text-xs text-gray-500 mt-3">
                        Showing <span className="font-bold text-gray-700">{filteredTests.length}</span> of {tests.length}
                    </p>
                )}
            </Card>

            {/* Tests List */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Loading tests...</p>
                </div>
            ) : filteredTests.length === 0 ? (
                <Card className="p-12 text-center">
                    <h3 className="text-lg font-medium text-gray-900">No tests found</h3>
                    <p className="text-gray-500 mt-2">
                        {searchQuery
                            ? "Try adjusting your search query"
                            : "Get started by creating your first test"}
                    </p>
                    {!searchQuery && (
                        <Link href="/tests/create">
                            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">
                                <span className="mr-2">+</span>
                                Create Test
                            </Button>
                        </Link>
                    )}
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredTests.map((test) => (
                        <Card key={test.id} className="p-6">
                            <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                                {/* Thumbnail */}
                                <div className="w-24 h-24 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                                    {test.thumbnailURL ? (
                                        <img
                                            src={test.thumbnailURL}
                                            alt={test.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                                            <FileTextIcon className="h-9 w-9" />
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-2 flex-wrap">
                                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                                            {test.title}
                                        </h3>
                                        {getStatusBadge(test.status)}
                                        {test.accessType === "free" && (
                                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                                                Free
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                                        {test.shortDescription}
                                    </p>

                                    {/* Stats */}
                                    <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                                        <span className="flex items-center gap-1">
                                            <BookOpenIcon className="h-4 w-4" />
                                            {test.totalTests || 0} tests
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <FileTextIcon className="h-4 w-4" />
                                            {test.totalQuestions || 0} questions
                                        </span>
                                        {test.accessType === "paid" && (
                                            <span className="flex items-center gap-1">
                                                <span>₹</span>
                                                {test.price}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex lg:flex-col gap-2 lg:items-end">
                                    <Link href={`/tests/${test.id}/tests`}>
                                        <Button variant="outline" size="sm" className="w-full bg-indigo-50 text-indigo-700 border-indigo-200">
                                            <BookOpenIcon className="mr-1 h-4 w-4" />
                                            Manage Tests
                                        </Button>
                                    </Link>
                                    <Link href={`/tests/${test.id}/edit`}>
                                        <Button variant="outline" size="sm" className="w-full">
                                            <EditIcon className="mr-1 h-4 w-4" />
                                            Edit Series
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                        onClick={() => setPendingDelete({ id: test.id, title: test.title })}
                                    >
                                        <TrashIcon className="mr-1 h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {pendingDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !deleting && setPendingDelete(null)} />
                    <Card className="relative max-w-md w-full p-6 shadow-2xl">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 id="delete-title" className="text-lg font-bold text-gray-900">Delete this test series?</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    <span className="font-medium text-gray-700">{pendingDelete.title}</span> will be permanently removed along with all its tests, questions, and student attempts. This cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting} className="flex-1">
                                Cancel
                            </Button>
                            <Button onClick={handleConfirmDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                                {deleting ? "Deleting..." : "Delete Permanently"}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
