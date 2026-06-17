"use client";

/**
 * The ONE formatting toolbar, shown at the top of the editor. It acts on the
 * currently-focused rich field (a form RichText box, or an inline-editable
 * bullet/summary on the resume). Disabled (greyed) when nothing formattable is
 * focused. Buttons use onMouseDown→preventDefault so clicking them doesn't blur
 * the editor and lose the selection.
 */
import { useEffect, useState, type ReactNode } from "react";
import { getFormatTarget, subscribeFormat, type Align } from "@/lib/resume/formatBus";

/** Align icon — horizontal lines arranged left/center/right/justified. */
function AlignIcon({ rows }: { rows: [number, number][] }) {
    return (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
            {rows.map(([x1, x2], i) => (
                <line key={i} x1={x1} y1={3.5 + i * 3} x2={x2} y2={3.5 + i * 3} />
            ))}
        </svg>
    );
}

const ALIGNS: { a: Align; icon: ReactNode; title: string }[] = [
    { a: "left", title: "Align left", icon: <AlignIcon rows={[[2, 14], [2, 9], [2, 12], [2, 8]]} /> },
    { a: "center", title: "Align center", icon: <AlignIcon rows={[[2, 14], [4, 12], [3, 13], [5, 11]]} /> },
    { a: "right", title: "Align right", icon: <AlignIcon rows={[[2, 14], [7, 14], [4, 14], [8, 14]]} /> },
    { a: "justify", title: "Justify", icon: <AlignIcon rows={[[2, 14], [2, 14], [2, 14], [2, 14]]} /> },
];

export default function FormatToolbar() {
    const [, force] = useState(0);
    useEffect(() => subscribeFormat(() => force((n) => n + 1)), []);

    const target = getFormatTarget();
    const enabled = !!target;
    const align = target?.getAlign() ?? "left";

    const exec = (cmd: "bold" | "italic" | "underline") => {
        try {
            document.execCommand("styleWithCSS", false, "false");
            document.execCommand(cmd, false);
        } catch {
            /* execCommand unsupported */
        }
    };

    const cls = (active: boolean) =>
        `flex h-7 min-w-[28px] items-center justify-center rounded-md px-2 text-sm transition ${
            !enabled
                ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                : active
                  ? "bg-primary-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        }`;

    return (
        <div
            className="flex items-center gap-2.5"
            title={enabled ? undefined : "Click into a bullet or the summary to format it"}
        >
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Format</span>
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                <button type="button" disabled={!enabled} title="Bold (⌘/Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} className={`${cls(false)} font-bold`}>
                    B
                </button>
                <button type="button" disabled={!enabled} title="Italic (⌘/Ctrl+I)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} className={`${cls(false)} italic`}>
                    I
                </button>
                <button type="button" disabled={!enabled} title="Underline (⌘/Ctrl+U)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} className={`${cls(false)} underline`}>
                    U
                </button>
                <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                {ALIGNS.map((x) => (
                    <button
                        key={x.a}
                        type="button"
                        disabled={!enabled}
                        title={x.title}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => target?.align(x.a)}
                        className={cls(enabled && align === x.a)}
                    >
                        {x.icon}
                    </button>
                ))}
            </div>
        </div>
    );
}
