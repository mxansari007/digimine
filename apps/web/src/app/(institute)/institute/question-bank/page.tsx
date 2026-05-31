"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import {
    AiQuestionGenerator,
    LockedFeatureButton,
    type GeneratedQuestionDraft,
} from "@/components/teacher/AiQuestionGenerator";
import { downloadQuestionTemplate } from "@/lib/import/markdownQuestions";

type Option = { id?: string; text: string; isCorrect?: boolean };

type Question = {
    id: string;
    type: "mcq" | "text_input" | "code";
    questionText: string;
    options: Option[] | null;
    correctAnswer: string | null;
    explanation: string | null;
    marks: number;
    negativeMarks: number;
    difficulty: "easy" | "moderate" | "hard";
    subject: string | null;
    topic: string | null;
    tags: string[];
    createdAt: string | null;
};

function diffChip(d: Question["difficulty"]) {
    if (d === "easy") return "chip-success";
    if (d === "hard") return "chip-danger";
    return "chip-warning";
}

export default function InstituteQuestionBankPage() {
    const { firebaseUser } = useAuthContext();
    const [instituteId, setInstituteId] = useState("");
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [showForm, setShowForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const teaching = useTeachingFeatures();

    // Filters
    const [search, setSearch] = useState("");
    const [subjectFilter, setSubjectFilter] = useState("");
    const [difficultyFilter, setDifficultyFilter] = useState<"" | Question["difficulty"]>("");
    const [typeFilter, setTypeFilter] = useState<"" | Question["type"]>("");

    const loadAll = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const meRes = await teacherFetch(firebaseUser, "/api/institute/me");
            const meData = await meRes.json();
            const id = meData?.institute?.id;
            if (!id) throw new Error("No institute");
            setInstituteId(id);
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(id)}/question-bank`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setQuestions(data.questions || []);
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const subjects = useMemo(() => {
        const set = new Set<string>();
        questions.forEach((q) => q.subject && set.add(q.subject));
        return Array.from(set).sort();
    }, [questions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return questions.filter((qn) => {
            if (subjectFilter && qn.subject !== subjectFilter) return false;
            if (difficultyFilter && qn.difficulty !== difficultyFilter) return false;
            if (typeFilter && qn.type !== typeFilter) return false;
            if (q) {
                const hay = `${qn.questionText} ${qn.subject || ""} ${qn.topic || ""} ${qn.tags.join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [questions, search, subjectFilter, difficultyFilter, typeFilter]);

    /**
     * AI-draft → POST /api/institute/{id}/question-bank adapter.
     * Mirrors the teacher-side adapter on /teacher/questions.
     */
    const handleAiSave = async (
        q: GeneratedQuestionDraft,
        ctx: { topic: string; subject: string; difficulty: string; type: string }
    ) => {
        if (!firebaseUser || !instituteId) throw new Error("Not signed in");
        const truncatedTitle =
            q.questionText.length > 80
                ? q.questionText.slice(0, 77) + "…"
                : q.questionText;
        const difficulty =
            q.difficulty === "easy" ? "easy" : q.difficulty === "hard" ? "hard" : "moderate";
        const payload = {
            title: truncatedTitle,
            type: q.type,
            questionText: q.questionText,
            options:
                q.type === "mcq"
                    ? q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
                    : null,
            correctAnswer: q.type === "text_input" ? q.correctAnswer ?? "" : null,
            explanation: q.explanation,
            marks: q.marks,
            negativeMarks: 0,
            difficulty,
            subject: ctx.subject || ctx.topic || "AI generated",
            topic: ctx.topic || "AI generated",
            tags: ["ai-generated"],
        };
        const res = await teacherFetch(
            firebaseUser,
            `/api/institute/${encodeURIComponent(instituteId)}/question-bank`,
            { method: "POST", body: JSON.stringify(payload) }
        );
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Save failed");
        }
        await loadAll();
    };

    const handleDelete = async (id: string) => {
        if (!firebaseUser || !instituteId) return;
        if (!confirm("Delete this question?")) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}/question-bank/${encodeURIComponent(id)}`,
                { method: "DELETE" }
            );
            if (!res.ok) throw new Error("Failed");
            await loadAll();
        } catch (err: any) {
            alert(err.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-2xl font-bold text-gray-900">Question bank</h1>
                        <HelpTutorial {...TUTORIALS.institute_question_bank} />
                    </div>
                    <p className="mt-1 text-gray-500">
                        Central pool of vetted questions. Every teacher in your institute can pull from here when
                        authoring a quiz or test.
                    </p>
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
                        onClick={() =>
                            downloadQuestionTemplate("question-bank-template.md")
                        }
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-primary-200 hover:bg-white hover:text-primary-700"
                    >
                        Download Template
                    </LockedFeatureButton>
                    <Button variant="primary" onClick={() => setShowForm(true)}>
                        + Add question
                    </Button>
                </div>
            </div>

            <Card className="p-4">
                <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search questions, topics, tags…"
                        className="field-input"
                    />
                    <select
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                        className="field-input"
                    >
                        <option value="">All subjects</option>
                        {subjects.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    <select
                        value={difficultyFilter}
                        onChange={(e) => setDifficultyFilter(e.target.value as any)}
                        className="field-input"
                    >
                        <option value="">All difficulty</option>
                        <option value="easy">Easy</option>
                        <option value="moderate">Moderate</option>
                        <option value="hard">Hard</option>
                    </select>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as any)}
                        className="field-input"
                    >
                        <option value="">All types</option>
                        <option value="mcq">MCQ</option>
                        <option value="text_input">Text input</option>
                        <option value="code">Code</option>
                    </select>
                </div>
            </Card>

            {error && <Card className="p-4 text-sm text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10">{error}</Card>}

            {loading ? (
                <Card className="p-12 text-center text-sm text-gray-500">Loading...</Card>
            ) : filtered.length === 0 ? (
                <Card className="p-12 text-center text-gray-500">
                    {questions.length === 0
                        ? "Your question bank is empty. Add your first question above."
                        : "No questions match your filters."}
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map((q) => (
                        <Card key={q.id} className="p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className={diffChip(q.difficulty)}>{q.difficulty}</span>
                                        <span className="chip-neutral">{q.type.replace("_", " ")}</span>
                                        {q.subject && <span className="chip-primary">{q.subject}</span>}
                                        {q.topic && <span className="chip-accent">{q.topic}</span>}
                                        <span className="text-xs text-gray-500">
                                            {q.marks} mark{q.marks === 1 ? "" : "s"}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">{q.questionText}</p>
                                    {q.type === "mcq" && q.options && (
                                        <ul className="mt-2 space-y-1 text-xs text-gray-600">
                                            {q.options.map((o, i) => (
                                                <li key={o.id || i} className={o.isCorrect ? "flex items-center gap-1 text-emerald-700 font-semibold" : ""}>
                                                    <span>{String.fromCharCode(65 + i)}. {o.text}</span>
                                                    {o.isCorrect && <Check className="h-3 w-3 shrink-0" aria-hidden />}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {q.type === "text_input" && q.correctAnswer && (
                                        <p className="mt-2 text-xs text-emerald-700">
                                            Correct answer: {q.correctAnswer}
                                        </p>
                                    )}
                                    {q.tags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {q.tags.map((t) => (
                                                <span key={t} className="text-[10px] rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                                                    #{t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleDelete(q.id)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                >
                                    Delete
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {showForm && (
                <CreateQuestionModal
                    onClose={() => setShowForm(false)}
                    onCreate={async (payload) => {
                        if (!firebaseUser || !instituteId) return false;
                        setCreating(true);
                        try {
                            const res = await teacherFetch(
                                firebaseUser,
                                `/api/institute/${encodeURIComponent(instituteId)}/question-bank`,
                                { method: "POST", body: JSON.stringify(payload) }
                            );
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "Failed");
                            setShowForm(false);
                            await loadAll();
                            return true;
                        } catch (err: any) {
                            alert(err.message);
                            return false;
                        } finally {
                            setCreating(false);
                        }
                    }}
                    creating={creating}
                />
            )}
        </div>
    );
}

function CreateQuestionModal({
    onClose,
    onCreate,
    creating,
}: {
    onClose: () => void;
    onCreate: (payload: any) => Promise<boolean>;
    creating: boolean;
}) {
    const [type, setType] = useState<"mcq" | "text_input">("mcq");
    const [questionText, setQuestionText] = useState("");
    const [marks, setMarks] = useState(1);
    const [negativeMarks, setNegativeMarks] = useState(0);
    const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard">("moderate");
    const [subject, setSubject] = useState("");
    const [topic, setTopic] = useState("");
    const [tags, setTags] = useState("");
    const [explanation, setExplanation] = useState("");
    const [options, setOptions] = useState<Option[]>([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
    ]);
    const [correctAnswer, setCorrectAnswer] = useState("");

    const handleSubmit = async () => {
        const payload: any = {
            type,
            questionText,
            marks,
            negativeMarks,
            difficulty,
            subject: subject.trim() || undefined,
            topic: topic.trim() || undefined,
            tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            explanation: explanation.trim() || undefined,
        };
        if (type === "mcq") payload.options = options.filter((o) => o.text.trim());
        else payload.correctAnswer = correctAnswer.trim();

        await onCreate(payload);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
            <Card className="my-12 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add question</h3>

                <div className="grid gap-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="stat-label">Type</label>
                            <select value={type} onChange={(e) => setType(e.target.value as any)} className="field-input mt-1 text-sm py-2">
                                <option value="mcq">MCQ</option>
                                <option value="text_input">Text input</option>
                            </select>
                        </div>
                        <div>
                            <label className="stat-label">Difficulty</label>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value as any)}
                                className="field-input mt-1 text-sm py-2"
                            >
                                <option value="easy">Easy</option>
                                <option value="moderate">Moderate</option>
                                <option value="hard">Hard</option>
                            </select>
                        </div>
                        <div>
                            <label className="stat-label">Marks</label>
                            <input
                                type="number"
                                min={1}
                                value={marks}
                                onChange={(e) => setMarks(Math.max(1, Number(e.target.value) || 1))}
                                className="field-input mt-1 text-sm py-2"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="stat-label">Question</label>
                        <textarea
                            value={questionText}
                            onChange={(e) => setQuestionText(e.target.value)}
                            rows={3}
                            placeholder="Enter the question text..."
                            className="field-input mt-1 text-sm"
                        />
                    </div>

                    {type === "mcq" ? (
                        <div className="space-y-2">
                            <label className="stat-label">Options (tick the correct one)</label>
                            {options.map((opt, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        checked={Boolean(opt.isCorrect)}
                                        onChange={() => {
                                            setOptions(options.map((o, j) => ({ ...o, isCorrect: j === i })));
                                        }}
                                    />
                                    <input
                                        type="text"
                                        value={opt.text}
                                        onChange={(e) => {
                                            const next = [...options];
                                            next[i] = { ...next[i], text: e.target.value };
                                            setOptions(next);
                                        }}
                                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                        className="field-input flex-1 text-sm py-2"
                                    />
                                    {options.length > 2 && (
                                        <button
                                            type="button"
                                            onClick={() => setOptions(options.filter((_, j) => j !== i))}
                                            className="text-xs text-red-600"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => setOptions([...options, { text: "", isCorrect: false }])}
                                className="text-xs font-semibold text-primary-700"
                            >
                                + Add option
                            </button>
                        </div>
                    ) : (
                        <div>
                            <label className="stat-label">Correct answer</label>
                            <input
                                type="text"
                                value={correctAnswer}
                                onChange={(e) => setCorrectAnswer(e.target.value)}
                                className="field-input mt-1 text-sm py-2"
                                placeholder="The expected answer (case-insensitive match)"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="stat-label">Subject</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="e.g. Maths"
                                className="field-input mt-1 text-sm py-2"
                            />
                        </div>
                        <div>
                            <label className="stat-label">Topic</label>
                            <input
                                type="text"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="e.g. Algebra"
                                className="field-input mt-1 text-sm py-2"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="stat-label">Tags (comma-separated)</label>
                            <input
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="cbse, board-2024"
                                className="field-input mt-1 text-sm py-2"
                            />
                        </div>
                        <div>
                            <label className="stat-label">Negative marks</label>
                            <input
                                type="number"
                                min={0}
                                step={0.25}
                                value={negativeMarks}
                                onChange={(e) => setNegativeMarks(Math.max(0, Number(e.target.value) || 0))}
                                className="field-input mt-1 text-sm py-2"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="stat-label">Explanation (optional)</label>
                        <textarea
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            rows={2}
                            placeholder="Shown to students after they answer..."
                            className="field-input mt-1 text-sm"
                        />
                    </div>

                    <div className="flex gap-2 mt-2">
                        <Button
                            variant="primary"
                            className="flex-1"
                            onClick={handleSubmit}
                            isLoading={creating}
                            disabled={!questionText.trim()}
                        >
                            Save question
                        </Button>
                        <Button variant="outline" onClick={onClose} disabled={creating}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
