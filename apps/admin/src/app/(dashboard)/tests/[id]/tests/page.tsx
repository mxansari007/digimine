"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import {
    getTestSeries,
    getTestsInSeries,
    deleteTestInSeries,
    updateTestSeries,
    updateTestInSeries,
} from "@/lib/firestore/tests";
import { EditIcon, HelpCircleIcon, TrashIcon } from "@/components/icons/AppIcons";
import type { TestSeries, Test } from "@digimine/types";

function getTestCreatedTime(test: Test): number {
    return test.createdAt instanceof Date ? test.createdAt.getTime() : 0;
}

function sortTestsByLatest(tests: Test[]): Test[] {
    return [...tests].sort((a, b) => {
        const latestDiff = getTestCreatedTime(b) - getTestCreatedTime(a);
        return latestDiff || a.order - b.order;
    });
}

export default function SeriesTestsPage() {
    const params = useParams();
    const seriesId = params.id as string;

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [tests, setTests] = useState<Test[]>([]);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [seriesId]);

    async function loadData() {
        try {
            setLoading(true);
            const [seriesData, testsData] = await Promise.all([
                getTestSeries(seriesId),
                getTestsInSeries(seriesId),
            ]);
            setSeries(seriesData);
            setTests(sortTestsByLatest(testsData));
        } catch (error: any) {
            console.error("Error loading tests:", error);
            alert("Error loading tests");
        } finally {
            setLoading(false);
        }
    }

    const handleDeleteTest = async (testId: string) => {
        if (!confirm("Are you sure you want to delete this test? All questions will be lost.")) {
            return;
        }

        try {
            await deleteTestInSeries(seriesId, testId);
            setTests((current) => current.filter((t) => t.id !== testId));
        } catch (error: any) {
            console.error("Error deleting test:", error);
            alert("Failed to delete test");
        }
    };

    const handlePublishSeries = async () => {
        if (!series || publishing) return;

        try {
            setPublishing("series");
            await updateTestSeries({ id: series.id, status: "published" });
            setSeries({ ...series, status: "published" });
        } catch (error: any) {
            console.error("Error publishing series:", error);
            alert(error.message || "Failed to publish series");
        } finally {
            setPublishing(null);
        }
    };

    const handlePublishTest = async (test: Test) => {
        if (publishing) return;

        try {
            setPublishing(test.id);
            await updateTestInSeries({ id: test.id, seriesId, status: "published" });
            setTests((current) =>
                current.map((item) =>
                    item.id === test.id ? { ...item, status: "published" } : item
                )
            );
        } catch (error: any) {
            console.error("Error publishing test:", error);
            alert(error.message || "Failed to publish test");
        } finally {
            setPublishing(null);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-4 text-gray-500">Loading tests...</p>
            </div>
        );
    }

    if (!series) {
        return (
            <div className="text-center py-12">
                <h1 className="text-2xl font-bold text-gray-900">Series Not Found</h1>
                <Link href="/tests">
                    <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">
                        Back to Test Series
                    </Button>
                </Link>
            </div>
        );
    }

    const publishedTests = tests.filter((test) => test.status === "published");
    const isPubliclyVisible = series.status === "published" && publishedTests.length > 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/tests">
                        <Button variant="outline" size="sm">
                            ← Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{series.title}</h1>
                        <p className="text-gray-500">Included Tests ({tests.length})</p>
                    </div>
                </div>
                <Link href={`/tests/${seriesId}/tests/create`}>
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        + Add Test
                    </Button>
                </Link>
            </div>

            {!isPubliclyVisible && (
                <Card className="border-amber-200 bg-amber-50 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="font-semibold text-amber-900">Not visible on the web frontend yet</h2>
                            <p className="mt-1 text-sm text-amber-800">
                                Public pages only show published test series with at least one published included test.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                                <span className={`rounded-full px-2.5 py-1 ${series.status === "published" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                                    Series: {series.status}
                                </span>
                                <span className={`rounded-full px-2.5 py-1 ${publishedTests.length > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                                    Published tests: {publishedTests.length}
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {series.status !== "published" && (
                                <Button
                                    onClick={handlePublishSeries}
                                    disabled={publishing !== null}
                                    className="bg-amber-600 text-white hover:bg-amber-700"
                                >
                                    {publishing === "series" ? "Publishing..." : "Publish Series"}
                                </Button>
                            )}
                            {tests.some((test) => test.status !== "published") && (
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        for (const test of tests.filter((item) => item.status !== "published")) {
                                            await handlePublishTest(test);
                                        }
                                    }}
                                    disabled={publishing !== null}
                                    className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                >
                                    Publish Draft Tests
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4">
                {tests.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-gray-500 mb-4">No tests added to this series yet</p>
                        <Link href={`/tests/${seriesId}/tests/create`}>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                + Add First Test
                            </Button>
                        </Link>
                    </Card>
                ) : (
                    tests.map((test, index) => (
                        <Card key={test.id} className="p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-medium">
                                        {index + 1}
                                    </span>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">{test.title}</h3>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                                {test.duration} mins
                                            </span>
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                                                {test.totalQuestions} Questions
                                            </span>
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                                                {test.totalMarks} Marks
                                            </span>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                                test.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {test.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link href={`/tests/${seriesId}/tests/${test.id}/questions`}>
                                        <Button variant="outline" size="sm">
                                            <HelpCircleIcon className="mr-1 h-4 w-4" />
                                            Questions
                                        </Button>
                                    </Link>
                                    <Link href={`/tests/${seriesId}/tests/${test.id}/edit`}>
                                        <Button variant="outline" size="sm">
                                            <EditIcon className="mr-1 h-4 w-4" />
                                            Edit
                                        </Button>
                                    </Link>
                                    {test.status !== "published" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-green-700 border-green-200 hover:bg-green-50"
                                            onClick={() => handlePublishTest(test)}
                                            disabled={publishing !== null}
                                        >
                                            {publishing === test.id ? "Publishing..." : "Publish"}
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={() => handleDeleteTest(test.id)}
                                    >
                                        <TrashIcon className="mr-1 h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
