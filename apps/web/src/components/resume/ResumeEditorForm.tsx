"use client";

/**
 * The structured resume editor (left pane). Controlled — it never owns the
 * resume; it calls `onChange(nextData)`. AI assist (bullet rewrite, summary
 * generation) is delegated up via callbacks so the page owns quota/error
 * handling.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@digimine/ui";
import RichText from "./RichText";
import {
    REORDERABLE_SECTIONS,
    customSectionIdFromToken,
    customSectionToken,
    isCustomSectionToken,
    normalizeSectionOrder,
} from "@digimine/types";
import type {
    ResumeCertification,
    ResumeCustomEntry,
    ResumeCustomSection,
    ResumeData,
    ResumeEducation,
    ResumeExperience,
    ResumeProject,
    ResumeSectionKey,
    ResumeSkillGroup,
} from "@digimine/types";

const SECTION_LABELS: Record<ResumeSectionKey, string> = REORDERABLE_SECTIONS.reduce(
    (acc, s) => ({ ...acc, [s.key]: s.label }),
    {} as Record<ResumeSectionKey, string>
);

let _seq = 0;
const cid = () => `c${Date.now().toString(36)}${(_seq++).toString(36)}`;

function replaceAt<T>(arr: T[], idx: number, patch: Partial<T>): T[] {
    return arr.map((x, i) => (i === idx ? { ...x, ...patch } : x));
}
function removeAt<T>(arr: T[], idx: number): T[] {
    return arr.filter((_, i) => i !== idx);
}
function moveAt<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
}

const INPUT =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const LABEL = "block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1";

function Text({
    label,
    value,
    onChange,
    placeholder,
    field,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    field?: string;
}) {
    return (
        <label className="block">
            <span className={LABEL}>{label}</span>
            <input
                data-rz-field={field}
                className={INPUT}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
            />
        </label>
    );
}

function SectionCard({
    title,
    children,
    action,
    anchor,
    style,
}: {
    title: string;
    children: ReactNode;
    action?: ReactNode;
    anchor?: string;
    style?: CSSProperties;
}) {
    return (
        <section
            data-rz-anchor={anchor}
            style={style}
            className="scroll-mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft-sm dark:border-slate-700 dark:bg-slate-900"
        >
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                {action}
            </div>
            {children}
        </section>
    );
}

function EntryShell({
    onUp,
    onDown,
    onRemove,
    children,
    anchor,
}: {
    onUp: () => void;
    onDown: () => void;
    onRemove: () => void;
    children: ReactNode;
    anchor?: string;
}) {
    return (
        <div data-rz-anchor={anchor} className="relative scroll-mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="absolute right-2 top-2 flex gap-1 text-slate-400">
                <button type="button" onClick={onUp} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" title="Move up">
                    ↑
                </button>
                <button type="button" onClick={onDown} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" title="Move down">
                    ↓
                </button>
                <button type="button" onClick={onRemove} className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Remove">
                    ✕
                </button>
            </div>
            {children}
        </div>
    );
}

/** Bullet list editor with per-bullet AI "Improve". */
function Bullets({
    bullets,
    onChange,
    role,
    onImprove,
    aiBusy,
    placeholder,
    pathPrefix,
}: {
    bullets: string[];
    onChange: (next: string[]) => void;
    role: string;
    onImprove: (bullet: string, role: string) => Promise<string[]>;
    aiBusy: boolean;
    placeholder?: string;
    pathPrefix?: string;
}) {
    const [busyIdx, setBusyIdx] = useState<number | null>(null);
    const [variants, setVariants] = useState<{ idx: number; options: string[] } | null>(null);

    const improve = async (idx: number) => {
        const text = bullets[idx]?.trim();
        if (!text) return;
        setBusyIdx(idx);
        setVariants(null);
        try {
            const options = await onImprove(text, role);
            if (options.length) setVariants({ idx, options });
        } finally {
            setBusyIdx(null);
        }
    };

    return (
        <div className="space-y-2">
            <span className={LABEL}>Bullet points</span>
            {bullets.map((b, i) => (
                <div key={i}>
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <RichText
                                field={pathPrefix ? `${pathPrefix}.${i}` : undefined}
                                value={b}
                                onChange={(v) => onChange(replaceAtStr(bullets, i, v))}
                                placeholder={placeholder || "Built X that achieved Y, improving Z by N%"}
                                minHeight={44}
                            />
                        </div>
                        <div className="flex w-24 shrink-0 flex-col gap-1">
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    disabled={i === 0}
                                    onClick={() => onChange(moveAt(bullets, i, -1))}
                                    title="Move up"
                                    className="flex-1 rounded-lg border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    disabled={i === bullets.length - 1}
                                    onClick={() => onChange(moveAt(bullets, i, 1))}
                                    title="Move down"
                                    className="flex-1 rounded-lg border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange([...bullets.slice(0, i + 1), bullets[i], ...bullets.slice(i + 1)])}
                                    title="Duplicate bullet"
                                    className="flex flex-1 items-center justify-center rounded-lg border border-slate-200 py-1 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                >
                                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                                        <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                                        <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
                                    </svg>
                                </button>
                            </div>
                            <button
                                type="button"
                                disabled={aiBusy || busyIdx === i || !b.trim()}
                                onClick={() => improve(i)}
                                className="whitespace-nowrap rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300"
                                title="Rewrite this bullet with AI"
                            >
                                {busyIdx === i ? "…" : "✨ Improve"}
                            </button>
                            <button
                                type="button"
                                onClick={() => onChange(removeAt(bullets, i))}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                    {variants?.idx === i && (
                        <div className="mt-1 space-y-1 rounded-lg border border-primary-200 bg-primary-50/60 p-2 dark:border-primary-500/30 dark:bg-primary-500/10">
                            <div className="text-xs font-medium text-primary-700 dark:text-primary-300">
                                Pick a rewrite:
                            </div>
                            {variants.options.map((opt, k) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => {
                                        onChange(replaceAtStr(bullets, i, opt));
                                        setVariants(null);
                                    }}
                                    className="block w-full rounded-md bg-white px-2 py-1.5 text-left text-xs text-slate-700 shadow-sm hover:ring-2 hover:ring-primary-400 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    {opt}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setVariants(null)}
                                className="text-xs text-slate-400 hover:text-slate-600"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            ))}
            <button
                type="button"
                onClick={() => onChange([...bullets, ""])}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
                + Add bullet
            </button>
        </div>
    );
}

function replaceAtStr(arr: string[], idx: number, value: string): string[] {
    return arr.map((x, i) => (i === idx ? value : x));
}

function csvToArr(v: string): string[] {
    return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

const CUSTOM_COMPONENTS = [
    { k: "title", label: "Heading" },
    { k: "date", label: "Date" },
    { k: "subtitle", label: "Subtitle" },
    { k: "link", label: "Link" },
] as const;

/** One pluggable custom-section entry: bullets are always shown; Heading /
 *  Date / Subtitle / Link are optional components the user toggles on as needed
 *  (so nothing is forced — they "plug in" what the entry needs). */
function CustomEntryEditor({
    entry,
    pathPrefix,
    onChange,
    onRemove,
    onUp,
    onDown,
    onImprove,
    aiBusy,
}: {
    entry: ResumeCustomEntry;
    pathPrefix: string;
    onChange: (patch: Partial<ResumeCustomEntry>) => void;
    onRemove: () => void;
    onUp: () => void;
    onDown: () => void;
    onImprove: (bullet: string, role: string) => Promise<string[]>;
    aiBusy: boolean;
}) {
    const [extra, setExtra] = useState<Set<string>>(() => {
        const s = new Set<string>();
        for (const c of CUSTOM_COMPONENTS) if (entry[c.k]) s.add(c.k);
        return s;
    });
    const show = (k: string) => extra.has(k);
    const toggle = (k: "title" | "subtitle" | "date" | "link") =>
        setExtra((prev) => {
            const next = new Set(prev);
            if (next.has(k)) {
                next.delete(k);
                onChange({ [k]: "" });
            } else {
                next.add(k);
            }
            return next;
        });

    return (
        <EntryShell onUp={onUp} onDown={onDown} onRemove={onRemove}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5 pr-16">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Components</span>
                {CUSTOM_COMPONENTS.map((c) => (
                    <button
                        key={c.k}
                        type="button"
                        onClick={() => toggle(c.k)}
                        className={
                            show(c.k)
                                ? "rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300"
                                : "rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 transition hover:border-primary-400 hover:text-primary-600 dark:border-slate-600 dark:text-slate-400"
                        }
                    >
                        {show(c.k) ? "✓ " : "+ "}
                        {c.label}
                    </button>
                ))}
            </div>
            {show("title") && (
                <Text field={`${pathPrefix}.title`} label="Heading" value={entry.title} onChange={(v) => onChange({ title: v })} placeholder="Award / item name" />
            )}
            {(show("subtitle") || show("date") || show("link")) && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {show("subtitle") && <Text field={`${pathPrefix}.subtitle`} label="Subtitle" value={entry.subtitle} onChange={(v) => onChange({ subtitle: v })} placeholder="Organisation / venue" />}
                    {show("date") && <Text field={`${pathPrefix}.date`} label="Date" value={entry.date} onChange={(v) => onChange({ date: v })} placeholder="Jan 2026" />}
                    {show("link") && <Text field={`${pathPrefix}.link`} label="Link" value={entry.link} onChange={(v) => onChange({ link: v })} placeholder="https://…" />}
                </div>
            )}
            <div className="mt-2">
                <Bullets pathPrefix={`${pathPrefix}.bullets`} bullets={entry.bullets} role={entry.title} onImprove={onImprove} aiBusy={aiBusy} onChange={(b) => onChange({ bullets: b })} />
            </div>
        </EntryShell>
    );
}

interface Props {
    data: ResumeData;
    onChange: (next: ResumeData) => void;
    onImproveBullet: (bullet: string, role: string) => Promise<string[]>;
    onGenerateSummary: () => Promise<string | null>;
    aiBusy: boolean;
    /** Data-path of the field the user is hovering/editing in the preview. The
     *  matching section/entry is scrolled into view + ringed. */
    activePath?: string | null;
}

/** Map a field path (e.g. "experience.0.bullets.2") to its form anchor
 *  ("experience.0"); non-indexed paths map to the section ("contact"). */
function anchorFromPath(path: string): string {
    const seg = path.split(".");
    return seg.length >= 2 && /^\d+$/.test(seg[1]) ? `${seg[0]}.${seg[1]}` : seg[0];
}

export default function ResumeEditorForm({
    data,
    onChange,
    onImproveBullet,
    onGenerateSummary,
    aiBusy,
    activePath,
}: Props) {
    const [genningSummary, setGenningSummary] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const set = (patch: Partial<ResumeData>) => onChange({ ...data, ...patch });

    // Reflect the preview's hovered/active field: ring the section card (soft) AND
    // the exact field input inside it (strong), then scroll it into view. Done
    // imperatively so a fast mouse sweep doesn't re-render the whole form.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const sectionEl = activePath
            ? root.querySelector<HTMLElement>(`[data-rz-anchor="${anchorFromPath(activePath)}"]`)
            : null;
        const fieldEl = activePath
            ? root.querySelector<HTMLElement>(`[data-rz-field="${activePath}"]`)
            : null;
        root.querySelectorAll<HTMLElement>("[data-rz-anchor]").forEach((el) => {
            if (el === sectionEl) {
                el.style.transition = "box-shadow .15s ease";
                el.style.boxShadow = "0 0 0 2px rgb(99 102 241 / 0.4)";
            } else if (el.style.boxShadow) {
                el.style.boxShadow = "";
            }
        });
        root.querySelectorAll<HTMLElement>("[data-rz-field]").forEach((el) => {
            if (el === fieldEl) {
                el.style.transition = "box-shadow .15s ease, background-color .15s ease";
                el.style.boxShadow = "0 0 0 2px rgb(99 102 241 / 0.9)";
                el.style.backgroundColor = "rgb(99 102 241 / 0.08)";
            } else if (el.style.boxShadow || el.style.backgroundColor) {
                el.style.boxShadow = "";
                el.style.backgroundColor = "";
            }
        });
        // Center the target so it lands in a comfortable spot to edit (not jammed
        // against the top/bottom edge of the form pane).
        (fieldEl ?? sectionEl)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [activePath]);

    const genSummary = async () => {
        setGenningSummary(true);
        try {
            const s = await onGenerateSummary();
            if (s) set({ summary: s });
        } finally {
            setGenningSummary(false);
        }
    };

    // Section order is a token list: built-in keys + `custom:<id>` for individual
    // custom sections. The editor cards below are laid out with flexbox `order` so
    // they visually follow this list — reorder here, and the cards reflow to match.
    const customIds = data.customSections.map((s) => s.id);
    const order = normalizeSectionOrder(data.sectionOrder, customIds);
    const orderIndex = (token: string) => {
        const i = order.indexOf(token);
        return i < 0 ? order.length : i;
    };
    const tokenLabel = (token: string) => {
        if (isCustomSectionToken(token)) {
            const s = data.customSections.find((x) => x.id === customSectionIdFromToken(token));
            return s?.title?.trim() || "Untitled section";
        }
        return SECTION_LABELS[token as ResumeSectionKey] || token;
    };

    return (
        <div ref={rootRef} className="flex flex-col gap-4">
            {/* Section order — pinned to the top (order -2) */}
            <SectionCard title="Section order" style={{ order: -2 }}>
                <p className="-mt-1 mb-2 text-xs text-slate-400">
                    Move sections up or down to change where they appear on your resume. Each custom section
                    can be placed anywhere.
                </p>
                <div className="space-y-1.5">
                    {order.map((tok, i) => (
                        <div
                            key={tok}
                            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
                        >
                            <span className="flex items-center gap-2">
                                {isCustomSectionToken(tok) && (
                                    <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
                                        Custom
                                    </span>
                                )}
                                {tokenLabel(tok)}
                            </span>
                            <div className="flex gap-1 text-slate-400">
                                <button
                                    type="button"
                                    disabled={i === 0}
                                    onClick={() => set({ sectionOrder: moveAt(order, i, -1) })}
                                    className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                                    title="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    disabled={i === order.length - 1}
                                    onClick={() => set({ sectionOrder: moveAt(order, i, 1) })}
                                    className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                                    title="Move down"
                                >
                                    ↓
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* Contact — pinned right after Section order (order -1) */}
            <SectionCard title="Contact" anchor="contact" style={{ order: -1 }}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Text field="contact.fullName" label="Full name" value={data.contact.fullName} onChange={(v) => set({ contact: { ...data.contact, fullName: v } })} placeholder="Aisha Khan" />
                    <Text field="contact.headline" label="Headline" value={data.contact.headline} onChange={(v) => set({ contact: { ...data.contact, headline: v } })} placeholder="Final-year B.Tech CSE" />
                    <Text field="contact.email" label="Email" value={data.contact.email} onChange={(v) => set({ contact: { ...data.contact, email: v } })} placeholder="you@email.com" />
                    <Text field="contact.phone" label="Phone" value={data.contact.phone} onChange={(v) => set({ contact: { ...data.contact, phone: v } })} placeholder="+91 90000 00000" />
                    <Text field="contact.location" label="Location" value={data.contact.location} onChange={(v) => set({ contact: { ...data.contact, location: v } })} placeholder="Bengaluru, India" />
                </div>
                <div className="mt-3">
                    <span className={LABEL}>Links</span>
                    <div className="space-y-2">
                        {data.contact.links.map((l, i) => (
                            <div key={i} className="flex gap-2">
                                <input
                                    className={`${INPUT} max-w-[140px]`}
                                    value={l.label}
                                    placeholder="GitHub"
                                    onChange={(e) => set({ contact: { ...data.contact, links: replaceAt(data.contact.links, i, { label: e.target.value }) } })}
                                />
                                <input
                                    className={INPUT}
                                    value={l.url}
                                    placeholder="https://github.com/you"
                                    onChange={(e) => set({ contact: { ...data.contact, links: replaceAt(data.contact.links, i, { url: e.target.value }) } })}
                                />
                                <button type="button" onClick={() => set({ contact: { ...data.contact, links: removeAt(data.contact.links, i) } })} className="shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => set({ contact: { ...data.contact, links: [...data.contact.links, { label: "", url: "" }] } })} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                            + Add link
                        </button>
                    </div>
                </div>
            </SectionCard>

            {/* Summary */}
            <SectionCard
                title="Professional summary"
                anchor="summary"
                style={{ order: orderIndex("summary") }}
                action={
                    <Button size="sm" variant="outline" isLoading={genningSummary} disabled={aiBusy} onClick={genSummary}>
                        ✨ Generate
                    </Button>
                }
            >
                <RichText field="summary" value={data.summary} onChange={(v) => set({ summary: v })} minHeight={92} placeholder="2–3 sentences: your level, strongest skills, and a signature achievement." />
            </SectionCard>

            {/* Experience */}
            <SectionCard
                title="Experience"
                style={{ order: orderIndex("experience") }}
                action={
                    <Button size="sm" variant="outline" onClick={() => set({ experience: [...data.experience, newExperience()] })}>
                        + Add
                    </Button>
                }
            >
                <div className="space-y-3">
                    {data.experience.length === 0 && <Empty>No experience yet.</Empty>}
                    {data.experience.map((e, i) => (
                        <EntryShell key={e.id} anchor={`experience.${i}`} onUp={() => set({ experience: moveAt(data.experience, i, -1) })} onDown={() => set({ experience: moveAt(data.experience, i, 1) })} onRemove={() => set({ experience: removeAt(data.experience, i) })}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Text field={`experience.${i}.role`} label="Role / title" value={e.role} onChange={(v) => set({ experience: replaceAt(data.experience, i, { role: v }) })} />
                                <Text field={`experience.${i}.company`} label="Company" value={e.company} onChange={(v) => set({ experience: replaceAt(data.experience, i, { company: v }) })} />
                                <Text field={`experience.${i}.location`} label="Location" value={e.location} onChange={(v) => set({ experience: replaceAt(data.experience, i, { location: v }) })} />
                                <div className="grid grid-cols-2 gap-2">
                                    <Text label="Start" value={e.startDate} onChange={(v) => set({ experience: replaceAt(data.experience, i, { startDate: v }) })} placeholder="Jun 2024" />
                                    <Text label="End" value={e.endDate} onChange={(v) => set({ experience: replaceAt(data.experience, i, { endDate: v }) })} placeholder="Aug 2024" />
                                </div>
                            </div>
                            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={e.current} onChange={(ev) => set({ experience: replaceAt(data.experience, i, { current: ev.target.checked }) })} />
                                I currently work here
                            </label>
                            <div className="mt-3">
                                <Bullets pathPrefix={`experience.${i}.bullets`} bullets={e.bullets} role={e.role} onImprove={onImproveBullet} aiBusy={aiBusy} onChange={(next) => set({ experience: replaceAt(data.experience, i, { bullets: next }) })} />
                            </div>
                        </EntryShell>
                    ))}
                </div>
            </SectionCard>

            {/* Projects */}
            <SectionCard
                title="Projects"
                style={{ order: orderIndex("projects") }}
                action={
                    <Button size="sm" variant="outline" onClick={() => set({ projects: [...data.projects, newProject()] })}>
                        + Add
                    </Button>
                }
            >
                <div className="space-y-3">
                    {data.projects.length === 0 && <Empty>No projects yet.</Empty>}
                    {data.projects.map((p, i) => (
                        <EntryShell key={p.id} anchor={`projects.${i}`} onUp={() => set({ projects: moveAt(data.projects, i, -1) })} onDown={() => set({ projects: moveAt(data.projects, i, 1) })} onRemove={() => set({ projects: removeAt(data.projects, i) })}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Text field={`projects.${i}.name`} label="Name" value={p.name} onChange={(v) => set({ projects: replaceAt(data.projects, i, { name: v }) })} />
                                <Text field={`projects.${i}.subtitle`} label="Subtitle" value={p.subtitle} onChange={(v) => set({ projects: replaceAt(data.projects, i, { subtitle: v }) })} placeholder="Full-stack expense tracker" />
                                <Text label="Link" value={p.link} onChange={(v) => set({ projects: replaceAt(data.projects, i, { link: v }) })} placeholder="https://…" />
                                <Text field={`projects.${i}.tech`} label="Tech (comma-separated)" value={p.tech.join(", ")} onChange={(v) => set({ projects: replaceAt(data.projects, i, { tech: csvToArr(v) }) })} placeholder="React, Node, Postgres" />
                            </div>
                            <div className="mt-3">
                                <Bullets pathPrefix={`projects.${i}.bullets`} bullets={p.bullets} role={p.name} onImprove={onImproveBullet} aiBusy={aiBusy} onChange={(next) => set({ projects: replaceAt(data.projects, i, { bullets: next }) })} />
                            </div>
                        </EntryShell>
                    ))}
                </div>
            </SectionCard>

            {/* Education */}
            <SectionCard
                title="Education"
                style={{ order: orderIndex("education") }}
                action={
                    <Button size="sm" variant="outline" onClick={() => set({ education: [...data.education, newEducation()] })}>
                        + Add
                    </Button>
                }
            >
                <div className="space-y-3">
                    {data.education.length === 0 && <Empty>No education yet.</Empty>}
                    {data.education.map((e, i) => (
                        <EntryShell key={e.id} anchor={`education.${i}`} onUp={() => set({ education: moveAt(data.education, i, -1) })} onDown={() => set({ education: moveAt(data.education, i, 1) })} onRemove={() => set({ education: removeAt(data.education, i) })}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Text field={`education.${i}.school`} label="School" value={e.school} onChange={(v) => set({ education: replaceAt(data.education, i, { school: v }) })} />
                                <Text field={`education.${i}.degree`} label="Degree" value={e.degree} onChange={(v) => set({ education: replaceAt(data.education, i, { degree: v }) })} placeholder="B.Tech" />
                                <Text field={`education.${i}.field`} label="Field" value={e.field} onChange={(v) => set({ education: replaceAt(data.education, i, { field: v }) })} placeholder="Computer Science" />
                                <Text field={`education.${i}.grade`} label="Grade" value={e.grade} onChange={(v) => set({ education: replaceAt(data.education, i, { grade: v }) })} placeholder="8.7 CGPA" />
                                <Text label="Start" value={e.startDate} onChange={(v) => set({ education: replaceAt(data.education, i, { startDate: v }) })} placeholder="2022" />
                                <Text label="End" value={e.endDate} onChange={(v) => set({ education: replaceAt(data.education, i, { endDate: v }) })} placeholder="2026" />
                            </div>
                        </EntryShell>
                    ))}
                </div>
            </SectionCard>

            {/* Skills */}
            <SectionCard
                title="Skills"
                style={{ order: orderIndex("skills") }}
                action={
                    <Button size="sm" variant="outline" onClick={() => set({ skills: [...data.skills, newSkillGroup()] })}>
                        + Add group
                    </Button>
                }
            >
                <div className="space-y-2">
                    {data.skills.length === 0 && <Empty>No skills yet.</Empty>}
                    {data.skills.map((g, i) => (
                        <div key={g.id} data-rz-anchor={`skills.${i}`} className="flex scroll-mt-3 gap-2 rounded-lg">
                            <input data-rz-field={`skills.${i}.category`} className={`${INPUT} max-w-[150px]`} value={g.category} placeholder="Languages" onChange={(e) => set({ skills: replaceAt(data.skills, i, { category: e.target.value }) })} />
                            <input data-rz-field={`skills.${i}.skills`} className={INPUT} value={g.skills.join(", ")} placeholder="Python, Java, SQL" onChange={(e) => set({ skills: replaceAt(data.skills, i, { skills: csvToArr(e.target.value) }) })} />
                            <button type="button" onClick={() => set({ skills: removeAt(data.skills, i) })} className="shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* Certifications */}
            <SectionCard
                title="Certifications"
                style={{ order: orderIndex("certifications") }}
                action={
                    <Button size="sm" variant="outline" onClick={() => set({ certifications: [...data.certifications, newCertification()] })}>
                        + Add
                    </Button>
                }
            >
                <div className="space-y-3">
                    {data.certifications.length === 0 && <Empty>None yet.</Empty>}
                    {data.certifications.map((c, i) => (
                        <EntryShell key={c.id} anchor={`certifications.${i}`} onUp={() => set({ certifications: moveAt(data.certifications, i, -1) })} onDown={() => set({ certifications: moveAt(data.certifications, i, 1) })} onRemove={() => set({ certifications: removeAt(data.certifications, i) })}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Text field={`certifications.${i}.name`} label="Name" value={c.name} onChange={(v) => set({ certifications: replaceAt(data.certifications, i, { name: v }) })} />
                                <Text field={`certifications.${i}.issuer`} label="Issuer" value={c.issuer} onChange={(v) => set({ certifications: replaceAt(data.certifications, i, { issuer: v }) })} />
                                <Text field={`certifications.${i}.date`} label="Date" value={c.date} onChange={(v) => set({ certifications: replaceAt(data.certifications, i, { date: v }) })} />
                                <Text label="Link" value={c.link} onChange={(v) => set({ certifications: replaceAt(data.certifications, i, { link: v }) })} />
                            </div>
                        </EntryShell>
                    ))}
                </div>
            </SectionCard>

            {/* Custom sections — each is its own card, independently placeable via
                "Section order" above (flex order). */}
            {data.customSections.map((s, si) => (
                <SectionCard
                    key={s.id}
                    title={s.title.trim() || "Custom section"}
                    anchor={`customSections.${si}`}
                    style={{ order: orderIndex(customSectionToken(s.id)) }}
                    action={
                        <button
                            type="button"
                            onClick={() => set({ customSections: removeAt(data.customSections, si) })}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-500/10"
                        >
                            Delete
                        </button>
                    }
                >
                    <Text field={`customSections.${si}.title`} label="Section title" value={s.title} onChange={(v) => set({ customSections: replaceAt(data.customSections, si, { title: v }) })} placeholder="Achievements" />
                    <p className="mt-1.5 text-xs text-slate-400">
                        Each entry can plug in an optional heading, date, subtitle, or link — add only what you
                        need. The heading is editable right on the resume; reorder this section from “Section order” above.
                    </p>
                    <div className="mt-3 space-y-2.5">
                        {s.entries.map((en, ei) => (
                            <CustomEntryEditor
                                key={en.id}
                                entry={en}
                                pathPrefix={`customSections.${si}.entries.${ei}`}
                                onImprove={onImproveBullet}
                                aiBusy={aiBusy}
                                onChange={(patch) => set({ customSections: replaceAt(data.customSections, si, { entries: replaceAt(s.entries, ei, patch) }) })}
                                onRemove={() => set({ customSections: replaceAt(data.customSections, si, { entries: removeAt(s.entries, ei) }) })}
                                onUp={() => set({ customSections: replaceAt(data.customSections, si, { entries: moveAt(s.entries, ei, -1) }) })}
                                onDown={() => set({ customSections: replaceAt(data.customSections, si, { entries: moveAt(s.entries, ei, 1) }) })}
                            />
                        ))}
                        <button type="button" onClick={() => set({ customSections: replaceAt(data.customSections, si, { entries: [...s.entries, newCustomEntry()] }) })} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                            + Add entry
                        </button>
                    </div>
                </SectionCard>
            ))}

            {/* Add a new custom section — always rendered last */}
            <button
                type="button"
                onClick={() => set({ customSections: [...data.customSections, newCustomSection()] })}
                style={{ order: 9999 }}
                className="rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 transition hover:border-primary-400 hover:text-primary-600 dark:border-slate-700 dark:text-slate-400"
            >
                + Add custom section
            </button>
        </div>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="text-xs text-slate-400">{children}</p>;
}

// ── item factories ───────────────────────────────────────────────────
function newExperience(): ResumeExperience {
    return { id: cid(), company: "", role: "", location: "", startDate: "", endDate: "", current: false, bullets: [""] };
}
function newProject(): ResumeProject {
    return { id: cid(), name: "", subtitle: "", link: "", tech: [], bullets: [""] };
}
function newEducation(): ResumeEducation {
    return { id: cid(), school: "", degree: "", field: "", location: "", startDate: "", endDate: "", grade: "", details: [] };
}
function newSkillGroup(): ResumeSkillGroup {
    return { id: cid(), category: "", skills: [] };
}
function newCertification(): ResumeCertification {
    return { id: cid(), name: "", issuer: "", date: "", link: "" };
}
function newCustomEntry(): ResumeCustomEntry {
    return { id: cid(), title: "", subtitle: "", date: "", link: "", bullets: [""] };
}
function newCustomSection(): ResumeCustomSection {
    return { id: cid(), title: "", entries: [newCustomEntry()] };
}
