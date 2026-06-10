"use client";

/**
 * "Generate with AI" button + modal for the teacher and institute
 * question-bank pages.
 *
 * Behaviour:
 *   - The trigger button is disabled (with an explanatory tooltip)
 *     when AI is globally OFF, OR when the caller's plan doesn't
 *     include `ai_question_generation`.
 *   - When the user clicks Generate, the modal fires
 *     POST /api/teacher/ai/generate-questions and shows the drafts
 *     inline with per-question "Save" + "Save all" actions.
 *   - Saving is decoupled — the caller passes an `onSave(question)`
 *     that performs the actual create (teacher uses
 *     createTeacherQuestionBankQuestion; institute uses its own
 *     fetcher). This keeps the modal reusable across both portals.
 */
import { Fragment, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { NumberInput } from "@digimine/shared";
import { Sparkles, X, Check, Lock } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { teacherFetch } from "@/lib/api/teacherFetch";

export type GeneratedQuestionType = "mcq" | "text_input" | "code";

export type GeneratedQuestionDraft = {
    type: GeneratedQuestionType;
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
    correctAnswer: string | null;
    explanation: string;
    difficulty: "easy" | "moderate" | "hard";
    marks: number;
};

const TYPE_LABELS: Record<GeneratedQuestionType, string> = {
    mcq: "MCQ (4 options)",
    text_input: "Text input",
    code: "Code",
};

const ALL_TYPES: GeneratedQuestionType[] = ["mcq", "text_input", "code"];

export interface AiQuestionGeneratorProps {
    firebaseUser: FirebaseUser | null;
    /** Global AI kill-switch — from /api/me/teaching-features. */
    aiEnabled: boolean;
    /** Caller's plan-level entitlement for ai_question_generation. */
    hasFeature: boolean;
    /** Hard cap per request returned by /api/me/teaching-features. */
    maxCount: number;
    /**
     * Plan-level daily cap and today's usage. `cap === null` means no
     * limit; `cap === 0` means the plan has AI enabled but with zero
     * daily quota (acts as a soft-disable). Both fields drive the
     * "X of Y today" badge inside the modal.
     */
    dailyQuota: { used: number; cap: number | null };
    /** Where to send the user to upgrade if they lack the feature. */
    upgradeHref: string;
    /**
     * Persists a generated draft. Caller wires this to its
     * question-bank create function (teacher/institute differ).
     * `ctx` carries the form context (topic + subject) so the caller
     * can stamp the required topic/category/etc fields the question
     * bank expects. Should resolve when the question is committed;
     * rejecting surfaces an inline error on that row.
     */
    onSave: (
        q: GeneratedQuestionDraft,
        ctx: { topic: string; subject: string; difficulty: string; type: string }
    ) => Promise<void>;
    /**
     * Fired after a successful generation request returns. Caller wires
     * this to `useTeachingFeatures().refresh()` so the daily-quota badge
     * on the trigger button updates without a page reload.
     */
    onGenerated?: () => void;
    /**
     * Which question types to expose in the Type dropdown. Useful for
     * contexts that don't support every type — e.g. quizzes and
     * contests exclude `"code"`. Defaults to all three. The first entry
     * is the default selection.
     */
    allowedTypes?: GeneratedQuestionType[];
}

type Status = "idle" | "loading" | "ready" | "error";

export function AiQuestionGenerator({
    firebaseUser,
    aiEnabled,
    hasFeature,
    maxCount,
    dailyQuota,
    upgradeHref,
    onSave,
    onGenerated,
    allowedTypes,
}: AiQuestionGeneratorProps) {
    const [open, setOpen] = useState(false);

    const quotaExhausted =
        dailyQuota.cap !== null && dailyQuota.used >= dailyQuota.cap;
    const disabled = !aiEnabled || !hasFeature || quotaExhausted;
    const title = !aiEnabled
        ? "AI question generation is currently unavailable. Please check back later."
        : !hasFeature
            ? "Your plan doesn't include AI question generation. Upgrade to unlock."
            : quotaExhausted
                ? `Daily quota reached (${dailyQuota.used}/${dailyQuota.cap}). Resets at midnight IST.`
                : "Generate question drafts from a topic + prompt.";

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled}
                title={title}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                    disabled
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-violet-300 bg-gradient-to-r from-violet-50 dark:from-violet-500/10 to-fuchsia-50 dark:to-fuchsia-500/10 text-violet-700 dark:text-violet-300 hover:border-violet-400 hover:from-violet-100 hover:to-fuchsia-100"
                }`}
            >
                <Sparkles className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Generate with AI
                {!aiEnabled && (
                    <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        OFF
                    </span>
                )}
                {aiEnabled && !hasFeature && (
                    <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        UPGRADE
                    </span>
                )}
                {aiEnabled && hasFeature && dailyQuota.cap !== null && (
                    <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            quotaExhausted
                                ? "bg-rose-200 text-rose-900"
                                : "bg-violet-200 text-violet-900"
                        }`}
                    >
                        {dailyQuota.used}/{dailyQuota.cap}
                    </span>
                )}
            </button>

            {open && (
                <AiModal
                    firebaseUser={firebaseUser}
                    aiEnabled={aiEnabled}
                    hasFeature={hasFeature}
                    maxCount={maxCount}
                    dailyQuota={dailyQuota}
                    upgradeHref={upgradeHref}
                    onSave={onSave}
                    onGenerated={onGenerated}
                    allowedTypes={allowedTypes}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

function AiModal({
    firebaseUser,
    aiEnabled,
    hasFeature,
    maxCount,
    dailyQuota,
    upgradeHref,
    onSave,
    onGenerated,
    allowedTypes,
    onClose,
}: AiQuestionGeneratorProps & { onClose: () => void }) {
    const types: GeneratedQuestionType[] =
        allowedTypes && allowedTypes.length > 0 ? allowedTypes : ALL_TYPES;
    // Effective per-request ceiling = min(plan request cap, remaining
    // questions in today's bucket). If the daily cap is null, the API
    // request cap is the only ceiling.
    const remainingToday =
        dailyQuota.cap === null ? Infinity : Math.max(0, dailyQuota.cap - dailyQuota.used);
    const effectiveMax = Math.max(1, Math.min(maxCount, remainingToday === Infinity ? maxCount : remainingToday));
    const [topic, setTopic] = useState("");
    const [subject, setSubject] = useState("");
    const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard">("moderate");
    const [type, setType] = useState<GeneratedQuestionType>(types[0]);
    const [count, setCount] = useState(5);
    const [extraContext, setExtraContext] = useState("");

    const [status, setStatus] = useState<Status>("idle");
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [questions, setQuestions] = useState<GeneratedQuestionDraft[]>([]);
    const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
    const [rowError, setRowError] = useState<Record<number, string>>({});

    const generate = async () => {
        if (!firebaseUser || !topic.trim()) return;
        setStatus("loading");
        setErrorMessage("");
        setQuestions([]);
        setSavedIdx(new Set());
        setRowError({});
        try {
            const res = await teacherFetch(
                firebaseUser,
                "/api/teacher/ai/generate-questions",
                {
                    method: "POST",
                    body: JSON.stringify({
                        topic: topic.trim(),
                        subject: subject.trim(),
                        difficulty,
                        type,
                        count: Math.min(maxCount, Math.max(1, count)),
                        extraContext: extraContext.trim(),
                    }),
                }
            );
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `Generation failed (${res.status})`);
            }
            setQuestions(data.questions || []);
            setStatus("ready");
            // Tell the parent (page) to re-fetch /api/me/teaching-features
            // so the daily-quota badge on the trigger button reflects the
            // increment the server just made.
            onGenerated?.();
        } catch (err) {
            setErrorMessage((err as Error).message || "Generation failed");
            setStatus("error");
        }
    };

    const saveOne = async (i: number) => {
        const q = questions[i];
        if (!q) return;
        setRowError((m) => {
            const { [i]: _drop, ...rest } = m;
            return rest;
        });
        try {
            await onSave(q, {
                topic: topic.trim(),
                subject: subject.trim(),
                difficulty,
                type,
            });
            setSavedIdx((s) => new Set(s).add(i));
        } catch (err) {
            setRowError((m) => ({ ...m, [i]: (err as Error).message || "Save failed" }));
        }
    };

    const saveAll = async () => {
        for (let i = 0; i < questions.length; i++) {
            if (!savedIdx.has(i)) {
                // eslint-disable-next-line no-await-in-loop
                await saveOne(i);
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
            onClick={onClose}
        >
            <Card
                className="my-8 flex w-full max-w-2xl flex-col p-0"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <Sparkles className="h-4 w-4 text-violet-600" strokeWidth={2.5} aria-hidden />
                        Generate questions with AI
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </button>
                </div>

                {!aiEnabled || !hasFeature ? (
                    <div className="p-5">
                        <p className="text-sm text-slate-700">
                            {!aiEnabled
                                ? "AI question generation is currently unavailable. The admin has it disabled — check back later."
                                : "Your current plan doesn't include AI question generation."}
                        </p>
                        {!aiEnabled ? null : (
                            <Link href={upgradeHref}>
                                <Button variant="primary" className="mt-3">
                                    See upgrade plans →
                                </Button>
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4 p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block sm:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Topic *
                                </span>
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="e.g. Binary search trees, SQL joins, Newton's laws"
                                    autoFocus
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Subject
                                </span>
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="DSA, Physics, etc."
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Difficulty
                                </span>
                                <select
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                                >
                                    <option value="easy">Easy</option>
                                    <option value="moderate">Moderate</option>
                                    <option value="hard">Hard</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Question type
                                </span>
                                <select
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    value={type}
                                    onChange={(e) =>
                                        setType(e.target.value as GeneratedQuestionType)
                                    }
                                    disabled={types.length === 1}
                                >
                                    {types.map((t) => (
                                        <option key={t} value={t}>
                                            {TYPE_LABELS[t]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    How many (1–{effectiveMax})
                                </span>
                                <NumberInput
                                    min={1}
                                    max={effectiveMax}
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    value={Math.min(count, effectiveMax)}
                                    onValueChange={(v) =>
                                        setCount(Math.min(effectiveMax, Math.max(1, v ?? 1)))
                                    }
                                />
                                {dailyQuota.cap !== null && (
                                    <span className="mt-1 block text-[10px] text-slate-500">
                                        {dailyQuota.used} of {dailyQuota.cap} used today · resets at midnight IST
                                    </span>
                                )}
                            </label>
                            <label className="block sm:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Extra context (optional)
                                </span>
                                <textarea
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    value={extraContext}
                                    onChange={(e) => setExtraContext(e.target.value)}
                                    placeholder="e.g. focus on time-complexity reasoning; avoid trick questions."
                                />
                            </label>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500">
                                Drafts are returned to this screen — review and save the ones
                                you want. Nothing is saved automatically.
                            </p>
                            <Button
                                variant="primary"
                                onClick={generate}
                                isLoading={status === "loading"}
                                disabled={!topic.trim() || status === "loading"}
                            >
                                <Sparkles
                                    className="mr-1.5 h-4 w-4"
                                    strokeWidth={2.5}
                                    aria-hidden
                                />
                                Generate
                            </Button>
                        </div>

                        {status === "error" && (
                            <div className="rounded-lg border border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
                                {errorMessage}
                            </div>
                        )}

                        {status === "ready" && questions.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-slate-900">
                                        {questions.length} draft{questions.length === 1 ? "" : "s"}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={saveAll}
                                        className="text-xs font-semibold text-violet-700 hover:text-violet-800"
                                    >
                                        Save all →
                                    </button>
                                </div>
                                <ul className="space-y-2">
                                    {questions.map((q, i) => (
                                        <li
                                            key={i}
                                            className="rounded-lg border border-slate-200 bg-white p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm text-slate-900">
                                                        <span className="mr-1.5 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                                                            {q.type}
                                                        </span>
                                                        <span className="mr-1.5 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                                                            {q.difficulty}
                                                        </span>
                                                        {q.questionText}
                                                    </p>
                                                    {q.options.length > 0 && (
                                                        <ul className="mt-2 grid gap-1 text-xs">
                                                            {q.options.map((o, oi) => (
                                                                <li
                                                                    key={oi}
                                                                    className={`flex items-start gap-1.5 ${
                                                                        o.isCorrect
                                                                            ? "text-emerald-700"
                                                                            : "text-slate-600"
                                                                    }`}
                                                                >
                                                                    {o.isCorrect ? (
                                                                        <Check
                                                                            className="mt-0.5 h-3 w-3 flex-shrink-0"
                                                                            strokeWidth={2.5}
                                                                            aria-hidden
                                                                        />
                                                                    ) : (
                                                                        <span className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                                                    )}
                                                                    <span>{o.text}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                    {q.explanation && (
                                                        <p className="mt-2 text-[11px] italic text-slate-500">
                                                            {q.explanation}
                                                        </p>
                                                    )}
                                                </div>
                                                {savedIdx.has(i) ? (
                                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                        <Check
                                                            className="h-3 w-3"
                                                            strokeWidth={2.5}
                                                            aria-hidden
                                                        />
                                                        Saved
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => saveOne(i)}
                                                        className="rounded-md border border-violet-300 dark:border-violet-500/25 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100"
                                                    >
                                                        Save
                                                    </button>
                                                )}
                                            </div>
                                            {rowError[i] && (
                                                <p className="mt-1 text-[11px] text-rose-600">
                                                    {rowError[i]}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <div className="border-t border-slate-100 p-3 text-right">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </Card>
        </div>
    );
}

/**
 * Inline lock badge for buttons that are gated by a teaching
 * feature. Usage:
 *
 *   <LockedFeatureButton
 *      locked={!has("question_bank_template_download")}
 *      upgradeHref={upgradeHref}
 *      onClick={...}
 *   >
 *      Download Template
 *   </LockedFeatureButton>
 *
 * When locked, the button becomes a link to the upgrade page and
 * shows a lock icon + "Upgrade" pill instead of firing onClick.
 */
export function LockedFeatureButton({
    locked,
    upgradeHref,
    children,
    className,
    tooltipWhenLocked,
    onClick,
}: {
    locked: boolean;
    upgradeHref: string;
    children: React.ReactNode;
    className?: string;
    tooltipWhenLocked?: string;
    onClick?: () => void;
}) {
    if (locked) {
        return (
            <Link
                href={upgradeHref}
                title={tooltipWhenLocked || "Upgrade to unlock this feature"}
                className={
                    className ||
                    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:border-amber-400 hover:bg-amber-100"
                }
            >
                <Lock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                <Fragment>{children}</Fragment>
                <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                    Upgrade
                </span>
            </Link>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className={className}
        >
            {children}
        </button>
    );
}
