"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FormattedContent } from "@digimine/ui";

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    required?: boolean;
    placeholder?: string;
    helperText?: string;
    minHeight?: number;
    compact?: boolean;
}

type EditorMode = "visual" | "source";

const toolbarButtonClass =
    "h-8 min-w-8 px-2 rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function RichTextEditor({
    value,
    onChange,
    label,
    required = false,
    placeholder = "Write the question here...",
    helperText,
    minHeight = 180,
    compact = false,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [mode, setMode] = useState<EditorMode>("visual");
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (mode !== "visual" || !editorRef.current) return;
        if (editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value || "";
        }
    }, [mode, value]);

    const emitChange = () => {
        const html = editorRef.current?.innerHTML || "";
        onChange(html === "<br>" ? "" : html);
    };

    const focusEditor = () => {
        editorRef.current?.focus();
    };

    const runCommand = (command: string, commandValue?: string) => {
        focusEditor();
        document.execCommand(command, false, commandValue);
        emitChange();
    };

    const insertHtml = (html: string) => {
        focusEditor();
        document.execCommand("insertHTML", false, html);
        emitChange();
    };

    const getSelectionText = () => window.getSelection()?.toString() || "";

    const wrapSelection = (tag: string, fallback: string, attrs = "") => {
        const selectedText = getSelectionText();
        const content = selectedText ? escapeHtml(selectedText) : fallback;
        insertHtml(`<${tag}${attrs}>${content}</${tag}>`);
    };

    const insertLink = () => {
        const url = window.prompt("Paste the link URL");
        if (!url) return;
        const selectedText = getSelectionText();
        const text = selectedText ? escapeHtml(selectedText) : escapeHtml(url);
        insertHtml(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    };

    const insertImage = () => {
        const url = window.prompt("Paste the image URL");
        if (!url) return;
        const alt = window.prompt("Image description") || "Question image";
        insertHtml(`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`);
    };

    const insertTable = () => {
        insertHtml(
            '<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value</td><td>Value</td></tr></tbody></table>'
        );
    };

    const insertCodeBlock = () => {
        const selectedText = getSelectionText();
        insertHtml(`<pre><code>${escapeHtml(selectedText || "Paste code here")}</code></pre>`);
    };

    const insertMathLine = () => {
        insertHtml("<p><strong>Formula:</strong> x<sup>2</sup> + y<sub>1</sub> = ?</p>");
    };

    return (
        <div className="space-y-2">
            {label && (
                <label className="block text-sm font-medium text-gray-700">
                    {label}
                    {required && <span className="text-red-500"> *</span>}
                </label>
            )}

            <div className="overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
                    <select
                        value=""
                        onChange={(event) => {
                            if (!event.target.value) return;
                            runCommand("formatBlock", event.target.value);
                            event.target.value = "";
                        }}
                        className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700"
                        aria-label="Text style"
                    >
                        <option value="">Style</option>
                        <option value="p">Paragraph</option>
                        <option value="h2">Heading</option>
                        <option value="h3">Subheading</option>
                    </select>
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("bold")} title="Bold">
                        B
                    </button>
                    <button type="button" className={`${toolbarButtonClass} italic`} onClick={() => runCommand("italic")} title="Italic">
                        I
                    </button>
                    <button type="button" className={`${toolbarButtonClass} underline`} onClick={() => runCommand("underline")} title="Underline">
                        U
                    </button>
                    <button type="button" className={`${toolbarButtonClass} line-through`} onClick={() => runCommand("strikeThrough")} title="Strike">
                        S
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("insertUnorderedList")} title="Bulleted list">
                        List
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("insertOrderedList")} title="Numbered list">
                        1.
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("formatBlock", "blockquote")} title="Quote">
                        Quote
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => wrapSelection("code", "code")} title="Inline code">
                        Code
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={insertCodeBlock} title="Code block">
                        Block
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("superscript")} title="Superscript">
                        x2
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("subscript")} title="Subscript">
                        x1
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={() => wrapSelection("mark", "highlight")} title="Highlight">
                        Mark
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={insertMathLine} title="Formula template">
                        Formula
                    </button>
                    <button type="button" className={toolbarButtonClass} onClick={insertLink} title="Link">
                        Link
                    </button>
                    {!compact && (
                        <>
                            <button type="button" className={toolbarButtonClass} onClick={insertImage} title="Image">
                                Image
                            </button>
                            <button type="button" className={toolbarButtonClass} onClick={insertTable} title="Table">
                                Table
                            </button>
                            <button type="button" className={toolbarButtonClass} onClick={() => insertHtml("<hr />")} title="Divider">
                                HR
                            </button>
                        </>
                    )}
                    <button type="button" className={toolbarButtonClass} onClick={() => runCommand("removeFormat")} title="Clear formatting">
                        Clear
                    </button>
                    <div className="ml-auto flex gap-1">
                        <button
                            type="button"
                            className={`${toolbarButtonClass} ${mode === "source" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : ""}`}
                            onClick={() => setMode(mode === "visual" ? "source" : "visual")}
                        >
                            HTML
                        </button>
                        <button
                            type="button"
                            className={`${toolbarButtonClass} ${showPreview ? "bg-indigo-50 text-indigo-700 border-indigo-200" : ""}`}
                            onClick={() => setShowPreview((current) => !current)}
                        >
                            Preview
                        </button>
                    </div>
                </div>

                {mode === "visual" ? (
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        data-placeholder={placeholder}
                        onInput={emitChange}
                        onBlur={emitChange}
                        onPaste={(event) => {
                            event.preventDefault();
                            const html = event.clipboardData.getData("text/html");
                            const text = event.clipboardData.getData("text/plain");
                            insertHtml(html || escapeHtml(text).replace(/\n/g, "<br />"));
                        }}
                        className="rich-text-editor min-h-[var(--editor-height)] w-full bg-white px-4 py-3 text-sm text-gray-900 outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
                        style={{ "--editor-height": `${minHeight}px` } as CSSProperties}
                    />
                ) : (
                    <textarea
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        rows={compact ? 4 : 8}
                        className="min-h-[var(--editor-height)] w-full resize-y bg-gray-950 px-4 py-3 font-mono text-sm text-gray-100 outline-none"
                        style={{ "--editor-height": `${minHeight}px` } as CSSProperties}
                        placeholder="<p>Write formatted HTML here...</p>"
                    />
                )}
            </div>

            {helperText && <p className="text-xs text-gray-500">{helperText}</p>}

            {showPreview && (
                <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">Student preview</div>
                    <FormattedContent html={value} size={compact ? "sm" : "base"} className="text-gray-800" />
                </div>
            )}
        </div>
    );
}
