"use client";

/**
 * Resume Maker — list / dashboard. Lists the student's resumes, creates blank
 * ones, and runs the "bring your own resume" import (upload to Storage → AI
 * structure → new resume), then routes into the editor.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@digimine/ui";
import { uploadFile } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/common";
import ImportDialog, { type ImportSubmission } from "@/components/resume/ImportDialog";
import TemplateGallery from "@/components/resume/TemplateGallery";
import {
    createResume,
    deleteResume,
    getResumeTemplates,
    importResume,
    listResumes,
    ResumeApiError,
} from "@/lib/api/resumeClient";
import {
    DEFAULT_RESUME_ACCENT,
    DEFAULT_RESUME_TEMPLATE,
    emptyResumeData,
    RESUME_TEMPLATES,
    SAMPLE_RESUME_DATA,
    type ResumeSummary,
    type ResumeTemplateId,
    type ResumeTemplateSpec,
} from "@digimine/types";

function scoreTone(score: number | null) {
    if (score == null) return "text-slate-400";
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-amber-600";
    return "text-rose-600";
}

export default function ResumeListPage() {
    const { firebaseUser } = useAuthContext();
    const router = useRouter();
    const toast = useToast();

    const [resumes, setResumes] = useState<ResumeSummary[]>([]);
    const [templates, setTemplates] = useState<ResumeTemplateSpec[]>(RESUME_TEMPLATES);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importBusy, setImportBusy] = useState(false);
    const [importStatus, setImportStatus] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const { resumes } = await listResumes(firebaseUser);
            setResumes(resumes);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load resumes");
        } finally {
            setLoading(false);
        }
        // Templates (built-ins + admin-created); keep built-ins on failure.
        try {
            const { templates } = await getResumeTemplates(firebaseUser);
            if (templates.length) setTemplates(templates);
        } catch {
            /* keep built-in defaults */
        }
    }, [firebaseUser, toast]);

    useEffect(() => {
        load();
    }, [load]);

    const handleApiError = (e: unknown) => {
        if (e instanceof ResumeApiError) {
            toast.error(e.message);
        } else {
            toast.error(e instanceof Error ? e.message : "Something went wrong");
        }
    };

    const createFromTemplate = async (templateId: ResumeTemplateId, withSample: boolean) => {
        if (!firebaseUser) return;
        setCreating(true);
        try {
            const { resume } = await createResume(firebaseUser, {
                title: withSample ? "My resume" : "Untitled resume",
                templateId,
                accentColor: DEFAULT_RESUME_ACCENT,
                data: withSample ? SAMPLE_RESUME_DATA : emptyResumeData(),
            });
            router.push(`/student/resume/${resume.id}`);
        } catch (e) {
            handleApiError(e);
            setCreating(false);
        }
    };

    const runImport = async (sub: ImportSubmission) => {
        if (!firebaseUser) return;
        setImportBusy(true);
        try {
            let imported;
            if (sub.kind === "text") {
                setImportStatus("Reading your resume…");
                imported = await importResume(firebaseUser, { text: sub.text });
            } else {
                setImportStatus("Uploading file…");
                const safe = sub.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "resume";
                const path = `resumes/${firebaseUser.uid}/${Date.now()}-${safe}`;
                const fileUrl = await new Promise<string>((resolve, reject) => {
                    uploadFile(storage, path, sub.file, (s) => {
                        if (s.downloadUrl) resolve(s.downloadUrl);
                        else if (s.error) reject(s.error);
                        else setImportStatus(`Uploading… ${Math.round(s.progress)}%`);
                    });
                });
                setImportStatus("Reading your resume with AI…");
                imported = await importResume(firebaseUser, {
                    fileUrl,
                    storagePath: path,
                    fileName: sub.file.name,
                    mimeType: sub.file.type || "",
                });
            }

            setImportStatus("Creating your resume…");
            const { resume } = await createResume(firebaseUser, {
                title: imported.data.contact.fullName
                    ? `${imported.data.contact.fullName}'s resume`
                    : "Imported resume",
                templateId: DEFAULT_RESUME_TEMPLATE,
                accentColor: DEFAULT_RESUME_ACCENT,
                data: imported.data,
                importedFrom: imported.importedFrom,
            });
            toast.success("Imported! Review and polish it below.");
            router.push(`/student/resume/${resume.id}`);
        } catch (e) {
            handleApiError(e);
            setImportBusy(false);
            setImportStatus("");
        }
    };

    const remove = async (id: string, title: string) => {
        if (!firebaseUser) return;
        if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
        try {
            await deleteResume(firebaseUser, id);
            setResumes((rs) => rs.filter((r) => r.id !== id));
            toast.success("Resume deleted");
        } catch (e) {
            handleApiError(e);
        }
    };

    if (loading) return <PageLoading />;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">
                        Resume Maker
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Build an ATS-friendly resume, import your existing one, and check your ATS score with AI.
                    </p>
                </div>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                    Import existing resume
                </Button>
            </div>

            {/* Start a new resume — pick a template (Word-style gallery) */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Start a new resume
                    </h2>
                    {creating && <span className="text-xs text-primary-600">Creating…</span>}
                </div>
                <TemplateGallery busy={creating} templates={templates} onCreate={createFromTemplate} />
            </section>

            {/* Saved resumes */}
            <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Your resumes
                </h2>
                {resumes.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                        Your saved resumes will appear here. Pick a template above or import your existing resume to get started.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                                    <th className="px-4 py-3 font-semibold">Name</th>
                                    <th className="px-4 py-3 font-semibold">Template</th>
                                    <th className="px-4 py-3 font-semibold">ATS</th>
                                    <th className="px-4 py-3 font-semibold">Updated</th>
                                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resumes.map((r) => {
                                    const tpl = templates.find((t) => t.id === r.templateId);
                                    return (
                                        <tr
                                            key={r.id}
                                            className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                                        >
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => router.push(`/student/resume/${r.id}`)}
                                                    className="font-semibold text-slate-900 hover:text-primary-600 dark:text-slate-100"
                                                >
                                                    {r.title}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{tpl?.label || "Classic"}</td>
                                            <td className="px-4 py-3">
                                                {r.atsScore != null ? (
                                                    <span className={`font-bold ${scoreTone(r.atsScore)}`}>
                                                        {r.atsScore}
                                                        <span className="text-[10px] font-normal text-slate-400">/100</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-slate-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{new Date(r.updatedAt).toLocaleDateString()}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        onClick={() => router.push(`/student/resume/${r.id}`)}
                                                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-primary-400 hover:text-primary-600 dark:border-slate-700 dark:text-slate-300"
                                                    >
                                                        Open
                                                    </button>
                                                    <button
                                                        onClick={() => remove(r.id, r.title)}
                                                        className="text-xs text-slate-400 hover:text-rose-500"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <ImportDialog
                open={importOpen}
                busy={importBusy}
                statusText={importStatus}
                onClose={() => setImportOpen(false)}
                onSubmit={runImport}
            />
        </div>
    );
}
