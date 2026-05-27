"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, FormattedContent, stripFormattedContent } from "@digimine/ui";
import { getTeacherTestSeries, getTestById, getTeacherTestQuestions as getQuestionsByTestId, createTeacherTestQuestion as createQuestion, updateTeacherTestQuestion as updateQuestion, deleteTeacherTestQuestion as deleteQuestion, updateTeacherTestInSeries as updateTestInSeries } from "@/lib/firestore/tests";
import { RichTextEditor } from "@digimine/shared";
import { QuestionBankPicker } from "@/components/question-bank/QuestionBankPicker";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import {
    AiQuestionGenerator,
    type GeneratedQuestionDraft,
} from "@/components/teacher/AiQuestionGenerator";
import { incrementTeacherQuestionBankUsage, questionBankToTestQuestionInput } from "@/lib/firestore/questionBank";
import { parseQuestionsMarkdown, downloadQuestionTemplate, type ParseError, type ParsedSection } from "@/lib/import/markdownQuestions";
import { CheckIcon, EditIcon, TrashIcon } from "@/components/icons/AppIcons";
import type { TestSeries, Test, Question, QuestionType, DifficultyLevel, CodeLanguage, CodeTestCase, CodeStarter, CodeScoringMode, CreateQuestionInput, TestSectionInput, QuestionBankQuestion } from "@digimine/types";

const CODE_LANGUAGES: { value: CodeLanguage; label: string }[] = [
    { value: "python", label: "Python" },
    { value: "javascript", label: "JavaScript" },
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
];

function normalizeSectionRef(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

interface QuestionFormData {
    id?: string;
    type: QuestionType;
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
    correctAnswer: string;
    explanation: string;
    marks: number;
    negativeMarks: number;
    difficulty: DifficultyLevel;
    supportedLanguages: CodeLanguage[];
    starters: CodeStarter[];
    testCases: CodeTestCase[];
    codeScoringMode: CodeScoringMode;
    timeLimit: number;
    memoryLimit: number;
    sectionId?: string;
    passageGroup: string;
    passage: string;
}

export default function TeacherTestQuestionsPage() {
    const params = useParams();
    const { firebaseUser } = useAuthContext();
    const teaching = useTeachingFeatures();
    const seriesId = params.id as string;
    const testId = params.testId as string;

    const [series, setSeries] = useState<TestSeries | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<QuestionFormData | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importPreview, setImportPreview] = useState<CreateQuestionInput[]>([]);
    const [importSections, setImportSections] = useState<ParsedSection[]>([]);
    const [importErrors, setImportErrors] = useState<ParseError[]>([]);
    const [importFileName, setImportFileName] = useState<string>("");
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 });
    const [bankPickerOpen, setBankPickerOpen] = useState(false);
    const testSections = (test?.sections || [])
        .filter((section) => section.title.trim())
        .sort((a, b) => a.order - b.order);
    const sectionById = new Map(testSections.map((section) => [section.id, section]));
    const defaultSectionId = testSections[0]?.id || "";
    const getSectionDefaults = (sectionId?: string) => {
        const section = sectionId ? sectionById.get(sectionId) : undefined;
        return {
            marks: typeof section?.marksPerQuestion === "number" ? section.marksPerQuestion : undefined,
            negativeMarks: typeof section?.negativeMarks === "number" ? section.negativeMarks : undefined,
        };
    };
    const importProgressPercent = importProgress.total > 0
        ? Math.round((importProgress.completed / importProgress.total) * 100)
        : 0;

    const resetImportState = () => {
        setImportOpen(false);
        setImportPreview([]);
        setImportSections([]);
        setImportErrors([]);
        setImportFileName("");
        setImportStatus("");
        setImportProgress({ completed: 0, total: 0 });
    };

    useEffect(() => {
        loadData();
    }, [seriesId, testId]);

    async function loadData() {
        try {
            setLoading(true);
            const [seriesData, testData, questionsData] = await Promise.all([
                getTeacherTestSeries(seriesId),
                getTestById(seriesId, testId),
                getQuestionsByTestId(seriesId, testId),
            ]);
            setSeries(seriesData);
            setTest(testData);
            setQuestions(questionsData);
        } catch (error: any) {
            console.error("Error loading data:", error);
            alert(`Error loading questions: ${error.message || "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    }

    const getInitialFormData = (): QuestionFormData => {
        const sectionDefaults = getSectionDefaults(defaultSectionId);
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
            marks: sectionDefaults.marks ?? (test?.totalMarks && questions.length > 0 ? test.totalMarks / (questions.length + 1) : 1),
            negativeMarks: sectionDefaults.negativeMarks ?? 0,
            difficulty: "medium",
            supportedLanguages: ["python"],
            starters: [{ language: "python", code: "# Write your code here\n" }],
            testCases: [
                { id: "", input: "", expectedOutput: "", isHidden: false, weight: 1 },
            ],
            codeScoringMode: "all_or_nothing",
            timeLimit: 2,
            memoryLimit: 128,
            sectionId: defaultSectionId,
            passageGroup: "",
            passage: "",
        };
    };

    const handleAddQuestion = () => {
        setEditingQuestion(getInitialFormData());
        setShowForm(true);
    };

    const handleAiSave = async (q: GeneratedQuestionDraft) => {
        // Tests support all three types — MCQ, text input, and code.
        // Code drafts come back without test cases / starters; the
        // teacher edits those in the regular question form afterwards.
        const difficulty: DifficultyLevel =
            q.difficulty === "easy" ? "easy" : q.difficulty === "hard" ? "hard" : "medium";
        const base: any = {
            seriesId,
            testId,
            type: q.type,
            questionText: q.questionText,
            explanation: q.explanation || undefined,
            marks: q.marks,
            difficulty,
            order: questions.length,
            sectionId: defaultSectionId || undefined,
            passageGroup: "",
            passage: "",
        };
        if (q.type === "mcq") {
            base.options = q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }));
        } else if (q.type === "text_input") {
            base.correctAnswer = q.correctAnswer ?? "";
        } else if (q.type === "code") {
            base.supportedLanguages = ["python"];
            base.starters = [{ language: "python", code: "# Write your code here\n" }];
            base.testCases = [];
            base.codeScoringMode = "all_or_nothing";
            base.timeLimit = 2;
            base.memoryLimit = 128;
        }
        await createQuestion(base);
        await loadData();
    };

    const handleAddFromQuestionBank = async (bankQuestions: QuestionBankQuestion[]) => {
        if (bankQuestions.length === 0) return;
        setSaving(true);
        try {
            for (let i = 0; i < bankQuestions.length; i++) {
                await createQuestion(questionBankToTestQuestionInput(
                    bankQuestions[i],
                    seriesId,
                    testId,
                    questions.length + i,
                    defaultSectionId || undefined
                ));
            }
            if (firebaseUser?.uid) {
                await incrementTeacherQuestionBankUsage(firebaseUser.uid, bankQuestions.map((question) => question.id));
            }
            await loadData();
        } catch (error: any) {
            console.error("Failed to add questions from bank:", error);
            alert(`Failed to add questions from bank: ${error.message || "Unknown error"}`);
        } finally {
            setSaving(false);
        }
    };

    const handleImportFile = async (file: File) => {
        setImportFileName(file.name);
        setImportStatus("");
        setImportProgress({ completed: 0, total: 0 });
        try {
            const text = await file.text();
            const result = parseQuestionsMarkdown(text);
            setImportPreview(result.questions);
            setImportSections(result.sections);
            setImportErrors(result.errors);
            setImportOpen(true);
        } catch (err: any) {
            alert(`Failed to read file: ${err.message || "Unknown error"}`);
        }
    };

    const handleConfirmImport = async () => {
        if (importPreview.length === 0) return;
        setImporting(true);
        setImportStatus("Preparing import...");
        setImportProgress({ completed: 0, total: importPreview.length });
        try {
            setImportStatus("Preparing sections...");
            const existingSections = test?.sections || [];
            const nextSections: TestSectionInput[] = existingSections.map((section) => ({ ...section }));
            const sectionRefToId = new Map<string, string>();
            const registerSectionRef = (value: string | undefined, id: string) => {
                if (!value) return;
                sectionRefToId.set(normalizeSectionRef(value), id);
            };

            nextSections.forEach((section) => {
                if (!section.id) return;
                registerSectionRef(section.id, section.id);
                registerSectionRef(section.title, section.id);
            });

            importSections.forEach((section) => {
                const existingId =
                    sectionRefToId.get(normalizeSectionRef(section.id || "")) ||
                    sectionRefToId.get(normalizeSectionRef(section.key)) ||
                    sectionRefToId.get(normalizeSectionRef(section.title));

                if (existingId) {
                    const existingIndex = nextSections.findIndex((item) => item.id === existingId);
                    if (existingIndex >= 0) {
                        nextSections[existingIndex] = {
                            ...nextSections[existingIndex],
                            title: section.title || nextSections[existingIndex].title,
                            description: section.description ?? nextSections[existingIndex].description,
                            marksPerQuestion: section.marksPerQuestion ?? nextSections[existingIndex].marksPerQuestion,
                            negativeMarks: section.negativeMarks ?? nextSections[existingIndex].negativeMarks,
                            cutoffMarks: section.cutoffMarks ?? nextSections[existingIndex].cutoffMarks,
                        };
                    }
                    registerSectionRef(section.key, existingId);
                    registerSectionRef(section.title, existingId);
                    return;
                }

                const id = section.id || section.key;
                nextSections.push({
                    id,
                    title: section.title,
                    description: section.description || "",
                    order: nextSections.length,
                    marksPerQuestion: section.marksPerQuestion,
                    negativeMarks: section.negativeMarks,
                    cutoffMarks: section.cutoffMarks,
                });
                registerSectionRef(id, id);
                registerSectionRef(section.key, id);
                registerSectionRef(section.title, id);
            });

            importPreview.forEach((question) => {
                if (!question.sectionId) return;
                const ref = normalizeSectionRef(question.sectionId);
                if (sectionRefToId.has(ref)) return;

                const id = ref || `section-${nextSections.length + 1}`;
                nextSections.push({
                    id,
                    title: question.sectionId,
                    description: "",
                    order: nextSections.length,
                });
                registerSectionRef(id, id);
                registerSectionRef(question.sectionId, id);
            });

            if (nextSections.length !== existingSections.length || importSections.length > 0) {
                setImportStatus("Saving section setup...");
                await updateTestInSeries({
                    id: testId,
                    seriesId,
                    sections: nextSections,
                });
            }

            const fallbackSectionId =
                defaultSectionId ||
                (importSections[0] ? sectionRefToId.get(normalizeSectionRef(importSections[0].key)) : undefined) ||
                "";
            const startOrder = questions.length;
            for (let i = 0; i < importPreview.length; i++) {
                const q = importPreview[i];
                setImportStatus(`Importing question ${i + 1} of ${importPreview.length}...`);
                setImportProgress({ completed: i, total: importPreview.length });
                const importedSectionId = q.sectionId
                    ? sectionRefToId.get(normalizeSectionRef(q.sectionId)) || q.sectionId
                    : fallbackSectionId || undefined;
                await createQuestion({
                    ...q,
                    seriesId,
                    testId,
                    order: startOrder + i,
                    sectionId: importedSectionId,
                });
                setImportProgress({ completed: i + 1, total: importPreview.length });
            }
            setImportStatus("Refreshing question list...");
            await loadData();
            resetImportState();
            alert(`Successfully imported ${importPreview.length} question${importPreview.length === 1 ? "" : "s"}.`);
        } catch (err: any) {
            console.error("Import failed:", err);
            setImportStatus("Import failed. Check the error message and try again.");
            alert(`Import failed: ${err.message || "Unknown error"}`);
        } finally {
            setImporting(false);
        }
    };

    const handleEditQuestion = (question: Question) => {
        setEditingQuestion({
            id: question.id,
            type: question.type,
            questionText: question.questionText,
            options: question.options?.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) || [],
            correctAnswer: question.correctAnswer || "",
            explanation: question.explanation || "",
            marks: question.marks,
            negativeMarks: question.negativeMarks || 0,
            difficulty: question.difficulty,
            supportedLanguages: question.supportedLanguages || ["python"],
            starters: question.starters || [{ language: "python", code: "# Write your code here\n" }],
            testCases: question.testCases?.map(tc => ({ ...tc, weight: tc.weight ?? 1 })) || [{ id: "", input: "", expectedOutput: "", isHidden: false, weight: 1 }],
            codeScoringMode: question.codeScoringMode || "all_or_nothing",
            timeLimit: question.timeLimit || 2,
            memoryLimit: question.memoryLimit || 128,
            sectionId: question.sectionId || "",
            passageGroup: question.passageGroup || "",
            passage: question.passage || "",
        });
        setShowForm(true);
    };

    const handleDeleteQuestion = async (questionId: string) => {
        if (!confirm("Are you sure you want to delete this question?")) {
            return;
        }

        try {
            await deleteQuestion(seriesId, testId, questionId);
            setQuestions(questions.filter((q) => q.id !== questionId));
        } catch (error: any) {
            console.error("Error deleting question:", error);
            alert(`Failed to delete question: ${error.message || "Unknown error"}`);
        }
    };

    const handleSaveQuestion = async () => {
        if (!editingQuestion) return;

        if (!stripFormattedContent(editingQuestion.questionText)) {
            alert("Question text is required");
            return;
        }

        if (editingQuestion.type === "mcq") {
            const validOptions = editingQuestion.options.filter((o) => stripFormattedContent(o.text));
            if (validOptions.length < 2) {
                alert("MCQ questions need at least 2 options");
                return;
            }
            if (!validOptions.some((o) => o.isCorrect)) {
                alert("Please mark at least one option as correct");
                return;
            }
        } else if (editingQuestion.type === "text_input" && !editingQuestion.correctAnswer.trim()) {
            alert("Correct answer is required for text input questions");
            return;
        } else if (editingQuestion.type === "code") {
            if (editingQuestion.supportedLanguages.length === 0) {
                alert("Please select at least one supported language");
                return;
            }
            const validTestCases = editingQuestion.testCases.filter(
                (tc) => tc.input.trim() || tc.expectedOutput.trim()
            );
            if (validTestCases.length === 0) {
                alert("Please add at least one test case");
                return;
            }
        }

        setSaving(true);
        try {
            const validOptions = editingQuestion.options.filter((o) => stripFormattedContent(o.text));
            const questionData = {
                seriesId,
                testId,
                type: editingQuestion.type,
                questionText: editingQuestion.questionText,
                options: editingQuestion.type === "mcq" ? validOptions : undefined,
                correctAnswer: editingQuestion.type === "text_input" ? editingQuestion.correctAnswer : undefined,
                explanation: editingQuestion.explanation || undefined,
                marks: editingQuestion.marks,
                negativeMarks: editingQuestion.negativeMarks || undefined,
                difficulty: editingQuestion.difficulty,
                order: questions.length,
                sectionId: editingQuestion.sectionId || undefined,
                passageGroup: editingQuestion.passageGroup.trim(),
                passage: editingQuestion.passage,
                supportedLanguages: editingQuestion.type === "code" ? editingQuestion.supportedLanguages : undefined,
                starters: editingQuestion.type === "code" ? editingQuestion.starters : undefined,
                testCases: editingQuestion.type === "code"
                    ? editingQuestion.testCases.filter(tc => tc.input.trim() || tc.expectedOutput.trim()).map(tc => ({
                        ...tc,
                        id: tc.id || crypto.randomUUID(),
                        weight: tc.weight ?? 1,
                    }))
                    : undefined,
                codeScoringMode: editingQuestion.type === "code" ? editingQuestion.codeScoringMode : undefined,
                timeLimit: editingQuestion.type === "code" ? editingQuestion.timeLimit : undefined,
                memoryLimit: editingQuestion.type === "code" ? editingQuestion.memoryLimit : undefined,
            };

            if (editingQuestion.id) {
                await updateQuestion({
                    id: editingQuestion.id,
                    ...questionData,
                } as any);
            } else {
                await createQuestion(questionData as any);
            }

            await loadData();
            setShowForm(false);
            setEditingQuestion(null);
        } catch (error: any) {
            console.error("Error saving question:", error);
            alert(`Failed to save question: ${error.message || "Unknown error"}`);
        } finally {
            setSaving(false);
        }
    };

    const handleOptionChange = (index: number, field: "text" | "isCorrect", value: string | boolean) => {
        if (!editingQuestion) return;

        const newOptions = [...editingQuestion.options];
        newOptions[index] = { ...newOptions[index], [field]: value };

        setEditingQuestion({
            ...editingQuestion,
            options: newOptions,
        });
    };

    const handleAddOption = () => {
        if (!editingQuestion) return;

        setEditingQuestion({
            ...editingQuestion,
            options: [...editingQuestion.options, { text: "", isCorrect: false }],
        });
    };

    const handleRemoveOption = (index: number) => {
        if (!editingQuestion) return;

        const newOptions = editingQuestion.options.filter((_, i) => i !== index);
        setEditingQuestion({
            ...editingQuestion,
            options: newOptions,
        });
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700 mx-auto"></div>
                <p className="mt-4 text-gray-500">Loading questions...</p>
            </div>
        );
    }

    if (!series || !test) {
        return (
            <div className="text-center py-12">
                <h1 className="text-2xl font-bold text-gray-900">Not Found</h1>
                <p className="text-gray-500 mt-2">The test or series you are looking for does not exist.</p>
                <Link href="/teacher/content">
                    <Button className="mt-4">
                        Back to Content
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href={`/teacher/content/tests/${seriesId}/tests`}>
                        <Button variant="outline" size="sm">
                            ← Back to Tests
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{test.title}</h1>
                        <p className="text-gray-500">{series.title} • {questions.length} questions</p>
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
                    />
                    <Button
                        variant="outline"
                        onClick={() => downloadQuestionTemplate()}
                        title="Download a sample Markdown template you can fill in and re-upload"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                            Download Template
                        </span>
                    </Button>
                    <label className="inline-block">
                        <input
                            type="file"
                            accept=".md,text/markdown,text/plain"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImportFile(file);
                                e.target.value = "";
                            }}
                        />
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" /></svg>
                            Import Markdown
                        </span>
                    </label>
                    <Button
                        variant="outline"
                        onClick={() => setBankPickerOpen(true)}
                    >
                        Add from Bank
                    </Button>
                    <Button onClick={handleAddQuestion}>
                        + Add Question
                    </Button>
                </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
                {questions.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-gray-500 mb-4">No questions added to this test yet</p>
                        <Button onClick={handleAddQuestion}>
                            + Add First Question
                        </Button>
                    </Card>
                ) : (
                    questions.map((question, index) => (
                        <Card key={question.id} className="p-6">
                            <div className="flex items-start gap-4">
                                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 font-medium text-primary-700">
                                    {index + 1}
                                </span>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                            {question.type === "mcq" ? "MCQ" : question.type === "code" ? "Code" : "Text Input"}
                                        </span>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {question.marks} marks
                                        </span>
                                        {(question.negativeMarks || 0) > 0 && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                -{question.negativeMarks} neg
                                            </span>
                                        )}
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize bg-green-100 text-green-800">
                                            {question.difficulty}
                                        </span>
                                        {question.sectionId && sectionById.has(question.sectionId) && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-800">
                                                {sectionById.get(question.sectionId)?.title}
                                            </span>
                                        )}
                                        {question.sectionId && sectionById.get(question.sectionId)?.marksPerQuestion !== undefined && (
                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                                {sectionById.get(question.sectionId)?.marksPerQuestion} marks/question
                                            </span>
                                        )}
                                    </div>
                                    <FormattedContent html={question.questionText} className="text-gray-900 font-medium" />
                                    
                                    {question.type === "mcq" && question.options && (
                                        <div className="mt-3 space-y-1">
                                            {question.options.map((option, i) => (
                                                <div
                                                    key={option.id}
                                                    className={`flex items-center gap-2 text-sm ${
                                                        option.isCorrect
                                                            ? "text-green-700 font-medium"
                                                            : "text-gray-600"
                                                    }`}
                                                >
                                                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs">
                                                        {String.fromCharCode(65 + i)}
                                                    </span>
                                                    <FormattedContent html={option.text} as="span" size="sm" />
                                                    {option.isCorrect && (
                                                        <CheckIcon className="h-4 w-4 text-green-600" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {question.type === "text_input" && question.correctAnswer && (
                                        <div className="mt-3 text-sm">
                                            <span className="text-gray-500">Correct Answer: </span>
                                            <span className="text-green-700 font-medium">{question.correctAnswer}</span>
                                        </div>
                                    )}

                                    {question.type === "code" && (
                                        <div className="mt-3 space-y-1 text-sm">
                                            <div className="flex flex-wrap gap-2">
                                                <span className="text-gray-500">Languages:</span>
                                                {question.supportedLanguages?.map((lang) => (
                                                    <span key={lang} className="px-2 py-0.5 bg-primary-50 text-primary-800 rounded text-xs font-medium">
                                                        {lang}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="text-gray-500">
                                                Test Cases: <span className="font-medium text-gray-700">{question.testCases?.length || 0}</span>
                                                {question.testCases && question.testCases.some(tc => tc.isHidden) && (
                                                    <span className="text-gray-400 ml-1">({question.testCases.filter(tc => tc.isHidden).length} hidden)</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {question.explanation && (
                                        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                                            <span className="font-medium">Explanation: </span>
                                            <FormattedContent html={question.explanation} size="sm" className="mt-1" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEditQuestion(question)}
                                    >
                                        <EditIcon className="mr-1 h-4 w-4" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-red-600 hover:bg-red-50 border-red-200"
                                        onClick={() => handleDeleteQuestion(question.id)}
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

            <QuestionBankPicker
                open={bankPickerOpen}
                mode="test"
                onClose={() => setBankPickerOpen(false)}
                onSelect={handleAddFromQuestionBank}
                title="Add Bank Questions to Test"
                teacherId={firebaseUser?.uid || ""}
            />

            {/* Question Form Modal */}
            {showForm && editingQuestion && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">
                                {editingQuestion.id ? "Edit Question" : "Add Question"}
                            </h2>

                            <div className="space-y-4">
                                {/* Question Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Question Type
                                    </label>
                                    <select
                                        value={editingQuestion.type}
                                        onChange={(e) =>
                                            setEditingQuestion({
                                                ...editingQuestion,
                                                type: e.target.value as QuestionType,
                                            })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="mcq">Multiple Choice (MCQ)</option>
                                        <option value="text_input">Text Input</option>
                                        <option value="code">Code / Programming</option>
                                    </select>
                                </div>

                                {testSections.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Section
                                        </label>
                                        <select
                                            value={editingQuestion.sectionId || ""}
                                            onChange={(e) =>
                                                {
                                                    const sectionDefaults = getSectionDefaults(e.target.value);
                                                    setEditingQuestion({
                                                        ...editingQuestion,
                                                        sectionId: e.target.value,
                                                        marks: sectionDefaults.marks ?? editingQuestion.marks,
                                                        negativeMarks: sectionDefaults.negativeMarks ?? editingQuestion.negativeMarks,
                                                    });
                                                }
                                            }
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        >
                                            <option value="">No section</option>
                                            {testSections.map((section) => (
                                                <option key={section.id} value={section.id}>
                                                    {section.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Question Text */}
                                <div>
                                    <RichTextEditor
                                        label="Question Text"
                                        required
                                        value={editingQuestion.questionText}
                                        onChange={(value) =>
                                            setEditingQuestion({
                                                ...editingQuestion,
                                                questionText: value,
                                            })
                                        }
                                        minHeight={220}
                                        helperText="Use headings, lists, tables, formulas, links, images, and code blocks to frame the question clearly."
                                        mediaUploadPath={`tests/${seriesId}/${testId}/questions/question-text`}
                                    />
                                </div>

                                <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                                    <summary className="cursor-pointer text-sm font-bold text-amber-900">
                                        Shared passage or case text (optional)
                                    </summary>
                                    <div className="mt-4 space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Passage group ID
                                            </label>
                                            <input
                                                type="text"
                                                value={editingQuestion.passageGroup}
                                                onChange={(e) =>
                                                    setEditingQuestion({
                                                        ...editingQuestion,
                                                        passageGroup: e.target.value,
                                                    })
                                                }
                                                placeholder="Example: cn-routing-set-1"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                            />
                                        </div>
                                        <RichTextEditor
                                            label="Passage content"
                                            value={editingQuestion.passage}
                                            onChange={(value) =>
                                                setEditingQuestion({
                                                    ...editingQuestion,
                                                    passage: value,
                                                })
                                            }
                                            placeholder="Add a common passage, diagram, table, case study, or video for a group of questions..."
                                            minHeight={170}
                                            helperText="Use the same group ID on related questions. You can place inline images and YouTube videos inside the passage."
                                            mediaUploadPath={`tests/${seriesId}/${testId}/questions/passages`}
                                        />
                                    </div>
                                </details>

                                {/* MCQ Options */}
                                {editingQuestion.type === "mcq" && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Options (mark the correct one)
                                        </label>
                                        <div className="space-y-2">
                                            {editingQuestion.options.map((option, index) => (
                                                <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                                    <div className="mb-2 flex items-center justify-between gap-3">
                                                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                                            <input
                                                                type="radio"
                                                                name="correctOption"
                                                                checked={option.isCorrect}
                                                                onChange={() => {
                                                                    const newOptions = editingQuestion.options.map((o, i) => ({
                                                                        ...o,
                                                                        isCorrect: i === index,
                                                                    }));
                                                                    setEditingQuestion({
                                                                        ...editingQuestion,
                                                                        options: newOptions,
                                                                    });
                                                                }}
                                                                className="w-4 h-4 text-primary-700 border-gray-300 focus:ring-primary-500"
                                                            />
                                                            Option {String.fromCharCode(65 + index)}
                                                            {option.isCorrect && (
                                                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                                                    Correct
                                                                </span>
                                                            )}
                                                        </label>
                                                        {editingQuestion.options.length > 2 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveOption(index)}
                                                                className="rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-800"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                    <RichTextEditor
                                                        value={option.text}
                                                        onChange={(value) => handleOptionChange(index, "text", value)}
                                                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                                                        minHeight={90}
                                                        compact
                                                        enableMedia
                                                        mediaUploadPath={`tests/${seriesId}/${testId}/questions/options`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAddOption}
                                            className="mt-2 text-primary-700 hover:text-primary-900 text-sm font-medium"
                                        >
                                            + Add Option
                                        </button>
                                    </div>
                                )}

                                {/* Text Input Answer */}
                                {editingQuestion.type === "text_input" && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Correct Answer *
                                        </label>
                                        <input
                                            type="text"
                                            value={editingQuestion.correctAnswer}
                                            onChange={(e) =>
                                                setEditingQuestion({
                                                    ...editingQuestion,
                                                    correctAnswer: e.target.value,
                                                })
                                            }
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        />
                                    </div>
                                )}

                                {/* Code Question Fields */}
                                {editingQuestion.type === "code" && (
                                    <div className="space-y-4">
                                        {/* Supported Languages */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Supported Languages *
                                            </label>
                                            <div className="flex flex-wrap gap-3">
                                                {CODE_LANGUAGES.map((lang) => (
                                                    <label key={lang.value} className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                                                        <input
                                                            type="checkbox"
                                                            checked={editingQuestion.supportedLanguages.includes(lang.value)}
                                                            onChange={(e) => {
                                                                const langs = e.target.checked
                                                                    ? [...editingQuestion.supportedLanguages, lang.value]
                                                                    : editingQuestion.supportedLanguages.filter((l) => l !== lang.value);
                                                                const starters = e.target.checked
                                                                    ? [...editingQuestion.starters, { language: lang.value, code: `# ${lang.label} starter code\n` }]
                                                                    : editingQuestion.starters.filter((s) => s.language !== lang.value);
                                                                setEditingQuestion({
                                                                    ...editingQuestion,
                                                                    supportedLanguages: langs,
                                                                    starters,
                                                                });
                                                            }}
                                                            className="w-4 h-4 text-primary-700"
                                                        />
                                                        <span className="text-sm">{lang.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Starter Code per Language */}
                                        {editingQuestion.supportedLanguages.length > 0 && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Starter Code
                                                </label>
                                                <div className="space-y-3">
                                                    {editingQuestion.starters
                                                        .filter((s) => editingQuestion.supportedLanguages.includes(s.language))
                                                        .map((starter) => (
                                                            <div key={starter.language}>
                                                                <span className="text-xs font-bold text-gray-500 uppercase">
                                                                    {CODE_LANGUAGES.find((l) => l.value === starter.language)?.label}
                                                                </span>
                                                                <textarea
                                                                    value={starter.code}
                                                                    onChange={(e) => {
                                                                        const newStarters = editingQuestion.starters.map((s) =>
                                                                            s.language === starter.language
                                                                                ? { ...s, code: e.target.value }
                                                                                : s
                                                                        );
                                                                        setEditingQuestion({
                                                                            ...editingQuestion,
                                                                            starters: newStarters,
                                                                        });
                                                                    }}
                                                                    rows={4}
                                                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                                                />
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Scoring Mode */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Scoring Mode
                                            </label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <label className={`relative flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${editingQuestion.codeScoringMode === 'all_or_nothing' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                                                    <input
                                                        type="radio"
                                                        name="codeScoringMode"
                                                        value="all_or_nothing"
                                                        checked={editingQuestion.codeScoringMode === 'all_or_nothing'}
                                                        onChange={() => setEditingQuestion({ ...editingQuestion, codeScoringMode: 'all_or_nothing' })}
                                                        className="mt-0.5"
                                                    />
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-900">All-or-Nothing</div>
                                                        <div className="text-xs text-gray-500">Full marks only if all test cases pass. Otherwise 0 (or negative marks).</div>
                                                    </div>
                                                </label>
                                                <label className={`relative flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${editingQuestion.codeScoringMode === 'weighted' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                                                    <input
                                                        type="radio"
                                                        name="codeScoringMode"
                                                        value="weighted"
                                                        checked={editingQuestion.codeScoringMode === 'weighted'}
                                                        onChange={() => setEditingQuestion({ ...editingQuestion, codeScoringMode: 'weighted' })}
                                                        className="mt-0.5"
                                                    />
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-900">Weighted (Partial Credit)</div>
                                                        <div className="text-xs text-gray-500">Marks awarded proportionally based on each test case&apos;s weight.</div>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Test Cases */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-sm font-medium text-gray-700">
                                                    Test Cases *
                                                </label>
                                                {editingQuestion.codeScoringMode === 'weighted' && (() => {
                                                    const totalWeight = editingQuestion.testCases.reduce((s, tc) => s + (tc.weight ?? 1), 0);
                                                    return (
                                                        <span className="text-xs text-gray-500">
                                                            Total weight: <span className="font-bold text-gray-700">{totalWeight}</span>
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <div className="space-y-3">
                                                {editingQuestion.testCases.map((tc, idx) => (
                                                    <div key={idx} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-bold text-gray-700">Test Case {idx + 1}</span>
                                                            {editingQuestion.testCases.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newCases = editingQuestion.testCases.filter((_, i) => i !== idx);
                                                                        setEditingQuestion({ ...editingQuestion, testCases: newCases });
                                                                    }}
                                                                    className="text-red-600 hover:text-red-800 text-sm"
                                                                >
                                                                    Remove
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">Input</label>
                                                                <textarea
                                                                    value={tc.input}
                                                                    onChange={(e) => {
                                                                        const newCases = [...editingQuestion.testCases];
                                                                        newCases[idx] = { ...tc, input: e.target.value };
                                                                        setEditingQuestion({ ...editingQuestion, testCases: newCases });
                                                                    }}
                                                                    rows={2}
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 mb-1">Expected Output</label>
                                                                <textarea
                                                                    value={tc.expectedOutput}
                                                                    onChange={(e) => {
                                                                        const newCases = [...editingQuestion.testCases];
                                                                        newCases[idx] = { ...tc, expectedOutput: e.target.value };
                                                                        setEditingQuestion({ ...editingQuestion, testCases: newCases });
                                                                    }}
                                                                    rows={2}
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between flex-wrap gap-3">
                                                            <label className="flex items-center gap-2 text-sm">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={tc.isHidden}
                                                                    onChange={(e) => {
                                                                        const newCases = [...editingQuestion.testCases];
                                                                        newCases[idx] = { ...tc, isHidden: e.target.checked };
                                                                        setEditingQuestion({ ...editingQuestion, testCases: newCases });
                                                                    }}
                                                                    className="w-4 h-4"
                                                                />
                                                                Hidden from student
                                                            </label>
                                                            {editingQuestion.codeScoringMode === 'weighted' && (() => {
                                                                const totalWeight = editingQuestion.testCases.reduce((s, t) => s + (t.weight ?? 1), 0) || 1;
                                                                const w = tc.weight ?? 1;
                                                                const pct = Math.round((w / totalWeight) * 100);
                                                                return (
                                                                    <label className="flex items-center gap-2 text-sm">
                                                                        <span className="text-xs font-medium text-gray-600">Weight</span>
                                                                        <input
                                                                            type="number"
                                                                            value={tc.weight ?? 1}
                                                                            min={0}
                                                                            step={1}
                                                                            onChange={(e) => {
                                                                                const newCases = [...editingQuestion.testCases];
                                                                                newCases[idx] = { ...tc, weight: Math.max(0, parseFloat(e.target.value) || 0) };
                                                                                setEditingQuestion({ ...editingQuestion, testCases: newCases });
                                                                            }}
                                                                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                                                            aria-label={`Weight for test case ${idx + 1}`}
                                                                        />
                                                                        <span className="text-xs text-gray-500">({pct}%)</span>
                                                                    </label>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setEditingQuestion({
                                                        ...editingQuestion,
                                                        testCases: [
                                                            ...editingQuestion.testCases,
                                                            { id: "", input: "", expectedOutput: "", isHidden: false, weight: 1 },
                                                        ],
                                                    })
                                                }
                                                className="mt-2 text-primary-700 hover:text-primary-900 text-sm font-medium"
                                            >
                                                + Add Test Case
                                            </button>
                                        </div>

                                        {/* Time & Memory Limits */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Time Limit (seconds)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={editingQuestion.timeLimit}
                                                    onChange={(e) =>
                                                        setEditingQuestion({
                                                            ...editingQuestion,
                                                            timeLimit: parseFloat(e.target.value) || 1,
                                                        })
                                                    }
                                                    min={1}
                                                    step={0.5}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Memory Limit (MB)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={editingQuestion.memoryLimit}
                                                    onChange={(e) =>
                                                        setEditingQuestion({
                                                            ...editingQuestion,
                                                            memoryLimit: parseFloat(e.target.value) || 64,
                                                        })
                                                    }
                                                    min={16}
                                                    step={16}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Explanation */}
                                <div>
                                    <RichTextEditor
                                        label="Explanation (optional)"
                                        value={editingQuestion.explanation}
                                        onChange={(value) =>
                                            setEditingQuestion({
                                                ...editingQuestion,
                                                explanation: value,
                                            })
                                        }
                                        placeholder="Add solution steps, formulas, or references..."
                                        minHeight={150}
                                        mediaUploadPath={`tests/${seriesId}/${testId}/questions/explanations`}
                                    />
                                </div>

                                {/* Marks & Difficulty */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Marks *
                                        </label>
                                        <input
                                            type="number"
                                            value={editingQuestion.marks}
                                            onChange={(e) =>
                                                setEditingQuestion({
                                                    ...editingQuestion,
                                                    marks: parseFloat(e.target.value) || 0,
                                                })
                                            }
                                            min={0.5}
                                            step={0.5}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Negative Marks
                                        </label>
                                        <input
                                            type="number"
                                            value={editingQuestion.negativeMarks}
                                            onChange={(e) =>
                                                setEditingQuestion({
                                                    ...editingQuestion,
                                                    negativeMarks: parseFloat(e.target.value) || 0,
                                                })
                                            }
                                            min={0}
                                            step={0.25}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Difficulty
                                        </label>
                                        <select
                                            value={editingQuestion.difficulty}
                                            onChange={(e) =>
                                                setEditingQuestion({
                                                    ...editingQuestion,
                                                    difficulty: e.target.value as DifficultyLevel,
                                                })
                                            }
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        >
                                            <option value="easy">Easy</option>
                                            <option value="medium">Medium</option>
                                            <option value="hard">Hard</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t">
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
                                <Button
                                    type="button"
                                    onClick={handleSaveQuestion}
                                    disabled={saving}
                                >
                                    {saving ? "Saving..." : editingQuestion?.id ? "Update" : "Save"}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Markdown Import Preview Modal */}
            {importOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-200 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Import Questions from Markdown</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {importFileName && <span className="font-medium text-gray-700">{importFileName}</span>}
                                    {importFileName && " — "}
                                    Review the parsed results below before importing.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={resetImportState}
                                disabled={importing}
                                className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Close"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {/* Summary */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                                    <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Ready to import</div>
                                    <div className="text-2xl font-bold text-emerald-900 mt-1">{importPreview.length}</div>
                                </div>
                                <div className="p-4 rounded-lg bg-primary-50 border border-primary-200">
                                    <div className="text-xs font-bold text-primary-800 uppercase tracking-wider">Sections</div>
                                    <div className="text-2xl font-bold text-primary-950 mt-1">{importSections.length}</div>
                                </div>
                                <div className={`p-4 rounded-lg border ${importErrors.length ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider ${importErrors.length ? "text-red-700" : "text-gray-500"}`}>Errors</div>
                                    <div className={`text-2xl font-bold mt-1 ${importErrors.length ? "text-red-900" : "text-gray-700"}`}>{importErrors.length}</div>
                                </div>
                            </div>

                            {(importing || importStatus) && (
                                <div className="p-4 rounded-lg bg-primary-50 border border-primary-200" role="status" aria-live="polite">
                                    <div className="flex items-center gap-3">
                                        {importing && (
                                            <span className="h-4 w-4 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" aria-hidden="true" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-bold text-primary-950">
                                                {importStatus || "Preparing import..."}
                                            </div>
                                            {importProgress.total > 0 && (
                                                <div className="text-xs text-primary-800 mt-0.5">
                                                    {importProgress.completed} of {importProgress.total} questions saved
                                                </div>
                                            )}
                                        </div>
                                        {importProgress.total > 0 && (
                                            <div className="text-sm font-bold text-primary-950">
                                                {importProgressPercent}%
                                            </div>
                                        )}
                                    </div>
                                    {importProgress.total > 0 && (
                                        <div className="mt-3 h-2 rounded-full bg-white overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary-600 transition-all duration-300"
                                                style={{ width: `${importProgressPercent}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {importSections.length > 0 && (
                                <div className="p-4 rounded-lg bg-primary-50 border border-primary-200">
                                    <h3 className="text-sm font-bold text-primary-950 mb-2">Sections to create or reuse</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {importSections.map((section) => (
                                            <span key={section.key} className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-800 border border-primary-100">
                                                {section.title}
                                                {section.marksPerQuestion !== undefined ? ` · ${section.marksPerQuestion} marks/Q` : ""}
                                                {section.negativeMarks !== undefined ? ` · -${section.negativeMarks}` : ""}
                                                {section.cutoffMarks !== undefined ? ` · cutoff ${section.cutoffMarks}` : ""}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Errors */}
                            {importErrors.length > 0 && (
                                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                                    <h3 className="text-sm font-bold text-red-900 mb-2">Issues found</h3>
                                    <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                                        {importErrors.map((err, i) => (
                                            <li key={i}>
                                                <span className="font-mono text-xs bg-red-100 px-1.5 py-0.5 rounded">line {err.line}</span> {err.message}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Preview list */}
                            {importPreview.length > 0 ? (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-bold text-gray-900">Preview</h3>
                                    {importPreview.map((q, idx) => (
                                        <div key={idx} className="p-3 rounded-lg border border-gray-200 bg-white">
                                            <div className="flex items-center justify-between gap-3 mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-800 text-xs font-bold">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-800">
                                                        {q.type === "code" ? "Code" : "MCQ"}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {q.marks} mark{q.marks === 1 ? "" : "s"} · {q.difficulty || "medium"}
                                                        {q.sectionId ? ` · ${q.sectionId}` : ""}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-400">
                                                    {q.type === "mcq"
                                                        ? `${q.options?.length || 0} options`
                                                        : `${q.testCases?.length || 0} test cases · ${q.supportedLanguages?.join(", ") || "—"}`}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-700 line-clamp-2">{stripFormattedContent(q.questionText)}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : importErrors.length === 0 ? (
                                <div className="p-6 text-center text-gray-500 text-sm">
                                    No questions parsed from the file.
                                </div>
                            ) : null}
                        </div>

                        <div className="p-6 border-t border-gray-200 flex items-center justify-between gap-3">
                            <div className="text-xs text-gray-500">
                                Imported questions will be appended after existing questions ({questions.length} currently).
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={resetImportState}
                                    disabled={importing}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleConfirmImport}
                                    disabled={importing || importPreview.length === 0}
                                >
                                    {importing ? "Importing..." : `Import ${importPreview.length} question${importPreview.length === 1 ? "" : "s"}`}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
