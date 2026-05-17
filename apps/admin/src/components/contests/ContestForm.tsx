"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, stripFormattedContent } from "@digimine/ui";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { QuestionBankPicker } from "@/components/question-bank/QuestionBankPicker";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createContest, updateContest } from "@/lib/firestore/contests";
import { getAllTestSeries, getTestsInSeries } from "@/lib/firestore/tests";
import { getAllQuizzes } from "@/lib/firestore/quizzes";
import { incrementQuestionBankUsage } from "@/lib/firestore/questionBank";
import { parseQuizQuestionsMarkdown, QUIZ_QUESTION_TEMPLATE_MD } from "@/lib/import/quizMarkdownQuestions";
import type { Contest, ContestSourceType, CreateQuizQuestionInput, DifficultyLevel, QuestionBankQuestion, QuestionType, Quiz, Test, TestSeries, TestStatus } from "@digimine/types";

interface ContestFormProps {
    contest?: Contest;
}

interface ContestFormState {
    title: string;
    slug: string;
    shortDescription: string;
    description: string;
    thumbnailURL: string;
    status: TestStatus;
    sourceType: ContestSourceType;
    seriesId: string;
    testId: string;
    quizId: string;
    customQuestionsMarkdown: string;
    category: string;
    tags: string;
    startTime: string;
    endTime: string;
}

type CustomInputMode = "builder" | "markdown";

interface CustomQuestionDraft {
    type: Exclude<QuestionType, "code">;
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
    correctAnswer: string;
    explanation: string;
    marks: number;
    negativeMarks: number;
    difficulty: DifficultyLevel;
    passageGroup: string;
    passage: string;
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function toDateTimeLocalValue(date: Date) {
    const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const local = new Date(safeDate.getTime() - safeDate.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function defaultDateTime(offsetMinutes: number) {
    return toDateTimeLocalValue(new Date(Date.now() + offsetMinutes * 60 * 1000));
}

function splitTags(value: string) {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function initialCustomQuestion(): CustomQuestionDraft {
    return {
        type: "mcq",
        questionText: "",
        options: [
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
        ],
        correctAnswer: "",
        explanation: "",
        marks: 1,
        negativeMarks: 0,
        difficulty: "medium",
        passageGroup: "",
        passage: "",
    };
}

function getValidOptions(question: CustomQuestionDraft) {
    return question.options.filter((option) => stripFormattedContent(option.text));
}

function validateCustomQuestion(question: CustomQuestionDraft) {
    if (!stripFormattedContent(question.questionText)) return "Question text is required.";
    if (question.type === "mcq") {
        const validOptions = getValidOptions(question);
        if (validOptions.length < 2) return "MCQ questions need at least 2 options.";
        if (!validOptions.some((option) => option.isCorrect)) return "Mark one option as correct.";
    }
    if (question.type === "text_input" && !question.correctAnswer.trim()) {
        return "Correct answer is required for text input questions.";
    }
    if (!Number.isFinite(question.marks) || question.marks <= 0) return "Marks must be greater than 0.";
    return null;
}

function toCustomQuestionInput(question: CustomQuestionDraft, index: number): CreateQuizQuestionInput {
    const validOptions = getValidOptions(question);
    return {
        quizId: "",
        type: question.type,
        questionText: question.questionText,
        options: question.type === "mcq" ? validOptions : undefined,
        correctAnswer: question.type === "text_input" ? question.correctAnswer.trim() : undefined,
        explanation: question.explanation || undefined,
        marks: question.marks,
        negativeMarks: question.negativeMarks || undefined,
        difficulty: question.difficulty,
        order: index,
        passageGroup: question.passageGroup.trim() || undefined,
        passage: question.passage || undefined,
    };
}

export function ContestForm({ contest }: ContestFormProps) {
    const router = useRouter();
    const { user } = useAdminAuth();
    const [seriesList, setSeriesList] = useState<TestSeries[]>([]);
    const [tests, setTests] = useState<Test[]>([]);
    const [quizList, setQuizList] = useState<Quiz[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingTests, setLoadingTests] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manualSlug, setManualSlug] = useState(Boolean(contest));
    const [customInputMode, setCustomInputMode] = useState<CustomInputMode>("builder");
    const [customQuestions, setCustomQuestions] = useState<CustomQuestionDraft[]>([]);
    const [editingCustomIndex, setEditingCustomIndex] = useState<number | null>(null);
    const [editingCustomQuestion, setEditingCustomQuestion] = useState<CustomQuestionDraft | null>(null);
    const [customQuestionError, setCustomQuestionError] = useState<string | null>(null);
    const [bankPickerOpen, setBankPickerOpen] = useState(false);
    const [form, setForm] = useState<ContestFormState>(() => ({
        title: contest?.title || "",
        slug: contest?.slug || contest?.id || "",
        shortDescription: contest?.shortDescription || "",
        description: contest?.description || "",
        thumbnailURL: contest?.thumbnailURL || "",
        status: contest?.status || "draft",
        sourceType: contest?.sourceType || (contest?.quizId ? "quiz" : "test"),
        seriesId: contest?.seriesId || "",
        testId: contest?.testId || "",
        quizId: contest?.quizId || "",
        customQuestionsMarkdown: "",
        category: contest?.category || "",
        tags: contest?.tags?.join(", ") || "",
        startTime: contest?.startTime ? toDateTimeLocalValue(contest.startTime) : defaultDateTime(60),
        endTime: contest?.endTime ? toDateTimeLocalValue(contest.endTime) : defaultDateTime(120),
    }));

    useEffect(() => {
        async function loadSeries() {
            try {
                setLoading(true);
                const [items, quizzes] = await Promise.all([
                    getAllTestSeries(),
                    getAllQuizzes(),
                ]);
                setSeriesList(items);
                setQuizList(quizzes);
                setForm((current) => ({
                    ...current,
                    seriesId: !current.seriesId && items[0] ? items[0].id : current.seriesId,
                    quizId: !current.quizId && current.sourceType === "quiz" && quizzes[0] ? quizzes[0].id : current.quizId,
                }));
            } catch (err) {
                console.error("Failed to load test series:", err);
                setError("Could not load test series.");
            } finally {
                setLoading(false);
            }
        }
        loadSeries();
    }, []);

    useEffect(() => {
        if (!form.seriesId) {
            setTests([]);
            return;
        }

        async function loadTests() {
            try {
                setLoadingTests(true);
                const items = await getTestsInSeries(form.seriesId);
                setTests(items);
                setForm((current) => {
                    if (current.testId && items.some((test) => test.id === current.testId)) return current;
                    return { ...current, testId: items[0]?.id || "" };
                });
            } catch (err) {
                console.error("Failed to load tests:", err);
                setTests([]);
                setError("Could not load tests for the selected series.");
            } finally {
                setLoadingTests(false);
            }
        }
        loadTests();
    }, [form.seriesId]);

    const selectedTest = useMemo(
        () => tests.find((test) => test.id === form.testId) || null,
        [tests, form.testId]
    );
    const selectedQuiz = useMemo(
        () => quizList.find((quiz) => quiz.id === form.quizId) || null,
        [quizList, form.quizId]
    );

    const updateField = (field: keyof ContestFormState, value: string) => {
        setForm((current) => {
            if (field === "title" && !manualSlug && !contest) {
                return { ...current, title: value, slug: slugify(value) };
            }
            if (field === "sourceType") {
                return {
                    ...current,
                    sourceType: value as ContestSourceType,
                    quizId: value === "quiz" && !current.quizId && quizList[0] ? quizList[0].id : current.quizId,
                };
            }
            return { ...current, [field]: field === "slug" ? slugify(value) : value };
        });
        if (field === "slug") setManualSlug(true);
    };

    const handleAddCustomQuestion = () => {
        setEditingCustomIndex(null);
        setCustomQuestionError(null);
        setEditingCustomQuestion(initialCustomQuestion());
    };

    const handleEditCustomQuestion = (index: number) => {
        setEditingCustomIndex(index);
        setCustomQuestionError(null);
        setEditingCustomQuestion({ ...customQuestions[index], options: [...customQuestions[index].options] });
    };

    const updateCustomOption = (index: number, patch: Partial<{ text: string; isCorrect: boolean }>) => {
        if (!editingCustomQuestion) return;
        const nextOptions = [...editingCustomQuestion.options];
        nextOptions[index] = { ...nextOptions[index], ...patch };
        setEditingCustomQuestion({ ...editingCustomQuestion, options: nextOptions });
    };

    const handleSaveCustomQuestion = () => {
        if (!editingCustomQuestion) return;
        const validationError = validateCustomQuestion(editingCustomQuestion);
        if (validationError) {
            setCustomQuestionError(validationError);
            return;
        }

        setCustomQuestions((current) => {
            if (editingCustomIndex === null) return [...current, editingCustomQuestion];
            return current.map((item, index) => (index === editingCustomIndex ? editingCustomQuestion : item));
        });
        setEditingCustomIndex(null);
        setEditingCustomQuestion(null);
        setCustomQuestionError(null);
        setError(null);
    };

    const handleAddCustomQuestionsFromBank = async (bankQuestions: QuestionBankQuestion[]) => {
        const quizCompatibleQuestions = bankQuestions.filter((question) => question.type !== "code");
        if (quizCompatibleQuestions.length === 0) return;

        setCustomQuestions((current) => [
            ...current,
            ...quizCompatibleQuestions.map((question): CustomQuestionDraft => ({
                type: question.type as Exclude<QuestionType, "code">,
                questionText: question.questionText,
                options: question.options?.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) || [
                    { text: "", isCorrect: true },
                    { text: "", isCorrect: false },
                ],
                correctAnswer: question.correctAnswer || "",
                explanation: question.explanation || "",
                marks: question.marks,
                negativeMarks: question.negativeMarks || 0,
                difficulty: question.difficulty,
                passageGroup: question.passageGroup || "",
                passage: question.passage || "",
            })),
        ]);
        await incrementQuestionBankUsage(quizCompatibleQuestions.map((question) => question.id));
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!user) {
            setError("Admin profile is still loading.");
            return;
        }
        if (form.sourceType === "test" && (!form.seriesId || !form.testId)) {
            setError("Choose a test series and test.");
            return;
        }
        if (form.sourceType === "quiz" && !form.quizId) {
            setError("Choose a quiz.");
            return;
        }

        const customParse = form.sourceType === "custom" && customInputMode === "markdown" && form.customQuestionsMarkdown.trim()
            ? parseQuizQuestionsMarkdown(form.customQuestionsMarkdown)
            : { questions: [], errors: [] };
        let customQuestionPayload: CreateQuizQuestionInput[] = [];
        if (form.sourceType === "custom") {
            if (customInputMode === "builder") {
                const invalidQuestionIndex = customQuestions.findIndex((question) => validateCustomQuestion(question));
                if (invalidQuestionIndex >= 0) {
                    setError(`Question ${invalidQuestionIndex + 1}: ${validateCustomQuestion(customQuestions[invalidQuestionIndex])}`);
                    return;
                }
                customQuestionPayload = customQuestions.map(toCustomQuestionInput);
            } else {
                if (customParse.errors.length > 0) {
                    setError(`Question import has errors. Line ${customParse.errors[0].line}: ${customParse.errors[0].message}`);
                    return;
                }
                customQuestionPayload = customParse.questions;
            }

            if (!contest && customQuestionPayload.length === 0) {
                setError("Add questions with the builder or upload a markdown question paper.");
                return;
            }
        }

        const payload = {
            title: form.title.trim(),
            slug: form.slug.trim(),
            shortDescription: form.shortDescription.trim(),
            description: form.description.trim(),
            thumbnailURL: form.thumbnailURL.trim() || undefined,
            status: form.status,
            sourceType: form.sourceType,
            seriesId: form.sourceType === "test" ? form.seriesId : undefined,
            testId: form.sourceType === "test" ? form.testId : undefined,
            quizId: form.sourceType === "quiz" ? form.quizId : form.sourceType === "custom" && contest?.sourceType === "custom" ? form.quizId || contest.quizId : undefined,
            customQuestions: form.sourceType === "custom" && customQuestionPayload.length > 0 ? customQuestionPayload : undefined,
            category: form.category.trim() || undefined,
            tags: splitTags(form.tags),
            startTime: new Date(form.startTime),
            endTime: new Date(form.endTime),
        };

        if (!payload.title || !payload.slug || !payload.shortDescription || !payload.description) {
            setError("Title, slug, short description, and description are required.");
            return;
        }

        try {
            setSaving(true);
            setError(null);
            if (contest) {
                await updateContest({ id: contest.id, ...payload });
            } else {
                await createContest(payload, user.id);
            }
            router.push("/contests");
        } catch (err) {
            console.error("Failed to save contest:", err);
            setError(err instanceof Error ? err.message : "Could not save contest.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card className="p-8 text-center text-slate-500">
                Loading contest builder...
            </Card>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <Card className="border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                    {error}
                </Card>
            )}

            <Card className="p-5 sm:p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Contest title</span>
                        <input
                            value={form.title}
                            onChange={(event) => updateField("title", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="Infosys National Sprint"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Slug</span>
                        <input
                            value={form.slug}
                            onChange={(event) => updateField("slug", event.target.value)}
                            disabled={Boolean(contest)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-500 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="infosys-national-sprint"
                        />
                    </label>
                    <label className="space-y-2 lg:col-span-2">
                        <span className="text-sm font-bold text-slate-700">Short description</span>
                        <input
                            value={form.shortDescription}
                            onChange={(event) => updateField("shortDescription", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="A live ranked test for placement preparation."
                        />
                    </label>
                    <label className="space-y-2 lg:col-span-2">
                        <span className="text-sm font-bold text-slate-700">Description</span>
                        <textarea
                            value={form.description}
                            onChange={(event) => updateField("description", event.target.value)}
                            rows={5}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="Explain the contest format, syllabus, and who should join."
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Thumbnail URL</span>
                        <input
                            value={form.thumbnailURL}
                            onChange={(event) => updateField("thumbnailURL", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="Optional image URL"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Status</span>
                        <select
                            value={form.status}
                            onChange={(event) => updateField("status", event.target.value as TestStatus)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                        </select>
                    </label>
                </div>
            </Card>

            <Card className="p-5 sm:p-6">
                <div className="mb-4">
                    <h2 className="text-base font-bold text-slate-950">Contest paper</h2>
                    <p className="mt-1 text-sm text-slate-500">Use a full test, an existing quiz, or upload a standalone contest paper.</p>
                </div>
                <div className="mb-5 grid gap-3 md:grid-cols-3">
                    {([
                        { key: "test", title: "Test", body: "Use a test from a test series." },
                        { key: "quiz", title: "Quiz", body: "Use an existing quiz as a live contest." },
                        { key: "custom", title: "Upload", body: "Paste or upload standalone questions." },
                    ] as { key: ContestSourceType; title: string; body: string }[]).map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => updateField("sourceType", option.key)}
                            className={`rounded-2xl border p-4 text-left transition ${
                                form.sourceType === option.key
                                    ? "border-primary-400 bg-primary-50 text-primary-900 ring-2 ring-primary-100"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                        >
                            <div className="text-sm font-bold">{option.title}</div>
                            <div className="mt-1 text-xs leading-5">{option.body}</div>
                        </button>
                    ))}
                </div>

                {form.sourceType === "test" && (
                    <div className="grid gap-5 lg:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-bold text-slate-700">Test series</span>
                            <select
                                value={form.seriesId}
                                onChange={(event) => updateField("seriesId", event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            >
                                {seriesList.map((series) => (
                                    <option key={series.id} value={series.id}>{series.title}</option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-bold text-slate-700">Test</span>
                            <select
                                value={form.testId}
                                onChange={(event) => updateField("testId", event.target.value)}
                                disabled={loadingTests || tests.length === 0}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none disabled:bg-slate-50 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            >
                                {tests.map((test) => (
                                    <option key={test.id} value={test.id}>{test.title}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                )}

                {(form.sourceType === "quiz" || form.sourceType === "custom") && (
                    <div className="grid gap-5 lg:grid-cols-2">
                        {form.sourceType === "quiz" && (
                            <label className="space-y-2 lg:col-span-2">
                                <span className="text-sm font-bold text-slate-700">Quiz</span>
                                <select
                                    value={form.quizId}
                                    onChange={(event) => updateField("quizId", event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                >
                                    {quizList.map((quiz) => (
                                        <option key={quiz.id} value={quiz.id}>{quiz.title}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {form.sourceType === "custom" && (
                            <div className="space-y-3 lg:col-span-2">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <span className="text-sm font-bold text-slate-700">Custom questions</span>
                                        <p className="mt-1 text-xs text-slate-500">Build questions with the editor, or switch to markdown for bulk import.</p>
                                    </div>
                                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                                        {([
                                            { key: "builder", label: "Builder" },
                                            { key: "markdown", label: "Markdown" },
                                        ] as { key: CustomInputMode; label: string }[]).map((option) => (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => setCustomInputMode(option.key)}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                                    customInputMode === option.key
                                                        ? "bg-white text-primary-700 shadow-sm"
                                                        : "text-slate-500 hover:text-slate-800"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {customInputMode === "builder" && (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <div className="text-sm font-bold text-slate-900">
                                                    {customQuestions.length} question{customQuestions.length === 1 ? "" : "s"} drafted
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Supports rich text, images, videos, passages, options, marks, negative marking, and explanations.
                                                </p>
                                            </div>
                                            <Button type="button" size="sm" onClick={handleAddCustomQuestion}>
                                                Add Question
                                            </Button>
                                            <Button type="button" size="sm" variant="outline" onClick={() => setBankPickerOpen(true)}>
                                                Add from Bank
                                            </Button>
                                        </div>

                                        {customQuestions.length > 0 ? (
                                            <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                                {customQuestions.map((question, index) => (
                                                    <div key={`${question.type}-${index}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary-50 px-2 text-xs font-bold text-primary-700">
                                                                    {index + 1}
                                                                </span>
                                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-600">
                                                                    {question.type.replace("_", " ")}
                                                                </span>
                                                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                                                                    {question.marks} mark{question.marks === 1 ? "" : "s"}
                                                                </span>
                                                                {question.negativeMarks > 0 && (
                                                                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                                                                        -{question.negativeMarks}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-800">
                                                                {stripFormattedContent(question.questionText) || "Untitled question"}
                                                            </p>
                                                        </div>
                                                        <div className="flex shrink-0 gap-2">
                                                            <Button type="button" variant="outline" size="sm" onClick={() => handleEditCustomQuestion(index)}>
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setCustomQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                                            >
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
                                                <p className="text-sm font-bold text-slate-900">No questions drafted yet</p>
                                                <p className="mt-1 text-sm text-slate-500">Add questions one by one using the same rich editor available in quizzes.</p>
                                            </div>
                                        )}
                                        {contest?.sourceType === "custom" && customQuestions.length === 0 && (
                                            <p className="mt-3 text-xs text-slate-500">Leave this empty to keep the current uploaded question paper. Add questions here to replace it.</p>
                                        )}
                                    </div>
                                )}

                                {customInputMode === "markdown" && (
                                    <>
                                        <div className="flex flex-wrap justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateField("customQuestionsMarkdown", QUIZ_QUESTION_TEMPLATE_MD)}
                                        >
                                            Insert Template
                                        </Button>
                                        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:border-primary-200 hover:text-primary-700">
                                            Upload .md
                                            <input
                                                type="file"
                                                accept=".md,.txt,text/markdown,text/plain"
                                                className="hidden"
                                                onChange={async (event) => {
                                                    const file = event.target.files?.[0];
                                                    if (!file) return;
                                                    updateField("customQuestionsMarkdown", await file.text());
                                                }}
                                            />
                                        </label>
                                    </div>
                                        <textarea
                                            value={form.customQuestionsMarkdown}
                                            onChange={(event) => updateField("customQuestionsMarkdown", event.target.value)}
                                            rows={14}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs leading-6 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                            placeholder="Paste quiz markdown questions here..."
                                        />
                                        {contest?.sourceType === "custom" && !form.customQuestionsMarkdown && (
                                            <p className="text-xs text-slate-500">Leave blank to keep the current uploaded question paper. Paste new markdown to replace it.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {form.sourceType === "test" && selectedTest && (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-3">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Questions</div>
                            <div className="mt-1 font-bold text-slate-900">{selectedTest.totalQuestions}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Marks</div>
                            <div className="mt-1 font-bold text-slate-900">{selectedTest.totalMarks}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Duration</div>
                            <div className="mt-1 font-bold text-slate-900">{selectedTest.duration} mins</div>
                        </div>
                    </div>
                )}
                {form.sourceType === "quiz" && selectedQuiz && (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-3">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Questions</div>
                            <div className="mt-1 font-bold text-slate-900">{selectedQuiz.totalQuestions}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Marks</div>
                            <div className="mt-1 font-bold text-slate-900">{selectedQuiz.totalMarks}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Time limit</div>
                            <div className="mt-1 font-bold text-slate-900">{selectedQuiz.timeLimitMinutes || 0} mins</div>
                        </div>
                    </div>
                )}
            </Card>

            <Card className="p-5 sm:p-6">
                <div className="mb-4">
                    <h2 className="text-base font-bold text-slate-950">Live window</h2>
                    <p className="mt-1 text-sm text-slate-500">Every learner receives the same end time. If they join late, their remaining time is reduced.</p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Starts at</span>
                        <input
                            type="datetime-local"
                            value={form.startTime}
                            onChange={(event) => updateField("startTime", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Ends at</span>
                        <input
                            type="datetime-local"
                            value={form.endTime}
                            onChange={(event) => updateField("endTime", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Category</span>
                        <input
                            value={form.category}
                            onChange={(event) => updateField("category", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="Aptitude, CN, DSA..."
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-sm font-bold text-slate-700">Tags</span>
                        <input
                            value={form.tags}
                            onChange={(event) => updateField("tags", event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            placeholder="infosys, placement, live"
                        />
                    </label>
                </div>
            </Card>

            <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.push("/contests")}>
                    Cancel
                </Button>
                <Button type="submit" isLoading={saving}>
                    {contest ? "Save Contest" : "Create Contest"}
                </Button>
            </div>

            {editingCustomQuestion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
                    <Card className="max-h-[92vh] w-full max-w-5xl overflow-y-auto">
                        <div className="space-y-5 p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-950">
                                        {editingCustomIndex === null ? "Add Contest Question" : "Edit Contest Question"}
                                    </h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        This question will be saved into the contest paper when you save the contest.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingCustomIndex(null);
                                        setEditingCustomQuestion(null);
                                        setCustomQuestionError(null);
                                    }}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:border-slate-300 hover:text-slate-900"
                                >
                                    Close
                                </button>
                            </div>

                            {customQuestionError && (
                                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                    {customQuestionError}
                                </div>
                            )}

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-slate-700">Question type</label>
                                <select
                                    value={editingCustomQuestion.type}
                                    onChange={(event) => setEditingCustomQuestion({
                                        ...editingCustomQuestion,
                                        type: event.target.value as Exclude<QuestionType, "code">,
                                    })}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                >
                                    <option value="mcq">Multiple Choice</option>
                                    <option value="text_input">Text Input</option>
                                </select>
                            </div>

                            <RichTextEditor
                                label="Question Text"
                                required
                                value={editingCustomQuestion.questionText}
                                onChange={(questionText) => setEditingCustomQuestion({ ...editingCustomQuestion, questionText })}
                                minHeight={220}
                                helperText="Use rich text, images, videos, tables, formulas, code snippets, and media wrapping."
                                mediaUploadPath={`contests/${form.slug || "draft"}/questions/question-text`}
                            />

                            <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                                <summary className="cursor-pointer text-sm font-bold text-amber-900">Shared passage or case text (optional)</summary>
                                <div className="mt-4 space-y-3">
                                    <input
                                        value={editingCustomQuestion.passageGroup}
                                        onChange={(event) => setEditingCustomQuestion({ ...editingCustomQuestion, passageGroup: event.target.value })}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                        placeholder="Passage group ID, e.g. cn-case-1"
                                    />
                                    <RichTextEditor
                                        label="Passage content"
                                        value={editingCustomQuestion.passage}
                                        onChange={(passage) => setEditingCustomQuestion({ ...editingCustomQuestion, passage })}
                                        minHeight={160}
                                        mediaUploadPath={`contests/${form.slug || "draft"}/questions/passages`}
                                    />
                                </div>
                            </details>

                            {editingCustomQuestion.type === "mcq" && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="block text-sm font-semibold text-slate-700">Options</label>
                                        <button
                                            type="button"
                                            onClick={() => setEditingCustomQuestion({
                                                ...editingCustomQuestion,
                                                options: [...editingCustomQuestion.options, { text: "", isCorrect: false }],
                                            })}
                                            className="text-sm font-semibold text-primary-600"
                                        >
                                            Add option
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {editingCustomQuestion.options.map((option, index) => (
                                            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                        <input
                                                            type="radio"
                                                            name="correctContestCustomOption"
                                                            checked={option.isCorrect}
                                                            onChange={() => setEditingCustomQuestion({
                                                                ...editingCustomQuestion,
                                                                options: editingCustomQuestion.options.map((item, optionIndex) => ({
                                                                    ...item,
                                                                    isCorrect: optionIndex === index,
                                                                })),
                                                            })}
                                                            className="h-4 w-4 text-primary-600"
                                                        />
                                                        Option {String.fromCharCode(65 + index)}
                                                    </label>
                                                    {editingCustomQuestion.options.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingCustomQuestion({
                                                                ...editingCustomQuestion,
                                                                options: editingCustomQuestion.options.filter((_, optionIndex) => optionIndex !== index),
                                                            })}
                                                            className="text-sm font-semibold text-red-600"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                <RichTextEditor
                                                    value={option.text}
                                                    onChange={(text) => updateCustomOption(index, { text })}
                                                    compact
                                                    enableMedia
                                                    minHeight={90}
                                                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                                    mediaUploadPath={`contests/${form.slug || "draft"}/questions/options`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {editingCustomQuestion.type === "text_input" && (
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Correct answer</label>
                                    <input
                                        value={editingCustomQuestion.correctAnswer}
                                        onChange={(event) => setEditingCustomQuestion({ ...editingCustomQuestion, correctAnswer: event.target.value })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </div>
                            )}

                            <RichTextEditor
                                label="Explanation (optional)"
                                value={editingCustomQuestion.explanation}
                                onChange={(explanation) => setEditingCustomQuestion({ ...editingCustomQuestion, explanation })}
                                minHeight={150}
                                mediaUploadPath={`contests/${form.slug || "draft"}/questions/explanations`}
                            />

                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Marks</label>
                                    <input
                                        type="number"
                                        min={0.5}
                                        step={0.5}
                                        value={editingCustomQuestion.marks}
                                        onChange={(event) => setEditingCustomQuestion({ ...editingCustomQuestion, marks: Number(event.target.value) || 1 })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Negative marks</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={editingCustomQuestion.negativeMarks}
                                        onChange={(event) => setEditingCustomQuestion({ ...editingCustomQuestion, negativeMarks: Number(event.target.value) || 0 })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Difficulty</label>
                                    <select
                                        value={editingCustomQuestion.difficulty}
                                        onChange={(event) => setEditingCustomQuestion({ ...editingCustomQuestion, difficulty: event.target.value as DifficultyLevel })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    >
                                        <option value="easy">Easy</option>
                                        <option value="medium">Medium</option>
                                        <option value="hard">Hard</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setEditingCustomIndex(null);
                                        setEditingCustomQuestion(null);
                                        setCustomQuestionError(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button type="button" onClick={handleSaveCustomQuestion}>
                                    {editingCustomIndex === null ? "Add Question" : "Update Question"}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            <QuestionBankPicker
                open={bankPickerOpen}
                mode="quiz"
                onClose={() => setBankPickerOpen(false)}
                onSelect={handleAddCustomQuestionsFromBank}
                title="Add Bank Questions to Contest"
            />
        </form>
    );
}
