"use client";

/**
 * Admin → Mega-nav editor.
 *
 * Lets an admin reshape the public header end-to-end:
 *   - Add / rename / reorder / delete top-level items
 *   - Edit each item's hero block (heading, description, CTA, gradient, image, stats)
 *   - Edit each item's section list (heading + sub-links with optional description)
 *   - Edit each item's featured cards (title, description, target, gradient, image, badge)
 *
 * Edits are kept in local state until "Save" — at which point the payload
 * is PUT to /api/admin/site-config/mega-nav. The server re-validates the
 * tree and only writes Firestore + invalidates the Redis cache if the
 * payload is well-formed. Validation errors come back per-path and are
 * surfaced inline.
 *
 * Safety affordances:
 *   - "Reset to defaults" reverts the form to the static config the app
 *     ships with (handy if an edit went sideways).
 *   - "Discard changes" rolls back to the last saved snapshot.
 *   - Unsaved-state pill in the header so you can't accidentally navigate
 *     away thinking the change is live.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/api";

// ─── Types (mirror apps/web/src/components/layout/megaNavData.ts) ──────

type MegaAccent = "primary" | "amber" | "emerald" | "indigo" | "rose" | "violet";

interface MegaLink {
    label: string;
    href: string;
    description?: string;
}

interface MegaSection {
    heading: string;
    items: MegaLink[];
}

interface MegaFeatured {
    title: string;
    description: string;
    href: string;
    gradient: string;
    imageUrl?: string;
    badge?: string;
}

interface MegaHero {
    heading: string;
    description: string;
    cta: { label: string; href: string };
    gradient: string;
    imageUrl?: string;
    stats?: { value: string; label: string }[];
}

interface MegaItem {
    label: string;
    href: string;
    accent: MegaAccent;
    hero: MegaHero;
    sections: MegaSection[];
    featured: MegaFeatured[];
}

const ACCENT_OPTIONS: { value: MegaAccent; label: string; chip: string }[] = [
    { value: "primary", label: "Primary (teal)", chip: "bg-teal-500" },
    { value: "amber", label: "Amber", chip: "bg-amber-500" },
    { value: "emerald", label: "Emerald", chip: "bg-emerald-500" },
    { value: "indigo", label: "Indigo", chip: "bg-indigo-500" },
    { value: "rose", label: "Rose", chip: "bg-rose-500" },
    { value: "violet", label: "Violet", chip: "bg-violet-500" },
];

const GRADIENT_PRESETS: { label: string; value: string }[] = [
    { label: "Teal (primary)", value: "from-primary-500 to-primary-700" },
    { label: "Teal → amber", value: "from-primary-500 via-emerald-400 to-amber-400" },
    { label: "Amber", value: "from-amber-400 to-amber-600" },
    { label: "Indigo → violet", value: "from-indigo-500 to-violet-600" },
    { label: "Rose → orange", value: "from-rose-500 to-orange-500" },
    { label: "Emerald", value: "from-emerald-500 to-teal-600" },
    { label: "Slate", value: "from-slate-700 to-slate-900" },
];

const EMPTY_ITEM: MegaItem = {
    label: "New section",
    href: "/",
    accent: "primary",
    hero: {
        heading: "Heading",
        description: "Short description shown in the hero block.",
        cta: { label: "Learn more", href: "/" },
        gradient: "from-primary-500 to-primary-700",
    },
    sections: [],
    featured: [],
};

// ─── Page component ────────────────────────────────────────────────────

export default function MegaNavAdminPage() {
    const [items, setItems] = useState<MegaItem[] | null>(null);
    const [savedSnapshot, setSavedSnapshot] = useState<string>("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [validationErrors, setValidationErrors] = useState<
        { path: string; message: string }[]
    >([]);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await authedFetch("/api/admin/site-config/mega-nav");
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Failed to load");
            const next = (data.items || []) as MegaItem[];
            setItems(next);
            setSavedSnapshot(JSON.stringify(next));
        } catch (e) {
            setError((e as Error)?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const dirty = useMemo(
        () => items !== null && JSON.stringify(items) !== savedSnapshot,
        [items, savedSnapshot]
    );

    const updateItem = (idx: number, patch: Partial<MegaItem>) => {
        setItems((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], ...patch };
            return next;
        });
    };

    const moveItem = (idx: number, dir: -1 | 1) => {
        setItems((prev) => {
            if (!prev) return prev;
            const target = idx + dir;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(idx, 1);
            next.splice(target, 0, moved);
            return next;
        });
        setActiveIndex((curr) => {
            if (curr === idx) return idx + dir;
            if (curr === idx + dir) return idx;
            return curr;
        });
    };

    const addItem = () => {
        setItems((prev) => {
            const next = [...(prev || []), JSON.parse(JSON.stringify(EMPTY_ITEM)) as MegaItem];
            setActiveIndex(next.length - 1);
            return next;
        });
    };

    const deleteItem = (idx: number) => {
        if (!confirm("Delete this top-level item? This affects the public header.")) return;
        setItems((prev) => {
            if (!prev) return prev;
            const next = prev.filter((_, i) => i !== idx);
            setActiveIndex((c) => Math.min(c, Math.max(next.length - 1, 0)));
            return next;
        });
    };

    const save = async () => {
        if (!items) return;
        setSaving(true);
        setError("");
        setValidationErrors([]);
        try {
            const res = await authedFetch("/api/admin/site-config/mega-nav", {
                method: "PUT",
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (Array.isArray(data?.details)) {
                    setValidationErrors(data.details);
                }
                throw new Error(data?.error || "Save failed");
            }
            setSavedSnapshot(JSON.stringify(items));
            setSavedAt(Date.now());
        } catch (e) {
            setError((e as Error)?.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        if (dirty && !confirm("Discard all unsaved changes?")) return;
        if (savedSnapshot) setItems(JSON.parse(savedSnapshot) as MegaItem[]);
        setValidationErrors([]);
        setError("");
    };

    const resetDefaults = async () => {
        if (
            !confirm(
                "Wipe the Firestore config and revert the public header to the code defaults? You can re-edit afterwards."
            )
        )
            return;
        setSaving(true);
        setError("");
        try {
            const res = await authedFetch("/api/admin/site-config/mega-nav", {
                method: "DELETE",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Reset failed");
            }
        } catch (e) {
            setError((e as Error)?.message || "Reset failed");
        } finally {
            await load();
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-32 animate-pulse rounded-xl bg-slate-100"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (!items) {
        return (
            <div className="p-8">
                <p className="text-sm text-rose-600">{error || "Failed to load."}</p>
                <button
                    onClick={load}
                    className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                    Retry
                </button>
            </div>
        );
    }

    const active = items[activeIndex];
    const errorsForPath = (prefix: string) =>
        validationErrors.filter((e) => e.path.startsWith(prefix));

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-900">Mega-nav</h1>
                        {dirty && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                UNSAVED
                            </span>
                        )}
                        {savedAt && !dirty && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                Saved
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Full control of the public header — top-level items, hero blocks,
                        section lists, and featured cards. Saves invalidate the cached
                        copy immediately.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
                    >
                        Back to dashboard
                    </Link>
                    <button
                        onClick={discard}
                        disabled={!dirty || saving}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Discard
                    </button>
                    <button
                        onClick={resetDefaults}
                        disabled={saving}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Reset to defaults
                    </button>
                    <button
                        onClick={save}
                        disabled={!dirty || saving}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </header>

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                </div>
            )}
            {validationErrors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold">Fix the following before saving:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {validationErrors.map((e, i) => (
                            <li key={i}>
                                <code className="rounded bg-white/70 px-1 font-mono">
                                    {e.path}
                                </code>{" "}
                                — {e.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Top-level item tabs */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                {items.map((it, i) => (
                    <button
                        key={i}
                        onClick={() => setActiveIndex(i)}
                        className={
                            "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors " +
                            (i === activeIndex
                                ? "bg-slate-900 text-white"
                                : "text-slate-600 hover:bg-slate-100")
                        }
                    >
                        {it.label || `Item ${i + 1}`}
                    </button>
                ))}
                <button
                    onClick={addItem}
                    className="ml-auto rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700"
                >
                    + Add item
                </button>
            </div>

            {active && (
                <div className="space-y-6">
                    {/* Top-level fields */}
                    <Card title="Top-level item" subtitle="Shown as a trigger in the header.">
                        <div className="grid gap-4 md:grid-cols-3">
                            <Field
                                label="Label"
                                value={active.label}
                                onChange={(v) => updateItem(activeIndex, { label: v })}
                                placeholder="e.g. Practice"
                                errors={errorsForPath(`items[${activeIndex}].label`)}
                            />
                            <Field
                                label="Href"
                                value={active.href}
                                onChange={(v) => updateItem(activeIndex, { href: v })}
                                placeholder="/practice"
                                errors={errorsForPath(`items[${activeIndex}].href`)}
                            />
                            <SelectField
                                label="Accent color"
                                value={active.accent}
                                onChange={(v) =>
                                    updateItem(activeIndex, { accent: v as MegaAccent })
                                }
                                options={ACCENT_OPTIONS.map((o) => ({
                                    value: o.value,
                                    label: o.label,
                                }))}
                            />
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs">
                            <span className="text-slate-500">Reorder:</span>
                            <button
                                onClick={() => moveItem(activeIndex, -1)}
                                disabled={activeIndex === 0}
                                className="rounded border border-slate-200 px-2 py-1 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                ← Move left
                            </button>
                            <button
                                onClick={() => moveItem(activeIndex, 1)}
                                disabled={activeIndex === items.length - 1}
                                className="rounded border border-slate-200 px-2 py-1 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Move right →
                            </button>
                            <button
                                onClick={() => deleteItem(activeIndex)}
                                disabled={items.length <= 1}
                                className="ml-auto rounded border border-rose-200 px-2 py-1 text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Delete item
                            </button>
                        </div>
                    </Card>

                    {/* Hero */}
                    <Card title="Hero block" subtitle="Left column of the dropdown panel.">
                        <HeroEditor
                            hero={active.hero}
                            onChange={(hero) => updateItem(activeIndex, { hero })}
                            errorsForPath={(suffix) =>
                                errorsForPath(`items[${activeIndex}].hero${suffix}`)
                            }
                        />
                    </Card>

                    {/* Sections */}
                    <Card
                        title="Sections"
                        subtitle="Middle column. Each section is a heading + list of links."
                    >
                        <SectionsEditor
                            sections={active.sections}
                            onChange={(sections) => updateItem(activeIndex, { sections })}
                            errorsForPath={(suffix) =>
                                errorsForPath(`items[${activeIndex}].sections${suffix}`)
                            }
                        />
                    </Card>

                    {/* Featured */}
                    <Card
                        title="Featured cards"
                        subtitle="Right column. Promoted articles / tests / courses, etc."
                    >
                        <FeaturedEditor
                            featured={active.featured}
                            onChange={(featured) => updateItem(activeIndex, { featured })}
                            errorsForPath={(suffix) =>
                                errorsForPath(`items[${activeIndex}].featured${suffix}`)
                            }
                        />
                    </Card>
                </div>
            )}
        </div>
    );
}

// ─── Reusable form primitives ──────────────────────────────────────────

function Card({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                {subtitle && (
                    <p className="text-xs text-slate-500">{subtitle}</p>
                )}
            </header>
            <div className="p-5">{children}</div>
        </section>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    errors = [],
    helper,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    errors?: { path: string; message: string }[];
    helper?: string;
}) {
    return (
        <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={
                    "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 " +
                    (errors.length > 0 ? "border-rose-300" : "border-slate-200")
                }
            />
            {helper && <p className="mt-1 text-[11px] text-slate-400">{helper}</p>}
            {errors.map((e, i) => (
                <p key={i} className="mt-1 text-[11px] text-rose-600">
                    {e.message}
                </p>
            ))}
        </label>
    );
}

function TextArea({
    label,
    value,
    onChange,
    rows = 3,
    placeholder,
    errors = [],
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    rows?: number;
    placeholder?: string;
    errors?: { path: string; message: string }[];
}) {
    return (
        <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <textarea
                value={value}
                rows={rows}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={
                    "mt-1 w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 " +
                    (errors.length > 0 ? "border-rose-300" : "border-slate-200")
                }
            />
            {errors.map((e, i) => (
                <p key={i} className="mt-1 text-[11px] text-rose-600">
                    {e.message}
                </p>
            ))}
        </label>
    );
}

function SelectField({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function GradientPicker({
    value,
    onChange,
    label = "Gradient",
}: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
}) {
    const preset = GRADIENT_PRESETS.find((p) => p.value === value);
    return (
        <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
                {GRADIENT_PRESETS.map((p) => (
                    <button
                        key={p.value}
                        type="button"
                        onClick={() => onChange(p.value)}
                        className={
                            "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition " +
                            (value === p.value
                                ? "border-primary-400 bg-primary-50 text-primary-800"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")
                        }
                    >
                        <span
                            className={`h-4 w-8 rounded bg-gradient-to-br ${p.value}`}
                        />
                        {p.label}
                    </button>
                ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
                Or type a Tailwind gradient class string below.{" "}
                {preset && (
                    <span className="text-slate-500">
                        Selected: <code>{preset.value}</code>
                    </span>
                )}
            </p>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                placeholder="from-primary-500 to-amber-500"
            />
        </div>
    );
}

// ─── Hero editor ───────────────────────────────────────────────────────

function HeroEditor({
    hero,
    onChange,
    errorsForPath,
}: {
    hero: MegaHero;
    onChange: (hero: MegaHero) => void;
    errorsForPath: (suffix: string) => { path: string; message: string }[];
}) {
    const set = <K extends keyof MegaHero>(k: K, v: MegaHero[K]) =>
        onChange({ ...hero, [k]: v });
    const stats = hero.stats || [];

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Field
                    label="Heading"
                    value={hero.heading}
                    onChange={(v) => set("heading", v)}
                    errors={errorsForPath(".heading")}
                />
                <Field
                    label="Image URL (optional)"
                    value={hero.imageUrl || ""}
                    onChange={(v) => set("imageUrl", v || undefined)}
                    placeholder="https://…"
                />
            </div>
            <TextArea
                label="Description"
                value={hero.description}
                onChange={(v) => set("description", v)}
                rows={2}
                errors={errorsForPath(".description")}
            />
            <div className="grid gap-4 md:grid-cols-2">
                <Field
                    label="CTA label"
                    value={hero.cta.label}
                    onChange={(v) => set("cta", { ...hero.cta, label: v })}
                    errors={errorsForPath(".cta.label")}
                />
                <Field
                    label="CTA href"
                    value={hero.cta.href}
                    onChange={(v) => set("cta", { ...hero.cta, href: v })}
                    errors={errorsForPath(".cta.href")}
                />
            </div>
            <GradientPicker
                value={hero.gradient}
                onChange={(v) => set("gradient", v)}
            />
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Stats (optional, max 3)
                    </p>
                    <button
                        type="button"
                        onClick={() =>
                            set("stats", [...stats, { value: "", label: "" }].slice(0, 3))
                        }
                        disabled={stats.length >= 3}
                        className="text-xs font-semibold text-primary-700 hover:text-primary-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        + Add stat
                    </button>
                </div>
                <div className="mt-2 space-y-2">
                    {stats.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                value={s.value}
                                onChange={(e) => {
                                    const next = [...stats];
                                    next[i] = { ...s, value: e.target.value };
                                    set("stats", next);
                                }}
                                placeholder="200+"
                                className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                            />
                            <input
                                value={s.label}
                                onChange={(e) => {
                                    const next = [...stats];
                                    next[i] = { ...s, label: e.target.value };
                                    set("stats", next);
                                }}
                                placeholder="problems"
                                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => set("stats", stats.filter((_, j) => j !== i))}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Sections editor ───────────────────────────────────────────────────

function SectionsEditor({
    sections,
    onChange,
    errorsForPath,
}: {
    sections: MegaSection[];
    onChange: (sections: MegaSection[]) => void;
    errorsForPath: (suffix: string) => { path: string; message: string }[];
}) {
    const addSection = () =>
        onChange([...sections, { heading: "New section", items: [] }]);
    const updateSection = (i: number, patch: Partial<MegaSection>) => {
        const next = [...sections];
        next[i] = { ...next[i], ...patch };
        onChange(next);
    };
    const removeSection = (i: number) =>
        onChange(sections.filter((_, j) => j !== i));

    return (
        <div className="space-y-3">
            {sections.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    No sections yet. Sections appear as labeled columns in the middle of
                    the dropdown.
                </p>
            )}
            {sections.map((s, sIdx) => (
                <div
                    key={sIdx}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                >
                    <div className="flex items-center gap-2">
                        <input
                            value={s.heading}
                            onChange={(e) => updateSection(sIdx, { heading: e.target.value })}
                            placeholder="Section heading"
                            className={
                                "flex-1 rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 " +
                                (errorsForPath(`[${sIdx}].heading`).length > 0
                                    ? "border-rose-300"
                                    : "border-slate-200")
                            }
                        />
                        <button
                            type="button"
                            onClick={() => removeSection(sIdx)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300"
                        >
                            Remove section
                        </button>
                    </div>
                    <div className="mt-2 space-y-2">
                        {s.items.map((it, iIdx) => (
                            <div
                                key={iIdx}
                                className="grid grid-cols-12 gap-2 rounded-lg bg-slate-50 p-2"
                            >
                                <input
                                    value={it.label}
                                    onChange={(e) => {
                                        const next = [...s.items];
                                        next[iIdx] = { ...it, label: e.target.value };
                                        updateSection(sIdx, { items: next });
                                    }}
                                    placeholder="Link label"
                                    className={
                                        "col-span-3 rounded-lg border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 " +
                                        (errorsForPath(`[${sIdx}].items[${iIdx}].label`).length > 0
                                            ? "border-rose-300"
                                            : "border-slate-200")
                                    }
                                />
                                <input
                                    value={it.href}
                                    onChange={(e) => {
                                        const next = [...s.items];
                                        next[iIdx] = { ...it, href: e.target.value };
                                        updateSection(sIdx, { items: next });
                                    }}
                                    placeholder="/path"
                                    className={
                                        "col-span-4 rounded-lg border bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 " +
                                        (errorsForPath(`[${sIdx}].items[${iIdx}].href`).length > 0
                                            ? "border-rose-300"
                                            : "border-slate-200")
                                    }
                                />
                                <input
                                    value={it.description || ""}
                                    onChange={(e) => {
                                        const next = [...s.items];
                                        next[iIdx] = {
                                            ...it,
                                            description: e.target.value || undefined,
                                        };
                                        updateSection(sIdx, { items: next });
                                    }}
                                    placeholder="Description (optional)"
                                    className="col-span-4 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = s.items.filter((_, j) => j !== iIdx);
                                        updateSection(sIdx, { items: next });
                                    }}
                                    className="col-span-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() =>
                                updateSection(sIdx, {
                                    items: [...s.items, { label: "", href: "" }],
                                })
                            }
                            className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700"
                        >
                            + Add link
                        </button>
                    </div>
                </div>
            ))}
            <button
                type="button"
                onClick={addSection}
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700"
            >
                + Add section
            </button>
        </div>
    );
}

// ─── Featured editor ───────────────────────────────────────────────────

function FeaturedEditor({
    featured,
    onChange,
    errorsForPath,
}: {
    featured: MegaFeatured[];
    onChange: (featured: MegaFeatured[]) => void;
    errorsForPath: (suffix: string) => { path: string; message: string }[];
}) {
    const addCard = () =>
        onChange([
            ...featured,
            {
                title: "",
                description: "",
                href: "",
                gradient: "from-primary-500 to-primary-700",
            },
        ]);
    const update = (i: number, patch: Partial<MegaFeatured>) => {
        const next = [...featured];
        next[i] = { ...next[i], ...patch };
        onChange(next);
    };
    const remove = (i: number) => onChange(featured.filter((_, j) => j !== i));

    return (
        <div className="space-y-3">
            {featured.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    No featured cards yet. Up to 3 surface in the dropdown.
                </p>
            )}
            {featured.map((f, fIdx) => (
                <div
                    key={fIdx}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                >
                    <div className="grid gap-3 md:grid-cols-2">
                        <Field
                            label="Title"
                            value={f.title}
                            onChange={(v) => update(fIdx, { title: v })}
                            errors={errorsForPath(`[${fIdx}].title`)}
                        />
                        <Field
                            label="Href"
                            value={f.href}
                            onChange={(v) => update(fIdx, { href: v })}
                            errors={errorsForPath(`[${fIdx}].href`)}
                        />
                    </div>
                    <div className="mt-3">
                        <TextArea
                            label="Description"
                            value={f.description}
                            onChange={(v) => update(fIdx, { description: v })}
                            rows={2}
                        />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Field
                            label="Image URL (optional)"
                            value={f.imageUrl || ""}
                            onChange={(v) =>
                                update(fIdx, { imageUrl: v || undefined })
                            }
                            placeholder="https://…"
                        />
                        <Field
                            label="Badge (optional)"
                            value={f.badge || ""}
                            onChange={(v) => update(fIdx, { badge: v || undefined })}
                            placeholder="e.g. Free, Live"
                        />
                    </div>
                    <div className="mt-3">
                        <GradientPicker
                            value={f.gradient}
                            onChange={(v) => update(fIdx, { gradient: v })}
                        />
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            onClick={() => remove(fIdx)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300"
                        >
                            Remove card
                        </button>
                    </div>
                </div>
            ))}
            <button
                type="button"
                onClick={addCard}
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700"
            >
                + Add featured card
            </button>
        </div>
    );
}
