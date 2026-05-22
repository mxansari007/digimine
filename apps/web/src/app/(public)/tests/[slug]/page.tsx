"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { 
    getTestSeriesBySlug, 
    getTestsInSeries, 
    hasUserPurchasedTest,
    getUserTestAttempts,
    getResumableAttemptsFromList,
    enrollInFreeTestSeries
} from "@/lib/firestore/tests";
import { useAuthContext } from "@/contexts/AuthContext";
import { BookOpenIcon, CalendarIcon, CheckIcon, ClockIcon, FileTextIcon, LockIcon, TargetIcon } from "@/components/icons/AppIcons";
import type { TestSeries, Test, TestAttempt } from "@digimine/types";

function getTestCreatedTime(test: Test): number {
    return test.createdAt instanceof Date ? test.createdAt.getTime() : 0;
}

function sortTestsByLatest(tests: Test[]): Test[] {
    return [...tests].sort((a, b) => {
        const latestDiff = getTestCreatedTime(b) - getTestCreatedTime(a);
        return latestDiff || a.order - b.order;
    });
}

function formatTestDate(test: Test): string {
    if (!(test.createdAt instanceof Date) || Number.isNaN(test.createdAt.getTime())) {
        return "Date unavailable";
    }

    return test.createdAt.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default function TestSeriesDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, firebaseUser, loading: authLoading } = useAuthContext();
    const slug = params.slug as string;
    const wasSubmitted = searchParams.get("submitted") === "1";
    const classroomTeacherId = searchParams.get("teacherId");

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [tests, setTests] = useState<Test[]>([]);
    const [attempts, setAttempts] = useState<TestAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasPurchased, setHasPurchased] = useState(false);
    const [enrolling, setEnrolling] = useState(false);

    useEffect(() => {
        if (classroomTeacherId && authLoading) return;
        loadData();
    }, [slug, user?.id, firebaseUser, authLoading, classroomTeacherId]);

    async function loadData() {
        try {
            setLoading(true);
            let seriesData: TestSeries | null = null;
            let classroomToken: string | null = null;

            // Classroom path: skip client Firestore (it'd fail with permissions) and use server API
            if (classroomTeacherId) {
                if (!firebaseUser) {
                    router.push(`/login?redirect=${encodeURIComponent(`/tests/${slug}?teacherId=${classroomTeacherId}`)}`);
                    return;
                }
                classroomToken = await firebaseUser.getIdToken();
                const res = await fetch(`/api/content/data?type=test&slug=${encodeURIComponent(slug)}&teacherId=${encodeURIComponent(classroomTeacherId)}`, {
                    headers: { Authorization: `Bearer ${classroomToken}` },
                });
                const serverData = await res.json();
                if (!res.ok) throw new Error(serverData.error || "You do not have access to this classroom test.");
                seriesData = (serverData.content || null) as TestSeries | null;
            } else {
                seriesData = await getTestSeriesBySlug(slug);
            }

            if (!seriesData) {
                router.push("/tests");
                return;
            }
            setSeries(seriesData);
            
            // Load tests: use server API if classroom context to avoid Firestore rules
            let testsData: Test[];
            if (classroomTeacherId) {
                const testsRes = await fetch(`/api/content/data?type=test&parentId=${encodeURIComponent(seriesData.id)}&teacherId=${encodeURIComponent(classroomTeacherId)}`, {
                    headers: classroomToken ? { Authorization: `Bearer ${classroomToken}` } : {},
                });
                const testsJson = await testsRes.json();
                if (!testsRes.ok) throw new Error(testsJson.error || "Could not load classroom tests.");
                testsData = (testsJson.tests || []) as Test[];
            } else {
                testsData = await getTestsInSeries(seriesData.id);
            }
            setTests(sortTestsByLatest(testsData));

            if (user) {
                if (classroomTeacherId) {
                    // Classroom students get access without purchase, while their
                    // own attempt history still drives resume/result buttons.
                    setHasPurchased(true);
                    setAttempts(await getUserTestAttempts(user.id, seriesData.id));
                } else {
                    const [purchased, attemptsData] = await Promise.all([
                        hasUserPurchasedTest(user.id, seriesData.id),
                        getUserTestAttempts(user.id, seriesData.id)
                    ]);
                    setHasPurchased(purchased);
                    setAttempts(attemptsData);
                }
            } else {
                setHasPurchased(false);
                setAttempts([]);
            }
        } catch (error) {
            console.error("Error loading test series:", error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!series) return null;

    const isUnlocked = hasPurchased;
    const firstAvailableTest = tests[0] || null;
    const regularAttempts = attempts.filter((attempt) => !attempt.contestId);
    const resumableAttempts = getResumableAttemptsFromList(regularAttempts);
    const activeAttempt = resumableAttempts[0] || null;
    const activeAttemptSeriesTest = activeAttempt
        ? tests.find((test) => test.id === activeAttempt.testId)
        : null;
    const teacherParam = classroomTeacherId ? `&teacherId=${encodeURIComponent(classroomTeacherId)}` : "";
    const primaryStartHref = activeAttempt && activeAttemptSeriesTest
        ? `/tests/${series.slug}/attempt?testId=${activeAttempt.testId}&attemptId=${activeAttempt.id}${teacherParam}`
        : firstAvailableTest
            ? `/tests/${series.slug}/attempt?testId=${firstAvailableTest.id}${teacherParam}`
            : `/tests/${series.slug}`;

    const handleFreeEnrollment = async () => {
        if (!user || enrolling) return;
        try {
            setEnrolling(true);
            await enrollInFreeTestSeries(user.id, series.id);
            setHasPurchased(true);
        } catch (error: any) {
            alert(error.message || "Failed to enroll");
        } finally {
            setEnrolling(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Breadcrumb */}
                <nav className="mb-6">
                    <ol className="flex items-center gap-2 text-sm text-gray-500">
                        <li><Link href="/" className="hover:text-gray-700">Home</Link></li>
                        <li>/</li>
                        <li><Link href="/tests" className="hover:text-gray-700">Tests</Link></li>
                        <li>/</li>
                        <li className="text-gray-900 font-medium">{series.title}</li>
                    </ol>
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Header Card */}
                        <Card className="overflow-hidden">
                            <div className="h-64 bg-indigo-600 relative">
                                {series.thumbnailURL ? (
                                    <img src={series.thumbnailURL} alt={series.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20">
                                        <BookOpenIcon className="h-24 w-24" />
                                    </div>
                                )}
                                {series.accessType === "free" && (
                                    <span className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold">FREE</span>
                                )}
                                {isUnlocked && (
                                    <span className="absolute top-4 left-4 bg-indigo-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow">
                                        Enrolled
                                    </span>
                                )}
                            </div>
                            <div className="p-6">
                                <div className="flex flex-wrap items-center gap-3 mb-4">
                                    <h1 className="text-3xl font-bold text-gray-900">{series.title}</h1>
                                    {isUnlocked && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                            Enrolled
                                        </span>
                                    )}
                                </div>
                                <p className="text-gray-600 text-lg leading-relaxed">{series.description}</p>
                            </div>
                        </Card>

                        {/* Tests List */}
                        <div className="space-y-4">
                            {wasSubmitted && (
                                <Card className="border-green-100 bg-green-50 p-4 text-green-800">
                                    Your test was submitted successfully. Results will be available when the admin enables instant results for this test.
                                </Card>
                            )}
                            <h2 className="text-2xl font-bold text-gray-900">Included Tests ({tests.length})</h2>
                            {tests.length === 0 ? (
                                <Card className="p-8 text-center text-gray-500">No tests available in this series yet.</Card>
                            ) : (
                                tests.map((test, index) => {
                                    // Find the most recent attempt for this specific test
                                    const testAttempts = regularAttempts.filter(a => a.testId === test.id);
                                    const resumableAttempt = resumableAttempts.find(a => a.testId === test.id) || null;
                                    const latestFinalizedAttempt = testAttempts.find(a => a.status === 'completed' || a.status === 'timed_out') || null;
                                    const latestAttempt = resumableAttempt || latestFinalizedAttempt || testAttempts[0] || null;
                                    const hasInProgress = !!resumableAttempt;
                                    const hasCompleted = !!latestFinalizedAttempt;

                                    return (
                                        <Card key={test.id} className="p-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-start gap-4">
                                                    <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold">
                                                        {index + 1}
                                                    </span>
                                                    <div>
                                                        <h3 className="text-lg font-bold text-gray-900">{test.title}</h3>
                                                        <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                                                            <span className="inline-flex items-center gap-1"><CalendarIcon className="h-4 w-4" /> {formatTestDate(test)}</span>
                                                            <span className="inline-flex items-center gap-1"><ClockIcon className="h-4 w-4" /> {test.duration} mins</span>
                                                            <span className="inline-flex items-center gap-1"><FileTextIcon className="h-4 w-4" /> {test.totalQuestions} Questions</span>
                                                            <span className="inline-flex items-center gap-1"><TargetIcon className="h-4 w-4" /> {test.totalMarks} Marks</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {isUnlocked ? (
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        {hasInProgress && resumableAttempt ? (
                                                            <Link href={`/tests/${series.slug}/attempt?testId=${test.id}&attemptId=${resumableAttempt.id}${teacherParam}`}>
                                                                <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 w-full">
                                                                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                                                    Continue Test
                                                                </Button>
                                                            </Link>
                                                        ) : hasCompleted && latestAttempt ? (
                                                            <>
                                                                {test.instantResults ? (
                                                                    <Link href={`/dashboard/tests/results/${latestAttempt.id}`}>
                                                                        <Button variant="outline" size="sm" className="w-full">View Result</Button>
                                                                    </Link>
                                                                ) : (
                                                                    <Button variant="outline" size="sm" disabled className="w-full">Submitted</Button>
                                                                )}
                                                                {test.allowRetake && (
                                                                    <Link href={`/tests/${series.slug}/attempt?testId=${test.id}${teacherParam}`}>
                                                                        <Button size="sm" className="bg-indigo-600 text-white w-full">Retake Test</Button>
                                                                    </Link>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <Link href={`/tests/${series.slug}/attempt?testId=${test.id}${teacherParam}`}>
                                                                <Button className="bg-green-600 hover:bg-green-700 text-white w-full">Start Test</Button>
                                                            </Link>
                                                        )}
                                                    </div>
                                                ) : !user ? (
                                                    <Link href="/login">
                                                        <Button variant="outline" size="sm" className="border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                                                            Login to Access
                                                        </Button>
                                                    </Link>
                                                ) : series.accessType === "free" ? (
                                                    <Button 
                                                        onClick={handleFreeEnrollment}
                                                        disabled={enrolling}
                                                        className="bg-green-600 hover:bg-green-700 text-white"
                                                    >
                                                        {enrolling ? "Enrolling..." : "Enroll for Free"}
                                                    </Button>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-400">
                                                        <LockIcon className="h-4 w-4" />
                                                        <span className="text-sm font-medium">Locked</span>
                                                    </div>
                                                )}
                                            </div>
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 space-y-4">
                            {isUnlocked ? (
                                <Card className="p-6 text-center border-green-100 bg-green-50">
                                    <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-green-900">You are enrolled</h3>
                                    <p className="mt-2 text-sm text-green-700">
                                        Your access is active. Start any test from this series whenever you are ready.
                                    </p>
                                    {firstAvailableTest && (
                                        <Link href={primaryStartHref}>
                                            <Button className="mt-5 w-full bg-green-600 py-3 text-white hover:bg-green-700">
                                                {activeAttempt ? "Continue Active Test" : "Start First Test"}
                                            </Button>
                                        </Link>
                                    )}
                                </Card>
                            ) : (
                                <Card className="p-6 text-center">
                                    {series.accessType === "paid" ? (
                                        <>
                                            <div className="mb-4">
                                                <span className="text-4xl font-bold text-gray-900">₹{series.price}</span>
                                                {series.compareAtPrice && series.compareAtPrice > series.price && (
                                                    <span className="ml-2 text-lg text-gray-500 line-through">₹{series.compareAtPrice}</span>
                                                )}
                                            </div>
                                            <Link href={user ? `/tests/${series.slug}/purchase` : `/login?redirect=/tests/${series.slug}`}>
                                                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3">
                                                    {user ? "Unlock All Tests" : "Login to Unlock"}
                                                </Button>
                                            </Link>
                                            <p className="mt-3 text-xs text-gray-500">One-time payment for lifetime access to this series.</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="mb-4">
                                                <span className="text-4xl font-bold text-green-600">Free</span>
                                            </div>
                                            {user ? (
                                                <Button 
                                                    onClick={handleFreeEnrollment}
                                                    disabled={enrolling}
                                                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
                                                >
                                                    {enrolling ? "Enrolling..." : "Enroll for Free"}
                                                </Button>
                                            ) : (
                                                <Link href={`/login?redirect=/tests/${series.slug}`}>
                                                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3">
                                                        Login to Enroll
                                                    </Button>
                                                </Link>
                                            )}
                                            <p className="mt-3 text-xs text-gray-500">Free enrollment for lifetime access to this series.</p>
                                        </>
                                    )}
                                </Card>
                            )}

                            <Card className="p-6">
                                <h3 className="font-bold text-gray-900 mb-4">Series Features:</h3>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-gray-600"><CheckIcon className="h-4 w-4 text-green-500" /> {tests.length} Practice Tests</li>
                                    <li className="flex items-center gap-3 text-sm text-gray-600"><CheckIcon className="h-4 w-4 text-green-500" /> Detailed Performance Reports</li>
                                    <li className="flex items-center gap-3 text-sm text-gray-600"><CheckIcon className="h-4 w-4 text-green-500" /> Instant Score Calculation</li>
                                    <li className="flex items-center gap-3 text-sm text-gray-600"><CheckIcon className="h-4 w-4 text-green-500" /> All India Ranking</li>
                                </ul>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
