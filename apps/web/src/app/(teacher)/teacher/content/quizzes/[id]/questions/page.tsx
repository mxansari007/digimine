"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, FormattedContent, stripFormattedContent } from "@digimine/ui";
import { RichTextEditor, NumberInput } from "@digimine/shared";
import { QuestionBankPicker } from "@/components/question-bank/QuestionBankPicker";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import {
    AiQuestionGenerator,
    LockedFeatureButton,
    type GeneratedQuestionDraft,
} from "@/components/teacher/AiQuestionGenerator";
import {
    createTeacherQuizQuestion as createQuizQuestion,
    deleteTeacherQuizQuestion as deleteQuizQuestion,
    getQuizById as getQuiz,
    getQuizQuestions,
    updateTeacherQuizQuestion as updateQuizQuestion,
} from "@/lib/firestore/quizzes";
import { incrementTeacherQuestionBankUsage, questionBankToQuizQuestionInput } from "@/lib/firestore/questionBank";
import {
    downloadQuizQuestionTemplate,
    parseQuizQuestionsMarkdown,
    type QuizParseError,
} from "@/lib/import/quizMarkdownQuestions";
import { CheckIcon, EditIcon, TrashIcon } from "@/components/icons/AppIcons";
import type { CreateQuizQuestionInput, DifficultyLevel, Quiz, QuizQuestion, QuestionType, QuestionBankQuestion } from "@digimine/types";

interface QuizQuestionFormData {
    id?: string;
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

function initialQuestion(): QuizQuestionFormData {
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

export default function TeacherQuizQuestionsPage() {
    const params = useParams();
    const { firebaseUser } = useAuthContext();
    const teaching = useTeachingFeatures();
    const quizId = params.id as string;
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<QuizQuestionFormData | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [importPreview, setImportPreview] = useState<CreateQuizQuestionInput[]>([]);
    const [importErrors, setImportErrors] = useState<QuizParseError[]>([]);
    const [importFileName, setImportFileName] = useState("");
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 });
    const [bankPickerOpen, setBankPickerOpen] = useState(false);

    const importProgressPercent = importProgress.total > 0
        ? Math.round((importProgress.completed / importProgress.total) * 100)
        : 0;

    useEffect(() => {
        loadData();
    }, [quizId]);

    async function loadData() {
        setLoading(true);
        try {
            const [quizData, questionData] = await Promise.all([getQuiz(quizId), getQuizQuestions(quizId)]);
            setQuiz(quizData);
            setQuestions(questionData);
        } catch (error) {
            console.error("Error loading quiz questions:", error);
        } finally {
            setLoading(false);
        }
    }

    const resetImportState = () => {
        setImportOpen(false);
        setImportPreview([]);
        setImportErrors([]);
        setImportFileName("");
        setImportStatus("");
        setImportProgress({ completed: 0, total: 0 });
    };

    const handleImportFile = async (file: File) => {
        setImportFileName(file.name);
        setImportStatus("");
        setImportProgress({ completed: 0, total: 0 });

        try {
            const text = await file.text();
            const result = parseQuizQuestionsMarkdown(text);
            setImportPreview(result.questions);
            setImportErrors(result.errors);
            setImportOpen(true);
        } catch (error) {
            console.error("Quiz import parse failed:", error);
            alert("Could not read this markdown file.");
        }
    };

    const handleConfirmImport = async () => {
        if (importPreview.length === 0 || importErrors.length > 0) return;

        setImporting(true);
        setImportStatus("Preparing quiz import...");
        setImportProgress({ completed: 0, total: importPreview.length });

        try {
            for (let i = 0; i < importPreview.length; i++) {
                const question = importPreview[i];
                setImportStatus(`Importing question ${i + 1} of ${importPreview.length}...`);
                setImportProgress({ completed: i, total: importPreview.length });
                await createQuizQuestion({
                    ...question,
                    quizId,
                    order: questions.length + i,
                });
                setImportProgress({ completed: i + 1, total: importPreview.length });
            }

            setImportStatus("Refreshing quiz questions...");
            await loadData();
            resetImportState();
            alert(`Successfully imported ${importPreview.length} question${importPreview.length === 1 ? "" : "s"}.`);
        } catch (error) {
            console.error("Quiz import failed:", error);
            setImportStatus("Import failed. Check the error message and try again.");
            alert("Import failed. Please check the console for details.");
        } finally {
            setImporting(false);
        }
    };

    const handleAiSave = async (q: GeneratedQuestionDraft) => {
        // The per-quiz editor doesn't accept "code" type — surface a clear
        // message instead of silently dropping the draft.
        if (q.type === "code") {
            throw new Error("Code questions can't be added inside a quiz. Use MCQ or text input.");
        }
        const difficulty: DifficultyLevel =
            q.difficulty === "easy" ? "easy" : q.difficulty === "hard" ? "hard" : "medium";
        const payload: CreateQuizQuestionInput = {
            quizId,
            type: q.type,
            questionText: q.questionText,
            options: q.type === "mcq"
                ? q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
                : undefined,
            correctAnswer: q.type === "text_input" ? (q.correctAnswer ?? "") : undefined,
            explanation: q.explanation || undefined,
            marks: q.marks,
            negativeMarks: 0,
            difficulty,
            order: questions.length,
        };
        await createQuizQuestion(payload);
        await loadData();
    };

    const handleAddQuestion = () => {
        setEditingQuestion(initialQuestion());
        setShowForm(true);
    };

    const handleAddFromQuestionBank = async (bankQuestions: QuestionBankQuestion[]) => {
        if (bankQuestions.length === 0) return;
        setSaving(true);
        try {
            for (let i = 0; i < bankQuestions.length; i++) {
                await createQuizQuestion(questionBankToQuizQuestionInput(bankQuestions[i], quizId, questions.length + i));
            }
            if (firebaseUser?.uid) {
                await incrementTeacherQuestionBankUsage(firebaseUser.uid, bankQuestions.map((question) => question.id));
            }
            await loadData();
        } catch (error) {
            console.error("Failed to add bank questions:", error);
            alert(error instanceof Error ? error.message : "Failed to add questions from bank.");
        } finally {
            setSaving(false);
        }
    };

    const handleEditQuestion = (question: QuizQuestion) => {
        setEditingQuestion({
            id: question.id,
            type: question.type,
            questionText: question.questionText,
            options: question.options?.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) || [],
            correctAnswer: question.correctAnswer || "",
            explanation: question.explanation || "",
            marks: question.marks,
            negativeMarks: question.negativeMarks || 0,
            difficulty: question.difficulty,
            passageGroup: question.passageGroup || "",
            passage: question.passage || "",
        });
        setShowForm(true);
    };

    const handleSaveQuestion = async () => {
        if (!editingQuestion) return;

        if (!stripFormattedContent(editingQuestion.questionText)) {
            alert("Question text is required");
            return;
        }

        const validOptions = editingQuestion.options.filter((option) => stripFormattedContent(option.text));
        if (editingQuestion.type === "mcq") {
            if (validOptions.length < 2) {
                alert("MCQ questions need at least 2 options");
                return;
            }
            if (!validOptions.some((option) => option.isCorrect)) {
                alert("Please mark one option as correct");
                return;
            }
        }

        if (editingQuestion.type === "text_input" && !editingQuestion.correctAnswer.trim()) {
            alert("Correct answer is required for text input questions");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                quizId,
                type: editingQuestion.type,
                questionText: editingQuestion.questionText,
                options: editingQuestion.type === "mcq" ? validOptions : undefined,
                correctAnswer: editingQuestion.type === "text_input" ? editingQuestion.correctAnswer : undefined,
                explanation: editingQuestion.explanation || undefined,
                marks: editingQuestion.marks,
                negativeMarks: editingQuestion.negativeMarks || undefined,
                difficulty: editingQuestion.difficulty,
                order: questions.length,
                passageGroup: editingQuestion.passageGroup.trim() || undefined,
                passage: editingQuestion.passage || undefined,
            };

            if (editingQuestion.id) {
                await updateQuizQuestion({ id: editingQuestion.id, ...payload });
            } else {
                await createQuizQuestion(payload);
            }

            await loadData();
            setShowForm(false);
            setEditingQuestion(null);
        } catch (error) {
            console.error("Error saving quiz question:", error);
            alert("Failed to save quiz question.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteQuestion = async (questionId: string) => {
        if (!confirm("Delete this question?")) return;
        try {
            await deleteQuizQuestion(quizId, questionId);
            setQuestions((current) => current.filter((question) => question.id !== questionId));
        } catch (error) {
            console.error("Error deleting quiz question:", error);
            alert("Failed to delete question.");
        }
    };

    const updateOption = (index: number, patch: Partial<{ text: string; isCorrect: boolean }>) => {
        if (!editingQuestion) return;
        const nextOptions = [...editingQuestion.options];
        nextOptions[index] = { ...nextOptions[index], ...patch };
        setEditingQuestion({ ...editingQuestion, options: nextOptions });
    };

    if (loading) {
        return <div className="py-12 text-center text-slate-500">Loading quiz questions...</div>;
    }

    if (!quiz) {
        return (
            <div className="py-12 text-center">
                <h1 className="text-2xl font-bold text-slate-950">Quiz not found</h1>
                <Link href="/teacher/content">
                    <Button className="mt-4">Back to Quizzes</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/teacher/content">
                        <Button variant="outline" size="sm">← Back</Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-950">{quiz.title}</h1>
                        <p className="text-slate-500">{questions.length} questions · {quiz.totalMarks || 0} marks</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <AiQuestionGenerator
                        firebaseUser={firebaseUser}
                        aiEnabled={teaching.aiEnabled}
                        hasFeature={teaching.has("ai_question_generation")}
                        maxCount={teaching.aiPublic.maxQuestionsPerRequest}
                        dailyQuota={teaching.aiQuota}
                        upgradeHref={teaching.upgradeHref}
                        onSave={handleAiSave}
                        onGenerated={teaching.refresh}
                        // Quizzes don't accept code questions — hide that
                        // option from the AI generator's Type dropdown.
                        allowedTypes={["mcq", "text_input"]}
                    />
                    <LockedFeatureButton
                        locked={!teaching.has("question_bank_template_download")}
                        upgradeHref={teaching.upgradeHref}
                        tooltipWhenLocked="Question template download is included on paid plans."
                        onClick={() => downloadQuizQuestionTemplate()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2 text-base font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-primary-200 hover:bg-white hover:text-primary-700"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Download Template
                    </LockedFeatureButton>
                    {teaching.has("question_bank_markdown_import") ? (
                        <label className="inline-block">
                            <input
                                type="file"
                                accept=".md,text/markdown,text/plain"
                                className="hidden"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) handleImportFile(file);
                                    event.target.value = "";
                                }}
                            />
                            <span className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2 text-base font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-primary-200 hover:bg-white hover:text-primary-700">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" />
                                </svg>
                                Import
                            </span>
                        </label>
                    ) : (
                        <LockedFeatureButton
                            locked
                            upgradeHref={teaching.upgradeHref}
                            tooltipWhenLocked="Markdown import is included on paid plans."
                        >
                            Import
                        </LockedFeatureButton>
                    )}
                    <Button variant="outline" onClick={() => setBankPickerOpen(true)}>
                        Add from Bank
                    </Button>
                    <Button variant="primary" onClick={handleAddQuestion}>+ Add Question</Button>
                </div>
            </div>

            <div className="space-y-4">
                {questions.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-slate-500">No questions added yet.</p>
                        <Button className="mt-4" onClick={handleAddQuestion}>Add first question</Button>
                    </Card>
                ) : (
                    questions.map((question, index) => (
                        <Card key={question.id} className="p-6">
                            <div className="flex items-start gap-4">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/15 font-bold text-primary-700 dark:text-primary-300">
                                    {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold capitalize text-slate-700">
                                            {question.type === "mcq" ? "MCQ" : "Text input"}
                                        </span>
                                        <span className="rounded-full bg-blue-100 dark:bg-blue-500/15 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                                            {question.marks} marks
                                        </span>
                                        <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold capitalize text-emerald-700 dark:text-emerald-300">
                                            {question.difficulty}
                                        </span>
                                    </div>
                                    {question.passage && (
                                        <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-3">
                                            <FormattedContent html={question.passage} size="sm" />
                                        </div>
                                    )}
                                    <FormattedContent html={question.questionText} className="font-medium text-slate-900" />
                                    {question.type === "mcq" && question.options && (
                                        <div className="mt-3 space-y-1">
                                            {question.options.map((option, optionIndex) => (
                                                <div key={option.id} className={`flex items-center gap-2 text-sm ${option.isCorrect ? "font-semibold text-emerald-700" : "text-slate-600"}`}>
                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs">
                                                        {String.fromCharCode(65 + optionIndex)}
                                                    </span>
                                                    <FormattedContent html={option.text} as="span" size="sm" />
                                                    {option.isCorrect && <CheckIcon className="h-4 w-4 text-emerald-600" />}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {question.explanation && (
                                        <div className="mt-3 rounded-xl bg-slate-50 p-3">
                                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Explanation</p>
                                            <FormattedContent html={question.explanation} size="sm" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex shrink-0 flex-col gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleEditQuestion(question)}>
                                        <EditIcon className="mr-1 h-4 w-4" />
                                        Edit
                                    </Button>
                                    <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDeleteQuestion(question.id)}>
                                        <TrashIcon className="mr-1 h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            <QuestionBankPicker
                open={bankPickerOpen}
                mode="quiz"
                onClose={() => setBankPickerOpen(false)}
                onSelect={handleAddFromQuestionBank}
                title="Add Bank Questions to Quiz"
                teacherId={firebaseUser?.uid || ""}
            />

            {importOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
                            <div>
                                <h2 className="text-lg font-bold text-slate-950">Import Quiz Questions</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {importFileName && <span className="font-medium text-slate-700">{importFileName}</span>}
                                    {importFileName && " - "}
                                    Review the parsed quiz questions before saving.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={resetImportState}
                                disabled={importing}
                                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Close import preview"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto p-6">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Ready to import</div>
                                    <div className="mt-1 text-2xl font-bold text-emerald-950 dark:text-emerald-300">{importPreview.length}</div>
                                </div>
                                <div className={`rounded-xl border p-4 ${importErrors.length ? "border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10" : "border-slate-200 bg-slate-50"}`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider ${importErrors.length ? "text-red-700 dark:text-red-300" : "text-slate-500"}`}>Errors</div>
                                    <div className={`mt-1 text-2xl font-bold ${importErrors.length ? "text-red-950 dark:text-red-300" : "text-slate-700"}`}>{importErrors.length}</div>
                                </div>
                            </div>

                            {(importing || importStatus) && (
                                <div className="rounded-xl border border-primary-200 dark:border-primary-500/25 bg-primary-50 dark:bg-primary-500/10 p-4" role="status" aria-live="polite">
                                    <div className="flex items-center gap-3">
                                        {importing && (
                                            <span className="h-4 w-4 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" aria-hidden="true" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-bold text-primary-950">
                                                {importStatus || "Preparing import..."}
                                            </div>
                                            {importProgress.total > 0 && (
                                                <div className="mt-0.5 text-xs text-primary-700">
                                                    {importProgress.completed} of {importProgress.total} questions saved
                                                </div>
                                            )}
                                        </div>
                                        {importProgress.total > 0 && (
                                            <div className="text-sm font-bold text-primary-950">{importProgressPercent}%</div>
                                        )}
                                    </div>
                                    {importProgress.total > 0 && (
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                                            <div
                                                className="h-full rounded-full bg-primary-600 transition-all duration-300"
                                                style={{ width: `${importProgressPercent}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {importErrors.length > 0 && (
                                <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-4">
                                    <h3 className="mb-2 text-sm font-bold text-red-950 dark:text-red-300">Fix these issues first</h3>
                                    <ul className="space-y-1 text-sm text-red-800 dark:text-red-300">
                                        {importErrors.map((error, index) => (
                                            <li key={index}>
                                                <span className="rounded bg-red-100 dark:bg-red-500/15 px-1.5 py-0.5 font-mono text-xs">line {error.line}</span>{" "}
                                                {error.message}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {importPreview.length > 0 ? (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-bold text-slate-950">Preview</h3>
                                    {importPreview.map((question, index) => (
                                        <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/15 text-xs font-bold text-primary-700 dark:text-primary-300">
                                                        {index + 1}
                                                    </span>
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                                        {question.type === "mcq" ? "MCQ" : "Text input"}
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {question.marks} mark{question.marks === 1 ? "" : "s"} · {question.difficulty || "medium"}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-slate-400">
                                                    {question.type === "mcq"
                                                        ? `${question.options?.length || 0} options`
                                                        : "answer key included"}
                                                </span>
                                            </div>
                                            <p className="line-clamp-2 text-sm text-slate-700">
                                                {stripFormattedContent(question.questionText)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : importErrors.length === 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                                    No quiz questions were parsed from this file.
                                </div>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-3 border-t border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-slate-500">
                                Imported questions will be appended after the existing {questions.length} question{questions.length === 1 ? "" : "s"}.
                            </p>
                            <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" onClick={resetImportState} disabled={importing}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleConfirmImport}
                                    disabled={importing || importPreview.length === 0 || importErrors.length > 0}
                                >
                                    {importing ? "Importing..." : `Import ${importPreview.length} question${importPreview.length === 1 ? "" : "s"}`}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {showForm && editingQuestion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <Card className="max-h-[90vh] w-full max-w-5xl overflow-y-auto">
                        <div className="space-y-5 p-6">
                            <h2 className="text-xl font-bold text-slate-950">
                                {editingQuestion.id ? "Edit Question" : "Add Question"}
                            </h2>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-slate-700">Question type</label>
                                <select
                                    value={editingQuestion.type}
                                    onChange={(event) => setEditingQuestion({ ...editingQuestion, type: event.target.value as Exclude<QuestionType, "code"> })}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                                >
                                    <option value="mcq">Multiple Choice</option>
                                    <option value="text_input">Text Input</option>
                                </select>
                            </div>

                            <RichTextEditor
                                label="Question Text"
                                required
                                value={editingQuestion.questionText}
                                onChange={(questionText) => setEditingQuestion({ ...editingQuestion, questionText })}
                                minHeight={220}
                                helperText="Use rich text, images, videos, tables, formulas, code snippets, and media wrapping."
                                mediaUploadPath={`quizzes/${quizId}/questions/question-text`}
                            />

                            <details className="rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/50 dark:bg-amber-500/10 p-4">
                                <summary className="cursor-pointer text-sm font-bold text-amber-900 dark:text-amber-300">Shared passage or case text (optional)</summary>
                                <div className="mt-4 space-y-3">
                                    <input
                                        value={editingQuestion.passageGroup}
                                        onChange={(event) => setEditingQuestion({ ...editingQuestion, passageGroup: event.target.value })}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                        placeholder="Passage group ID, e.g. cn-case-1"
                                    />
                                    <RichTextEditor
                                        label="Passage content"
                                        value={editingQuestion.passage}
                                        onChange={(passage) => setEditingQuestion({ ...editingQuestion, passage })}
                                        minHeight={160}
                                        mediaUploadPath={`quizzes/${quizId}/questions/passages`}
                                    />
                                </div>
                            </details>

                            {editingQuestion.type === "mcq" && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="block text-sm font-semibold text-slate-700">Options</label>
                                        <button
                                            type="button"
                                            onClick={() => setEditingQuestion({ ...editingQuestion, options: [...editingQuestion.options, { text: "", isCorrect: false }] })}
                                            className="text-sm font-semibold text-primary-600"
                                        >
                                            + Add option
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {editingQuestion.options.map((option, index) => (
                                            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                        <input
                                                            type="radio"
                                                            name="correctQuizOption"
                                                            checked={option.isCorrect}
                                                            onChange={() => setEditingQuestion({
                                                                ...editingQuestion,
                                                                options: editingQuestion.options.map((item, optionIndex) => ({ ...item, isCorrect: optionIndex === index })),
                                                            })}
                                                            className="h-4 w-4 text-primary-600"
                                                        />
                                                        Option {String.fromCharCode(65 + index)}
                                                    </label>
                                                    {editingQuestion.options.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingQuestion({ ...editingQuestion, options: editingQuestion.options.filter((_, optionIndex) => optionIndex !== index) })}
                                                            className="text-sm font-semibold text-red-600"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                <RichTextEditor
                                                    value={option.text}
                                                    onChange={(text) => updateOption(index, { text })}
                                                    compact
                                                    enableMedia
                                                    minHeight={90}
                                                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                                    mediaUploadPath={`quizzes/${quizId}/questions/options`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {editingQuestion.type === "text_input" && (
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Correct answer</label>
                                    <input
                                        value={editingQuestion.correctAnswer}
                                        onChange={(event) => setEditingQuestion({ ...editingQuestion, correctAnswer: event.target.value })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                                    />
                                </div>
                            )}

                            <RichTextEditor
                                label="Explanation (optional)"
                                value={editingQuestion.explanation}
                                onChange={(explanation) => setEditingQuestion({ ...editingQuestion, explanation })}
                                minHeight={150}
                                mediaUploadPath={`quizzes/${quizId}/questions/explanations`}
                            />

                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Marks</label>
                                    <NumberInput
                                        min={0.5}
                                        step={0.5}
                                        value={editingQuestion.marks}
                                        onValueChange={(v) => setEditingQuestion({ ...editingQuestion, marks: v ?? 1 })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Negative marks</label>
                                    <NumberInput
                                        min={0}
                                        step={0.25}
                                        value={editingQuestion.negativeMarks}
                                        onValueChange={(v) => setEditingQuestion({ ...editingQuestion, negativeMarks: v ?? 0 })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Difficulty</label>
                                    <select
                                        value={editingQuestion.difficulty}
                                        onChange={(event) => setEditingQuestion({ ...editingQuestion, difficulty: event.target.value as DifficultyLevel })}
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
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
                                        setShowForm(false);
                                        setEditingQuestion(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button type="button" variant="primary" isLoading={saving} onClick={handleSaveQuestion}>
                                    {editingQuestion.id ? "Update Question" : "Save Question"}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
