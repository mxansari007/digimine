"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, DataTable, PaginationControls, getPaginatedItems, stripFormattedContent, type DataTableColumn } from "@digimine/ui";
import { RichTextEditor, NumberInput } from "@digimine/shared";
import { useAuthContext } from "@/contexts/AuthContext";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";
import { MobileAuthoringNotice } from "@/components/teacher/MobileAuthoringNotice";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import {
    AiQuestionGenerator,
    LockedFeatureButton,
    type GeneratedQuestionDraft,
} from "@/components/teacher/AiQuestionGenerator";
import {
    createTeacherQuestionBankQuestion,
    deleteTeacherQuestionBankQuestion,
    getTeacherQuestionBankQuestions,
    updateTeacherQuestionBankQuestion,
} from "@/lib/firestore/questionBank";
import { downloadQuestionTemplate, parseQuestionsMarkdown, type ParseError, type ParsedSection } from "@/lib/import/markdownQuestions";
import type {
    CodeLanguage,
    CodeScoringMode,
    CodeStarter,
    CodeTestCase,
    CreateQuestionBankQuestionInput,
    CreateQuestionInput,
    DifficultyLevel,
    QuestionBankQuestion,
    QuestionType,
    TestStatus,
} from "@digimine/types";

const CODE_LANGUAGES: { value: CodeLanguage; label: string }[] = [
    { value: "python", label: "Python" },
    { value: "javascript", label: "JavaScript" },
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
];

interface QuestionBankFormData {
    id?: string;
    title: string;
    type: QuestionType;
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
    correctAnswer: string;
    explanation: string;
    marks: number;
    negativeMarks: number;
    difficulty: DifficultyLevel;
    topic: string;
    category: string;
    subcategory: string;
    tags: string;
    status: TestStatus;
    supportedLanguages: CodeLanguage[];
    starters: CodeStarter[];
    testCases: CodeTestCase[];
    codeScoringMode: CodeScoringMode;
    timeLimit: number;
    memoryLimit: number;
    passageGroup: string;
    passage: string;
}

function initialQuestion(): QuestionBankFormData {
    return {
        title: "",
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
        topic: "",
        category: "",
        subcategory: "",
        tags: "",
        status: "published",
        supportedLanguages: ["python"],
        starters: [{ language: "python", code: "# Write your code here\n" }],
        testCases: [{ id: "", input: "", expectedOutput: "", isHidden: false, weight: 1 }],
        codeScoringMode: "all_or_nothing",
        timeLimit: 2,
        memoryLimit: 128,
        passageGroup: "",
        passage: "",
    };
}

function splitTags(value: string) {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function optionLabel(value: string) {
    return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toFormQuestionType(type: QuestionBankQuestion["type"]): QuestionType {
    if (type === "code" || type === "coding") return "code";
    if (type === "mcq" || type === "msq" || type === "true_false" || type === "aptitude") return "mcq";
    return "text_input";
}

function normalizeImportRef(value: string | undefined): string {
    return (value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function createImportedTitle(question: CreateQuestionInput, index: number) {
    const text = stripFormattedContent(question.questionText).replace(/\s+/g, " ").trim();
    if (!text) return `Imported Question ${index + 1}`;
    return text.length > 84 ? `${text.slice(0, 81)}...` : text;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error";
}

function statusBadge(status: TestStatus) {
    const styles = {
        draft: "bg-slate-100 text-slate-700",
        published: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        archived: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${styles[status]}`}>{status}</span>;
}

export default function TeacherQuestionBankPage() {
    const { firebaseUser } = useAuthContext();
    const teacherId = firebaseUser?.uid || "";
    const teaching = useTeachingFeatures();

    /**
     * AI-draft → CreateQuestionBankQuestionInput adapter. Caller is the
     * AiQuestionGenerator modal. We construct sensible defaults for the
     * fields the AI draft doesn't carry (title from questionText,
     * topic/category from the modal's form context).
     */
    const handleAiSave = async (
        q: GeneratedQuestionDraft,
        ctx: { topic: string; subject: string; difficulty: string; type: string }
    ) => {
        if (!teacherId) throw new Error("Sign in to save");
        const truncatedTitle =
            q.questionText.length > 80
                ? q.questionText.slice(0, 77) + "…"
                : q.questionText;
        // Map the AI's "moderate" to the existing field's "medium".
        const difficulty: DifficultyLevel =
            q.difficulty === "easy" ? "easy" : q.difficulty === "hard" ? "hard" : "medium";
        const payload: CreateQuestionBankQuestionInput = {
            title: truncatedTitle,
            type: q.type,
            questionText: q.questionText,
            options:
                q.type === "mcq"
                    ? q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
                    : undefined,
            correctAnswer:
                q.type === "text_input"
                    ? q.correctAnswer ?? ""
                    : undefined,
            explanation: q.explanation,
            marks: q.marks,
            negativeMarks: 0,
            difficulty,
            topic: ctx.topic || "AI generated",
            category: ctx.subject || ctx.topic || "AI generated",
            subcategory: undefined,
            tags: ["ai-generated"],
            status: "draft",
        } as CreateQuestionBankQuestionInput;
        await createTeacherQuestionBankQuestion(teacherId, payload);
        // Refresh the page's question list so the new entry appears.
        await loadQuestions();
    };
    const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<QuestionBankFormData | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
    const [difficultyFilter, setDifficultyFilter] = useState<DifficultyLevel | "all">("all");
    const [statusFilter, setStatusFilter] = useState<TestStatus | "all">("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [topicFilter, setTopicFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [importOpen, setImportOpen] = useState(false);
    const [importPreview, setImportPreview] = useState<CreateQuestionInput[]>([]);
    const [importSections, setImportSections] = useState<ParsedSection[]>([]);
    const [importErrors, setImportErrors] = useState<ParseError[]>([]);
    const [importFileName, setImportFileName] = useState("");
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState("");
    const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 });
    const [importDefaults, setImportDefaults] = useState({
        category: "",
        topic: "",
        subcategory: "",
        tags: "",
        status: "published" as TestStatus,
    });

    const importProgressPercent = importProgress.total > 0
        ? Math.round((importProgress.completed / importProgress.total) * 100)
        : 0;

    useEffect(() => {
        loadQuestions();
    }, [teacherId]);

    async function loadQuestions() {
        setLoading(true);
        try {
            if (!teacherId) {
                setQuestions([]);
                return;
            }
            setQuestions(await getTeacherQuestionBankQuestions(teacherId, { includeCode: true, status: "all" }));
        } catch (error) {
            console.error("Failed to load question bank:", error);
        } finally {
            setLoading(false);
        }
    }

    const resetImportState = () => {
        setImportOpen(false);
        setImportPreview([]);
        setImportSections([]);
        setImportErrors([]);
        setImportFileName("");
        setImporting(false);
        setImportStatus("");
        setImportProgress({ completed: 0, total: 0 });
        setImportDefaults({
            category: categoryFilter !== "all" ? categoryFilter : "",
            topic: topicFilter !== "all" ? topicFilter : "",
            subcategory: "",
            tags: "",
            status: "published",
        });
    };

    const getImportedSectionTitle = (sectionId: string | undefined) => {
        if (!sectionId) return "";
        const ref = normalizeImportRef(sectionId);
        const section = importSections.find((item) =>
            [item.id, item.key, item.title]
                .filter(Boolean)
                .map((value) => normalizeImportRef(String(value)))
                .includes(ref)
        );
        return section?.title || sectionId;
    };

    const handleImportFile = async (file: File) => {
        setImportFileName(file.name);
        setImportStatus("Reading markdown file...");
        setImportProgress({ completed: 0, total: 0 });
        setImportDefaults({
            category: categoryFilter !== "all" ? categoryFilter : "",
            topic: topicFilter !== "all" ? topicFilter : "",
            subcategory: "",
            tags: "",
            status: "published",
        });

        try {
            const text = await file.text();
            const result = parseQuestionsMarkdown(text);
            setImportPreview(result.questions);
            setImportSections(result.sections);
            setImportErrors(result.errors);
            setImportStatus(result.errors.length > 0 ? "Review parser issues before importing." : "Preview ready.");
            setImportOpen(true);
        } catch (error) {
            console.error("Failed to parse question bank markdown:", error);
            alert(`Failed to read markdown file: ${getErrorMessage(error)}`);
            setImportStatus("");
        }
    };

    const buildImportedQuestionPayload = (
        question: CreateQuestionInput,
        index: number
    ): CreateQuestionBankQuestionInput => {
        const topic = getImportedSectionTitle(question.sectionId) || importDefaults.topic.trim() || "General";
        return {
            title: createImportedTitle(question, index),
            type: question.type,
            questionText: question.questionText,
            options: question.type === "mcq" ? question.options : undefined,
            correctAnswer: question.type === "text_input" ? question.correctAnswer?.trim() : undefined,
            explanation: question.explanation || undefined,
            marks: question.marks,
            negativeMarks: question.negativeMarks || undefined,
            difficulty: question.difficulty || "medium",
            topic,
            category: importDefaults.category.trim(),
            subcategory: importDefaults.subcategory.trim() || undefined,
            tags: splitTags(importDefaults.tags),
            status: importDefaults.status,
            supportedLanguages: question.type === "code" ? question.supportedLanguages : undefined,
            starters: question.type === "code" ? question.starters : undefined,
            testCases: question.type === "code" ? question.testCases : undefined,
            codeScoringMode: question.type === "code" ? question.codeScoringMode : undefined,
            timeLimit: question.type === "code" ? question.timeLimit : undefined,
            memoryLimit: question.type === "code" ? question.memoryLimit : undefined,
            passageGroup: question.passageGroup || undefined,
            passage: question.passage || undefined,
        };
    };

    const handleConfirmImport = async () => {
        if (!teacherId || importPreview.length === 0 || importing) return;
        if (importErrors.length > 0) {
            alert("Fix the markdown parser errors before importing.");
            return;
        }
        if (!importDefaults.category.trim()) {
            alert("Category is required before importing into the question bank.");
            return;
        }

        setImporting(true);
        setImportStatus("Preparing question bank import...");
        setImportProgress({ completed: 0, total: importPreview.length });
        try {
            for (let index = 0; index < importPreview.length; index++) {
                setImportStatus(`Importing question ${index + 1} of ${importPreview.length}...`);
                setImportProgress({ completed: index, total: importPreview.length });
                await createTeacherQuestionBankQuestion(teacherId, buildImportedQuestionPayload(importPreview[index], index));
                setImportProgress({ completed: index + 1, total: importPreview.length });
            }
            setImportStatus("Refreshing question bank...");
            await loadQuestions();
            resetImportState();
            alert(`Imported ${importPreview.length} question${importPreview.length === 1 ? "" : "s"} into the question bank.`);
        } catch (error) {
            console.error("Question bank import failed:", error);
            setImportStatus("Import failed. Fix the issue and retry.");
            alert(`Import failed: ${getErrorMessage(error)}`);
        } finally {
            setImporting(false);
        }
    };

    const categories = useMemo(
        () => Array.from(new Set(questions.map((question) => question.category).filter(Boolean))).sort(),
        [questions]
    );
    const topics = useMemo(
        () => Array.from(new Set(questions.map((question) => question.topic).filter(Boolean))).sort(),
        [questions]
    );

    const filteredQuestions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return questions
            .filter((question) => typeFilter === "all" || toFormQuestionType(question.type) === typeFilter)
            .filter((question) => difficultyFilter === "all" || question.difficulty === difficultyFilter)
            .filter((question) => statusFilter === "all" || question.status === statusFilter)
            .filter((question) => categoryFilter === "all" || question.category === categoryFilter)
            .filter((question) => topicFilter === "all" || question.topic === topicFilter)
            .filter((question) => {
                if (!q) return true;
                const haystack = [
                    question.title,
                    question.topic,
                    question.category,
                    question.subcategory || "",
                    question.tags.join(" "),
                    stripFormattedContent(question.questionText),
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            });
    }, [categoryFilter, difficultyFilter, questions, searchQuery, statusFilter, topicFilter, typeFilter]);

    const paginatedQuestions = getPaginatedItems(filteredQuestions, page, pageSize);

    useEffect(() => {
        setPage(1);
    }, [filteredQuestions.length, pageSize]);

    const handleAddQuestion = () => {
        setEditingQuestion(initialQuestion());
        setShowForm(true);
    };

    const handleEditQuestion = (question: QuestionBankQuestion) => {
        setEditingQuestion({
            id: question.id,
            title: question.title,
            type: toFormQuestionType(question.type),
            questionText: question.questionText,
            options: question.options?.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) || [],
            correctAnswer: question.correctAnswer || "",
            explanation: question.explanation || "",
            marks: question.marks,
            negativeMarks: question.negativeMarks || 0,
            difficulty: question.difficulty,
            topic: question.topic,
            category: question.category,
            subcategory: question.subcategory || "",
            tags: question.tags.join(", "),
            status: question.status,
            supportedLanguages: question.supportedLanguages || ["python"],
            starters: question.starters || [{ language: "python", code: "# Write your code here\n" }],
            testCases: question.testCases?.map((testCase) => ({ ...testCase, weight: testCase.weight ?? 1 })) || [{ id: "", input: "", expectedOutput: "", isHidden: false, weight: 1 }],
            codeScoringMode: question.codeScoringMode || "all_or_nothing",
            timeLimit: question.timeLimit || 2,
            memoryLimit: question.memoryLimit || 128,
            passageGroup: question.passageGroup || "",
            passage: question.passage || "",
        });
        setShowForm(true);
    };

    const validateQuestion = () => {
        if (!editingQuestion) return "Question data is missing.";
        if (!editingQuestion.title.trim()) return "Title is required.";
        if (!editingQuestion.category.trim()) return "Category is required.";
        if (!editingQuestion.topic.trim()) return "Topic is required.";
        if (!stripFormattedContent(editingQuestion.questionText)) return "Question text is required.";
        if (editingQuestion.type === "mcq") {
            const validOptions = editingQuestion.options.filter((option) => stripFormattedContent(option.text));
            if (validOptions.length < 2) return "MCQ questions need at least 2 options.";
            if (!validOptions.some((option) => option.isCorrect)) return "Please mark at least one option as correct.";
        }
        if (editingQuestion.type === "text_input" && !editingQuestion.correctAnswer.trim()) {
            return "Correct answer is required for text input questions.";
        }
        if (editingQuestion.type === "code") {
            if (editingQuestion.supportedLanguages.length === 0) return "Select at least one supported language.";
            if (!editingQuestion.testCases.some((testCase) => testCase.input.trim() || testCase.expectedOutput.trim())) {
                return "Add at least one code test case.";
            }
        }
        return null;
    };

    const handleSaveQuestion = async () => {
        if (!editingQuestion || !teacherId) return;
        const validationError = validateQuestion();
        if (validationError) {
            alert(validationError);
            return;
        }

        setSaving(true);
        try {
            const validOptions = editingQuestion.options.filter((option) => stripFormattedContent(option.text));
            const payload = {
                title: editingQuestion.title.trim(),
                type: editingQuestion.type,
                questionText: editingQuestion.questionText,
                options: editingQuestion.type === "mcq" ? validOptions : undefined,
                correctAnswer: editingQuestion.type === "text_input" ? editingQuestion.correctAnswer.trim() : undefined,
                explanation: editingQuestion.explanation || undefined,
                marks: editingQuestion.marks,
                negativeMarks: editingQuestion.negativeMarks || undefined,
                difficulty: editingQuestion.difficulty,
                topic: editingQuestion.topic.trim(),
                category: editingQuestion.category.trim(),
                subcategory: editingQuestion.subcategory.trim() || undefined,
                tags: splitTags(editingQuestion.tags),
                status: editingQuestion.status,
                supportedLanguages: editingQuestion.type === "code" ? editingQuestion.supportedLanguages : undefined,
                starters: editingQuestion.type === "code" ? editingQuestion.starters : undefined,
                testCases: editingQuestion.type === "code"
                    ? editingQuestion.testCases
                        .filter((testCase) => testCase.input.trim() || testCase.expectedOutput.trim())
                        .map((testCase) => ({ ...testCase, id: testCase.id || crypto.randomUUID(), weight: testCase.weight ?? 1 }))
                    : undefined,
                codeScoringMode: editingQuestion.type === "code" ? editingQuestion.codeScoringMode : undefined,
                timeLimit: editingQuestion.type === "code" ? editingQuestion.timeLimit : undefined,
                memoryLimit: editingQuestion.type === "code" ? editingQuestion.memoryLimit : undefined,
                passageGroup: editingQuestion.passageGroup.trim() || undefined,
                passage: editingQuestion.passage || undefined,
            };

            if (editingQuestion.id) {
                await updateTeacherQuestionBankQuestion(teacherId, { id: editingQuestion.id, ...payload });
            } else {
                await createTeacherQuestionBankQuestion(teacherId, payload);
            }

            await loadQuestions();
            setShowForm(false);
            setEditingQuestion(null);
        } catch (error) {
            console.error("Failed to save question:", error);
            alert("Failed to save question.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteQuestion = async (question: QuestionBankQuestion) => {
        if (!confirm(`Delete "${question.title}" from the question bank?`)) return;
        try {
            await deleteTeacherQuestionBankQuestion(teacherId, question.id);
            setQuestions((current) => current.filter((item) => item.id !== question.id));
        } catch (error) {
            console.error("Failed to delete bank question:", error);
            alert("Failed to delete question.");
        }
    };

    const updateOption = (index: number, patch: Partial<{ text: string; isCorrect: boolean }>) => {
        if (!editingQuestion) return;
        const nextOptions = [...editingQuestion.options];
        nextOptions[index] = { ...nextOptions[index], ...patch };
        setEditingQuestion({ ...editingQuestion, options: nextOptions });
    };

    const columns: DataTableColumn<QuestionBankQuestion>[] = [
        {
            key: "question",
            header: "Question",
            render: (question) => (
                <div className="min-w-[260px]">
                    <div className="font-bold text-slate-950">{question.title}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{stripFormattedContent(question.questionText)}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{question.category}</span>
                        <span>/</span>
                        <span>{question.topic}</span>
                        {question.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5">#{tag}</span>)}
                    </div>
                </div>
            ),
        },
        {
            key: "type",
            header: "Type",
            render: (question) => <span className="font-semibold text-slate-700">{optionLabel(question.type)}</span>,
        },
        {
            key: "meta",
            header: "Marks",
            render: (question) => (
                <div>
                    <div className="font-black text-slate-950">{question.marks}</div>
                    <div className="text-xs text-slate-400">{question.negativeMarks ? `-${question.negativeMarks}` : "No negative"}</div>
                </div>
            ),
        },
        {
            key: "difficulty",
            header: "Difficulty",
            render: (question) => <span className="capitalize text-slate-700">{question.difficulty}</span>,
        },
        {
            key: "usage",
            header: "Used",
            render: (question) => <span className="font-bold text-slate-900">{question.usageCount || 0}</span>,
        },
        {
            key: "status",
            header: "Status",
            render: (question) => statusBadge(question.status),
        },
        {
            key: "actions",
            header: "",
            className: "text-right",
            render: (question) => (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditQuestion(question)}>Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteQuestion(question)}>Delete</Button>
                </div>
            ),
        },
    ];

    const importCanSubmit =
        importPreview.length > 0 &&
        importErrors.length === 0 &&
        Boolean(importDefaults.category.trim()) &&
        !importing;

    return (
        <div className="space-y-6">
            <MobileAuthoringNotice what="Managing the question bank" />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-slate-950">Question Bank</h1>
                        <HelpTutorial {...TUTORIALS.teacher_question_bank} />
                    </div>
                    <p className="mt-1 text-slate-500">Store reusable questions for future tests, quizzes, and contests.</p>
                </div>
                <div className="flex flex-wrap gap-2">
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
                    <LockedFeatureButton
                        locked={!teaching.has("question_bank_template_download")}
                        upgradeHref={teaching.upgradeHref}
                        tooltipWhenLocked="Question template download is included on paid plans."
                        onClick={() => downloadQuestionTemplate("question-bank-template.md")}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2 text-base font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-primary-200 hover:bg-white hover:text-primary-700"
                    >
                        Download Template
                    </LockedFeatureButton>
                    {teaching.has("question_bank_markdown_import") ? (
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2 text-base font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-primary-200 hover:bg-white hover:text-primary-700 hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
                            <input
                                type="file"
                                accept=".md,.markdown,text/markdown,text/plain"
                                className="hidden"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) handleImportFile(file);
                                    event.target.value = "";
                                }}
                            />
                            Upload Markdown
                        </label>
                    ) : (
                        <LockedFeatureButton
                            locked
                            upgradeHref={teaching.upgradeHref}
                            tooltipWhenLocked="Markdown import is included on paid plans."
                        >
                            Upload Markdown
                        </LockedFeatureButton>
                    )}
                    <Button onClick={handleAddQuestion}>Create Question</Button>
                </div>
            </div>

            <div className="admin-panel p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_repeat(5,150px)]">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search by question, topic, tag..."
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                    <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as QuestionType | "all")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="all">All types</option>
                        <option value="mcq">MCQ</option>
                        <option value="text_input">Text input</option>
                        <option value="code">Code</option>
                    </select>
                    <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as DifficultyLevel | "all")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="all">All levels</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                    </select>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TestStatus | "all")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="all">All status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                    </select>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="all">All categories</option>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="all">All topics</option>
                        {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                    </select>
                </div>
            </div>

            <DataTable
                data={paginatedQuestions}
                isLoading={loading}
                keyExtractor={(question) => question.id}
                emptyState="No question bank items found."
                columns={columns}
                footer={
                    <PaginationControls
                        page={page}
                        pageSize={pageSize}
                        totalItems={filteredQuestions.length}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        pageSizeOptions={[10, 20, 50]}
                        itemLabel="questions"
                    />
                }
            />

            {importOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
                        <div className="space-y-5 p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-950">Import Markdown to Question Bank</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        {importFileName || "Markdown file"} parsed into {importPreview.length} reusable question{importPreview.length === 1 ? "" : "s"}.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={importing}
                                    onClick={resetImportState}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Close
                                </button>
                            </div>

                            {importStatus && (
                                <div className="rounded-2xl border border-primary-100 dark:border-primary-500/25 bg-primary-50 dark:bg-primary-500/10 p-4">
                                    <div className="flex items-center justify-between gap-4 text-sm font-semibold text-primary-800 dark:text-primary-300">
                                        <span>{importStatus}</span>
                                        {importProgress.total > 0 && <span>{importProgress.completed}/{importProgress.total}</span>}
                                    </div>
                                    {importProgress.total > 0 && (
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                                            <div
                                                className="h-full rounded-full bg-primary-500 transition-all duration-300"
                                                style={{ width: `${importProgressPercent}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {importErrors.length > 0 && (
                                <div className="rounded-2xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-4">
                                    <h3 className="font-bold text-red-800 dark:text-red-300">Fix these parser issues before importing</h3>
                                    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm text-red-700 dark:text-red-300">
                                        {importErrors.map((error, index) => (
                                            <div key={`${error.line}-${index}`} className="rounded-lg bg-white/70 px-3 py-2">
                                                Line {error.line}: {error.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-4 md:grid-cols-5">
                                <label className="space-y-1 md:col-span-2">
                                    <span className="text-sm font-semibold text-slate-700">Category</span>
                                    <input
                                        value={importDefaults.category}
                                        onChange={(event) => setImportDefaults({ ...importDefaults, category: event.target.value })}
                                        placeholder="Computer Networks, Aptitude..."
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                    <span className="text-sm font-semibold text-slate-700">Fallback topic</span>
                                    <input
                                        value={importDefaults.topic}
                                        onChange={(event) => setImportDefaults({ ...importDefaults, topic: event.target.value })}
                                        placeholder="Used when no markdown section exists"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Status</span>
                                    <select
                                        value={importDefaults.status}
                                        onChange={(event) => setImportDefaults({ ...importDefaults, status: event.target.value as TestStatus })}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    >
                                        <option value="published">Published</option>
                                        <option value="draft">Draft</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                    <span className="text-sm font-semibold text-slate-700">Subcategory</span>
                                    <input
                                        value={importDefaults.subcategory}
                                        onChange={(event) => setImportDefaults({ ...importDefaults, subcategory: event.target.value })}
                                        placeholder="Optional"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </label>
                                <label className="space-y-1 md:col-span-3">
                                    <span className="text-sm font-semibold text-slate-700">Tags</span>
                                    <input
                                        value={importDefaults.tags}
                                        onChange={(event) => setImportDefaults({ ...importDefaults, tags: event.target.value })}
                                        placeholder="Comma-separated tags applied to all imported questions"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                                    />
                                </label>
                            </div>

                            {importSections.length > 0 && (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <h3 className="font-bold text-slate-900">Markdown sections become topics</h3>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {importSections.map((section) => (
                                            <span key={section.key} className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm">
                                                {section.title}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-2xl border border-slate-200">
                                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                    <h3 className="font-bold text-slate-950">Preview</h3>
                                    <span className="text-sm font-semibold text-slate-500">{importPreview.length} question{importPreview.length === 1 ? "" : "s"}</span>
                                </div>
                                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                                    {importPreview.length === 0 ? (
                                        <p className="px-4 py-8 text-center text-sm text-slate-500">No valid questions were parsed from this file.</p>
                                    ) : importPreview.map((question, index) => (
                                        <div key={`${question.type}-${index}`} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[56px_1fr_180px] md:items-center">
                                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-500/10 font-black text-primary-700 dark:text-primary-300">{index + 1}</span>
                                            <div>
                                                <div className="font-bold text-slate-950">{createImportedTitle(question, index)}</div>
                                                <p className="mt-1 line-clamp-1 text-slate-500">{stripFormattedContent(question.questionText)}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 md:justify-end">
                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{optionLabel(question.type)}</span>
                                                <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                                    {getImportedSectionTitle(question.sectionId) || importDefaults.topic.trim() || "General"}
                                                </span>
                                                <span className="rounded-full bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">{question.marks} marks</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <Button type="button" variant="outline" disabled={importing} onClick={resetImportState}>Cancel</Button>
                                <Button type="button" isLoading={importing} disabled={!importCanSubmit} onClick={handleConfirmImport}>
                                    Import {importPreview.length} Question{importPreview.length === 1 ? "" : "s"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showForm && editingQuestion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
                        <div className="space-y-5 p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-950">{editingQuestion.id ? "Edit Question" : "Create Question"}</h2>
                                    <p className="mt-1 text-sm text-slate-500">Reusable question metadata controls filtering during test, quiz, and contest creation.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        setEditingQuestion(null);
                                    }}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:border-slate-300 hover:text-slate-900"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Title</span>
                                    <input value={editingQuestion.title} onChange={(event) => setEditingQuestion({ ...editingQuestion, title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Type</span>
                                    <select value={editingQuestion.type} onChange={(event) => setEditingQuestion({ ...editingQuestion, type: event.target.value as QuestionType })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none">
                                        <option value="mcq">Multiple Choice</option>
                                        <option value="text_input">Text Input</option>
                                        <option value="code">Code</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Category</span>
                                    <input value={editingQuestion.category} onChange={(event) => setEditingQuestion({ ...editingQuestion, category: event.target.value })} placeholder="Computer Networks, Aptitude..." className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Topic</span>
                                    <input value={editingQuestion.topic} onChange={(event) => setEditingQuestion({ ...editingQuestion, topic: event.target.value })} placeholder="OSI Model, Probability..." className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Subcategory</span>
                                    <input value={editingQuestion.subcategory} onChange={(event) => setEditingQuestion({ ...editingQuestion, subcategory: event.target.value })} placeholder="Optional" className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Tags</span>
                                    <input value={editingQuestion.tags} onChange={(event) => setEditingQuestion({ ...editingQuestion, tags: event.target.value })} placeholder="tcp-ip, infosys, easy" className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                            </div>

                            <RichTextEditor
                                label="Question Text"
                                required
                                value={editingQuestion.questionText}
                                onChange={(questionText) => setEditingQuestion({ ...editingQuestion, questionText })}
                                minHeight={220}
                                helperText="Use rich text, images, videos, tables, formulas, code snippets, and media wrapping."
                                mediaUploadPath={`question-bank/${editingQuestion.id || "draft"}/question-text`}
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
                                        mediaUploadPath={`question-bank/${editingQuestion.id || "draft"}/passages`}
                                    />
                                </div>
                            </details>

                            {editingQuestion.type === "mcq" && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="block text-sm font-semibold text-slate-700">Options</label>
                                        <button type="button" onClick={() => setEditingQuestion({ ...editingQuestion, options: [...editingQuestion.options, { text: "", isCorrect: false }] })} className="text-sm font-semibold text-primary-600">
                                            Add option
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {editingQuestion.options.map((option, index) => (
                                            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={option.isCorrect}
                                                            onChange={(event) => updateOption(index, { isCorrect: event.target.checked })}
                                                            className="h-4 w-4 text-primary-600"
                                                        />
                                                        Option {String.fromCharCode(65 + index)}
                                                    </label>
                                                    {editingQuestion.options.length > 2 && (
                                                        <button type="button" onClick={() => setEditingQuestion({ ...editingQuestion, options: editingQuestion.options.filter((_, optionIndex) => optionIndex !== index) })} className="text-sm font-semibold text-red-600">
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
                                                    mediaUploadPath={`question-bank/${editingQuestion.id || "draft"}/options`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {editingQuestion.type === "text_input" && (
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Correct answer</span>
                                    <input value={editingQuestion.correctAnswer} onChange={(event) => setEditingQuestion({ ...editingQuestion, correctAnswer: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                            )}

                            {editingQuestion.type === "code" && (
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-semibold text-slate-700">Supported languages</label>
                                        <div className="flex flex-wrap gap-2">
                                            {CODE_LANGUAGES.map((language) => (
                                                <label key={language.value} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingQuestion.supportedLanguages.includes(language.value)}
                                                        onChange={(event) => {
                                                            const nextLanguages = event.target.checked
                                                                ? [...editingQuestion.supportedLanguages, language.value]
                                                                : editingQuestion.supportedLanguages.filter((item) => item !== language.value);
                                                            const nextStarters = event.target.checked
                                                                ? [...editingQuestion.starters, { language: language.value, code: `// ${language.label} starter code\n` }]
                                                                : editingQuestion.starters.filter((starter) => starter.language !== language.value);
                                                            setEditingQuestion({ ...editingQuestion, supportedLanguages: nextLanguages, starters: nextStarters });
                                                        }}
                                                    />
                                                    {language.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    {editingQuestion.starters
                                        .filter((starter) => editingQuestion.supportedLanguages.includes(starter.language))
                                        .map((starter) => (
                                            <label key={starter.language} className="block space-y-1">
                                                <span className="text-sm font-semibold text-slate-700">{optionLabel(starter.language)} starter</span>
                                                <textarea
                                                    value={starter.code}
                                                    onChange={(event) => setEditingQuestion({
                                                        ...editingQuestion,
                                                        starters: editingQuestion.starters.map((item) => item.language === starter.language ? { ...item, code: event.target.value } : item),
                                                    })}
                                                    rows={4}
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none"
                                                />
                                            </label>
                                        ))}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <label className="text-sm font-semibold text-slate-700">Test cases</label>
                                            <button
                                                type="button"
                                                onClick={() => setEditingQuestion({ ...editingQuestion, testCases: [...editingQuestion.testCases, { id: "", input: "", expectedOutput: "", isHidden: false, weight: 1 }] })}
                                                className="text-sm font-semibold text-primary-600"
                                            >
                                                Add test case
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {editingQuestion.testCases.map((testCase, index) => (
                                                <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
                                                    <div className="mb-2 flex items-center justify-between">
                                                        <span className="text-sm font-bold text-slate-700">Case {index + 1}</span>
                                                        {editingQuestion.testCases.length > 1 && (
                                                            <button type="button" onClick={() => setEditingQuestion({ ...editingQuestion, testCases: editingQuestion.testCases.filter((_, itemIndex) => itemIndex !== index) })} className="text-sm font-semibold text-red-600">Remove</button>
                                                        )}
                                                    </div>
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <textarea value={testCase.input} onChange={(event) => setEditingQuestion({ ...editingQuestion, testCases: editingQuestion.testCases.map((item, itemIndex) => itemIndex === index ? { ...item, input: event.target.value } : item) })} placeholder="Input" rows={3} className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none" />
                                                        <textarea value={testCase.expectedOutput} onChange={(event) => setEditingQuestion({ ...editingQuestion, testCases: editingQuestion.testCases.map((item, itemIndex) => itemIndex === index ? { ...item, expectedOutput: event.target.value } : item) })} placeholder="Expected output" rows={3} className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none" />
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-4">
                                                        <label className="flex items-center gap-2 text-sm text-slate-600">
                                                            <input type="checkbox" checked={testCase.isHidden} onChange={(event) => setEditingQuestion({ ...editingQuestion, testCases: editingQuestion.testCases.map((item, itemIndex) => itemIndex === index ? { ...item, isHidden: event.target.checked } : item) })} />
                                                            Hidden
                                                        </label>
                                                        <label className="flex items-center gap-2 text-sm text-slate-600">
                                                            Weight
                                                            <NumberInput min={1} value={testCase.weight ?? 1} onValueChange={(v) => setEditingQuestion({ ...editingQuestion, testCases: editingQuestion.testCases.map((item, itemIndex) => itemIndex === index ? { ...item, weight: v ?? 1 } : item) })} className="w-20 rounded-lg border border-slate-200 px-2 py-1" />
                                                        </label>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-3">
                                        <label className="space-y-1">
                                            <span className="text-sm font-semibold text-slate-700">Scoring</span>
                                            <select value={editingQuestion.codeScoringMode} onChange={(event) => setEditingQuestion({ ...editingQuestion, codeScoringMode: event.target.value as CodeScoringMode })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none">
                                                <option value="all_or_nothing">All or nothing</option>
                                                <option value="weighted">Weighted</option>
                                            </select>
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-sm font-semibold text-slate-700">Time limit (s)</span>
                                            <NumberInput min={1} value={editingQuestion.timeLimit} onValueChange={(v) => setEditingQuestion({ ...editingQuestion, timeLimit: v ?? 2 })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none" />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-sm font-semibold text-slate-700">Memory (MB)</span>
                                            <NumberInput min={16} value={editingQuestion.memoryLimit} onValueChange={(v) => setEditingQuestion({ ...editingQuestion, memoryLimit: v ?? 128 })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none" />
                                        </label>
                                    </div>
                                </div>
                            )}

                            <RichTextEditor
                                label="Explanation (optional)"
                                value={editingQuestion.explanation}
                                onChange={(explanation) => setEditingQuestion({ ...editingQuestion, explanation })}
                                minHeight={150}
                                mediaUploadPath={`question-bank/${editingQuestion.id || "draft"}/explanations`}
                            />

                            <div className="grid gap-4 md:grid-cols-4">
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Marks</span>
                                    <NumberInput min={0.5} step={0.5} value={editingQuestion.marks} onValueChange={(v) => setEditingQuestion({ ...editingQuestion, marks: v ?? 1 })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Negative marks</span>
                                    <NumberInput min={0} step={0.25} value={editingQuestion.negativeMarks} onValueChange={(v) => setEditingQuestion({ ...editingQuestion, negativeMarks: v ?? 0 })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Difficulty</span>
                                    <select value={editingQuestion.difficulty} onChange={(event) => setEditingQuestion({ ...editingQuestion, difficulty: event.target.value as DifficultyLevel })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none">
                                        <option value="easy">Easy</option>
                                        <option value="medium">Medium</option>
                                        <option value="hard">Hard</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">Status</span>
                                    <select value={editingQuestion.status} onChange={(event) => setEditingQuestion({ ...editingQuestion, status: event.target.value as TestStatus })} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none">
                                        <option value="published">Published</option>
                                        <option value="draft">Draft</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </label>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingQuestion(null); }}>Cancel</Button>
                                <Button type="button" isLoading={saving} onClick={handleSaveQuestion}>{editingQuestion.id ? "Save Question" : "Create Question"}</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
