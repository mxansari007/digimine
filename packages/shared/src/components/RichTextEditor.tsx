"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { FirebaseStorage } from "firebase/storage";
import { uploadFile } from "../firebase/storage";
import { FormattedContent } from "@digimine/ui";

export interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    required?: boolean;
    placeholder?: string;
    helperText?: string;
    minHeight?: number;
    compact?: boolean;
    mediaUploadPath?: string;
    enableMedia?: boolean;
    storage?: FirebaseStorage;
}

type EditorMode = "visual" | "source";
type MediaLayout = "inline" | "left" | "center" | "right";
type MediaSize = "sm" | "md" | "lg" | "full";
type MediaCorner = "round" | "sharp";
type MediaFrame = "border" | "plain";

interface MediaSelectionState {
    layout: MediaLayout;
    size: MediaSize;
    corner: MediaCorner;
    frame: MediaFrame;
    hasCaption: boolean;
}

const toolbarButtonClass =
    "group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const toolbarButtonActiveClass = "border-indigo-200 bg-indigo-50 text-indigo-700";
const toolbarTooltipClass =
    "pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block group-focus-visible:block";
const mediaLayoutClasses = ["media-align-left", "media-align-center", "media-align-right"];
const mediaSizeClasses = ["media-size-sm", "media-size-md", "media-size-lg", "media-size-full"];
const mediaCornerClasses = ["media-corners-sharp"];
const mediaFrameClasses = ["media-frame-plain"];

type IconProps = {
    className?: string;
};

const iconBaseProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
};

function ToolbarButton({
    label,
    active,
    children,
    className = "",
    ...props
}: {
    label: string;
    active?: boolean;
    children: ReactNode;
    className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={`${toolbarButtonClass} ${active ? toolbarButtonActiveClass : ""} ${className}`}
            {...props}
        >
            {children}
            <span className={toolbarTooltipClass}>{label}</span>
        </button>
    );
}

function ListIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M8 6h13" />
            <path d="M8 12h13" />
            <path d="M8 18h13" />
            <path d="M3 6h.01" />
            <path d="M3 12h.01" />
            <path d="M3 18h.01" />
        </svg>
    );
}

function OrderedListIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M10 6h11" />
            <path d="M10 12h11" />
            <path d="M10 18h11" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M4 14h2l-2 4h2" />
        </svg>
    );
}

function QuoteIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M9 7H5a2 2 0 0 0-2 2v6h6V7Z" />
            <path d="M21 7h-4a2 2 0 0 0-2 2v6h6V7Z" />
        </svg>
    );
}

function LinkIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
            <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
        </svg>
    );
}

function ImageIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8" cy="10" r="1.5" />
            <path d="m21 15-4.5-4.5L8 19" />
        </svg>
    );
}

function UploadIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 20h16" />
        </svg>
    );
}

function VideoIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="m16 10 5-3v10l-5-3" />
        </svg>
    );
}

function TableIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
            <path d="M9 5v14" />
            <path d="M15 5v14" />
        </svg>
    );
}

function DividerIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M4 12h16" />
            <path d="M8 7h8" />
            <path d="M8 17h8" />
        </svg>
    );
}

function ClearIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M4 20h16" />
            <path d="m6 16 8.5-8.5a2.1 2.1 0 0 1 3 3L12 16" />
            <path d="M6 16h6" />
            <path d="m14 4 6 6" />
        </svg>
    );
}

function EyeIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function CodeBlockIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="m8 9-3 3 3 3" />
            <path d="m16 9 3 3-3 3" />
            <path d="m14 5-4 14" />
        </svg>
    );
}

function AlignIcon({ direction, className = "h-4 w-4" }: IconProps & { direction: "left" | "center" | "right" | "inline" }) {
    const lines = direction === "center"
        ? ["M7 6h10", "M5 12h14", "M7 18h10"]
        : direction === "right"
            ? ["M7 6h14", "M11 12h10", "M5 18h16"]
            : direction === "inline"
                ? ["M4 7h16", "M4 12h10", "M4 17h16"]
                : ["M3 6h14", "M3 12h10", "M3 18h16"];
    return (
        <svg className={className} {...iconBaseProps}>
            {lines.map((d) => <path key={d} d={d} />)}
        </svg>
    );
}

function CornerIcon({ sharp, className = "h-4 w-4" }: IconProps & { sharp?: boolean }) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d={sharp ? "M5 19V5h14" : "M5 19V9a4 4 0 0 1 4-4h10"} />
            <path d="M9 19h10" />
        </svg>
    );
}

function FrameIcon({ plain, className = "h-4 w-4" }: IconProps & { plain?: boolean }) {
    return (
        <svg className={className} {...iconBaseProps}>
            <rect x="5" y="5" width="14" height="14" rx={plain ? "0" : "2"} />
            {plain ? <path d="M4 20 20 4" /> : <path d="M8 9h8M8 15h8" />}
        </svg>
    );
}

function CaptionIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <rect x="4" y="5" width="16" height="10" rx="2" />
            <path d="M7 19h10" />
            <path d="M9 15v4" />
            <path d="M15 15v4" />
        </svg>
    );
}

function WidthIcon({ className = "h-4 w-4" }: IconProps) {
    return (
        <svg className={className} {...iconBaseProps}>
            <path d="M5 12h14" />
            <path d="m8 9-3 3 3 3" />
            <path d="m16 9 3 3-3 3" />
        </svg>
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function parseYouTubeVideoId(url: string): string | null {
    const trimmed = url.trim();
    const patterns = [
        /youtube\.com\/watch\?v=([^&]+)/i,
        /youtube\.com\/embed\/([^?&/]+)/i,
        /youtube\.com\/shorts\/([^?&/]+)/i,
        /youtu\.be\/([^?&/]+)/i,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-z0-9._-]/gi, "_");
}

function makeMediaId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `media_${crypto.randomUUID()}`;
    }
    return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFirstImageFromHtml(html: string): { src: string; alt: string } | null {
    const match = html.match(/<img\b([^>]*)>/i);
    if (!match?.[1]) return null;

    const attrs = match[1];
    const src =
        attrs.match(/\ssrc\s*=\s*"([^"]+)"/i)?.[1] ||
        attrs.match(/\ssrc\s*=\s*'([^']+)'/i)?.[1] ||
        "";
    if (!src || src.startsWith("data:")) return null;

    const alt =
        attrs.match(/\salt\s*=\s*"([^"]*)"/i)?.[1] ||
        attrs.match(/\salt\s*=\s*'([^']*)'/i)?.[1] ||
        "Inline image";

    return { src, alt };
}

function getMediaFigureFromNode(node: Node | null): HTMLElement | null {
    if (!node) return null;
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    return element?.closest?.("figure.media-card") as HTMLElement | null;
}

function getMediaLayout(figure: HTMLElement): MediaLayout {
    if (figure.classList.contains("media-align-left")) return "left";
    if (figure.classList.contains("media-align-center")) return "center";
    if (figure.classList.contains("media-align-right")) return "right";
    return "inline";
}

function getMediaSize(figure: HTMLElement): MediaSize {
    if (figure.classList.contains("media-size-sm")) return "sm";
    if (figure.classList.contains("media-size-md")) return "md";
    if (figure.classList.contains("media-size-full")) return "full";
    return "lg";
}

function getMediaCorner(figure: HTMLElement): MediaCorner {
    return figure.classList.contains("media-corners-sharp") ? "sharp" : "round";
}

function getMediaFrame(figure: HTMLElement): MediaFrame {
    return figure.classList.contains("media-frame-plain") ? "plain" : "border";
}

function getRangeFromPoint(x: number, y: number): Range | null {
    const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };

    const legacyRange = doc.caretRangeFromPoint?.(x, y);
    if (legacyRange) return legacyRange;

    const caretPosition = doc.caretPositionFromPoint?.(x, y);
    if (!caretPosition) return null;

    const range = doc.createRange();
    range.setStart(caretPosition.offsetNode, caretPosition.offset);
    range.collapse(true);
    return range;
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
    mediaUploadPath,
    enableMedia,
    storage,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const selectionRef = useRef<Range | null>(null);
    const selectedMediaRef = useRef<HTMLElement | null>(null);
    const draggedMediaIdRef = useRef<string | null>(null);
    const resizingMediaRef = useRef<{ figure: HTMLElement; startX: number; startWidth: number } | null>(null);
    const [mode, setMode] = useState<EditorMode>("visual");
    const [showPreview, setShowPreview] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("");
    const [uploadProgress, setUploadProgress] = useState(0);
    const [mediaSelection, setMediaSelection] = useState<MediaSelectionState | null>(null);
    const mediaEnabled = enableMedia ?? !compact;

    const prepareEditorMediaFigures = () => {
        if (!editorRef.current) return;
        editorRef.current.querySelectorAll<HTMLElement>("figure.media-card").forEach((figure) => {
            if (!figure.dataset.mediaId) figure.dataset.mediaId = makeMediaId();
            figure.setAttribute("draggable", "true");
            figure.setAttribute("contenteditable", "false");
            figure.setAttribute("title", "Click to select. Drag to move between paragraphs.");

            if (!figure.querySelector(".media-resize-handle")) {
                const handle = document.createElement("span");
                handle.className = "media-resize-handle";
                handle.setAttribute("contenteditable", "false");
                handle.setAttribute("draggable", "false");
                handle.setAttribute("title", "Drag to resize");
                figure.appendChild(handle);
            }
        });
    };

    useEffect(() => {
        if (mode !== "visual" || !editorRef.current) return;
        if (editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value || "";
        }
        prepareEditorMediaFigures();
    }, [mode, value]);

    const saveSelection = () => {
        if (!editorRef.current) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (!editorRef.current.contains(range.commonAncestorContainer)) return;
        selectionRef.current = range.cloneRange();
    };

    const restoreSelection = () => {
        const selection = window.getSelection();
        if (!selection || !selectionRef.current) return;
        selection.removeAllRanges();
        selection.addRange(selectionRef.current);
    };

    const getCleanEditorHtml = () => {
        if (!editorRef.current) return "";
        const clone = editorRef.current.cloneNode(true) as HTMLElement;
        clone.querySelectorAll<HTMLElement>(".media-card").forEach((element) => {
            element.classList.remove("media-editor-selected");
            element.removeAttribute("draggable");
            element.removeAttribute("contenteditable");
            element.removeAttribute("title");
            element.removeAttribute("data-media-id");
        });
        clone.querySelectorAll(".media-resize-handle").forEach((element) => element.remove());
        return clone.innerHTML;
    };

    const emitChange = () => {
        const html = getCleanEditorHtml();
        onChange(html === "<br>" ? "" : html);
    };

    const focusEditor = () => {
        editorRef.current?.focus();
        restoreSelection();
    };

    const runCommand = (command: string, commandValue?: string) => {
        focusEditor();
        document.execCommand(command, false, commandValue);
        emitChange();
    };

    const insertHtml = (html: string) => {
        focusEditor();
        document.execCommand("insertHTML", false, html);
        saveSelection();
        emitChange();
    };

    const selectMedia = (figure: HTMLElement | null) => {
        if (selectedMediaRef.current && selectedMediaRef.current !== figure) {
            selectedMediaRef.current.classList.remove("media-editor-selected");
        }

        selectedMediaRef.current = figure;

        if (!figure) {
            setMediaSelection(null);
            return;
        }

        figure.classList.add("media-editor-selected");
        setMediaSelection({
            layout: getMediaLayout(figure),
            size: getMediaSize(figure),
            corner: getMediaCorner(figure),
            frame: getMediaFrame(figure),
            hasCaption: Boolean(figure.querySelector("figcaption")),
        });
    };

    const updateSelectedMediaFromSelection = () => {
        const selection = window.getSelection();
        const figure = selection?.anchorNode ? getMediaFigureFromNode(selection.anchorNode) : null;
        selectMedia(figure);
    };

    const updateSelectedMediaFromTarget = (target: EventTarget | null) => {
        selectMedia(getMediaFigureFromNode(target as Node | null));
    };

    const getActiveMediaFigure = () => {
        if (selectedMediaRef.current?.isConnected) return selectedMediaRef.current;
        const selection = window.getSelection();
        const figure = selection?.anchorNode ? getMediaFigureFromNode(selection.anchorNode) : null;
        if (figure) selectMedia(figure);
        return figure;
    };

    const applyMediaLayout = (layout: MediaLayout) => {
        const figure = getActiveMediaFigure();
        if (!figure) {
            alert("Select an image or video in the editor first.");
            return;
        }

        figure.classList.remove(...mediaLayoutClasses);
        if (layout === "left") figure.classList.add("media-align-left");
        if (layout === "center") figure.classList.add("media-align-center");
        if (layout === "right") figure.classList.add("media-align-right");
        selectMedia(figure);
        emitChange();
    };

    const applyMediaSize = (size: MediaSize) => {
        const figure = getActiveMediaFigure();
        if (!figure) {
            alert("Select an image or video in the editor first.");
            return;
        }

        figure.classList.remove(...mediaSizeClasses);
        figure.classList.add(`media-size-${size}`);
        figure.style.removeProperty("max-width");
        figure.style.removeProperty("width");
        selectMedia(figure);
        emitChange();
    };

    const applyCustomMediaWidth = () => {
        const figure = getActiveMediaFigure();
        if (!figure) {
            alert("Select an image or video in the editor first.");
            return;
        }

        const current = figure.style.maxWidth || figure.style.width || "";
        const width = window.prompt("Width for selected media (example: 320px, 45%, 100%)", current || "50%");
        if (width === null) return;

        const trimmed = width.trim();
        figure.classList.remove(...mediaSizeClasses);

        if (!trimmed) {
            figure.classList.add("media-size-lg");
            figure.style.removeProperty("max-width");
            figure.style.removeProperty("width");
        } else {
            figure.style.maxWidth = trimmed;
            figure.style.width = trimmed === "100%" ? "100%" : "";
        }

        selectMedia(figure);
        emitChange();
    };

    const applyMediaCorner = (corner: MediaCorner) => {
        const figure = getActiveMediaFigure();
        if (!figure) {
            alert("Select an image or video in the editor first.");
            return;
        }

        figure.classList.remove(...mediaCornerClasses);
        if (corner === "sharp") figure.classList.add("media-corners-sharp");
        selectMedia(figure);
        emitChange();
    };

    const applyMediaFrame = (frame: MediaFrame) => {
        const figure = getActiveMediaFigure();
        if (!figure) {
            alert("Select an image or video in the editor first.");
            return;
        }

        figure.classList.remove(...mediaFrameClasses);
        if (frame === "plain") figure.classList.add("media-frame-plain");
        selectMedia(figure);
        emitChange();
    };

    const editMediaCaption = () => {
        const figure = getActiveMediaFigure();
        if (!figure) {
            alert("Select an image or video in the editor first.");
            return;
        }

        const currentCaption = figure.querySelector("figcaption")?.textContent || "";
        const caption = window.prompt("Figure label. Leave empty for pure media with no label.", currentCaption);
        if (caption === null) return;

        const trimmed = caption.trim();
        const existingCaption = figure.querySelector("figcaption");

        if (!trimmed) {
            existingCaption?.remove();
        } else if (existingCaption) {
            existingCaption.textContent = trimmed;
        } else {
            const figcaption = document.createElement("figcaption");
            figcaption.textContent = trimmed;
            figure.appendChild(figcaption);
        }

        const image = figure.querySelector("img");
        const iframe = figure.querySelector("iframe");
        if (image) image.setAttribute("alt", trimmed || "Inline image");
        if (iframe) iframe.setAttribute("title", trimmed || "Embedded video");

        selectMedia(figure);
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
        const caption = window.prompt("Figure label (optional)", "")?.trim() || "";
        const alt = caption || "Inline image";
        const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
        insertHtml(
            `<figure class="media-card media-size-lg"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />${captionHtml}</figure><p><br /></p>`
        );
        prepareEditorMediaFigures();
    };

    const insertYouTubeVideo = () => {
        const url = window.prompt("Paste a YouTube URL");
        if (!url) return;

        const videoId = parseYouTubeVideoId(url);
        if (!videoId) {
            alert("Please paste a valid YouTube URL.");
            return;
        }

        const title = window.prompt("Figure label (optional)", "")?.trim() || "";
        const captionHtml = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : "";
        insertHtml(
            `<figure class="media-card media-card-video media-size-full"><iframe src="https://www.youtube.com/embed/${escapeHtml(videoId)}" title="${escapeHtml(title || "Embedded video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>${captionHtml}</figure><p><br /></p>`
        );
        prepareEditorMediaFigures();
    };

    const insertUploadedImageFile = (file: File) => {
        if (!file || !mediaUploadPath) return;

        setUploadStatus("Uploading image...");
        setUploadProgress(0);
        const uploadPath = `${mediaUploadPath}/${Date.now()}_${sanitizeFileName(file.name)}`;

        uploadFile(storage!, uploadPath, file, ({ progress, downloadUrl, error }) => {
            setUploadProgress(progress);

            if (error) {
                setUploadStatus(`Upload failed: ${error.message}`);
                return;
            }

            if (downloadUrl) {
                const alt = "Inline image";
                insertHtml(
                    `<figure class="media-card media-size-lg"><img src="${escapeHtml(downloadUrl)}" alt="${escapeHtml(alt)}" /></figure><p><br /></p>`
                );
                prepareEditorMediaFigures();
                setUploadStatus("");
                setUploadProgress(0);
            }
        });
    };

    const uploadInlineImage = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        insertUploadedImageFile(file);
    };

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
        saveSelection();

        if (mediaEnabled && mediaUploadPath) {
            const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
            const imageFile = imageItem?.getAsFile();

            if (imageFile) {
                event.preventDefault();
                insertUploadedImageFile(imageFile);
                return;
            }
        }

        const html = event.clipboardData.getData("text/html");
        const text = event.clipboardData.getData("text/plain");
        const videoId = mediaEnabled ? parseYouTubeVideoId(text) || parseYouTubeVideoId(html) : null;
        const pastedImage = mediaEnabled ? getFirstImageFromHtml(html) : null;

        event.preventDefault();

        if (videoId) {
            insertHtml(
                `<figure class="media-card media-card-video media-size-full"><iframe src="https://www.youtube.com/embed/${escapeHtml(videoId)}" title="Embedded video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></figure><p><br /></p>`
            );
            prepareEditorMediaFigures();
            return;
        }

        if (pastedImage) {
            insertHtml(
                `<figure class="media-card media-size-lg"><img src="${escapeHtml(pastedImage.src)}" alt="${escapeHtml(pastedImage.alt)}" /></figure><p><br /></p>`
            );
            prepareEditorMediaFigures();
            return;
        }

        insertHtml(html || escapeHtml(text).replace(/\n/g, "<br />"));
    };

    const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
        if ((event.target as Element | null)?.closest?.(".media-resize-handle")) {
            event.preventDefault();
            return;
        }

        const figure = getMediaFigureFromNode(event.target as Node);
        if (!figure) return;
        if (!figure.dataset.mediaId) figure.dataset.mediaId = makeMediaId();
        draggedMediaIdRef.current = figure.dataset.mediaId;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", figure.dataset.mediaId);
        selectMedia(figure);
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!draggedMediaIdRef.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!editorRef.current || !draggedMediaIdRef.current) return;

        const draggedFigure = editorRef.current.querySelector<HTMLElement>(
            `figure.media-card[data-media-id="${draggedMediaIdRef.current}"]`
        );
        if (!draggedFigure) return;

        event.preventDefault();
        const range = getRangeFromPoint(event.clientX, event.clientY);
        if (!range || !editorRef.current.contains(range.commonAncestorContainer)) return;

        const targetFigure = getMediaFigureFromNode(range.commonAncestorContainer);
        if (targetFigure === draggedFigure) return;

        const movedFigure = draggedFigure.cloneNode(true) as HTMLElement;
        draggedFigure.remove();

        const insertionRange = range.cloneRange();
        if (targetFigure) {
            insertionRange.selectNode(targetFigure);
            insertionRange.collapse(false);
        }

        insertionRange.insertNode(movedFigure);
        movedFigure.after(document.createElement("br"));
        prepareEditorMediaFigures();
        selectMedia(movedFigure);
        draggedMediaIdRef.current = null;
        emitChange();
    };

    const handleMediaResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
        const target = event.target as Element | null;
        if (!target?.closest?.(".media-resize-handle")) return;

        const figure = getMediaFigureFromNode(target);
        if (!figure || !editorRef.current) return;

        event.preventDefault();
        event.stopPropagation();
        selectMedia(figure);
        figure.setAttribute("draggable", "false");
        resizingMediaRef.current = {
            figure,
            startX: event.clientX,
            startWidth: figure.getBoundingClientRect().width,
        };

        const editorWidth = editorRef.current.getBoundingClientRect().width;

        const handleMove = (moveEvent: globalThis.MouseEvent) => {
            const resizeState = resizingMediaRef.current;
            if (!resizeState) return;

            const nextWidth = Math.max(120, Math.min(editorWidth, resizeState.startWidth + moveEvent.clientX - resizeState.startX));
            resizeState.figure.classList.remove(...mediaSizeClasses);
            resizeState.figure.style.maxWidth = `${Math.round(nextWidth)}px`;
            resizeState.figure.style.width = `${Math.round(nextWidth)}px`;
            selectMedia(resizeState.figure);
        };

        const handleUp = () => {
            const resizeState = resizingMediaRef.current;
            if (resizeState) {
                resizeState.figure.setAttribute("draggable", "true");
                selectMedia(resizeState.figure);
                emitChange();
            }
            resizingMediaRef.current = null;
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
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
                <div className="flex flex-wrap items-center gap-1.5 overflow-visible border-b border-gray-200 bg-gray-50 p-2">
                    <select
                        value=""
                        onChange={(event) => {
                            if (!event.target.value) return;
                            runCommand("formatBlock", event.target.value);
                            event.target.value = "";
                        }}
                        className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Text style"
                        title="Text style"
                    >
                        <option value="">Style</option>
                        <option value="p">Paragraph</option>
                        <option value="h2">Heading</option>
                        <option value="h3">Subheading</option>
                    </select>
                    <ToolbarButton label="Bold" onClick={() => runCommand("bold")}>
                        <span className="text-sm font-black">B</span>
                    </ToolbarButton>
                    <ToolbarButton label="Italic" onClick={() => runCommand("italic")}>
                        <span className="text-sm font-black italic">I</span>
                    </ToolbarButton>
                    <ToolbarButton label="Underline" onClick={() => runCommand("underline")}>
                        <span className="text-sm font-black underline underline-offset-2">U</span>
                    </ToolbarButton>
                    <ToolbarButton label="Strike" onClick={() => runCommand("strikeThrough")}>
                        <span className="text-sm font-black line-through">S</span>
                    </ToolbarButton>
                    <ToolbarButton label="Bulleted list" onClick={() => runCommand("insertUnorderedList")}>
                        <ListIcon />
                    </ToolbarButton>
                    <ToolbarButton label="Numbered list" onClick={() => runCommand("insertOrderedList")}>
                        <OrderedListIcon />
                    </ToolbarButton>
                    <ToolbarButton label="Quote" onClick={() => runCommand("formatBlock", "blockquote")}>
                        <QuoteIcon />
                    </ToolbarButton>
                    <ToolbarButton label="Inline code" onClick={() => wrapSelection("code", "code")}>
                        <span className="font-mono text-xs font-black">&lt;/&gt;</span>
                    </ToolbarButton>
                    <ToolbarButton label="Code block" onClick={insertCodeBlock}>
                        <CodeBlockIcon />
                    </ToolbarButton>
                    <ToolbarButton label="Superscript" onClick={() => runCommand("superscript")}>
                        <span className="text-xs font-black">x<sup>2</sup></span>
                    </ToolbarButton>
                    <ToolbarButton label="Subscript" onClick={() => runCommand("subscript")}>
                        <span className="text-xs font-black">x<sub>1</sub></span>
                    </ToolbarButton>
                    <ToolbarButton label="Highlight" onClick={() => wrapSelection("mark", "highlight")}>
                        <span className="rounded bg-amber-200 px-1 text-xs font-black text-amber-900">A</span>
                    </ToolbarButton>
                    <ToolbarButton label="Formula template" onClick={insertMathLine}>
                        <span className="font-serif text-sm font-black">fx</span>
                    </ToolbarButton>
                    <ToolbarButton label="Link" onClick={insertLink}>
                        <LinkIcon />
                    </ToolbarButton>
                    {mediaEnabled && (
                        <>
                            {mediaUploadPath && (
                                <ToolbarButton
                                    label="Upload image"
                                    onMouseDown={saveSelection}
                                    onClick={() => imageInputRef.current?.click()}
                                >
                                    <UploadIcon />
                                </ToolbarButton>
                            )}
                            <ToolbarButton label="Image URL" onClick={insertImage}>
                                <ImageIcon />
                            </ToolbarButton>
                            <ToolbarButton label="YouTube video" onClick={insertYouTubeVideo}>
                                <VideoIcon />
                            </ToolbarButton>
                            <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
                            <ToolbarButton
                                label="Wrap media left"
                                active={mediaSelection?.layout === "left"}
                                onClick={() => applyMediaLayout("left")}
                            >
                                <AlignIcon direction="left" />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Wrap media right"
                                active={mediaSelection?.layout === "right"}
                                onClick={() => applyMediaLayout("right")}
                            >
                                <AlignIcon direction="right" />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Center media"
                                active={mediaSelection?.layout === "center"}
                                onClick={() => applyMediaLayout("center")}
                            >
                                <AlignIcon direction="center" />
                            </ToolbarButton>
                            <ToolbarButton
                                label="No text wrap"
                                active={mediaSelection?.layout === "inline"}
                                onClick={() => applyMediaLayout("inline")}
                            >
                                <AlignIcon direction="inline" />
                            </ToolbarButton>
                            {(["sm", "md", "lg", "full"] as const).map((size) => (
                                <ToolbarButton
                                    key={size}
                                    label={`Media size ${size === "full" ? "full width" : size.toUpperCase()}`}
                                    active={mediaSelection?.size === size}
                                    onClick={() => applyMediaSize(size)}
                                >
                                    <span className="text-[11px] font-black">{size === "full" ? "100" : size.toUpperCase()}</span>
                                </ToolbarButton>
                            ))}
                            <ToolbarButton label="Custom media width" onClick={applyCustomMediaWidth}>
                                <WidthIcon />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Rounded corners"
                                active={mediaSelection?.corner === "round"}
                                onClick={() => applyMediaCorner("round")}
                            >
                                <CornerIcon />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Sharp corners"
                                active={mediaSelection?.corner === "sharp"}
                                onClick={() => applyMediaCorner("sharp")}
                            >
                                <CornerIcon sharp />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Show media frame"
                                active={mediaSelection?.frame === "border"}
                                onClick={() => applyMediaFrame("border")}
                            >
                                <FrameIcon />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Plain media"
                                active={mediaSelection?.frame === "plain"}
                                onClick={() => applyMediaFrame("plain")}
                            >
                                <FrameIcon plain />
                            </ToolbarButton>
                            <ToolbarButton
                                label="Edit figure label"
                                active={mediaSelection?.hasCaption}
                                onClick={editMediaCaption}
                            >
                                <CaptionIcon />
                            </ToolbarButton>
                        </>
                    )}
                    {!compact && (
                        <>
                            <ToolbarButton label="Table" onClick={insertTable}>
                                <TableIcon />
                            </ToolbarButton>
                            <ToolbarButton label="Divider" onClick={() => insertHtml("<hr />")}>
                                <DividerIcon />
                            </ToolbarButton>
                        </>
                    )}
                    <ToolbarButton label="Clear formatting" onClick={() => runCommand("removeFormat")}>
                        <ClearIcon />
                    </ToolbarButton>
                    <div className="ml-auto flex gap-1.5">
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={uploadInlineImage}
                        />
                        <ToolbarButton
                            label="Edit HTML"
                            active={mode === "source"}
                            onClick={() => setMode(mode === "visual" ? "source" : "visual")}
                        >
                            <span className="font-mono text-xs font-black">&lt;&gt;</span>
                        </ToolbarButton>
                        <ToolbarButton
                            label="Preview"
                            active={showPreview}
                            onClick={() => setShowPreview((current) => !current)}
                        >
                            <EyeIcon />
                        </ToolbarButton>
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
                        onBlur={() => {
                            saveSelection();
                            emitChange();
                        }}
                        onMouseDown={handleMediaResizeStart}
                        onClick={(event) => {
                            saveSelection();
                            updateSelectedMediaFromTarget(event.target);
                        }}
                        onKeyUp={() => {
                            saveSelection();
                            updateSelectedMediaFromSelection();
                        }}
                        onMouseUp={() => {
                            saveSelection();
                            updateSelectedMediaFromSelection();
                        }}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onFocus={saveSelection}
                        onPaste={handlePaste}
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

            {uploadStatus && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                    {uploadStatus}
                    {uploadProgress > 0 && ` ${Math.round(uploadProgress)}%`}
                </div>
            )}

            {showPreview && (
                <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">Student preview</div>
                    <FormattedContent html={value} size={compact ? "sm" : "base"} className="text-gray-800" />
                </div>
            )}
        </div>
    );
}
