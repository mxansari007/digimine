"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { FileUpload } from "@/components/common/FileUpload";
import { CourseNotesEditor } from "@/components/common/CourseNotesEditor";
import { createCourse, updateCourse } from "@/lib/firestore/courses";
import { getAllTests } from "@/lib/firestore/tests";
import { getAllQuizzes } from "@/lib/firestore/quizzes";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type {
    Course,
    CourseAccessType,
    CourseDifficulty,
    CourseLinkedQuiz,
    CourseNoteChapter,
    CourseStatus,
    Quiz,
    TestSeries,
} from "@digimine/types";

interface CourseFormProps {
    initialData?: Course;
}

function makeId(prefix: string) {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseTags(value: string): string[] {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function CourseForm({ initialData }: CourseFormProps) {
    const router = useRouter();
    const { user } = useAdminAuth();
    const [testSeries, setTestSeries] = useState<TestSeries[]>([]);
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [tagsInput, setTagsInput] = useState((initialData?.tags || []).join(", "));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        title: initialData?.title || "",
        slug: initialData?.slug || "",
        description: initialData?.description || "",
        shortDescription: initialData?.shortDescription || "",
        thumbnailURL: initialData?.thumbnailURL || "",
        status: (initialData?.status || "draft") as CourseStatus,
        accessType: (initialData?.accessType || "free") as CourseAccessType,
        price: initialData?.price || 0,
        compareAtPrice: initialData?.compareAtPrice || 0,
        category: initialData?.category || "",
        difficulty: (initialData?.difficulty || "beginner") as CourseDifficulty,
        estimatedHours: initialData?.estimatedHours || 0,
        linkedTestSeriesIds: initialData?.linkedTestSeriesIds || [],
        linkedQuizzes: initialData?.linkedQuizzes || [],
        chapters: initialData?.chapters || [],
    });

    useEffect(() => {
        getAllTests()
            .then(setTestSeries)
            .catch((err) => console.error("Failed to load test series for course form:", err));
        getAllQuizzes()
            .then(setQuizzes)
            .catch((err) => console.error("Failed to load quizzes for course form:", err));
    }, []);

    const selectedTestSeries = useMemo(
        () => testSeries.filter((series) => formData.linkedTestSeriesIds.includes(series.id)),
        [formData.linkedTestSeriesIds, testSeries]
    );

    const handleTitleBlur = () => {
        if (!formData.slug && formData.title) {
            setFormData((prev) => ({
                ...prev,
                slug: formData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""),
            }));
        }
    };

    const toggleTestSeries = (seriesId: string) => {
        setFormData((prev) => ({
            ...prev,
            linkedTestSeriesIds: prev.linkedTestSeriesIds.includes(seriesId)
                ? prev.linkedTestSeriesIds.filter((id) => id !== seriesId)
                : [...prev.linkedTestSeriesIds, seriesId],
        }));
    };

    const addQuiz = () => {
        const quiz: CourseLinkedQuiz = {
            id: makeId("quiz"),
            title: "New quiz",
            description: "",
            url: "",
            status: "planned",
        };
        setFormData((prev) => ({ ...prev, linkedQuizzes: [...prev.linkedQuizzes, quiz] }));
    };

    const addExistingQuiz = (quiz: Quiz) => {
        setFormData((prev) => {
            if (prev.linkedQuizzes.some((linkedQuiz) => linkedQuiz.quizId === quiz.id || linkedQuiz.id === quiz.id)) {
                return prev;
            }

            const linkedQuiz: CourseLinkedQuiz = {
                id: quiz.id,
                quizId: quiz.id,
                title: quiz.title,
                description: quiz.shortDescription,
                url: `/quizzes/${quiz.slug}`,
                status: quiz.status === "published" ? "published" : "planned",
            };

            return { ...prev, linkedQuizzes: [...prev.linkedQuizzes, linkedQuiz] };
        });
    };

    const updateQuiz = (quizId: string, patch: Partial<CourseLinkedQuiz>) => {
        setFormData((prev) => ({
            ...prev,
            linkedQuizzes: prev.linkedQuizzes.map((quiz) => (quiz.id === quizId ? { ...quiz, ...patch } : quiz)),
        }));
    };

    const removeQuiz = (quizId: string) => {
        setFormData((prev) => ({
            ...prev,
            linkedQuizzes: prev.linkedQuizzes.filter((quiz) => quiz.id !== quizId),
        }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);

        const payload = {
            ...formData,
            tags: parseTags(tagsInput),
            thumbnailURL: formData.thumbnailURL || null,
            estimatedHours: Number(formData.estimatedHours) || 0,
            price: formData.accessType === "enrollment_required" ? Number(formData.price) || 0 : 0,
            compareAtPrice: Number(formData.compareAtPrice) || undefined,
            chapters: formData.chapters as CourseNoteChapter[],
        };

        try {
            if (initialData?.id) {
                await updateCourse({ id: initialData.id, ...payload });
            } else {
                await createCourse(payload, user?.id || "admin");
            }
            router.push("/courses");
            router.refresh();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Failed to save course");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                    <Card padding="lg">
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Course title</label>
                                <input
                                    required
                                    value={formData.title}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                                    onBlur={handleTitleBlur}
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    placeholder="Computer Networks"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Slug</label>
                                <input
                                    required
                                    value={formData.slug}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, slug: event.target.value }))}
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    placeholder="computer-networks"
                                />
                                {initialData && (
                                    <p className="mt-1 text-xs text-gray-500">
                                        The document stays under its original admin ID. Slug updates affect the public URL lookup.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Short description</label>
                                <textarea
                                    rows={2}
                                    maxLength={180}
                                    value={formData.shortDescription}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, shortDescription: event.target.value }))}
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    placeholder="Chapter-wise notes, diagrams, videos, quizzes, and mocks for Computer Networks."
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Description</label>
                                <textarea
                                    rows={5}
                                    value={formData.description}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    placeholder="Describe what this course covers and how students should use the notes."
                                />
                            </div>
                        </div>
                    </Card>

                    <Card padding="lg">
                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-gray-900">Course Notes</h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Build chapters, subtopics, rich notes, diagrams, and YouTube video embeds. These notes are stored separately from products.
                            </p>
                        </div>
                        <CourseNotesEditor
                            chapters={formData.chapters}
                            onChange={(chapters) => setFormData((prev) => ({ ...prev, chapters }))}
                            uploadPath={`courses/${formData.slug || "draft"}/notes`}
                        />
                    </Card>

                    <Card padding="lg">
                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-gray-900">Attached Test Series</h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Link full mocks or topic-wise test series that should appear inside this course.
                            </p>
                        </div>

                        {testSeries.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                No test series available yet.
                            </div>
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                                {testSeries.map((series) => (
                                    <label
                                        key={series.id}
                                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-primary-300 hover:bg-primary-50/40"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={formData.linkedTestSeriesIds.includes(series.id)}
                                            onChange={() => toggleTestSeries(series.id)}
                                            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-bold text-gray-900">{series.title}</span>
                                            <span className="mt-1 block text-xs text-gray-500">
                                                {series.totalTests || 0} tests · {series.totalQuestions || 0} questions
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card padding="lg">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Quizzes</h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    Link real quizzes from the quiz module, or add planned quiz entries for future work.
                                </p>
                            </div>
                            <Button type="button" variant="outline" onClick={addQuiz}>
                                Add Planned Quiz
                            </Button>
                        </div>

                        {quizzes.length > 0 && (
                            <div className="mb-4 grid gap-3 md:grid-cols-2">
                                {quizzes.map((quiz) => {
                                    const linked = formData.linkedQuizzes.some((linkedQuiz) => linkedQuiz.quizId === quiz.id || linkedQuiz.id === quiz.id);
                                    return (
                                        <button
                                            key={quiz.id}
                                            type="button"
                                            onClick={() => addExistingQuiz(quiz)}
                                            disabled={linked}
                                            className={`rounded-2xl border p-4 text-left transition ${
                                                linked
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                                    : "border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/40"
                                            }`}
                                        >
                                            <span className="block text-sm font-bold">{quiz.title}</span>
                                            <span className="mt-1 block text-xs opacity-70">
                                                {quiz.totalQuestions || 0} questions · {quiz.status}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {formData.linkedQuizzes.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                No quizzes linked yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {formData.linkedQuizzes.map((quiz) => (
                                    <div key={quiz.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                                            <input
                                                value={quiz.title}
                                                onChange={(event) => updateQuiz(quiz.id, { title: event.target.value })}
                                                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                                placeholder="OSI model quick quiz"
                                            />
                                            <select
                                                value={quiz.status || "planned"}
                                                onChange={(event) => updateQuiz(quiz.id, { status: event.target.value as CourseLinkedQuiz["status"] })}
                                                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none"
                                            >
                                                <option value="planned">Planned</option>
                                                <option value="published">Published</option>
                                            </select>
                                        </div>
                                        <input
                                            value={quiz.url || ""}
                                            onChange={(event) => updateQuiz(quiz.id, { url: event.target.value })}
                                            className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                            placeholder="/tests/networking-quiz or external quiz URL"
                                        />
                                        <div className="mt-3 flex gap-3">
                                            <input
                                                value={quiz.description || ""}
                                                onChange={(event) => updateQuiz(quiz.id, { description: event.target.value })}
                                                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                                placeholder="Short quiz description"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeQuiz(quiz.id)}
                                                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                <aside className="space-y-6">
                    <Card padding="lg">
                        <h2 className="mb-4 text-lg font-bold text-gray-900">Publishing</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Status</label>
                                <select
                                    value={formData.status}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.value as CourseStatus }))}
                                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Access</label>
                                <select
                                    value={formData.accessType}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, accessType: event.target.value as CourseAccessType }))}
                                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none"
                                >
                                    <option value="free">Free, open access</option>
                                    <option value="enrollment_required">Paid enrollment required</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500">
                                    Free courses expose notes to everyone. Paid enrollment courses reveal notes only after purchase.
                                </p>
                            </div>

                            {formData.accessType === "enrollment_required" && (
                                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-gray-700">Price (₹)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            step="0.01"
                                            required={formData.accessType === "enrollment_required"}
                                            value={formData.price}
                                            onChange={(event) => setFormData((prev) => ({ ...prev, price: Number(event.target.value) || 0 }))}
                                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-gray-700">Compare at</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.compareAtPrice}
                                            onChange={(event) => setFormData((prev) => ({ ...prev, compareAtPrice: Number(event.target.value) || 0 }))}
                                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">Difficulty</label>
                                    <select
                                        value={formData.difficulty}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, difficulty: event.target.value as CourseDifficulty }))}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none"
                                    >
                                        <option value="beginner">Beginner</option>
                                        <option value="intermediate">Intermediate</option>
                                        <option value="advanced">Advanced</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">Hours</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.estimatedHours}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, estimatedHours: Number(event.target.value) || 0 }))}
                                        className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Category</label>
                                <input
                                    value={formData.category}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    placeholder="Computer Science"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700">Tags</label>
                                <input
                                    value={tagsInput}
                                    onChange={(event) => setTagsInput(event.target.value)}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    placeholder="CN, OSI, TCP/IP"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card padding="lg">
                        <FileUpload
                            label="Course thumbnail"
                            path="courses/thumbnails"
                            accept="image/*"
                            existingUrl={formData.thumbnailURL || undefined}
                            onUploadComplete={(thumbnailURL) => setFormData((prev) => ({ ...prev, thumbnailURL }))}
                        />
                    </Card>

                    <Card padding="lg">
                        <h2 className="mb-3 text-lg font-bold text-gray-900">Attached Content</h2>
                        <div className="space-y-3 text-sm text-gray-600">
                            <p>
                                <span className="font-bold text-gray-900">{formData.chapters.length}</span> chapters
                            </p>
                            <p>
                                <span className="font-bold text-gray-900">
                                    {formData.chapters.reduce((total, chapter) => total + (chapter.subtopics?.length || 0), 0)}
                                </span>{" "}
                                subtopics
                            </p>
                            <p>
                                <span className="font-bold text-gray-900">{selectedTestSeries.length}</span> test series linked
                            </p>
                            <p>
                                <span className="font-bold text-gray-900">{formData.linkedQuizzes.length}</span> quizzes linked
                            </p>
                        </div>
                    </Card>

                    <div className="flex flex-col gap-3">
                        <Button type="submit" variant="primary" size="lg" isLoading={isLoading}>
                            {initialData ? "Save Course" : "Create Course"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push("/courses")}>
                            Cancel
                        </Button>
                    </div>
                </aside>
            </div>
        </form>
    );
}
