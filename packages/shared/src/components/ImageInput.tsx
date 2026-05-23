"use client";

import { useId, useState } from "react";
import type { FirebaseStorage } from "firebase/storage";
import { FileUpload } from "./FileUpload";

/**
 * Dual-mode image picker — Upload tab and URL tab in one control.
 *
 * Both tabs converge on a single string value (the final image URL). Admins
 * can paste an Unsplash / Pexels / CDN URL OR upload a local file that the
 * existing FileUpload helper pushes into Firebase Storage under `path` and
 * returns its download URL.
 *
 * App-agnostic — `storage` is passed in (same pattern as FileUpload) so the
 * shared component works for admin, teacher portal, institute portal, etc.
 */
export interface ImageInputProps {
    /** Firebase Storage instance from the consuming app. */
    storage: FirebaseStorage;
    /** Current URL value (may be empty). */
    value: string;
    /** Called with the new URL whenever the user uploads or types one. */
    onChange: (url: string) => void;
    /** Storage path prefix used by the Upload tab. */
    path: string;
    /** Field label shown above the tabs. */
    label?: string;
    /** Optional helper text shown below the value preview. */
    hint?: string;
    /** Placeholder for the URL input. */
    urlPlaceholder?: string;
    /** Accept attr for the file picker (defaults to image/*). */
    accept?: string;
    /**
     * Recommended dimensions shown as a badge — e.g. "1600×900 (16:9)".
     * Display purpose only; nothing is enforced. Set this on every field so
     * admins know which aspect ratio to upload at (cards use `object-cover`,
     * so a wrong-aspect image gets center-cropped at the rendered location).
     */
    idealSize?: string;
    /**
     * CSS aspect-ratio string used for the live-preview box (e.g. "16/9",
     * "4/3", "1200/630"). When provided, the preview is rendered at this
     * exact ratio so admins see how the image will be cropped on the site.
     */
    aspectRatio?: string;
}

function guessInitialMode(value: string): "upload" | "url" {
    if (!value) return "upload";
    if (/firebasestorage\.googleapis\.com/.test(value)) return "upload";
    if (/storage\.googleapis\.com/.test(value)) return "upload";
    return "url";
}

export function ImageInput({
    storage,
    value,
    onChange,
    path,
    label,
    hint,
    urlPlaceholder = "https://… (Unsplash, Firebase Storage, any CDN)",
    accept = "image/*",
    idealSize,
    aspectRatio,
}: ImageInputProps) {
    const tabId = useId();
    const [mode, setMode] = useState<"upload" | "url">(() => guessInitialMode(value));

    return (
        <div className="w-full">
            {(label || idealSize) && (
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {label && (
                        <label className="text-sm font-medium text-slate-700">{label}</label>
                    )}
                    {idealSize && (
                        <span
                            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-700 ring-1 ring-primary-100"
                            title="Upload at this resolution / aspect to avoid cropping"
                        >
                            <span aria-hidden="true">📐</span>
                            {idealSize}
                        </span>
                    )}
                </div>
            )}

            <div
                role="tablist"
                aria-label="Image source"
                className="mb-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "upload"}
                    aria-controls={`${tabId}-panel`}
                    onClick={() => setMode("upload")}
                    className={`rounded-md px-3 py-1.5 transition ${
                        mode === "upload"
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                            : "text-slate-500 hover:text-slate-900"
                    }`}
                >
                    ⬆ Upload
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "url"}
                    aria-controls={`${tabId}-panel`}
                    onClick={() => setMode("url")}
                    className={`rounded-md px-3 py-1.5 transition ${
                        mode === "url"
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                            : "text-slate-500 hover:text-slate-900"
                    }`}
                >
                    🔗 URL
                </button>
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        title="Clear current image"
                        className="ml-2 rounded-md px-2 py-1.5 text-slate-400 transition hover:text-rose-600"
                    >
                        ✕
                    </button>
                )}
            </div>

            <div id={`${tabId}-panel`} role="tabpanel">
                {mode === "upload" ? (
                    <FileUpload
                        storage={storage}
                        label="Upload image"
                        path={path}
                        accept={accept}
                        existingUrl={value || undefined}
                        onUploadComplete={(url) => onChange(url)}
                    />
                ) : (
                    <input
                        type="url"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={urlPlaceholder}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    />
                )}
            </div>

            {value && mode === "url" && (
                <div className="mt-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Preview {aspectRatio ? `(${aspectRatio.replace("/", ":")} card crop)` : ""}
                    </p>
                    <div
                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                        style={aspectRatio ? { aspectRatio } : { maxHeight: 160 }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={value}
                            alt="Preview"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.opacity = "0.4";
                            }}
                        />
                    </div>
                </div>
            )}

            {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
    );
}
