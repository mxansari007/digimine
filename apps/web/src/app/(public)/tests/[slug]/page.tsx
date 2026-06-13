"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import {
    getTestSeriesBySlug,
    getTestsInSeries,
    hasUserPurchasedTest,
    getUserTestAttempts,
    getResumableAttemptsFromList,
    enrollInFreeTestSeries
} from "@/lib/firestore/tests";
import { useAuthContext } from "@/contexts/AuthContext";
import { BookOpenIcon, CheckIcon, ClockIcon, FileTextIcon, LockIcon, TargetIcon } from "@/components/icons/AppIcons";
import type { TestSeries, Test, TestAttempt } from "@digimine/types";

function getTestCreatedTime(test: Test): number {
    return test.createdAt instanceof Date ? test.createdAt.getTime() : 0;
}

/**
 * Tests render in their curated series order (Mock 01 → Mock NN), the same
 * `order` field the admin arranges and the Firestore query sorts by. The
 * classroom API path doesn't guarantee ordering, so we always sort
 * client-side; creation time only breaks ties between equal orders.
 */
function sortTestsBySeriesOrder(tests: Test[]): Test[] {
    return [...tests].sort((a, b) => {
        const orderDiff = (a.order ?? 0) - (b.order ?? 0);
        return orderDiff || getTestCreatedTime(a) - getTestCreatedTime(b);
    });
}

/**
 * Normalize a Date / Firestore Timestamp / ISO string into a printable
 * date plus a `future` flag. Returns `null` if no release date is set or
 * the value can't be parsed.
 */
function formatReleaseDate(value: unknown): { label: string; future: boolean } | null {
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
    const label = date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: sameYear ? undefined : "numeric",
    });
    return { label, future: date.getTime() > Date.now() };
}

function formatTotalDuration(totalMinutes: number): string {
    if (totalMinutes < 90) return `${totalMinutes} mins`;
    const hours = totalMinutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hrs`;
}

export default function TestSeriesDetailPage() {
    const params = useParams();
    const router = useRouter();
    const toast = useToast();
    const searchParams = useSearchParams();
    const { user, firebaseUser, loading: authLoading } = useAuthContext();
    const slug = params.slug as string;
    const wasSubmitted = searchParams.get("submitted") === "1";
    const classroomTeacherId = searchParams.get("teacherId");
    const classroomClassId = searchParams.get("classId");
    // Either query param means the student is opening this series through
    // a classroom. The new class-centric flow passes `?classId=…`; legacy
    // /classroom/legacy:<teacherId>/tests/ still passes `?teacherId=…`.
    // The series detail page previously only honoured `teacherId`, which
    // is why a click from inside a new-style classroom fell through to the
    // public catalogue path and got redirected to /tests.
    const isClassroomContext = Boolean(classroomTeacherId || classroomClassId);

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [tests, setTests] = useState<Test[]>([]);
    const [attempts, setAttempts] = useState<TestAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasPurchased, setHasPurchased] = useState(false);
    const [enrolling, setEnrolling] = useState(false);

    useEffect(() => {
        if (isClassroomContext && authLoading) return;
        loadData();
    }, [slug, user?.id, firebaseUser, authLoading, isClassroomContext]);

    async function loadData() {
        try {
            setLoading(true);
            let seriesData: TestSeries | null = null;
            let classroomToken: string | null = null;

            // Classroom path: skip client Firestore (it'd fail with permissions) and use server API.
            // The /api/content/data route accepts EITHER teacherId or classId
            // and routes through assertTeacherContentAccess so both old-style
            // legacy classes (teacherId) and new-style class-centric URLs
            // (classId) resolve the same private series.
            if (isClassroomContext) {
                const classroomQs = new URLSearchParams();
                classroomQs.set("type", "test");
                classroomQs.set("slug", slug);
                if (classroomTeacherId) classroomQs.set("teacherId", classroomTeacherId);
                if (classroomClassId) classroomQs.set("classId", classroomClassId);
                if (!firebaseUser) {
                    router.push(
                        `/login?redirect=${encodeURIComponent(`/tests/${slug}?${classroomQs.toString()}`)}`
                    );
                    return;
                }
                classroomToken = await firebaseUser.getIdToken();
                const res = await fetch(`/api/content/data?${classroomQs.toString()}`, {
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
            if (isClassroomContext) {
                const childQs = new URLSearchParams();
                childQs.set("type", "test");
                childQs.set("parentId", seriesData.id);
                if (classroomTeacherId) childQs.set("teacherId", classroomTeacherId);
                if (classroomClassId) childQs.set("classId", classroomClassId);
                const testsRes = await fetch(`/api/content/data?${childQs.toString()}`, {
                    headers: classroomToken ? { Authorization: `Bearer ${classroomToken}` } : {},
                });
                const testsJson = await testsRes.json();
                if (!testsRes.ok) throw new Error(testsJson.error || "Could not load classroom tests.");
                testsData = (testsJson.tests || []) as Test[];
            } else {
                testsData = await getTestsInSeries(seriesData.id);
            }
            setTests(sortTestsBySeriesOrder(testsData));

            if (user) {
                if (isClassroomContext) {
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
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!series) return null;

    const isUnlocked = hasPurchased;
    const isLockedByRelease = (test: Test) => {
        const release = formatReleaseDate(test.availableFrom);
        return !!release && release.future;
    };
    const availableTests = tests.filter((test) => !isLockedByRelease(test));
    const upcomingTests = tests.filter(isLockedByRelease);
    // A test keeps its series position even when the list is split into
    // available / upcoming sections, so "Mock 03" is always badge 3.
    const testNumberById = new Map(tests.map((test, index) => [test.id, index + 1]));
    // First test the student can actually start. Skips locked future
    // releases so the sidebar CTA never points at a 403-gated test.
    const firstAvailableTest = availableTests[0] || null;
    const regularAttempts = attempts.filter((attempt) => !attempt.contestId);
    const resumableAttempts = getResumableAttemptsFromList(regularAttempts);
    const activeAttempt = resumableAttempts[0] || null;
    const activeAttemptSeriesTest = activeAttempt
        ? tests.find((test) => test.id === activeAttempt.testId)
        : null;
    const classroomParam =
        (classroomTeacherId ? `&teacherId=${encodeURIComponent(classroomTeacherId)}` : "") +
        (classroomClassId ? `&classId=${encodeURIComponent(classroomClassId)}` : "");
    const primaryStartHref = activeAttempt && activeAttemptSeriesTest
        ? `/tests/${series.slug}/attempt?testId=${activeAttempt.testId}&attemptId=${activeAttempt.id}${classroomParam}`
        : firstAvailableTest
            ? `/tests/${series.slug}/attempt?testId=${firstAvailableTest.id}${classroomParam}`
            : `/tests/${series.slug}`;

    const totalQuestions = tests.reduce((sum, test) => sum + (test.totalQuestions || 0), 0);
    const totalMarks = tests.reduce((sum, test) => sum + (test.totalMarks || 0), 0);
    const totalMinutes = tests.reduce((sum, test) => sum + (test.duration || 0), 0);
    const discountPercent =
        series.compareAtPrice && series.compareAtPrice > series.price
            ? Math.round((1 - series.price / series.compareAtPrice) * 100)
            : null;

    const renderTestCard = (test: Test) => {
        const seq = testNumberById.get(test.id) ?? 0;
        // Find the most recent attempt for this specific test
        const testAttempts = regularAttempts.filter(a => a.testId === test.id);
        const resumableAttempt = resumableAttempts.find(a => a.testId === test.id) || null;
        const latestFinalizedAttempt = testAttempts.find(a => a.status === 'completed' || a.status === 'timed_out') || null;
        const latestAttempt = resumableAttempt || latestFinalizedAttempt || testAttempts[0] || null;
        const hasInProgress = !!resumableAttempt;
        const hasCompleted = !!latestFinalizedAttempt;
        // Scheduling: tests with `availableFrom` in the future are
        // visible but locked. The right pane swaps from CTAs to
        // a "Releases on …" badge; the row is dimmed.
        const releaseAt = formatReleaseDate(test.availableFrom);
        const notYetReleased = !!releaseAt && releaseAt.future;

        return (
            <Card key={test.id} padding="none" className={notYetReleased ? "opacity-75" : ""}>
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                        <span
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ${
                                notYetReleased
                                    ? "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400"
                                    : "bg-primary-50 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/25"
                            }`}
                        >
                            {String(seq).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display text-base font-semibold text-gray-900">{test.title}</h3>
                                {notYetReleased ? null : hasInProgress ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25">
                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"></span>
                                        In Progress
                                    </span>
                                ) : hasCompleted ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-500/25">
                                        <CheckIcon className="h-3 w-3" /> Completed
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                                <span className="inline-flex items-center gap-1.5"><ClockIcon className="h-4 w-4" /> {test.duration} mins</span>
                                <span className="inline-flex items-center gap-1.5"><FileTextIcon className="h-4 w-4" /> {test.totalQuestions} Questions</span>
                                <span className="inline-flex items-center gap-1.5"><TargetIcon className="h-4 w-4" /> {test.totalMarks} Marks</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-shrink-0 sm:pl-4">
                        {notYetReleased ? (
                            <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                                <LockIcon className="h-4 w-4" /> Releases {releaseAt!.label}
                            </span>
                        ) : isUnlocked ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                {hasInProgress && resumableAttempt ? (
                                    <Link href={`/tests/${series.slug}/attempt?testId=${test.id}&attemptId=${resumableAttempt.id}${classroomParam}`}>
                                        <Button className="w-full">
                                            <span className="h-2 w-2 animate-pulse rounded-full bg-white"></span>
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
                                            <Link href={`/tests/${series.slug}/attempt?testId=${test.id}${classroomParam}`}>
                                                <Button variant="secondary" size="sm" className="w-full">Retake Test</Button>
                                            </Link>
                                        )}
                                    </>
                                ) : (
                                    <Link href={`/tests/${series.slug}/attempt?testId=${test.id}${classroomParam}`}>
                                        <Button className="w-full">Start Test</Button>
                                    </Link>
                                )}
                            </div>
                        ) : !user ? (
                            <Link href="/login">
                                <Button variant="outline" size="sm">Login to Access</Button>
                            </Link>
                        ) : series.accessType === "free" ? (
                            <Button
                                variant="success"
                                size="sm"
                                onClick={handleFreeEnrollment}
                                disabled={enrolling}
                            >
                                {enrolling ? "Enrolling..." : "Enroll for Free"}
                            </Button>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-500/10 dark:text-slate-400">
                                <LockIcon className="h-3.5 w-3.5" /> Locked
                            </span>
                        )}
                    </div>
                </div>
            </Card>
        );
    };

    const handleFreeEnrollment = async () => {
        if (!user || enrolling) return;
        try {
            setEnrolling(true);
            await enrollInFreeTestSeries(user.id, series.id);
            setHasPurchased(true);
        } catch (error: any) {
            toast.error(error.message || "Failed to enroll");
        } finally {
            setEnrolling(false);
        }
    };

    return (
        <div className="min-h-screen bg-background py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Breadcrumb */}
                <nav className="mb-6">
                    <ol className="flex items-center gap-2 text-sm text-slate-500">
                        <li><Link href="/" className="hover:text-slate-700 dark:hover:text-slate-300">Home</Link></li>
                        <li>/</li>
                        <li><Link href="/tests" className="hover:text-slate-700 dark:hover:text-slate-300">Tests</Link></li>
                        <li>/</li>
                        <li className="font-medium text-gray-900">{series.title}</li>
                    </ol>
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Header Card */}
                        <Card padding="none" className="overflow-hidden">
                            <div className="relative h-40 sm:h-48 bg-gradient-to-br from-primary-700 via-primary-600 to-accent-500">
                                {series.thumbnailURL ? (
                                    <img src={series.thumbnailURL} alt={series.title} className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-white/20">
                                        <BookOpenIcon className="h-20 w-20" />
                                    </div>
                                )}
                                {series.accessType === "free" && (
                                    <span className="absolute right-4 top-4 rounded-full bg-success-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-soft-sm">
                                        Free
                                    </span>
                                )}
                                {isUnlocked && (
                                    <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-success-700 shadow-soft-sm">
                                        <CheckIcon className="h-3.5 w-3.5" /> Enrolled
                                    </span>
                                )}
                            </div>
                            <div className="p-6 sm:p-8">
                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
                                    Test Series{series.category ? ` · ${series.category}` : ""}
                                </p>
                                <h1 className="mt-2 font-display text-2xl font-bold text-gray-900 sm:text-3xl">{series.title}</h1>
                                <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-400">{series.description}</p>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-500/15 border-t border-slate-100 dark:border-slate-500/15 sm:grid-cols-4">
                                {[
                                    { label: "Mock Tests", value: String(tests.length) },
                                    { label: "Questions", value: String(totalQuestions) },
                                    { label: "Total Marks", value: String(totalMarks) },
                                    { label: "Test Time", value: formatTotalDuration(totalMinutes) },
                                ].map((stat) => (
                                    <div key={stat.label} className="px-4 py-4 text-center sm:px-6">
                                        <div className="font-display text-xl font-bold text-gray-900">{stat.value}</div>
                                        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* Tests List */}
                        <div className="space-y-4">
                            {wasSubmitted && (
                                <Card intent="success" padding="md" className="text-success-800 dark:text-success-300">
                                    Your test was submitted successfully. Results will be available when the admin enables instant results for this test.
                                </Card>
                            )}
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="font-display text-xl font-bold text-gray-900 sm:text-2xl">
                                    Included Tests <span className="font-mono text-base font-semibold text-slate-400">({tests.length})</span>
                                </h2>
                                {upcomingTests.length > 0 && (
                                    <span className="text-sm text-slate-500">
                                        {availableTests.length} available now · {upcomingTests.length} releasing soon
                                    </span>
                                )}
                            </div>
                            {tests.length === 0 ? (
                                <Card padding="xl" className="text-center text-slate-500">No tests available in this series yet.</Card>
                            ) : (
                                <>
                                    {availableTests.map((test) => renderTestCard(test))}
                                    {upcomingTests.length > 0 && (
                                        <div className="pt-4">
                                            <div className="mb-3 flex items-center gap-3">
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25">
                                                    <LockIcon className="h-3 w-3" /> Coming Soon
                                                </span>
                                                <h3 className="font-display text-lg font-bold text-gray-900">
                                                    Scheduled Mock Tests ({upcomingTests.length})
                                                </h3>
                                            </div>
                                            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                                                These mock tests unlock automatically on their scheduled date. Enrol now so they are ready to attempt the moment they go live.
                                            </p>
                                            <div className="space-y-4">
                                                {upcomingTests.map((test) => renderTestCard(test))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 space-y-4">
                            {isUnlocked ? (
                                <Card intent="success" padding="lg" className="text-center">
                                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300">
                                        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="font-display text-lg font-bold text-success-900 dark:text-success-300">You are enrolled</h3>
                                    <p className="mt-2 text-sm text-success-700 dark:text-success-300">
                                        Your access is active. Start any test from this series whenever you are ready.
                                    </p>
                                    {firstAvailableTest && (
                                        <Link href={primaryStartHref}>
                                            <Button variant="success" size="lg" fullWidth className="mt-5">
                                                {activeAttempt ? "Continue Active Test" : "Start First Test"}
                                            </Button>
                                        </Link>
                                    )}
                                </Card>
                            ) : (
                                <Card padding="lg" className="text-center">
                                    {series.accessType === "paid" ? (
                                        <>
                                            {discountPercent !== null && (
                                                <span className="inline-flex rounded-full bg-success-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-success-700 ring-1 ring-success-200 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-500/25">
                                                    Save {discountPercent}%
                                                </span>
                                            )}
                                            <div className="mt-3 flex items-baseline justify-center gap-2">
                                                <span className="font-display text-4xl font-bold text-gray-900">₹{series.price}</span>
                                                {series.compareAtPrice && series.compareAtPrice > series.price && (
                                                    <span className="text-lg text-slate-400 line-through">₹{series.compareAtPrice}</span>
                                                )}
                                            </div>
                                            <Link href={user ? `/tests/${series.slug}/purchase` : `/login?redirect=/tests/${series.slug}`}>
                                                <Button variant="gradient" size="lg" fullWidth className="mt-5">
                                                    {user ? "Unlock All Tests" : "Login to Unlock"}
                                                </Button>
                                            </Link>
                                            <p className="mt-3 text-xs text-slate-500">One-time payment · Lifetime access to this series</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="mb-4">
                                                <span className="font-display text-4xl font-bold text-success-600 dark:text-success-400">Free</span>
                                            </div>
                                            {user ? (
                                                <Button
                                                    variant="success"
                                                    size="lg"
                                                    fullWidth
                                                    onClick={handleFreeEnrollment}
                                                    disabled={enrolling}
                                                >
                                                    {enrolling ? "Enrolling..." : "Enroll for Free"}
                                                </Button>
                                            ) : (
                                                <Link href={`/login?redirect=/tests/${series.slug}`}>
                                                    <Button variant="gradient" size="lg" fullWidth>
                                                        Login to Enroll
                                                    </Button>
                                                </Link>
                                            )}
                                            <p className="mt-3 text-xs text-slate-500">Free enrollment · Lifetime access to this series</p>
                                        </>
                                    )}
                                </Card>
                            )}

                            <Card padding="lg">
                                <h3 className="font-display font-bold text-gray-900">What you get</h3>
                                <ul className="mt-4 space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                        <CheckIcon className="h-4 w-4 flex-shrink-0 text-success-500" />
                                        {availableTests.length} mock test{availableTests.length === 1 ? "" : "s"} available now
                                    </li>
                                    {upcomingTests.length > 0 && (
                                        <li className="flex items-center gap-3 text-sm text-amber-700 dark:text-amber-300">
                                            <LockIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
                                            {upcomingTests.length} more releasing soon
                                        </li>
                                    )}
                                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                        <CheckIcon className="h-4 w-4 flex-shrink-0 text-success-500" /> Detailed Performance Reports
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                        <CheckIcon className="h-4 w-4 flex-shrink-0 text-success-500" /> Instant Score Calculation
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                                        <CheckIcon className="h-4 w-4 flex-shrink-0 text-success-500" /> All India Ranking
                                    </li>
                                </ul>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
