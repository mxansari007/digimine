"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { Eyebrow } from "@/components/projectEval/shared";

type ParamDraft = { title: string; description: string; maxScore: string };
type ClassOption = { id: string; name: string };

const DEFAULT_PARAMS: ParamDraft[] = [
    {
        title: "Functionality & completeness",
        description:
            "The core features described in the brief work end-to-end. Forms validate input, errors are handled, and there are no obviously broken flows.",
        maxScore: "10",
    },
    {
        title: "Code quality & structure",
        description:
            "Clear separation of frontend/backend concerns, sensible folder structure, readable naming, no large blocks of dead or copy-pasted code.",
        maxScore: "10",
    },
    {
        title: "Database design",
        description:
            "A real database is used (not hardcoded data). The schema/models fit the problem and relations are modeled correctly.",
        maxScore: "10",
    },
];

const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

const sectionClass =
    "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm";

export default function NewProjectEvalPage() {
    const { firebaseUser } = useAuthContext();
    const router = useRouter();
    const toast = useToast();

    const [title, setTitle] = useState("");
    const [brief, setBrief] = useState("");
    const [techStack, setTechStack] = useState("");
    const [dueAt, setDueAt] = useState("");
    const [assignedMode, setAssignedMode] = useState<"classes" | "all_students">("all_students");
    const [classIds, setClassIds] = useState<string[]>([]);
    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [params, setParams] = useState<ParamDraft[]>(DEFAULT_PARAMS);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!firebaseUser) return;
        teacherFetch(firebaseUser, "/api/teacher/classes")
            .then((res) => res.json())
            .then((data) => {
                const rows = (data.classes || []).filter((c: any) => !c.isArchived);
                setClasses(rows.map((c: any) => ({ id: c.id, name: c.name })));
            })
            .catch(() => {});
    }, [firebaseUser]);

    const updateParam = (i: number, patch: Partial<ParamDraft>) => {
        setParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    };

    const totalMarks = params.reduce((sum, p) => sum + (Number(p.maxScore) || 0), 0);

    const save = async (publish: boolean) => {
        if (!firebaseUser) return;
        setSaving(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/teacher/project-evals", {
                method: "POST",
                body: JSON.stringify({
                    title: title.trim(),
                    brief: brief.trim(),
                    techStack: techStack.trim(),
                    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                    assignedMode,
                    classIds: assignedMode === "classes" ? classIds : [],
                    status: publish ? "published" : "draft",
                    parameters: params.map((p) => ({
                        title: p.title.trim(),
                        description: p.description.trim(),
                        maxScore: Number(p.maxScore),
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create evaluation.");
            toast.success(publish ? "Evaluation published." : "Draft saved.");
            router.push(`/teacher/project-evals/${data.evaluation.id}`);
        } catch (err: any) {
            toast.error(err.message || "Failed to create evaluation.");
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6">
                <Eyebrow>New evaluation</Eyebrow>
                <h1 className="mt-1 font-display text-2xl font-bold text-gray-900">
                    Define the project and your rubric
                </h1>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
                {/* ── Form column ──────────────────────────────────────── */}
                <div className="space-y-5">
                    <section className={sectionClass}>
                        <Eyebrow>The project</Eyebrow>
                        <div className="mt-3 space-y-4">
                            <div>
                                <label htmlFor="pe-title" className="mb-1 block text-sm font-medium text-gray-900">
                                    Title
                                </label>
                                <input
                                    id="pe-title"
                                    className={inputClass}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Fullstack e-commerce mini project"
                                    maxLength={120}
                                />
                            </div>
                            <div>
                                <label htmlFor="pe-brief" className="mb-1 block text-sm font-medium text-gray-900">
                                    Brief
                                </label>
                                <textarea
                                    id="pe-brief"
                                    className={`${inputClass} min-h-[130px] leading-relaxed`}
                                    value={brief}
                                    onChange={(e) => setBrief(e.target.value)}
                                    placeholder="What should students build? Features, constraints, what you expect to see working."
                                    maxLength={6000}
                                />
                                <p className="mt-1 text-xs text-slate-400">
                                    Students see this, and the AI grades against it — specific briefs
                                    produce specific reports.
                                </p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="pe-stack" className="mb-1 block text-sm font-medium text-gray-900">
                                        Expected stack <span className="font-normal text-slate-400">· optional</span>
                                    </label>
                                    <input
                                        id="pe-stack"
                                        className={inputClass}
                                        value={techStack}
                                        onChange={(e) => setTechStack(e.target.value)}
                                        placeholder="React + Node/Express + MongoDB"
                                        maxLength={200}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="pe-due" className="mb-1 block text-sm font-medium text-gray-900">
                                        Due date <span className="font-normal text-slate-400">· optional</span>
                                    </label>
                                    <input
                                        id="pe-due"
                                        type="datetime-local"
                                        className={inputClass}
                                        value={dueAt}
                                        onChange={(e) => setDueAt(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className={sectionClass}>
                        <Eyebrow>Who submits</Eyebrow>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(
                                [
                                    {
                                        mode: "all_students" as const,
                                        label: "All my students",
                                        hint: "Everyone enrolled with you, across classes",
                                    },
                                    {
                                        mode: "classes" as const,
                                        label: "Specific classes",
                                        hint: "Pick which classes see this",
                                    },
                                ]
                            ).map((opt) => {
                                const active = assignedMode === opt.mode;
                                return (
                                    <button
                                        key={opt.mode}
                                        type="button"
                                        onClick={() => setAssignedMode(opt.mode)}
                                        aria-pressed={active}
                                        className={`rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                                            active
                                                ? "border-primary-500 bg-primary-50/60 dark:bg-primary-500/10"
                                                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500"
                                        }`}
                                    >
                                        <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                                        <span className="mt-0.5 block text-xs text-slate-500">{opt.hint}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {assignedMode === "classes" && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {classes.length === 0 && (
                                    <p className="text-sm text-slate-500">No classes found.</p>
                                )}
                                {classes.map((c) => {
                                    const selected = classIds.includes(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() =>
                                                setClassIds((prev) =>
                                                    selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                                                )
                                            }
                                            className={`rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                                                selected
                                                    ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
                                                    : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-400"
                                            }`}
                                        >
                                            {c.name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <section className={sectionClass}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <Eyebrow>Rubric</Eyebrow>
                                <p className="mt-1 text-xs text-slate-500">
                                    The AI scores each parameter separately and cites files as evidence.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setParams((prev) =>
                                        prev.length >= 12
                                            ? prev
                                            : [...prev, { title: "", description: "", maxScore: "10" }]
                                    )
                                }
                            >
                                Add parameter
                            </Button>
                        </div>

                        <div className="mt-4 space-y-3">
                            {params.map((p, i) => (
                                <div
                                    key={i}
                                    className="relative rounded-xl border border-slate-200 dark:border-slate-700 pl-4 pr-3 py-3 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-xl before:bg-primary-200 dark:before:bg-primary-500/40"
                                >
                                    <div className="flex items-start gap-2">
                                        <input
                                            className={`${inputClass} font-medium`}
                                            value={p.title}
                                            onChange={(e) => updateParam(i, { title: e.target.value })}
                                            placeholder="Parameter — e.g. Authentication & security"
                                            maxLength={120}
                                            aria-label={`Parameter ${i + 1} name`}
                                        />
                                        <div className="flex shrink-0 items-center gap-1">
                                            <input
                                                className={`${inputClass} w-16 text-center tabular-nums`}
                                                value={p.maxScore}
                                                onChange={(e) =>
                                                    updateParam(i, {
                                                        maxScore: e.target.value.replace(/[^0-9]/g, ""),
                                                    })
                                                }
                                                inputMode="numeric"
                                                aria-label={`Parameter ${i + 1} marks`}
                                            />
                                            <span className="text-xs text-slate-400">marks</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="mt-2 shrink-0 rounded p-1 text-slate-400 hover:text-danger-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
                                            onClick={() => setParams((prev) => prev.filter((_, idx) => idx !== i))}
                                            aria-label={`Remove parameter ${i + 1}`}
                                        >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <textarea
                                        className={`${inputClass} mt-2 min-h-[58px] text-[13px] leading-relaxed`}
                                        value={p.description}
                                        onChange={(e) => updateParam(i, { description: e.target.value })}
                                        placeholder="What earns full marks here? The AI reads this sentence-by-sentence."
                                        maxLength={1200}
                                        aria-label={`Parameter ${i + 1} expectation`}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* ── Live summary rail ────────────────────────────────── */}
                <aside className="lg:sticky lg:top-6 h-fit space-y-4">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface p-5 shadow-soft-sm">
                        <Eyebrow>Marksheet preview</Eyebrow>
                        <div className="mt-3 space-y-2">
                            {params.filter((p) => p.title.trim()).length === 0 ? (
                                <p className="text-sm text-slate-400">Name a parameter to see it here.</p>
                            ) : (
                                params
                                    .filter((p) => p.title.trim())
                                    .map((p, i) => (
                                        <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                                            <span className="truncate text-slate-600 dark:text-slate-300">{p.title}</span>
                                            <span className="shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                                                {Number(p.maxScore) || 0}
                                            </span>
                                        </div>
                                    ))
                            )}
                        </div>
                        <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
                            <span className="text-sm font-medium text-gray-900">Total</span>
                            <span className="font-display text-xl font-bold tabular-nums text-gray-900">
                                {totalMarks}
                                <span className="ml-1 font-mono text-xs font-normal text-slate-400">marks</span>
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Button variant="primary" fullWidth disabled={saving} onClick={() => save(true)}>
                            {saving ? "Saving…" : "Publish to students"}
                        </Button>
                        <Button variant="outline" fullWidth disabled={saving} onClick={() => save(false)}>
                            Save as draft
                        </Button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
