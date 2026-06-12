"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button, Card, FormattedContent } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { ClassroomShell, shortDateTime } from "@/components/classroom/ui";

export default function ClassroomContentPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const contentId = params.contentId as string;
    const contentType = searchParams.get("type") || "quiz";
    const classId = params.classId as string;
    const isLegacy = classId.startsWith("legacy:");
    const legacyTeacherId = isLegacy ? classId.replace(/^legacy:/, "") : "";
    const [content, setContent] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!contentId || authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/content/${contentId}?type=${contentType}`)}`);
            return;
        }
        const authUser = firebaseUser;

        async function loadContent() {
            setLoading(true);
            setError("");
            try {
                const token = await authUser.getIdToken();
                const detailQuery = isLegacy
                    ? `type=${contentType}&contentId=${contentId}&teacherId=${legacyTeacherId}`
                    : `type=${contentType}&contentId=${contentId}&classId=${classId}`;
                const res = await fetch(`/api/classroom/content-detail?${detailQuery}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Could not load content.");
                setContent(data.content || null);
            } catch (err) {
                setContent(null);
                setError(err instanceof Error ? err.message : "Could not load content.");
            } finally {
                setLoading(false);
            }
        }

        loadContent();
    }, [authLoading, contentId, contentType, firebaseUser, router, classId, isLegacy, legacyTeacherId]);

    const getTakeRoute = () => {
        if (!content) return null;
        const slug = content.slug || content.id;
        const param = isLegacy
            ? `teacherId=${encodeURIComponent(legacyTeacherId)}`
            : `classId=${encodeURIComponent(classId)}`;
        switch (contentType) {
            case "quiz": return `/quizzes/${slug}?${param}`;
            case "test": return `/tests/${slug}?${param}`;
            case "contest": return `/contests/${slug}?${param}`;
            case "course": return null;
            default: return null;
        }
    };

    const takeRoute = getTakeRoute();
    const typeLabel =
        contentType === "test" ? "Mock test series" :
        contentType.charAt(0).toUpperCase() + contentType.slice(1);

    if (loading) {
        return (
            <div className="min-h-screen bg-background px-4 py-10">
                <div className="mx-auto max-w-3xl space-y-3">
                    <div className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                </div>
            </div>
        );
    }
    if (!content) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background px-4">
                <Card className="max-w-sm p-8 text-center">
                    <h1 className="font-display text-lg font-semibold text-gray-900">
                        Couldn&apos;t open this
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {error || "This content may have been unpublished by your teacher."}
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push(`/classroom/${classId}`)}>
                        Back to classroom
                    </Button>
                </Card>
            </div>
        );
    }

    const chapters = Array.isArray(content.chapters) ? content.chapters : [];
    const facts: Array<[string, string]> = [];
    if (content.totalQuestions > 0) facts.push(["Questions", String(content.totalQuestions)]);
    if (content.totalMarks > 0) facts.push(["Marks", String(content.totalMarks)]);
    if (content.duration > 0) facts.push(["Duration", `${content.duration} min`]);
    if (content.estimatedHours > 0) facts.push(["Effort", `~${content.estimatedHours} hrs`]);
    if (content.startTime) facts.push(["Starts", shortDateTime(content.startTime)]);
    if (content.endTime) facts.push(["Ends", shortDateTime(content.endTime)]);

    return (
        <ClassroomShell
            backHref={`/classroom/${classId}`}
            backLabel="Classroom"
            eyebrow={typeLabel}
            title={content.title || content.name || typeLabel}
            subtitle={
                facts.length > 0 ? (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                        {facts.map(([k, v]) => (
                            <span key={k}>
                                <span className="text-slate-400">{k} </span>
                                <span className="text-gray-900">{v}</span>
                            </span>
                        ))}
                    </span>
                ) : undefined
            }
            aside={
                takeRoute ? (
                    <Button variant="primary" onClick={() => router.push(takeRoute)}>
                        {contentType === "quiz" ? "Take quiz" : contentType === "test" ? "Open series" : "View contest"}
                    </Button>
                ) : undefined
            }
        >
            {(content.description || content.shortDescription) && (
                <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {content.description || content.shortDescription}
                </p>
            )}

            {/* Course reader — chapters are a real sequence, so numbering is
                information here, not decoration. */}
            {contentType === "course" && chapters.length > 0 && (
                <div className="space-y-3">
                    {chapters.map((chapter: any, index: number) => (
                        <details
                            key={chapter.id || index}
                            open={index === 0}
                            className="group overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm"
                        >
                            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 focus-visible:bg-slate-50 focus:outline-none">
                                <span className="font-mono text-xs text-slate-400 tabular-nums">
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-display text-[15px] font-semibold text-gray-900">
                                        {chapter.title || `Chapter ${index + 1}`}
                                    </span>
                                    {chapter.description && (
                                        <span className="block truncate text-xs text-slate-500">
                                            {chapter.description}
                                        </span>
                                    )}
                                </span>
                                <svg
                                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </summary>
                            <div className="space-y-5 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
                                {(Array.isArray(chapter.subtopics) ? chapter.subtopics : []).map(
                                    (subtopic: any, subIndex: number) => (
                                        <div key={subtopic.id || subIndex}>
                                            <h4 className="text-sm font-semibold text-gray-900">
                                                {subtopic.title || `Topic ${subIndex + 1}`}
                                            </h4>
                                            {/* Canonical chapters carry HTML in `contentHtml`;
                                                legacy docs used plain-text `content`/`notes`. */}
                                            {subtopic.contentHtml ? (
                                                <FormattedContent
                                                    html={subtopic.contentHtml}
                                                    size="sm"
                                                    className="mt-1.5"
                                                />
                                            ) : subtopic.content || subtopic.notes ? (
                                                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                                    {subtopic.content || subtopic.notes}
                                                </p>
                                            ) : subtopic.summary ? (
                                                <p className="mt-1.5 text-sm text-slate-500">{subtopic.summary}</p>
                                            ) : null}
                                            {(subtopic.videoUrl ||
                                                (Array.isArray(subtopic.videos) && subtopic.videos.length > 0)) && (
                                                <div className="mt-2 flex flex-wrap gap-3">
                                                    {subtopic.videoUrl && (
                                                        <a
                                                            href={subtopic.videoUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-xs font-medium text-primary-700 dark:text-primary-300 hover:underline"
                                                        >
                                                            Watch video →
                                                        </a>
                                                    )}
                                                    {(subtopic.videos || []).map((v: any, vi: number) =>
                                                        v?.url ? (
                                                            <a
                                                                key={vi}
                                                                href={v.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-xs font-medium text-primary-700 dark:text-primary-300 hover:underline"
                                                            >
                                                                {v.title || `Watch video ${vi + 1}`} →
                                                            </a>
                                                        ) : null
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                )}
                            </div>
                        </details>
                    ))}
                </div>
            )}
        </ClassroomShell>
    );
}
