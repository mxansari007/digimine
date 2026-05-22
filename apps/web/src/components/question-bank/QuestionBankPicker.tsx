"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, stripFormattedContent } from "@digimine/ui";
import { getTeacherQuestionBankQuestions } from "@/lib/firestore/questionBank";
import type {
  DifficultyLevel,
  QuestionBankQuestion,
  QuestionType,
  TestStatus,
} from "@digimine/types";

interface QuestionBankPickerProps {
  open: boolean;
  mode: "test" | "quiz";
  teacherId: string;
  onClose: () => void;
  onSelect: (questions: QuestionBankQuestion[]) => void | Promise<void>;
  title?: string;
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function optionLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toPickerQuestionType(
  type: QuestionBankQuestion["type"]
): QuestionType {
  if (type === "code" || type === "coding") return "code";
  if (
    type === "mcq" ||
    type === "msq" ||
    type === "true_false" ||
    type === "aptitude"
  )
    return "mcq";
  return "text_input";
}

export function QuestionBankPicker({
  open,
  mode,
  teacherId,
  onClose,
  onSelect,
  title = "Select from Question Bank",
}: QuestionBankPickerProps) {
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<QuestionType | "all">("all");
  const [difficulty, setDifficulty] = useState<DifficultyLevel | "all">("all");
  const [status, setStatus] = useState<TestStatus | "all">("published");
  const [category, setCategory] = useState("all");
  const [topic, setTopic] = useState("all");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function loadQuestions() {
      setLoading(true);
      try {
        if (!teacherId) {
          if (active) setQuestions([]);
          return;
        }
        const items = await getTeacherQuestionBankQuestions(teacherId, {
          includeCode: mode === "test",
          status,
        });
        if (active) setQuestions(items);
      } catch (error) {
        console.error("Failed to load question bank:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadQuestions();
    return () => {
      active = false;
    };
  }, [mode, open, status, teacherId]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(questions.map((question) => question.category).filter(Boolean))
      ).sort(),
    [questions]
  );
  const topics = useMemo(
    () =>
      Array.from(
        new Set(questions.map((question) => question.topic).filter(Boolean))
      ).sort(),
    [questions]
  );

  const filteredQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const requiredTags = splitTags(tags).map((tag) => tag.toLowerCase());
    return questions
      .filter(
        (question) =>
          type === "all" || toPickerQuestionType(question.type) === type
      )
      .filter(
        (question) => difficulty === "all" || question.difficulty === difficulty
      )
      .filter(
        (question) => category === "all" || question.category === category
      )
      .filter((question) => topic === "all" || question.topic === topic)
      .filter(
        (question) =>
          requiredTags.length === 0 ||
          requiredTags.every((tag) =>
            question.tags.map((item) => item.toLowerCase()).includes(tag)
          )
      )
      .filter((question) => {
        if (!q) return true;
        const haystack = [
          question.title,
          question.category,
          question.topic,
          question.subcategory || "",
          question.tags.join(" "),
          stripFormattedContent(question.questionText),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [category, difficulty, questions, search, tags, topic, type]);

  const selectedQuestions = useMemo(
    () =>
      selectedIds
        .map((id) => questions.find((question) => question.id === id))
        .filter(Boolean) as QuestionBankQuestion[],
    [questions, selectedIds]
  );

  const toggleQuestion = (questionId: string) => {
    setSelectedIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
    );
  };

  const handleSelect = async () => {
    if (selectedQuestions.length === 0) return;
    setSaving(true);
    try {
      await onSelect(selectedQuestions);
      setSelectedIds([]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <Card className="max-h-[92vh] w-full max-w-6xl overflow-hidden">
        <div className="flex flex-col border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === "quiz"
                ? "Code questions are hidden because quizzes and custom contests support MCQ/text-input only."
                : "Select MCQ, text-input, or code questions from your teacher question bank."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 hover:border-slate-300 hover:text-slate-900 sm:mt-0"
          >
            Close
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[290px_1fr]">
          <aside className="border-b border-slate-100 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-3">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search question bank..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as TestStatus | "all")
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="published">Published only</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
                <option value="all">All status</option>
              </select>
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as QuestionType | "all")
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="all">All types</option>
                <option value="mcq">Multiple choice</option>
                <option value="text_input">Text input</option>
                {mode === "test" && <option value="code">Code</option>}
              </select>
              <select
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as DifficultyLevel | "all")
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="all">All difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="all">All topics</option>
                {topics.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Tags, comma separated"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="font-bold text-slate-950">
                  {selectedQuestions.length} selected
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {filteredQuestions.length} visible
                </div>
              </div>
            </div>
          </aside>

          <main className="flex max-h-[68vh] flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="py-16 text-center text-slate-500">
                  Loading question bank...
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                  <p className="font-bold text-slate-950">
                    No questions match these filters
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try another topic, category, tag, or status.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredQuestions.map((question) => {
                    const selected = selectedIds.includes(question.id);
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => toggleQuestion(question.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-primary-400 bg-primary-50 ring-2 ring-primary-100"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-950">
                                {question.title}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                {optionLabel(question.type)}
                              </span>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                {question.marks} marks
                              </span>
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                                {question.difficulty}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                              {stripFormattedContent(question.questionText)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>{question.category}</span>
                              <span>/</span>
                              <span>{question.topic}</span>
                              {question.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-slate-100 px-2 py-0.5"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${selected ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-500"}`}
                          >
                            {selected ? "Selected" : "Select"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSelect}
                disabled={selectedQuestions.length === 0}
                isLoading={saving}
              >
                Add {selectedQuestions.length || ""} Question
                {selectedQuestions.length === 1 ? "" : "s"}
              </Button>
            </div>
          </main>
        </div>
      </Card>
    </div>
  );
}
