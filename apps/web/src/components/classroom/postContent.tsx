"use client";

/**
 * Discussion post content — rendering and composing.
 *
 * Bodies are plain text with two conventions a developer audience already
 * knows: ```fenced``` blocks become copyable code cards, and `inline`
 * backticks become inline code. Images ride alongside as uploaded
 * attachments (Firebase Storage under community/{uid}/…), shown in a grid.
 * Keeping the body plain text means React escapes everything — no HTML, no
 * XSS surface — while still giving threads real code + image sharing.
 */
import { useRef, useState, type ReactNode } from "react";
import { uploadFile } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import type { Attachment } from "./community";

// ─────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s)]+)/g;

function linkify(text: string, keyBase: string): ReactNode[] {
    return text.split(URL_RE).map((part, i) => {
        if (URL_RE.test(part)) {
            return (
                <a
                    key={`${keyBase}-${i}`}
                    href={part}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-700 dark:text-primary-300 underline underline-offset-2 break-all hover:opacity-80"
                >
                    {part}
                </a>
            );
        }
        return <span key={`${keyBase}-${i}`}>{part}</span>;
    });
}

/** Split a text run on inline `code` spans. */
function renderInline(text: string, keyBase: string): ReactNode[] {
    return text.split(/(`[^`\n]+`)/g).map((part, i) => {
        if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
            return (
                <code
                    key={`${keyBase}-c${i}`}
                    className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-gray-900 dark:text-gray-100"
                >
                    {part.slice(1, -1)}
                </code>
            );
        }
        return <span key={`${keyBase}-t${i}`}>{linkify(part, `${keyBase}-t${i}`)}</span>;
    });
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard
            .writeText(code)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
    };
    return (
        <div className="group relative my-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {lang || "code"}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className="text-[11px] text-slate-500 hover:text-primary-700 dark:hover:text-primary-300 focus:outline-none focus-visible:underline"
                >
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre className="overflow-x-auto px-3.5 py-3 text-[13px] leading-relaxed">
                <code className="font-mono text-gray-900 dark:text-gray-100">{code}</code>
            </pre>
        </div>
    );
}

const FENCE_RE = /```([a-zA-Z0-9+#._-]*)\n?([\s\S]*?)```/g;

/** Body text with fenced code blocks, inline code, and links. */
export function PostBody({
    text,
    attachments,
}: {
    text: string;
    attachments?: Attachment[];
}) {
    const blocks: ReactNode[] = [];
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    FENCE_RE.lastIndex = 0;
    while ((m = FENCE_RE.exec(text)) !== null) {
        if (m.index > last) {
            const chunk = text.slice(last, m.index).replace(/^\n+|\n+$/g, "");
            if (chunk) {
                blocks.push(
                    <p key={`p${key++}`} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                        {renderInline(chunk, `p${key}`)}
                    </p>
                );
            }
        }
        blocks.push(<CodeBlock key={`code${key++}`} code={m[2].replace(/\n$/, "")} lang={m[1]} />);
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        const chunk = text.slice(last).replace(/^\n+/, "");
        if (chunk) {
            blocks.push(
                <p key={`p${key++}`} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {renderInline(chunk, `p${key}`)}
                </p>
            );
        }
    }

    return (
        <div className="min-w-0 space-y-1">
            {blocks}
            {attachments && attachments.length > 0 && (
                <div
                    className={`mt-2 grid gap-2 ${
                        attachments.length === 1 ? "grid-cols-1 max-w-md" : "grid-cols-2 max-w-lg"
                    }`}
                >
                    {attachments.map((a, i) => (
                        <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={a.url}
                                alt={a.name}
                                loading="lazy"
                                className="max-h-80 w-full bg-slate-50 dark:bg-slate-800 object-cover transition-opacity hover:opacity-90"
                            />
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────
// Composing
// ─────────────────────────────────────────────────────────────────────

const MAX = 4;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Compact image attach control for the thread / reply composers. Uploads
 * to community/{uid}/… and reports the resulting attachments up. Shows
 * thumbnails with a remove button while composing.
 */
export function AttachImages({
    uid,
    attachments,
    onChange,
    onError,
}: {
    uid: string;
    attachments: Attachment[];
    onChange: (next: Attachment[]) => void;
    onError?: (message: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const room = MAX - attachments.length;
        const picked = Array.from(files).slice(0, Math.max(0, room));
        const added: Attachment[] = [];
        setUploading(true);
        for (const file of picked) {
            if (!file.type.startsWith("image/")) {
                onError?.("Only images can be attached.");
                continue;
            }
            if (file.size > MAX_BYTES) {
                onError?.(`"${file.name}" is over 5MB.`);
                continue;
            }
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
            const path = `community/${uid}/${crypto.randomUUID()}-${safe}`;
            try {
                const url = await new Promise<string>((resolve, reject) => {
                    uploadFile(storage, path, file, (s) => {
                        if (s.downloadUrl) resolve(s.downloadUrl);
                        else if (s.error) reject(s.error);
                    });
                });
                added.push({ url, name: file.name });
            } catch {
                onError?.(`Couldn't upload "${file.name}".`);
            }
        }
        setUploading(false);
        if (added.length) onChange([...attachments, ...added]);
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <div className="space-y-2">
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                        <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                            <button
                                type="button"
                                onClick={() => onChange(attachments.filter((_, j) => j !== i))}
                                aria-label={`Remove ${a.name}`}
                                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/70 text-white hover:bg-gray-900"
                            >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || attachments.length >= MAX}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-primary-400 hover:text-primary-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
                </svg>
                {uploading ? "Uploading…" : attachments.length >= MAX ? "Max 4 images" : "Add image"}
            </button>
        </div>
    );
}
