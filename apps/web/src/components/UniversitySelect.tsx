"use client";

/**
 * Typeahead picker for the university directory. As the teacher types we hit
 * /api/universities/search (debounced) and show ranked matches; picking one
 * links the canonical row, and "Add …" lets them create a new one. The actual
 * dedupe/create happens server-side on submit, so free text is always safe.
 */
import { useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { textInputClass } from "@/components/onboarding";

export interface UniversityValue {
    /** Set once linked to a real directory row; null while it's free text. */
    id?: string | null;
    name: string;
}

interface Suggestion {
    university: {
        id: string;
        name: string;
        slug: string;
        shortName: string | null;
        city: string | null;
        state: string | null;
    };
    score: number;
    matchedOn: "exact" | "alias" | "acronym" | "fuzzy";
}

export function UniversitySelect({
    firebaseUser,
    value,
    onChange,
    disabled,
    placeholder,
}: {
    firebaseUser: FirebaseUser | null;
    value: UniversityValue;
    onChange: (v: UniversityValue) => void;
    disabled?: boolean;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value.name || "");
    const [items, setItems] = useState<Suggestion[]>([]);
    const [canCreate, setCanCreate] = useState(false);
    const [loading, setLoading] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep the input mirrored if the parent resets the value.
    useEffect(() => {
        setQuery(value.name || "");
    }, [value.name]);

    // Close the dropdown on an outside click.
    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    function runSearch(q: string) {
        if (!firebaseUser) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await teacherFetch(
                    firebaseUser,
                    `/api/universities/search?q=${encodeURIComponent(q)}`
                );
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
                    setCanCreate(Boolean(data.canCreate));
                }
            } catch {
                /* leave prior suggestions; the create fallback still works */
            } finally {
                setLoading(false);
            }
        }, 220);
    }

    function handleInput(v: string) {
        setQuery(v);
        // Typing un-links any previously chosen row — it becomes free text
        // until they pick again (the server resolves it on submit anyway).
        onChange({ id: null, name: v });
        setOpen(true);
        runSearch(v);
    }

    function pick(s: Suggestion) {
        // Seed-only rows have a synthetic "seed:" id — treat them as unlinked
        // so the server persists a real row on submit.
        const realId = s.university.id.startsWith("seed:") ? null : s.university.id;
        onChange({ id: realId, name: s.university.name });
        setQuery(s.university.name);
        setOpen(false);
    }

    function createNew() {
        onChange({ id: null, name: query.trim() });
        setOpen(false);
    }

    const showDropdown = open && query.trim().length > 0;

    return (
        <div className="relative" ref={boxRef}>
            <input
                type="text"
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                onFocus={() => {
                    setOpen(true);
                    if (!items.length) runSearch(query);
                }}
                className={textInputClass}
                placeholder={placeholder || "Start typing — e.g. Chandigarh University or CU"}
                disabled={disabled}
                autoComplete="off"
                role="combobox"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
            />

            {value.id ? (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                    Linked
                </span>
            ) : null}

            {showDropdown && (
                <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {items.map((s) => {
                        const sub = [s.university.shortName, s.university.city, s.university.state]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                            <button
                                type="button"
                                key={s.university.id}
                                onClick={() => pick(s)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                                <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {s.university.name}
                                </span>
                                {sub ? (
                                    <span className="shrink-0 text-xs text-slate-400">{sub}</span>
                                ) : null}
                            </button>
                        );
                    })}

                    {canCreate && query.trim().length >= 2 && (
                        <button
                            type="button"
                            onClick={createNew}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-primary-700 hover:bg-primary-50 dark:border-slate-800 dark:text-primary-300 dark:hover:bg-primary-500/10"
                        >
                            <span className="text-base leading-none">＋</span>
                            <span>
                                Add &ldquo;<span className="font-semibold">{query.trim()}</span>&rdquo; as a new
                                university
                            </span>
                        </button>
                    )}

                    {loading && !items.length ? (
                        <div className="px-4 py-2.5 text-sm text-slate-400">Searching…</div>
                    ) : null}
                    {!loading && !items.length && !canCreate ? (
                        <div className="px-4 py-2.5 text-sm text-slate-400">Keep typing…</div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
