"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button, FormattedContent } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { getCourseBySlug, getCourseChapters, getCourseEnrollment } from "@/lib/firestore/courses";
import { getTestSeriesBySlug } from "@/lib/firestore/tests";
import type { Course, CourseNoteChapter, CourseNoteSubtopic, TestSeries } from "@digimine/types";

type RazorpayPaymentResponse = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

type RazorpayFailureResponse = {
    error?: {
        description?: string;
    };
};

type RazorpayInstance = {
    open: () => void;
    on: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

function getRazorpay(): RazorpayConstructor | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as Window & typeof globalThis & { Razorpay?: RazorpayConstructor }).Razorpay;
}

export default function CourseDetailPage({ params }: { params: { slug: string } }) {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [course, setCourse] = useState<Course | null>(null);
    const [chapters, setChapters] = useState<CourseNoteChapter[]>([]);
    const [linkedTests, setLinkedTests] = useState<TestSeries[]>([]);
    const [isEnrolled, setIsEnrolled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [notesLoading, setNotesLoading] = useState(false);
    const [enrolling, setEnrolling] = useState(false);
    const [razorpayReady, setRazorpayReady] = useState(false);
    const [paymentProcessing, setPaymentProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadCourse() {
            setLoading(true);
            setError(null);
            try {
                const courseData = await getCourseBySlug(params.slug);
                if (!courseData) {
                    router.push("/courses");
                    return;
                }
                setCourse(courseData);

                const tests = await Promise.all(
                    (courseData.linkedTestSeriesIds || []).map((seriesId) => getTestSeriesBySlug(seriesId))
                );
                setLinkedTests(tests.filter(Boolean) as TestSeries[]);

                if (courseData.accessType === "free") {
                    setNotesLoading(true);
                    const notes = await getCourseChapters(courseData.id);
                    setChapters(notes);
                    setIsEnrolled(true);
                } else if (firebaseUser) {
                    const enrollment = await getCourseEnrollment(firebaseUser.uid, courseData.id);
                    const active = enrollment?.status === "active";
                    setIsEnrolled(active);
                    if (active) {
                        setNotesLoading(true);
                        const notes = await getCourseChapters(courseData.id);
                        setChapters(notes);
                    }
                }
            } catch (err) {
                console.error("Error loading course:", err);
                setError(err instanceof Error ? err.message : "Failed to load course");
            } finally {
                setNotesLoading(false);
                setLoading(false);
            }
        }

        loadCourse();
    }, [firebaseUser, params.slug, router]);

    useEffect(() => {
        setRazorpayReady(typeof getRazorpay() === "function");
    }, []);

    const canReadNotes = course?.accessType === "free" || isEnrolled;
    const isPaidCourse = course?.accessType === "enrollment_required";
    const stats = course?.notesSummary || { chapterCount: 0, subtopicCount: 0, imageCount: 0, videoCount: 0 };
    const redirectPath = `/login?redirect=/courses/${params.slug}`;

    const notesOutline = useMemo(() => course?.notesOutline || [], [course]);

    async function handleEnroll() {
        if (!course) return;
        if (course.accessType !== "free") {
            await handlePurchase();
            return;
        }
        if (!firebaseUser) {
            router.push(redirectPath);
            return;
        }

        setEnrolling(true);
        setError(null);
        try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch("/api/courses/enroll", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ courseId: course.id }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to enroll");

            setIsEnrolled(true);
            const notes = await getCourseChapters(course.id);
            setChapters(notes);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to enroll");
        } finally {
            setEnrolling(false);
        }
    }

    async function handlePurchase() {
        if (!course) return;
        if (!firebaseUser) {
            router.push(redirectPath);
            return;
        }

        setPaymentProcessing(true);
        setError(null);

        if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
            setError("Payment gateway key is not configured. Please contact support.");
            setPaymentProcessing(false);
            return;
        }

        const Razorpay = getRazorpay();
        if (!Razorpay || !razorpayReady) {
            setError("Payment gateway is still loading. Please wait a moment and try again.");
            setPaymentProcessing(false);
            return;
        }

        try {
            const token = await firebaseUser.getIdToken();
            const orderResponse = await fetch("/api/courses/create-order", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ courseId: course.id }),
            });
            const orderData = await orderResponse.json();

            if (!orderResponse.ok) {
                throw new Error(orderData.error || "Failed to create course order");
            }

            if (orderData.alreadyPurchased) {
                setIsEnrolled(true);
                const notes = await getCourseChapters(course.id);
                setChapters(notes);
                setPaymentProcessing(false);
                return;
            }

            const checkout = new Razorpay({
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount: orderData.amount,
                currency: orderData.currency,
                name: "PlacementRanker",
                description: `Course: ${course.title}`,
                order_id: orderData.razorpayOrderId,
                prefill: {
                    email: firebaseUser.email || "",
                },
                theme: {
                    color: "#4F46E5",
                },
                modal: {
                    confirm_close: true,
                    ondismiss: () => {
                        setError("Payment was cancelled. You can try again whenever you are ready.");
                        setPaymentProcessing(false);
                    },
                },
                handler: async (response: RazorpayPaymentResponse) => {
                    try {
                        const verifyResponse = await fetch("/api/courses/verify-payment", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                ...response,
                                orderId: orderData.orderId,
                                courseId: course.id,
                            }),
                        });
                        const verifyData = await verifyResponse.json();

                        if (!verifyResponse.ok) {
                            throw new Error(verifyData.error || "Payment verification failed");
                        }

                        setIsEnrolled(true);
                        const notes = await getCourseChapters(course.id);
                        setChapters(notes);
                    } catch (err) {
                        console.error("Course payment verification failed:", err);
                        setError(err instanceof Error ? err.message : "Payment verification failed. Please contact support.");
                    } finally {
                        setPaymentProcessing(false);
                    }
                },
            });

            checkout.on("payment.failed", (response) => {
                setError(response.error?.description || "Payment failed. Please try again.");
                setPaymentProcessing(false);
            });
            checkout.open();
        } catch (err) {
            console.error("Course purchase failed:", err);
            setError(err instanceof Error ? err.message : "Failed to process course purchase");
            setPaymentProcessing(false);
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    if (!course) return null;

    return (
        <div className="min-h-screen bg-slate-50">
            {isPaidCourse && (
                <Script
                    src="https://checkout.razorpay.com/v1/checkout.js"
                    strategy="lazyOnload"
                    onLoad={() => setRazorpayReady(typeof getRazorpay() === "function")}
                    onReady={() => setRazorpayReady(typeof getRazorpay() === "function")}
                    onError={() => setError("Payment gateway could not be loaded. Please refresh and try again.")}
                />
            )}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-16">
                    <div>
                        <div className="mb-5 flex flex-wrap gap-2">
                            <span className="rounded-full bg-primary-50 dark:bg-primary-500/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-primary-700 dark:text-primary-300">
                                {course.category || "Study Material"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600">
                                {course.difficulty}
                            </span>
                            <span className="rounded-full bg-green-50 dark:bg-green-500/10 px-3 py-1 text-xs font-black text-green-700 dark:text-green-300">
                                {course.accessType === "free" ? "Free access" : `Paid access · ₹${course.price || 0}`}
                            </span>
                        </div>
                        <h1 className="max-w-4xl text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">
                            {course.title}
                        </h1>
                        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                            {course.shortDescription || course.description}
                        </p>

                        <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                                [stats.chapterCount, "Chapters"],
                                [stats.subtopicCount, "Subtopics"],
                                [stats.videoCount, "Videos"],
                                [linkedTests.length + (course.linkedQuizzes?.length || 0), "Practice"],
                            ].map(([value, label]) => (
                                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-2xl font-black text-slate-950">{value}</p>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                                </div>
                            ))}
                        </div>

                        {error && (
                            <div className="mt-6 rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                        <div className="relative h-56 bg-slate-100">
                            {course.thumbnailURL ? (
                                <Image src={course.thumbnailURL} alt={course.title} fill sizes="420px" className="object-cover" />
                            ) : (
                                <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#020617] to-primary-900 text-white">
                                    <span className="text-6xl font-black">{course.title.slice(0, 1).toUpperCase()}</span>
                                </div>
                            )}
                        </div>
                        <div className="p-6">
                            {isPaidCourse && !canReadNotes && (
                                <div className="mb-5 rounded-2xl border border-indigo-100 dark:border-indigo-500/25 bg-indigo-50 dark:bg-indigo-500/10 p-4">
                                    <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Course price</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <p className="text-3xl font-black text-indigo-700 dark:text-indigo-300">₹{course.price || 0}</p>
                                        {course.compareAtPrice && course.compareAtPrice > (course.price || 0) && (
                                            <p className="pb-1 text-sm font-semibold text-slate-400 line-through">
                                                ₹{course.compareAtPrice}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                            <h2 className="text-xl font-black text-slate-950">
                                {canReadNotes ? "You can access this course" : isPaidCourse ? "Buy to unlock full notes" : "Enroll to unlock full notes"}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                {canReadNotes
                                    ? "Read notes, watch embedded videos, and jump into linked tests or quizzes."
                                    : isPaidCourse
                                        ? "The outline is visible now. Purchase this course to access full notes, diagrams, and videos."
                                        : "The outline is visible now. Sign in and enroll to access full notes, diagrams, and videos."}
                            </p>
                            {!canReadNotes && (
                                <Button
                                    className="mt-5 w-full"
                                    onClick={isPaidCourse ? handlePurchase : handleEnroll}
                                    isLoading={isPaidCourse ? paymentProcessing : enrolling}
                                    disabled={isPaidCourse && firebaseUser ? !razorpayReady || paymentProcessing : enrolling}
                                >
                                    {isPaidCourse
                                        ? firebaseUser
                                            ? razorpayReady
                                                ? `Buy for ₹${course.price || 0}`
                                                : "Loading Payment Gateway..."
                                            : "Sign In to Buy"
                                        : firebaseUser
                                            ? "Enroll Now"
                                            : "Sign In to Enroll"}
                                </Button>
                            )}
                            {canReadNotes && (
                                <a href="#course-notes" className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#020617] px-4 py-3 text-sm font-bold text-white hover:bg-[#1e293b]">
                                    Start Reading
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className="container-page grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div id="course-notes" className="space-y-5">
                    <div>
                        <h2 className="text-2xl font-black text-slate-950">Course Notes</h2>
                        <p className="mt-1 text-slate-500">
                            {canReadNotes ? "Chapter-wise material with diagrams and videos." : "Preview the course outline before enrollment."}
                        </p>
                    </div>

                    {notesLoading ? (
                        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                            Loading notes...
                        </div>
                    ) : canReadNotes ? (
                        chapters.length > 0 ? (
                            <div className="space-y-5">
                                {chapters.map((chapter, index) => (
                                    <CourseChapter key={chapter.id} chapter={chapter} index={index} />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                                Notes are being prepared for this course.
                            </div>
                        )
                    ) : (
                        <div className="space-y-4">
                            {notesOutline.map((chapter, index) => (
                                <div key={chapter.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                                    <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-600">
                                        Chapter {index + 1}
                                    </p>
                                    <h3 className="mt-1 text-xl font-black text-slate-950">{chapter.title}</h3>
                                    {chapter.description && <p className="mt-2 text-sm text-slate-500">{chapter.description}</p>}
                                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                        {(chapter.subtopics || []).map((subtopic) => (
                                            <div key={subtopic.id} className="rounded-xl bg-slate-50 px-3 py-2">
                                                <p className="truncate text-sm font-bold text-slate-700">{subtopic.title}</p>
                                                {subtopic.summary && <p className="mt-1 line-clamp-1 text-xs text-slate-500">{subtopic.summary}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <aside className="space-y-5">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-black text-slate-950">Linked Test Series</h2>
                        {linkedTests.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500">No test series attached yet.</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {linkedTests.map((series) => (
                                    <Link key={series.id} href={`/tests/${series.slug}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10">
                                        <p className="font-bold text-slate-950">{series.title}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {series.totalTests || 0} tests · {series.totalQuestions || 0} questions
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-black text-slate-950">Quizzes</h2>
                        {(course.linkedQuizzes || []).length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500">No quizzes attached yet.</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {(course.linkedQuizzes || []).map((quiz) => {
                                    const isReady = quiz.status === "published" && quiz.url;
                                    const content = (
                                        <div className="rounded-2xl border border-slate-200 p-4 transition hover:border-primary-200 hover:bg-primary-50/40 dark:hover:bg-primary-500/10">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="font-bold text-slate-950">{quiz.title}</p>
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">
                                                    {quiz.status || "planned"}
                                                </span>
                                            </div>
                                            {quiz.description && <p className="mt-1 text-xs text-slate-500">{quiz.description}</p>}
                                        </div>
                                    );

                                    return isReady ? (
                                        <Link key={quiz.id} href={quiz.url!}>
                                            {content}
                                        </Link>
                                    ) : (
                                        <div key={quiz.id}>{content}</div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </aside>
            </section>
        </div>
    );
}

function CourseChapter({ chapter, index }: { chapter: CourseNoteChapter; index: number }) {
    return (
        <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" open={index === 0}>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-600">Chapter {index + 1}</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-950">{chapter.title}</h3>
                    {chapter.description && <p className="mt-1 text-sm text-slate-500">{chapter.description}</p>}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 group-open:bg-primary-50 dark:group-open:bg-primary-500/10 group-open:text-primary-700 dark:group-open:text-primary-300">
                    {(chapter.subtopics || []).length} subtopics
                </span>
            </summary>
            <div className="divide-y divide-slate-100">
                {(chapter.subtopics || []).map((subtopic, subtopicIndex) => (
                    <CourseSubtopic key={subtopic.id} subtopic={subtopic} index={subtopicIndex} />
                ))}
            </div>
        </details>
    );
}

function CourseSubtopic({ subtopic, index }: { subtopic: CourseNoteSubtopic; index: number }) {
    return (
        <article className="p-5 lg:p-6">
            <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Subtopic {index + 1}</p>
                <h4 className="mt-1 text-xl font-black text-slate-950">{subtopic.title}</h4>
                {subtopic.summary && <p className="mt-1 text-sm text-slate-500">{subtopic.summary}</p>}
            </div>

            {subtopic.contentHtml && <FormattedContent html={subtopic.contentHtml} size="base" className="text-slate-700" />}

            {(subtopic.imageUrls || []).length > 0 && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {subtopic.imageUrls.map((url, imageIndex) => (
                        <a
                            key={`${url}-${imageIndex}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                        >
                            <img src={url} alt={`${subtopic.title} diagram ${imageIndex + 1}`} className="h-56 w-full object-contain" />
                        </a>
                    ))}
                </div>
            )}

            {(subtopic.videos || []).length > 0 && (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {subtopic.videos.map((video) => (
                        <div key={video.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-[#020617] shadow-sm">
                            <div className="aspect-video">
                                <iframe
                                    src={`https://www.youtube.com/embed/${video.videoId}`}
                                    title={video.title}
                                    className="h-full w-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            </div>
                            <div className="border-t border-white/10 px-4 py-3">
                                <p className="truncate text-sm font-bold text-white">{video.title}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </article>
    );
}
