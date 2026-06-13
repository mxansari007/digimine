"use client";

/**
 * Class resource library (web) — the twin of the mobile
 * app/class/[classId]/resources screen. Browse + share files (PDF, slide
 * decks, documents, images, video) and links for a class. Hits the SAME
 * server-only routes (/api/classes/[classId]/resources*) the mobile app uses;
 * gating + storage rules live there. Reuses the classroom design kit.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Card, useToast } from "@digimine/ui";
import { uploadFile } from "@digimine/shared";
import { useAuthContext } from "@/contexts/AuthContext";
import { storage } from "@/lib/firebase/client";
import { ClassroomShell } from "@/components/classroom/ui";
import { timeAgo } from "@/components/classroom/community";

type ResourceKind = "document" | "video" | "image" | "link";

type ResourceRow = {
    id: string;
    uploaderId: string;
    uploaderName: string;
    uploaderRole: string;
    title: string;
    description: string;
    kind: ResourceKind | string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
    isPinned: boolean;
    createdAt: string | null;
};

// Client upload caps — large videos would blow the upload up; share a hosted
// link instead. (Below the storage.rules ceilings.)
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 40 * 1024 * 1024;

const DOC_ACCEPT =
    ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip," +
    "application/pdf,application/msword,application/vnd.ms-powerpoint,application/vnd.ms-excel," +
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
    "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
    "text/plain,text/csv,application/zip";

const EXT_MIME: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip",
};

const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

function kindForMime(mime: string): ResourceKind {
    const m = (mime || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    return "document";
}

/** A File whose .type is set (deriving from the extension when the browser left it blank). */
function withMime(file: File): File {
    if (file.type) return file;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const mime = EXT_MIME[ext];
    if (!mime) return file;
    return new File([file], file.name, { type: mime });
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

function sizeError(kind: string, size: number): string | null {
    if (!size) return null;
    const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
    if (size <= max) return null;
    return (
        `That ${kind} is ${formatBytes(size)} — too large to upload here (max ${formatBytes(max)}). ` +
        (kind === "video" ? "Share a link to a hosted video instead." : "")
    ).trim();
}

function KindIcon({ kind, className = "h-5 w-5" }: { kind: string; className?: string }) {
    const common = { fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", "aria-hidden": true } as const;
    if (kind === "video")
        return (
            <svg className={className} {...common}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
        );
    if (kind === "image")
        return (
            <svg className={className} {...common}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" />
            </svg>
        );
    if (kind === "link")
        return (
            <svg className={className} {...common}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
        );
    return (
        <svg className={className} {...common}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    );
}

function ClassroomResourcesInner() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const classId = params.classId as string;
    const fromTeacher = searchParams.get("from") === "teacher";

    const [items, setItems] = useState<ResourceRow[]>([]);
    const [role, setRole] = useState("student");
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [viewing, setViewing] = useState<ResourceRow | null>(null);

    // Composer
    const [composing, setComposing] = useState(false);
    const [linkMode, setLinkMode] = useState(false);
    const [pickedFile, setPickedFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);

    const docInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);

    const isModerator = role === "teacher" || role === "institute_admin";
    const canShare = !(role === "student" && muted);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setError("");
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/classes/${classId}/resources`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't load resources.");
            setItems(data.resources || []);
            setRole(data.role || "student");
            setMuted(Boolean(data.block?.threads));
        } catch (err: any) {
            setError(err.message || "Couldn't load resources.");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser, classId]);

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent(`/classroom/${classId}/resources`)}`);
            return;
        }
        load();
    }, [authLoading, firebaseUser, router, classId, load]);

    const resetComposer = () => {
        setComposing(false);
        setLinkMode(false);
        setPickedFile(null);
        setTitle("");
        setDescription("");
        setLinkUrl("");
        setProgress(0);
    };

    const onPick = (file: File | null) => {
        if (!file) return;
        const named = withMime(file);
        const kind = kindForMime(named.type);
        const tooBig = sizeError(kind, named.size);
        if (tooBig) {
            toast.error(tooBig);
            return;
        }
        setPickedFile(named);
        setLinkMode(false);
        if (!title.trim()) setTitle(named.name.replace(/\.[^.]+$/, ""));
        if (docInputRef.current) docInputRef.current.value = "";
        if (mediaInputRef.current) mediaInputRef.current.value = "";
    };

    const share = async () => {
        if (!firebaseUser || busy) return;
        const t = title.trim();
        if (!t) {
            toast.error("Give the resource a title.");
            return;
        }
        setBusy(true);
        try {
            const token = await firebaseUser.getIdToken();
            let payload: Record<string, unknown>;
            if (linkMode) {
                const url = linkUrl.trim();
                if (!/^https?:\/\//i.test(url)) {
                    toast.error("Enter a valid http(s) link.");
                    setBusy(false);
                    return;
                }
                payload = { title: t, description: description.trim(), link: url, fileName: t };
            } else {
                if (!pickedFile) {
                    setBusy(false);
                    return;
                }
                const safe = pickedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";
                const path = `classResources/${classId}/${firebaseUser.uid}/${Date.now()}-${safe}`;
                setProgress(1);
                const url = await new Promise<string>((resolve, reject) => {
                    uploadFile(storage, path, pickedFile, (s) => {
                        if (s.downloadUrl) resolve(s.downloadUrl);
                        else if (s.error) reject(s.error);
                        else setProgress(Math.max(1, Math.round(s.progress)));
                    });
                });
                payload = {
                    title: t,
                    description: description.trim(),
                    fileUrl: url,
                    storagePath: path,
                    fileName: pickedFile.name,
                    mimeType: pickedFile.type,
                    size: pickedFile.size,
                };
            }
            const res = await fetch(`/api/classes/${classId}/resources`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Couldn't share that resource.");
            // Prepend, then keep pinned items on top to match the server order.
            setItems((prev) => [data.resource, ...prev].sort((a, b) => Number(b.isPinned) - Number(a.isPinned)));
            resetComposer();
            toast.success("Shared with the class.");
        } catch (err: any) {
            toast.error(err.message || "Couldn't share that resource.");
            setProgress(0);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (r: ResourceRow) => {
        if (!firebaseUser) return;
        if (!window.confirm(`Remove "${r.title}" for everyone?`)) return;
        setItems((prev) => prev.filter((x) => x.id !== r.id));
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/classes/${classId}/resources/${r.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
        } catch {
            toast.error("Couldn't remove that.");
            load();
        }
    };

    const togglePin = async (r: ResourceRow) => {
        if (!firebaseUser) return;
        const next = !r.isPinned;
        setItems((prev) =>
            [...prev.map((x) => (x.id === r.id ? { ...x, isPinned: next } : x))].sort(
                (a, b) => Number(b.isPinned) - Number(a.isPinned)
            )
        );
        try {
            const token = await firebaseUser.getIdToken();
            await fetch(`/api/classes/${classId}/resources/${r.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: next ? "pin" : "unpin" }),
            });
        } catch {
            load();
        }
    };

    return (
        <ClassroomShell
            backHref={fromTeacher ? `/teacher/classes/${classId}` : `/classroom/${classId}`}
            backLabel={fromTeacher ? "Class" : "Classroom"}
            eyebrow={isModerator ? "Managing" : "Classroom"}
            title="Resources"
            subtitle={
                isModerator
                    ? "Drop slide decks, PDFs and recordings for your class. Pin the essentials to the top."
                    : "Slide decks, PDFs, notes and recordings shared in this class. Add your own too."
            }
            aside={
                !composing && canShare ? (
                    <Button variant="primary" onClick={() => setComposing(true)}>
                        Share a resource
                    </Button>
                ) : undefined
            }
        >
            {muted && (
                <div className="rounded-2xl border border-accent-200 dark:border-accent-500/30 bg-accent-50/60 dark:bg-accent-500/10 px-4 py-3 text-sm text-accent-700 dark:text-accent-300">
                    Your teacher has muted you in this class. You can browse resources but can&apos;t
                    add any for now.
                </div>
            )}

            {/* Hidden file inputs */}
            <input ref={docInputRef} type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => onPick(e.target.files?.[0] || null)} />
            <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] || null)} />

            {composing && (
                <div className="rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-surface p-5 shadow-soft-sm">
                    {!pickedFile && !linkMode ? (
                        <div className="grid gap-2.5 sm:grid-cols-3">
                            <PickButton label="Document" sub="PDF, slides, Word, Excel" kind="document" onClick={() => docInputRef.current?.click()} />
                            <PickButton label="Photo or video" sub="From your device" kind="image" onClick={() => mediaInputRef.current?.click()} />
                            <PickButton label="Link" sub="Any web URL" kind="link" onClick={() => setLinkMode(true)} />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pickedFile && (
                                <div className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
                                    <span className="text-slate-500"><KindIcon kind={kindForMime(pickedFile.type)} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-gray-900">{pickedFile.name}</span>
                                        <span className="block text-xs text-slate-500">{formatBytes(pickedFile.size) || pickedFile.type}</span>
                                    </span>
                                    {!busy && (
                                        <button type="button" onClick={() => setPickedFile(null)} className="text-xs text-primary-700 dark:text-primary-300 hover:underline">
                                            Change
                                        </button>
                                    )}
                                </div>
                            )}

                            {linkMode && (
                                <input
                                    className={inputClass}
                                    placeholder="https://…"
                                    value={linkUrl}
                                    onChange={(e) => setLinkUrl(e.target.value)}
                                    inputMode="url"
                                    disabled={busy}
                                />
                            )}

                            <input className={`${inputClass} font-medium`} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} disabled={busy} />
                            <textarea className={`${inputClass} min-h-[64px]`} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} disabled={busy} />

                            {busy && !linkMode && (
                                <div className="space-y-1.5">
                                    <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                        <div className="h-1 bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
                                    </div>
                                    <p className="text-[11px] text-slate-500">Uploading… {progress}%</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={resetComposer} disabled={busy}>
                            Cancel
                        </Button>
                        {(pickedFile || linkMode) && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={share}
                                disabled={busy || !title.trim() || (linkMode ? !linkUrl.trim() : !pickedFile)}
                            >
                                {busy ? "Sharing…" : "Share with class"}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {error && <Card intent="danger" className="p-4 text-sm text-danger-700">{error}</Card>}

            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-6 py-14 text-center">
                    <h2 className="font-display text-lg font-semibold text-gray-900">No resources yet</h2>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
                        {canShare
                            ? "Be the first to share a deck, PDF or video with the class."
                            : "When someone shares a file or link, it shows up here."}
                    </p>
                    {!composing && canShare && (
                        <Button variant="primary" className="mt-4" onClick={() => setComposing(true)}>
                            Share a resource
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((r) => {
                        const isTeacher = r.uploaderRole !== "student";
                        const canRemove = r.uploaderId === firebaseUser?.uid || isModerator;
                        const meta = [r.uploaderName, formatBytes(r.size), timeAgo(r.createdAt)].filter(Boolean).join(" · ");
                        const opensInModal = r.kind === "image" || r.kind === "video";
                        return (
                            <div
                                key={r.id}
                                className={`flex items-center gap-3 rounded-2xl border bg-surface p-3.5 shadow-soft-sm transition-colors hover:border-primary-300 ${
                                    r.isPinned ? "border-primary-200 dark:border-primary-500/30" : "border-slate-200 dark:border-slate-700"
                                }`}
                            >
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isTeacher ? "bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                                    <KindIcon kind={r.kind} />
                                </span>

                                {opensInModal ? (
                                    <button type="button" onClick={() => setViewing(r)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline">
                                        <ResourceMeta r={r} isTeacher={isTeacher} meta={meta} />
                                    </button>
                                ) : (
                                    <a href={r.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 focus:outline-none focus-visible:underline">
                                        <ResourceMeta r={r} isTeacher={isTeacher} meta={meta} />
                                    </a>
                                )}

                                <div className="flex shrink-0 items-center gap-1">
                                    {isModerator && (
                                        <button
                                            type="button"
                                            onClick={() => togglePin(r)}
                                            title={r.isPinned ? "Unpin" : "Pin to top"}
                                            className={`rounded-lg p-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${r.isPinned ? "text-primary-600 dark:text-primary-300" : "text-slate-400"}`}
                                        >
                                            <svg className="h-4 w-4" fill={r.isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                            </svg>
                                        </button>
                                    )}
                                    {canRemove && (
                                        <button
                                            type="button"
                                            onClick={() => remove(r)}
                                            title="Remove"
                                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10"
                                        >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {viewing && <ResourceViewer resource={viewing} onClose={() => setViewing(null)} />}
        </ClassroomShell>
    );
}

function ResourceMeta({ r, isTeacher, meta }: { r: ResourceRow; isTeacher: boolean; meta: string }) {
    return (
        <>
            <span className="flex flex-wrap items-center gap-1.5">
                {r.isPinned && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Pinned</span>
                )}
                <span className="block truncate text-sm font-medium text-gray-900">{r.title}</span>
            </span>
            {r.description && <span className="mt-0.5 block truncate text-xs text-slate-500">{r.description}</span>}
            <span className="mt-0.5 block truncate text-xs text-slate-400">
                {isTeacher ? "Teacher · " : ""}
                {meta}
            </span>
        </>
    );
}

function PickButton({ label, sub, kind, onClick }: { label: string; sub: string; kind: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-3 text-left transition-colors hover:border-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500">
                <KindIcon kind={kind} />
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{label}</span>
                <span className="block truncate text-xs text-slate-500">{sub}</span>
            </span>
        </button>
    );
}

function ResourceViewer({ resource, onClose }: { resource: ResourceRow; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div className="flex items-center gap-3 pb-3 text-white">
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-white/10">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{resource.title}</span>
                <a href={resource.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-white/70 hover:text-white" onClick={(e) => e.stopPropagation()}>
                    Open original ↗
                </a>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {resource.kind === "video" ? (
                    <video src={resource.fileUrl} controls autoPlay className="max-h-full max-w-full rounded-lg" />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resource.fileUrl} alt={resource.title} className="max-h-full max-w-full rounded-lg object-contain" />
                )}
            </div>
        </div>
    );
}

export default function ClassroomResourcesPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <ClassroomResourcesInner />
        </Suspense>
    );
}
