"use client";

/**
 * ImageInput — dual-mode image source picker.
 *
 *   ┌──────────────┬──────────────┐
 *   │   Upload     │     URL      │  ← tab strip
 *   └──────────────┴──────────────┘
 *   <FileUpload> OR <input type="url">       depending on the active tab
 *   <img>  current value preview
 *
 * Both tabs converge on a single string value (the final image URL). Admins
 * can paste a URL from Unsplash / Firebase Storage / any CDN, OR upload a
 * local file that the existing FileUpload helper pushes into Firebase Storage
 * under `path` and returns its download URL.
 *
 * If the current value already looks like a Firebase Storage URL, the picker
 * defaults to the Upload tab (the user uploaded last time); otherwise it
 * opens on the URL tab — small UX nicety that picks the right default ~95%
 * of the time without an explicit setting.
 */

import { useState, useId } from "react";
import { FileUpload } from "@/components/common/FileUpload";

interface ImageInputProps {
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
}

function guessInitialMode(value: string): "upload" | "url" {
    if (!value) return "upload";
    if (/firebasestorage\.googleapis\.com/.test(value)) return "upload";
    if (/storage\.googleapis\.com/.test(value)) return "upload";
    return "url";
}

export function ImageInput({
    value,
    onChange,
    path,
    label,
    hint,
    urlPlaceholder = "https://… (Unsplash, Firebase Storage, any CDN)",
    accept = "image/*",
}: ImageInputProps) {
    const tabId = useId();
    const [mode, setMode] = useState<"upload" | "url">(() => guessInitialMode(value));

    return (
        <div className="w-full">
            {label && (
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
            )}

            {/* Tab strip */}
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

            {/* Live preview shows up whenever a value is present, regardless of which tab is active. */}
            {value && mode === "url" && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={value}
                    alt="Preview"
                    className="mt-3 max-h-40 w-full rounded-lg border border-slate-200 object-cover"
                    onError={(e) => {
                        // If the URL doesn't resolve, dim the broken preview but don't blow up the form.
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.4";
                    }}
                />
            )}

            {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
    );
}
