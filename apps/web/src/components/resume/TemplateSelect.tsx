"use client";

/** Polished template picker dropdown (replaces the basic native <select>). */
import { useEffect, useRef, useState } from "react";
import { RESUME_TEMPLATE_FAMILIES, resumeTemplateFamily, type ResumeTemplateSpec } from "@digimine/types";

interface Props {
    templates: ResumeTemplateSpec[];
    value: string;
    onChange: (id: string) => void;
}

export default function TemplateSelect({ templates, value, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const current = templates.find((t) => t.id === value) ?? templates[0];

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="inline-flex min-w-[150px] items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
                {current?.label ?? "Template"}
                <svg
                    className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div
                    role="listbox"
                    className="absolute left-0 top-full z-40 mt-1.5 max-h-[min(70vh,400px)] w-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                >
                    {RESUME_TEMPLATE_FAMILIES.map((fam) => {
                        const items = templates.filter((t) => resumeTemplateFamily(t) === fam);
                        if (!items.length) return null;
                        return (
                            <div key={fam}>
                                <div className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    {fam}
                                </div>
                                {items.map((t) => {
                                    const selected = t.id === value;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            role="option"
                                            aria-selected={selected}
                                            onClick={() => {
                                                onChange(t.id);
                                                setOpen(false);
                                            }}
                                            className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/60 ${
                                                selected ? "bg-primary-50/70 dark:bg-primary-500/10" : ""
                                            }`}
                                        >
                                            <span className="mt-0.5 w-4 shrink-0 text-primary-600">
                                                {selected && (
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</span>
                                                    {!t.builtin && (
                                                        <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                                            Custom
                                                        </span>
                                                    )}
                                                </span>
                                                {t.blurb && (
                                                    <span className="mt-0.5 block text-xs text-slate-400 line-clamp-1">{t.blurb}</span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
