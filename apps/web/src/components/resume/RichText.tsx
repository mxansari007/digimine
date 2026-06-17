"use client";

/**
 * A rich field for the FORM (summary, bullets): a contentEditable that renders
 * the stored value WYSIWYG (no raw tags). It has NO toolbar of its own — on
 * focus it registers with the shared format bus so the single top FormatToolbar
 * drives Bold/Italic/Underline (via execCommand on this focused box) and
 * alignment (via the registered handler). Commits the sanitized string on input.
 */
import { useEffect, useRef } from "react";
import { fmtInline } from "@/lib/resume/html";
import { parseAligned, serializeInline, wrapAligned } from "@/lib/resume/richtext";
import { clearFormatTargetIf, notifyFormat, setFormatTarget, type Align, type FormatTarget } from "@/lib/resume/formatBus";

interface Props {
    value: string;
    onChange: (next: string) => void;
    field?: string;
    placeholder?: string;
    minHeight?: number;
}

export default function RichText({ value, onChange, field, placeholder, minHeight = 56 }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const skip = useRef(false);
    const alignRef = useRef<Align>("left");

    // Render the external value (skip the render our own edit triggered).
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (skip.current) {
            skip.current = false;
            return;
        }
        const parsed = parseAligned(value);
        alignRef.current = parsed.align;
        el.style.textAlign = parsed.align;
        el.innerHTML = fmtInline(parsed.inner);
    }, [value]);

    const commit = () => {
        const el = ref.current;
        if (!el) return;
        let inner = serializeInline(el).replace(/\s+/g, " ").trim();
        if (!inner.replace(/<[^>]*>/g, "").trim()) inner = ""; // visually empty → store ""
        const next = inner ? wrapAligned(inner, alignRef.current) : "";
        if (next !== value) {
            skip.current = true;
            onChange(next);
        }
    };

    const applyAlign = (a: Align) => {
        alignRef.current = a;
        if (ref.current) {
            ref.current.style.textAlign = a;
            ref.current.focus();
        }
        commit();
        notifyFormat();
    };

    // Stable handle for the bus; methods refreshed each render to capture latest closures.
    const apiRef = useRef<FormatTarget>({ align: applyAlign, getAlign: () => alignRef.current });
    apiRef.current.align = applyAlign;
    apiRef.current.getAlign = () => alignRef.current;

    return (
        <div
            ref={ref}
            data-rz-field={field}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            data-ph={placeholder}
            onInput={commit}
            onFocus={() => setFormatTarget(apiRef.current)}
            onBlur={() => {
                commit();
                const api = apiRef.current;
                window.setTimeout(() => clearFormatTargetIf(api), 150);
            }}
            onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && !e.altKey) {
                    const k = e.key.toLowerCase();
                    if (k === "b" || k === "i" || k === "u") {
                        e.preventDefault();
                        try {
                            document.execCommand("styleWithCSS", false, "false");
                            document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline", false);
                        } catch {
                            /* ignore */
                        }
                        commit();
                    }
                }
            }}
            style={{ minHeight }}
            className="rz-rich rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-snug text-slate-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
    );
}
