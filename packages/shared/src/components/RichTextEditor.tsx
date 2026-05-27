"use client";

/**
 * Rich text editor (TipTap-based) used across the admin portal.
 *
 * Why this exists:
 *   - We standardized on TipTap (replacing the previous custom contentEditable
 *     implementation) for a more reliable editing surface, real undo/redo,
 *     and a solid extension ecosystem.
 *   - Same exported `RichTextEditorProps` so existing call sites
 *     (ArticleForm, CourseNotesEditor, PracticeProblemForm, …) keep working
 *     unchanged.
 *
 * Capabilities admins care about:
 *   - File-upload images (drag/drop + paste + toolbar) straight into Firebase
 *     Storage, no URLs to copy.
 *   - Image **alignment with text wrap** (float left / float right / center).
 *   - Image width sizing (S / M / L / Full).
 *   - Tables, links, lists, headings, blockquotes, code blocks, YouTube embeds.
 *   - Source-mode HTML toggle (escape hatch).
 *   - Generous default canvas size (`minHeight` defaults to 480px).
 *
 * The output is plain HTML compatible with the public `FormattedContent`
 * renderer — inline `style` attributes on `<img>` carry the float/wrap, so
 * articles render the same way they edited.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { FirebaseStorage } from "firebase/storage";
import { Link2, Image as ImageIcon, Play, ArrowLeft, ArrowRight, ArrowLeftRight } from "lucide-react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { uploadFile } from "../firebase/storage";

export interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    required?: boolean;
    placeholder?: string;
    helperText?: string;
    /** Editor canvas min height in px (default 480 — generous on purpose). */
    minHeight?: number;
    /** Compact preset (smaller toolbar + min-height) for short fields. */
    compact?: boolean;
    /** Storage folder prefix for uploads. Defaults to "content". */
    mediaUploadPath?: string;
    /** Hide the image / table / youtube buttons. */
    enableMedia?: boolean;
    storage?: FirebaseStorage;
}

// ── Image extension with float/wrap + width attributes ───────────────────────
//
// TipTap's stock Image only carries `src/alt/title`. We extend it with two
// attributes — `align` ("left" | "center" | "right" | null) and `width`
// (CSS string like "33%" / "100%") — and render inline `style` so the public
// renderer reproduces the wrap/centering without extra CSS.
const WrappedImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            align: {
                default: null as null | "left" | "center" | "right",
                parseHTML: (el) => {
                    const s = (el.getAttribute("style") || "").toLowerCase();
                    if (s.includes("float:left") || s.includes("float: left")) return "left";
                    if (s.includes("float:right") || s.includes("float: right")) return "right";
                    if (s.includes("margin:") && s.includes("auto")) return "center";
                    return null;
                },
                renderHTML: () => ({}), // serialized through `style` below
            },
            width: {
                default: null as string | null,
                parseHTML: (el) => el.getAttribute("width") || null,
                renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
            },
        };
    },
    renderHTML({ HTMLAttributes, node }) {
        const align = node.attrs.align as "left" | "center" | "right" | null;
        const widthAttr = (node.attrs.width as string | null) || null;
        const styles: string[] = [];
        if (widthAttr) styles.push(`width:${widthAttr}`);
        styles.push("height:auto");
        styles.push("border-radius:8px");
        if (align === "left") {
            styles.push("float:left", "margin:0.25rem 1rem 0.5rem 0", "max-width:60%");
        } else if (align === "right") {
            styles.push("float:right", "margin:0.25rem 0 0.5rem 1rem", "max-width:60%");
        } else if (align === "center") {
            styles.push("display:block", "margin:1rem auto");
        }
        return [
            "img",
            {
                ...HTMLAttributes,
                style: styles.join(";"),
                "data-align": align || "",
            },
        ];
    },
});

// ── Toolbar ──────────────────────────────────────────────────────────────────
function TButton({
    active,
    disabled,
    title,
    onClick,
    children,
}: {
    active?: boolean;
    disabled?: boolean;
    title: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={[
                "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md border px-2 text-xs font-semibold transition",
                active
                    ? "border-primary-300 bg-primary-50 text-primary-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function Divider() {
    return <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;
}

function Toolbar({
    editor,
    compact,
    enableMedia,
    onPickImage,
    onAddYoutube,
    onAddLink,
    onToggleSource,
    sourceMode,
    uploading,
}: {
    editor: Editor;
    compact: boolean;
    enableMedia: boolean;
    onPickImage: () => void;
    onAddYoutube: () => void;
    onAddLink: () => void;
    onToggleSource: () => void;
    sourceMode: boolean;
    uploading: boolean;
}) {
    const setAlign = (a: "left" | "center" | "right" | null) => {
        if (editor.isActive("image")) {
            editor.chain().focus().updateAttributes("image", { align: a }).run();
        } else {
            editor.chain().focus().setTextAlign(a || "left").run();
        }
    };
    const setImgWidth = (w: string | null) => {
        editor.chain().focus().updateAttributes("image", { width: w }).run();
    };
    const imgSelected = editor.isActive("image");

    return (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
            <TButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                <strong>B</strong>
            </TButton>
            <TButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                <em>I</em>
            </TButton>
            <TButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
                <s>S</s>
            </TButton>
            <TButton title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
                {"</>"}
            </TButton>
            <Divider />
            {!compact && (
                <>
                    <TButton title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</TButton>
                    <TButton title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</TButton>
                    <TButton title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</TButton>
                    <Divider />
                </>
            )}
            <TButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</TButton>
            <TButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.≡</TButton>
            <TButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>“ ”</TButton>
            {!compact && (
                <TButton title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{"{ }"}</TButton>
            )}
            <Divider />
            <TButton title="Link" active={editor.isActive("link")} onClick={onAddLink}>
                <Link2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </TButton>
            {enableMedia && (
                <>
                    <TButton title={uploading ? "Uploading…" : "Insert image"} onClick={onPickImage} disabled={uploading}>
                        {uploading ? "…" : <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                    </TButton>
                    {!compact && (
                        <>
                            <TButton title="Embed YouTube" onClick={onAddYoutube}>
                                <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} aria-hidden />
                            </TButton>
                            <TButton title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞</TButton>
                        </>
                    )}
                </>
            )}
            <Divider />
            {imgSelected ? (
                <>
                    <span className="ml-1 mr-1 text-[10px] font-bold uppercase text-slate-500">Image</span>
                    <TButton title="Wrap left" active={editor.getAttributes("image").align === "left"} onClick={() => setAlign("left")}>
                        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Wrap
                    </TButton>
                    <TButton title="Center" active={editor.getAttributes("image").align === "center"} onClick={() => setAlign("center")}>
                        <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Center
                    </TButton>
                    <TButton title="Wrap right" active={editor.getAttributes("image").align === "right"} onClick={() => setAlign("right")}>
                        Wrap <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </TButton>
                    <TButton title="Inline (no wrap)" onClick={() => setAlign(null)}>Inline</TButton>
                    <Divider />
                    <TButton title="Small (33%)" onClick={() => setImgWidth("33%")}>S</TButton>
                    <TButton title="Medium (50%)" onClick={() => setImgWidth("50%")}>M</TButton>
                    <TButton title="Large (75%)" onClick={() => setImgWidth("75%")}>L</TButton>
                    <TButton title="Full width" onClick={() => setImgWidth("100%")}>Full</TButton>
                </>
            ) : (
                <>
                    <TButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => setAlign("left")}>
                        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </TButton>
                    <TButton title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => setAlign("center")}>
                        <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </TButton>
                    <TButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => setAlign("right")}>
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </TButton>
                </>
            )}
            <span className="ml-auto inline-flex items-center gap-1">
                <TButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↶</TButton>
                <TButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↷</TButton>
                <Divider />
                <TButton title="View HTML source" active={sourceMode} onClick={onToggleSource}>{"</>"} HTML</TButton>
            </span>
        </div>
    );
}

// ── The editor itself ────────────────────────────────────────────────────────
export function RichTextEditor({
    value,
    onChange,
    label,
    required,
    placeholder = "Start writing…",
    helperText,
    minHeight,
    compact = false,
    mediaUploadPath = "content",
    enableMedia = true,
    storage,
}: RichTextEditorProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [sourceMode, setSourceMode] = useState(false);
    const [sourceDraft, setSourceDraft] = useState(value || "");
    const resolvedMinHeight = minHeight ?? (compact ? 180 : 480);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: { HTMLAttributes: { class: "rte-code" } },
            }),
            Placeholder.configure({ placeholder }),
            Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
            WrappedImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { loading: "lazy" } }),
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            Youtube.configure({ controls: true, nocookie: true, HTMLAttributes: { class: "rte-yt" } }),
            Table.configure({ resizable: true, HTMLAttributes: { class: "rte-table" } }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: value || "",
        editorProps: {
            attributes: {
                class: [
                    "rte-canvas prose prose-slate max-w-none focus:outline-none",
                    "px-4 py-4",
                ].join(" "),
                spellcheck: "true",
            },
            handleDrop: (view, event) => {
                const files = event.dataTransfer?.files;
                if (!files || files.length === 0) return false;
                const file = Array.from(files).find((f) => f.type.startsWith("image/"));
                if (!file) return false;
                event.preventDefault();
                handleImageFile(file);
                return true;
            },
            handlePaste: (view, event) => {
                const items = event.clipboardData?.items;
                if (!items) return false;
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    if (it.kind === "file" && it.type.startsWith("image/")) {
                        const file = it.getAsFile();
                        if (file) {
                            event.preventDefault();
                            handleImageFile(file);
                            return true;
                        }
                    }
                }
                return false;
            },
        },
        onUpdate: ({ editor: ed }) => {
            const html = ed.getHTML();
            onChange(html);
        },
    });

    // Keep external value in sync (e.g. when a draft loads after mount).
    useEffect(() => {
        if (!editor) return;
        if (sourceMode) return;
        const current = editor.getHTML();
        if (value !== current && value !== undefined) {
            editor.commands.setContent(value || "", { emitUpdate: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, editor]);

    const handleImageFile = useCallback(
        async (file: File) => {
            if (!editor) return;
            if (!storage) {
                // Fallback: data-URL (works for demo / no storage configured).
                const reader = new FileReader();
                reader.onload = () => {
                    const src = reader.result as string;
                    editor.chain().focus().setImage({ src, alt: file.name } as never).run();
                };
                reader.readAsDataURL(file);
                return;
            }
            try {
                setUploading(true);
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                const path = `${mediaUploadPath.replace(/\/$/, "")}/${Date.now()}-${safeName}`;
                await uploadFile(storage, path, file, ({ downloadUrl, error }) => {
                    if (error) {
                        console.error("[RTE] upload error", error);
                        return;
                    }
                    if (downloadUrl) {
                        editor.chain().focus().setImage({ src: downloadUrl, alt: file.name } as never).run();
                    }
                });
            } finally {
                setUploading(false);
            }
        },
        [editor, storage, mediaUploadPath]
    );

    const onPickImage = () => fileInputRef.current?.click();
    const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleImageFile(file);
        e.target.value = "";
    };

    const onAddLink = () => {
        if (!editor) return;
        const previous = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("Link URL", previous || "https://");
        if (url === null) return;
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    };

    const onAddYoutube = () => {
        if (!editor) return;
        const url = window.prompt("YouTube URL");
        if (!url) return;
        editor.chain().focus().setYoutubeVideo({ src: url, width: 640, height: 360 }).run();
    };

    const toggleSource = () => {
        if (!editor) return;
        if (sourceMode) {
            // commit source → editor
            editor.commands.setContent(sourceDraft || "", { emitUpdate: true });
            onChange(sourceDraft || "");
            setSourceMode(false);
        } else {
            setSourceDraft(editor.getHTML());
            setSourceMode(true);
        }
    };

    const labelEl = useMemo(
        () =>
            label ? (
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {label}
                    {required ? <span className="ml-1 text-rose-500">*</span> : null}
                </label>
            ) : null,
        [label, required]
    );

    return (
        <div className="w-full">
            {labelEl}
            <style>{rteStyles(resolvedMinHeight)}</style>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100">
                {editor && (
                    <Toolbar
                        editor={editor}
                        compact={compact}
                        enableMedia={enableMedia}
                        onPickImage={onPickImage}
                        onAddYoutube={onAddYoutube}
                        onAddLink={onAddLink}
                        onToggleSource={toggleSource}
                        sourceMode={sourceMode}
                        uploading={uploading}
                    />
                )}
                {sourceMode ? (
                    <textarea
                        className="block w-full resize-y px-4 py-4 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none"
                        style={{ minHeight: resolvedMinHeight }}
                        value={sourceDraft}
                        onChange={(e) => setSourceDraft(e.target.value)}
                        spellCheck={false}
                    />
                ) : (
                    <EditorContent editor={editor} />
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFileChange}
                />
            </div>
            {helperText && <p className="mt-1.5 text-xs text-slate-500">{helperText}</p>}
        </div>
    );
}

// Inline styles — keeps the prose canvas tall, makes image float/wrap behave,
// and ensures inserted tables/youtube look reasonable inside the editor.
function rteStyles(minHeight: number) {
    return `
.rte-canvas { min-height: ${minHeight}px; }
.rte-canvas::after { content: ""; display: block; clear: both; }
.rte-canvas p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: rgb(148 163 184);
    pointer-events: none;
    height: 0;
}
.rte-canvas img { max-width: 100%; height: auto; border-radius: 8px; }
.rte-canvas img[data-align="left"] { float: left; margin: 0.25rem 1rem 0.5rem 0; max-width: 60%; }
.rte-canvas img[data-align="right"] { float: right; margin: 0.25rem 0 0.5rem 1rem; max-width: 60%; }
.rte-canvas img[data-align="center"] { display: block; margin: 1rem auto; }
.rte-canvas img.ProseMirror-selectednode { outline: 2px solid rgb(20 184 166); outline-offset: 2px; }
.rte-canvas .rte-table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
.rte-canvas .rte-table td, .rte-canvas .rte-table th { border: 1px solid rgb(226 232 240); padding: 0.5rem; vertical-align: top; }
.rte-canvas .rte-table th { background: rgb(248 250 252); text-align: left; }
.rte-canvas .rte-yt { display: block; margin: 1rem auto; max-width: 100%; aspect-ratio: 16 / 9; }
.rte-canvas .rte-code { background: rgb(15 23 42); color: rgb(226 232 240); padding: 1rem; border-radius: 8px; font-size: 0.85rem; overflow-x: auto; }
.rte-canvas blockquote { border-left: 4px solid rgb(20 184 166); padding-left: 1rem; color: rgb(71 85 105); font-style: italic; }
.rte-canvas ul { list-style: disc; padding-left: 1.5rem; }
.rte-canvas ol { list-style: decimal; padding-left: 1.5rem; }
.rte-canvas h1 { font-size: 1.75rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.rte-canvas h2 { font-size: 1.4rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.rte-canvas h3 { font-size: 1.15rem; font-weight: 600; margin: 0.75rem 0 0.4rem; }
`;
}

export default RichTextEditor;
