"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";

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
    const typeLabel = contentType === "test" ? "Test Series" :
        contentType.charAt(0).toUpperCase() + contentType.slice(1);

    if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-gray-500">Loading...</div>;
    if (!content) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><Card className="p-8 text-center text-gray-500">{error || "Content not found."}</Card></div>;

    const chapters = Array.isArray(content.chapters) ? content.chapters : [];

    return (
        <div className="min-h-screen bg-slate-100 py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
                    <h1 className="text-2xl font-bold text-gray-900">{content.title || content.name || typeLabel}</h1>
                </div>

                <Card className="p-6 mb-6">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-4">
                        <span className="px-2 py-0.5 bg-gray-100 rounded-full capitalize">{contentType}</span>
                        {content.accessType === "free" && <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 rounded-full text-xs">Free</span>}
                    </div>
                    <p className="text-gray-600 whitespace-pre-wrap">{content.description || content.shortDescription || ""}</p>
                </Card>

                <Card className="p-6 space-y-3">
                    <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Details</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        {content.totalQuestions !== undefined && content.totalQuestions > 0 && <div><span className="text-gray-500">Questions:</span> <span className="font-semibold text-gray-900 ml-1">{content.totalQuestions}</span></div>}
                        {content.totalMarks !== undefined && content.totalMarks > 0 && <div><span className="text-gray-500">Marks:</span> <span className="font-semibold text-gray-900 ml-1">{content.totalMarks}</span></div>}
                        {content.duration !== undefined && content.duration > 0 && <div><span className="text-gray-500">Duration:</span> <span className="font-semibold text-gray-900 ml-1">{content.duration} min</span></div>}
                        {content.estimatedHours !== undefined && content.estimatedHours > 0 && <div><span className="text-gray-500">Duration:</span> <span className="font-semibold text-gray-900 ml-1">{content.estimatedHours} hrs</span></div>}
                        {content.startTime && <div><span className="text-gray-500">Starts:</span> <span className="font-semibold text-gray-900 ml-1">{new Date(content.startTime).toLocaleString()}</span></div>}
                        {content.endTime && <div><span className="text-gray-500">Ends:</span> <span className="font-semibold text-gray-900 ml-1">{new Date(content.endTime).toLocaleString()}</span></div>}
                    </div>
                </Card>

                {contentType === "course" && chapters.length > 0 && (
                    <Card className="mt-6 p-6">
                        <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Course Notes</h3>
                        <div className="mt-4 space-y-4">
                            {chapters.map((chapter: any, index: number) => (
                                <div key={chapter.id || index} className="rounded-xl border border-gray-200 p-4">
                                    <h4 className="font-semibold text-gray-900">{chapter.title || `Chapter ${index + 1}`}</h4>
                                    {chapter.description && <p className="mt-1 text-sm text-gray-500">{chapter.description}</p>}
                                    {Array.isArray(chapter.subtopics) && chapter.subtopics.length > 0 && (
                                        <div className="mt-3 space-y-3">
                                            {chapter.subtopics.map((subtopic: any, subIndex: number) => (
                                                <div key={subtopic.id || subIndex} className="rounded-lg bg-slate-50 p-3">
                                                    <div className="font-medium text-gray-900">{subtopic.title || `Topic ${subIndex + 1}`}</div>
                                                    {(subtopic.content || subtopic.notes) && (
                                                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{subtopic.content || subtopic.notes}</p>
                                                    )}
                                                    {subtopic.videoUrl && (
                                                        <a href={subtopic.videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary-700">
                                                            Open video
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                <div className="mt-6 flex gap-3 flex-wrap">
                    <Link href={`/classroom/${classId}`}>
                        <Button variant="outline">← Classroom</Button>
                    </Link>
                    {takeRoute && (
                        <Button variant="primary" onClick={() => router.push(takeRoute)}>
                            {contentType === "quiz" ? "Take Quiz" : contentType === "test" ? "Open Test Series" : contentType === "contest" ? "View Contest" : "Open"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
