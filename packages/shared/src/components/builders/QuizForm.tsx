"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button, Card } from "@digimine/ui";
import type { FirebaseStorage } from "firebase/storage";
import type { CreateQuizInput, Quiz, QuizAccessType, QuizStatus } from "@digimine/types";
import { ImageInput } from "../ImageInput";

export interface QuizFormProps {
    /** Existing quiz when editing; undefined when creating. */
    initialData?: Quiz;
    /**
     * Caller-supplied persistence. Returns once the write has completed.
     * Throwing will surface the error inline. The caller is responsible
     * for routing after success.
     */
    onSubmit: (payload: CreateQuizInput, existingId?: string) => Promise<void>;
    /** Cancel handler — typically `router.push(listPath)`. */
    onCancel: () => void;
    /** Firebase Storage instance used by the thumbnail uploader. */
    storage: FirebaseStorage;
    /**
     * Display mode. `teacher` hides the publish-status selector because
     * teacher content is private until admin approval.
     */
    mode?: "admin" | "teacher";
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function parseTags(value: string): string[] {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function QuizForm({ initialData, onSubmit, onCancel, storage, mode = "admin" }: QuizFormProps) {
    const isTeacherMode = mode === "teacher";
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [tagsInput, setTagsInput] = useState((initialData?.tags || []).join(", "));
    const [formData, setFormData] = useState<CreateQuizInput>({
        title: initialData?.title || "",
        slug: initialData?.slug || "",
        description: initialData?.description || "",
        shortDescription: initialData?.shortDescription || "",
        thumbnailURL: initialData?.thumbnailURL || "",
        // Teacher content is always draft on save; admin can publish directly.
        status: initialData?.status || (isTeacherMode ? "draft" : "draft"),
        accessType: initialData?.accessType || "free",
        category: initialData?.category || "",
        tags: initialData?.tags || [],
        timeLimitMinutes: initialData?.timeLimitMinutes || 0,
        passingPercentage: initialData?.passingPercentage || 0,
        shuffleQuestions: initialData?.shuffleQuestions ?? false,
        shuffleOptions: initialData?.shuffleOptions ?? false,
        showExplanations: initialData?.showExplanations ?? true,
        linkedCourseIds: initialData?.linkedCourseIds || [],
    });

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = event.target;

        if (type === "checkbox") {
            setFormData((prev) => ({ ...prev, [name]: (event.target as HTMLInputElement).checked }));
            return;
        }

        if (type === "number") {
            setFormData((prev) => ({ ...prev, [name]: Number(value) || 0 }));
            return;
        }

        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const title = event.target.value;
        setFormData((prev) => ({
            ...prev,
            title,
            slug: prev.slug || slugify(title),
        }));
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setError("");

        try {
            const payload: CreateQuizInput = {
                ...formData,
                tags: parseTags(tagsInput),
                thumbnailURL: formData.thumbnailURL || null,
                timeLimitMinutes: Number(formData.timeLimitMinutes) || 0,
                passingPercentage: Number(formData.passingPercentage) || 0,
            };
            await onSubmit(payload, initialData?.id);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Failed to save quiz");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        {error}
                    </div>
                )}

                {isTeacherMode && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Quiz will be saved as <strong>private</strong> to your classroom. Submit it for review
                        from the My Content page to publish it to the global marketplace.
                    </div>
                )}

                <Card padding="lg">
                    <h2 className="mb-4 text-lg font-bold text-slate-950">Quiz details</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Title</label>
                            <input
                                required
                                name="title"
                                value={formData.title}
                                onChange={handleTitleChange}
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="Computer Networks: OSI quick quiz"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Slug</label>
                            <input
                                required
                                name="slug"
                                value={formData.slug}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="cn-osi-quick-quiz"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Short description</label>
                            <input
                                required
                                maxLength={180}
                                name="shortDescription"
                                value={formData.shortDescription}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="A short topic quiz for OSI layers, protocols, and network basics."
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
                            <textarea
                                rows={5}
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="Explain what this quiz covers and when students should attempt it."
                            />
                        </div>
                    </div>
                </Card>

                <Card padding="lg">
                    <h2 className="mb-4 text-lg font-bold text-slate-950">Quiz behavior</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                type="checkbox"
                                name="shuffleQuestions"
                                checked={Boolean(formData.shuffleQuestions)}
                                onChange={handleChange}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Shuffle questions</span>
                                <span className="text-xs text-slate-500">Good for practice and repeated attempts.</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                type="checkbox"
                                name="shuffleOptions"
                                checked={Boolean(formData.shuffleOptions)}
                                onChange={handleChange}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Shuffle options</span>
                                <span className="text-xs text-slate-500">Applies to multiple-choice questions.</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                type="checkbox"
                                name="showExplanations"
                                checked={Boolean(formData.showExplanations)}
                                onChange={handleChange}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Show explanations</span>
                                <span className="text-xs text-slate-500">Display answer explanations after submission.</span>
                            </span>
                        </label>
                    </div>
                </Card>
            </div>

            <aside className="space-y-6">
                <Card padding="lg">
                    <h2 className="mb-4 text-lg font-bold text-slate-950">Publishing</h2>
                    <div className="space-y-4">
                        {!isTeacherMode && (
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={(event) =>
                                        setFormData((prev) => ({ ...prev, status: event.target.value as QuizStatus }))
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Access</label>
                            <select
                                name="accessType"
                                value={formData.accessType}
                                onChange={(event) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        accessType: event.target.value as QuizAccessType,
                                    }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none"
                            >
                                <option value="free">Free public quiz</option>
                                <option value="course_only">Course-only quiz</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Time limit (minutes)</label>
                            <input
                                type="number"
                                min={0}
                                name="timeLimitMinutes"
                                value={formData.timeLimitMinutes}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                            />
                            <p className="mt-1 text-xs text-slate-500">Use 0 for untimed practice.</p>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Passing percentage</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                name="passingPercentage"
                                value={formData.passingPercentage}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Category</label>
                            <input
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="Computer Networks"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Tags</label>
                            <input
                                value={tagsInput}
                                onChange={(event) => setTagsInput(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                placeholder="CN, OSI, TCP"
                            />
                        </div>
                    </div>
                </Card>

                <Card padding="lg">
                    <ImageInput
                        storage={storage}
                        label="Quiz thumbnail"
                        path="quizzes/thumbnails"
                        value={formData.thumbnailURL || ""}
                        idealSize="1600×900 (16:9)"
                        aspectRatio="16/9"
                        hint="Rendered at 16:9 on quiz cards and used as og:image for social shares. Keep the subject centred."
                        onChange={(thumbnailURL) =>
                            setFormData((prev) => ({ ...prev, thumbnailURL }))
                        }
                    />
                </Card>

                <div className="flex flex-col gap-3">
                    <Button type="submit" variant="primary" size="lg" isLoading={isSaving}>
                        {initialData ? "Save Quiz" : "Create Quiz"}
                    </Button>
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </aside>
        </form>
    );
}
