"use client";

/**
 * "Bring your own resume" dialog. Collects either an uploaded file (PDF/DOCX/
 * TXT) or pasted text and hands it up; the page does the Storage upload + the
 * /api/resume/import call (it owns the Firebase user + quota error handling).
 */
import { useRef, useState } from "react";
import { Button } from "@digimine/ui";

export type ImportSubmission = { kind: "file"; file: File } | { kind: "text"; text: string };

interface Props {
    open: boolean;
    busy: boolean;
    statusText?: string;
    onClose: () => void;
    onSubmit: (s: ImportSubmission) => void;
}

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export default function ImportDialog({ open, busy, statusText, onClose, onSubmit }: Props) {
    const [tab, setTab] = useState<"upload" | "paste">("upload");
    const [file, setFile] = useState<File | null>(null);
    const [text, setText] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    if (!open) return null;

    const canSubmit = tab === "upload" ? !!file : text.trim().length >= 30;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={busy ? undefined : onClose}
        >
            <div
                className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import an existing resume</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Upload your current resume (PDF, Word, or text) — or paste the text — and AI will turn it into an editable resume.
                </p>

                <div className="mt-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm dark:border-slate-700">
                    {(["upload", "paste"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            disabled={busy}
                            className={`rounded-md px-3 py-1.5 capitalize transition ${
                                tab === t ? "bg-primary-600 text-white" : "text-slate-600 dark:text-slate-300"
                            }`}
                        >
                            {t === "upload" ? "Upload file" : "Paste text"}
                        </button>
                    ))}
                </div>

                <div className="mt-4">
                    {tab === "upload" ? (
                        <div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept={ACCEPT}
                                className="hidden"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                            />
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => fileRef.current?.click()}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 transition hover:border-primary-400 hover:text-primary-600 dark:border-slate-600"
                            >
                                {file ? (
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{file.name}</span>
                                ) : (
                                    <span>Click to choose a PDF, DOCX, or TXT file</span>
                                )}
                            </button>
                        </div>
                    ) : (
                        <textarea
                            className="h-44 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            placeholder="Paste your full resume text here…"
                            value={text}
                            disabled={busy}
                            onChange={(e) => setText(e.target.value)}
                        />
                    )}
                </div>

                {busy && statusText && <p className="mt-3 text-sm text-primary-600">{statusText}</p>}

                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        isLoading={busy}
                        disabled={!canSubmit || busy}
                        onClick={() => {
                            if (tab === "upload" && file) onSubmit({ kind: "file", file });
                            else if (tab === "paste") onSubmit({ kind: "text", text: text.trim() });
                        }}
                    >
                        Import with AI
                    </Button>
                </div>
            </div>
        </div>
    );
}
