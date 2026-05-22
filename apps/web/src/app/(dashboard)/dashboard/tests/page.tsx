"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getUserTestPurchases, getTestSeries, getUserTestAttempts, getResumableAttemptsFromList } from "@/lib/firestore/tests";
import { getPurchasedTestSeriesIds, type TestSeries, type TestAttempt, type User } from "@digimine/types";
import { Card, Button, DataTable, PaginationControls, getPaginatedItems, type DataTableColumn } from "@digimine/ui";
import Link from "next/link";
import { PageLoading } from "@/components/common";

function getProfileSeriesIds(user: User | null): string[] {
    if (!user) return [];

    return Array.from(new Set([
        ...(user.purchasedTestSeriesIds || []),
        ...getPurchasedTestSeriesIds(user.purchasedTests || []),
    ].filter(Boolean)));
}

export default function MyTestSeriesPage() {
    const { user } = useAuthContext();
    const [seriesList, setSeriesList] = useState<TestSeries[]>([]);
    const [attempts, setAttempts] = useState<TestAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [attemptPage, setAttemptPage] = useState(1);
    const [attemptPageSize, setAttemptPageSize] = useState(5);

    useEffect(() => {
        if (!user) return;

        async function loadData() {
            try {
                const profileSeriesIds = getProfileSeriesIds(user);
                const [purchaseData, attemptData] = await Promise.all([
                    getUserTestPurchases(user!.id).catch((error) => {
                        console.error("Error loading test purchases:", error);
                        return [];
                    }),
                    getUserTestAttempts(user!.id).catch((error) => {
                        console.error("Error loading test attempts:", error);
                        return [];
                    })
                ]);
                
                const regularAttempts = attemptData.filter((attempt) => !attempt.contestId);
                setAttempts(regularAttempts);

                // Fetch series details from profile grants, purchase docs, and attempts.
                // A stale attempt can point at an inaccessible series; skip that one only.
                const uniqueSeriesIds = Array.from(new Set([
                    ...profileSeriesIds,
                    ...purchaseData.map(p => p.seriesId),
                    ...regularAttempts.map(a => a.seriesId)
                ].filter(Boolean)));
                
                const seriesPromises = uniqueSeriesIds.map(async (id) => {
                    try {
                        return await getTestSeries(id);
                    } catch (error) {
                        console.warn("Skipping inaccessible test series:", id, error);
                        return null;
                    }
                });
                const seriesData = await Promise.all(seriesPromises);
                setSeriesList(seriesData.filter(s => s !== null) as TestSeries[]);
            } catch (error) {
                console.error("Error loading test series:", error);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [user]);

    useEffect(() => {
        setAttemptPage(1);
    }, [attempts.length, attemptPageSize]);

    const resumableAttemptIds = useMemo(
        () => new Set(getResumableAttemptsFromList(attempts).map((attempt) => attempt.id)),
        [attempts]
    );
    const paginatedAttempts = useMemo(
        () => getPaginatedItems(attempts, attemptPage, attemptPageSize),
        [attempts, attemptPage, attemptPageSize]
    );

    if (loading) return <PageLoading variant="inline" />;

    const attemptColumns: DataTableColumn<TestAttempt>[] = [
        {
            key: "test",
            header: "Test Name",
            render: (attempt) => (
                <div className="min-w-[180px]">
                    <div className="font-semibold text-slate-900">Attempt #{attempt.id.substring(0, 6)}</div>
                    <div className="text-xs text-slate-400">ID: {attempt.id.substring(0, 8)}...</div>
                </div>
            ),
        },
        {
            key: "date",
            header: "Date",
            render: (attempt) => attempt.createdAt.toLocaleDateString(),
        },
        {
            key: "score",
            header: "Score",
            render: (attempt) => (
                <div>
                    <div className="font-bold text-slate-900">{attempt.totalScore}</div>
                    <div className="text-xs text-slate-400">{attempt.percentage}%</div>
                </div>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (attempt) => (
                attempt.status === "completed" ? (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        attempt.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                        {attempt.passed ? 'Passed' : 'Failed'}
                    </span>
                ) : attempt.status === "timed_out" ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                        Timed Out
                    </span>
                ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                        {resumableAttemptIds.has(attempt.id) ? 'In Progress' : 'Closed'}
                    </span>
                )
            ),
        },
        {
            key: "action",
            header: "",
            className: "text-right",
            render: (attempt) => {
                const seriesSlug = seriesList.find(s => s.id === attempt.seriesId)?.slug;
                if (attempt.status === 'in_progress' && resumableAttemptIds.has(attempt.id) && seriesSlug) {
                    return (
                        <Link href={`/tests/${seriesSlug}/attempt?testId=${attempt.testId}&attemptId=${attempt.id}`}>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                Continue
                            </Button>
                        </Link>
                    );
                }
                if (attempt.status === 'completed' || attempt.status === 'timed_out') {
                    return (
                        <Link href={`/dashboard/tests/results/${attempt.id}`}>
                            <Button variant="ghost" size="sm" className="text-primary-700 hover:text-primary-800 font-bold">
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
            <div>
                <h1 className="text-3xl font-bold text-gray-900">My Test Series</h1>
                <p className="text-gray-500 mt-2">Access your purchased test series and track your progress.</p>
            </div>

            {seriesList.length === 0 ? (
                <Card className="p-12 text-center flex flex-col items-center justify-center border-dashed border-2">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">No Test Series Found</h3>
                    <p className="text-gray-500 max-w-sm mt-2">You haven&apos;t purchased any test series yet. Explore our catalog to find the right practice tests for you.</p>
                    <Link href="/tests" className="mt-6">
                        <Button className="px-8">
                            Explore Test Series
                        </Button>
                    </Link>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {seriesList.map((series) => {
                        const seriesAttempts = attempts.filter(a => a.seriesId === series.id);

                        return (
                            <Card key={series.id} className="overflow-hidden group hover:shadow-xl transition-all duration-300 border-none shadow-md">
                                <div className="flex h-full">
                                    <div className="w-1/3 relative overflow-hidden bg-gray-200">
                                        {series.thumbnailURL ? (
                                            <img 
                                                src={series.thumbnailURL} 
                                                alt={series.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                No Image
                                            </div>
                                        )}
                                    </div>
                                    <div className="w-2/3 p-6 flex flex-col justify-between bg-white">
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] uppercase tracking-wider font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                                                    {series.category || "General"}
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-900 line-clamp-1">{series.title}</h3>
                                            <p className="text-sm text-gray-500 mt-2 line-clamp-2">{series.shortDescription}</p>
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-xs text-gray-400 uppercase font-bold">Progress</span>
                                                <span className="text-sm font-bold text-gray-700">
                                                    {seriesAttempts.length} Attempts
                                                </span>
                                            </div>
                                            <Link href={`/tests/${series.slug}`}>
                                                <Button size="sm" className="px-6">
                                                    Open Series
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Recent Activity */}
            {attempts.length > 0 && (
                <div className="mt-12">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Attempts</h2>
                    <DataTable
                        columns={attemptColumns}
                        data={paginatedAttempts}
                        keyExtractor={(attempt) => attempt.id}
                        emptyState="No attempts found."
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
            )}
        </div>
    );
}
