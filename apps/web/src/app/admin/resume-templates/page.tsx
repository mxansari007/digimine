"use client";

/**
 * Admin: build custom resume templates. Data-driven — the spec the admin sets
 * here renders identically in the student preview and the PDF (it's the same
 * ResumeTemplateSpec). Gated: this page checks isAdmin client-side and the
 * /api/admin/resume-templates route enforces requireAdmin server-side.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/common";
import ResumePreview from "@/components/resume/ResumePreview";
import {
    BUILTIN_RESUME_TEMPLATES,
    DEFAULT_RESUME_ACCENT,
    RESUME_ACCENT_COLORS,
    RESUME_FONTS,
    SAMPLE_RESUME_DATA,
    TEMPLATE_SPEC_BOUNDS,
    type ResumeHeadingStyle,
    type ResumeTemplateSpec,
} from "@digimine/types";

type Draft = ResumeTemplateSpec;

function blankFrom(base: ResumeTemplateSpec): Draft {
    return { ...base, id: "", label: `${base.label} copy`, blurb: base.blurb, builtin: false };
}

const INPUT =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

function Num({
    label,
    value,
    bounds,
    onChange,
}: {
    label: string;
    value: number;
    bounds: readonly [number, number];
    onChange: (v: number) => void;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                {label} <span className="text-slate-400">({bounds[0]}–{bounds[1]})</span>
            </span>
            <input
                type="number"
                className={INPUT}
                value={value}
                min={bounds[0]}
                max={bounds[1]}
                step={0.5}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </label>
    );
}

export default function AdminResumeTemplatesPage() {
    const { firebaseUser, isAdmin, loading } = useAuthContext();
    const toast = useToast();

    const [ready, setReady] = useState(false);
    const [customs, setCustoms] = useState<ResumeTemplateSpec[]>([]);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [accent, setAccent] = useState<string>(DEFAULT_RESUME_ACCENT);
    const [saving, setSaving] = useState(false);

    const adminFetch = useCallback(
        async (method: "GET" | "PUT", body?: unknown) => {
            if (!firebaseUser) throw new Error("Not signed in");
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/admin/resume-templates", {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: body ? JSON.stringify(body) : undefined,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as any)?.error || "Request failed");
            return json as { custom: ResumeTemplateSpec[]; builtins: ResumeTemplateSpec[] };
        },
        [firebaseUser]
    );

    useEffect(() => {
        if (!firebaseUser || !isAdmin) return;
        adminFetch("GET")
            .then((r) => setCustoms(r.custom))
            .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
            .finally(() => setReady(true));
    }, [firebaseUser, isAdmin, adminFetch, toast]);

    const persist = async (next: ResumeTemplateSpec[]) => {
        setSaving(true);
        try {
            const r = await adminFetch("PUT", { templates: next });
            setCustoms(r.custom);
            return r.custom;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save");
            return null;
        } finally {
            setSaving(false);
        }
    };

    const saveDraft = async () => {
        if (!draft) return;
        if (!draft.label.trim()) {
            toast.error("Give the template a name.");
            return;
        }
        // Upsert by id (existing) or append (new, id === "").
        const exists = draft.id && customs.some((c) => c.id === draft.id);
        const next = exists ? customs.map((c) => (c.id === draft.id ? draft : c)) : [...customs, draft];
        const saved = await persist(next);
        if (saved) {
            setDraft(null);
            toast.success("Template saved");
        }
    };

    const remove = async (id: string) => {
        if (!window.confirm("Delete this template? Resumes using it fall back to Classic.")) return;
        await persist(customs.filter((c) => c.id !== id));
    };

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((d) => (d ? { ...d, [key]: value } : d));

    const previewSpec = useMemo<ResumeTemplateSpec | null>(() => draft, [draft]);

    if (loading) return <PageLoading />;
    if (!isAdmin) {
        return (
            <div className="mx-auto max-w-md p-10 text-center">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admins only</h1>
                <p className="mt-2 text-sm text-slate-500">You need an admin account to manage resume templates.</p>
                <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-primary-600">
                    ← Back to dashboard
                </Link>
            </div>
        );
    }
    if (!ready) return <PageLoading />;

    const B = TEMPLATE_SPEC_BOUNDS;

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        Resume Templates
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Create ATS-safe templates students can pick. Changes apply to the preview and the PDF.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {BUILTIN_RESUME_TEMPLATES.map((b) => (
                        <Button key={b.id} size="sm" variant="outline" onClick={() => setDraft(blankFrom(b))}>
                            + From {b.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Existing custom templates */}
            <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Custom templates ({customs.length})
                </h2>
                {customs.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
                        No custom templates yet. Start one from a built-in base above.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {customs.map((c) => (
                            <div
                                key={c.id}
                                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                                <span className="font-medium text-slate-800 dark:text-slate-100">{c.label}</span>
                                <button onClick={() => setDraft({ ...c })} className="text-xs text-primary-600 hover:underline">
                                    Edit
                                </button>
                                <button onClick={() => remove(c.id)} className="text-xs text-rose-500 hover:underline">
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Editor + live preview */}
            {draft && previewSpec && (
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {draft.id ? "Edit template" : "New template"}
                            </h2>
                            <button onClick={() => setDraft(null)} className="text-xs text-slate-400 hover:text-slate-600">
                                Close
                            </button>
                        </div>

                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Name</span>
                            <input className={INPUT} value={draft.label} onChange={(e) => set("label", e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Description</span>
                            <input className={INPUT} value={draft.blurb} onChange={(e) => set("blurb", e.target.value)} />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <Num label="Name size" value={draft.nameSize} bounds={B.nameSize} onChange={(v) => set("nameSize", v)} />
                            <Num label="Heading size" value={draft.headingSize} bounds={B.headingSize} onChange={(v) => set("headingSize", v)} />
                            <Num label="Body size" value={draft.bodySize} bounds={B.bodySize} onChange={(v) => set("bodySize", v)} />
                            <Num label="Heading letter spacing" value={draft.letterSpacing} bounds={B.letterSpacing} onChange={(v) => set("letterSpacing", v)} />
                            <Num label="Section gap" value={draft.sectionGap} bounds={B.sectionGap} onChange={(v) => set("sectionGap", v)} />
                            <Num label="Entry gap" value={draft.entryGap} bounds={B.entryGap} onChange={(v) => set("entryGap", v)} />
                            <Num label="Page margin" value={draft.margin} bounds={B.margin} onChange={(v) => set("margin", v)} />
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Heading colour</span>
                                <select
                                    className={INPUT}
                                    value={draft.headingStyle}
                                    onChange={(e) => set("headingStyle", e.target.value as ResumeHeadingStyle)}
                                >
                                    <option value="accent">Accent</option>
                                    <option value="dark">Dark</option>
                                    <option value="muted">Muted grey</option>
                                </select>
                            </label>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-1">
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={draft.nameAccent} onChange={(e) => set("nameAccent", e.target.checked)} />
                                Name uses accent colour
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={draft.headingRule} onChange={(e) => set("headingRule", e.target.checked)} />
                                Underline section headings
                            </label>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500">Preview accent</span>
                                {RESUME_ACCENT_COLORS.map((col) => (
                                    <button
                                        key={col}
                                        onClick={() => setAccent(col)}
                                        className={`h-5 w-5 rounded-full ring-2 ring-offset-1 ${accent === col ? "ring-slate-900 dark:ring-white" : "ring-transparent"}`}
                                        style={{ backgroundColor: col }}
                                    />
                                ))}
                            </div>
                            <Button variant="primary" isLoading={saving} onClick={saveDraft}>
                                Save template
                            </Button>
                        </div>
                    </div>

                    {/* Live preview */}
                    <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                        <ResumePreview data={SAMPLE_RESUME_DATA} spec={previewSpec} accent={accent} font={RESUME_FONTS[0]} fontScale={1} mode="document" />
                    </div>
                </div>
            )}
        </div>
    );
}
