"use client";

/** Font family picker (dropdown) for the resume. */
import { useEffect, useRef, useState } from "react";
import { RESUME_FONTS } from "@digimine/types";

interface Props {
    value: string;
    onChange: (id: string) => void;
}

export default function FontSelect({ value, onChange }: Props) {
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

    const current = RESUME_FONTS.find((f) => f.id === value) ?? RESUME_FONTS[0];

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="inline-flex min-w-[140px] items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
                {current.label}
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
                    className="absolute left-0 top-full z-40 mt-1.5 max-h-72 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                >
                    {RESUME_FONTS.map((f) => {
                        const selected = f.id === value;
                        return (
                            <button
                                key={f.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                    onChange(f.id);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/60 ${
                                    selected ? "bg-primary-50/70 dark:bg-primary-500/10" : ""
                                }`}
                            >
                                <span className="font-medium text-slate-800 dark:text-slate-100">{f.label}</span>
                                <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                                    {f.serif ? "Serif" : "Sans"}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
