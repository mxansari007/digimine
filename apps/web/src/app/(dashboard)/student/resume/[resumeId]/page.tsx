"use client";

/**
 * Resume editor — left: structured form (with AI assist), right: live preview +
 * ATS score panel + JD tailoring. Autosaves edits, switches templates/accent,
 * runs the metered AI actions, and downloads the server-rendered PDF.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/common";
import ResumeEditorForm from "@/components/resume/ResumeEditorForm";
import ResumePreview from "@/components/resume/ResumePreview";
import MobileResumeView from "@/components/resume/MobileResumeView";
import { useIsMobile } from "@/hooks/useIsMobile";
import AtsScorePanel from "@/components/resume/AtsScorePanel";
import EditorWorkspace from "@/components/resume/EditorWorkspace";
import TemplateSelect from "@/components/resume/TemplateSelect";
import AccentPicker from "@/components/resume/AccentPicker";
import FontSelect from "@/components/resume/FontSelect";
import FormatToolbar from "@/components/resume/FormatToolbar";
import { setByPath } from "@/lib/resume/path";
import {
    assist,
    checkAts,
    downloadResumePdf,
    getResume,
    getResumeTemplates,
    ResumeApiError,
    saveResume,
} from "@/lib/api/resumeClient";
import {
    DEFAULT_RESUME_ACCENT_2,
    DEFAULT_RESUME_FONT,
    DEFAULT_RESUME_FONT_SCALE,
    DEFAULT_RESUME_MARGIN_SCALE,
    RESUME_ACCENT_COLORS,
    RESUME_FONT_SCALES,
    RESUME_MARGIN_SCALES,
    RESUME_TEMPLATES,
    resolveResumeFont,
    resolveTemplateSpec,
    type AtsScore,
    type ResumeAssistResultTailor,
    type ResumeData,
    type ResumeTemplateId,
    type ResumeTemplateSpec,
} from "@digimine/types";

type SaveStatus = "saved" | "saving" | "error";

export default function ResumeEditorPage() {
    const params = useParams() as { resumeId: string };
    const resumeId = params.resumeId;
    const { firebaseUser } = useAuthContext();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [title, setTitle] = useState("Untitled resume");
    const [templateId, setTemplateId] = useState<ResumeTemplateId>("classic");
    const [templates, setTemplates] = useState<ResumeTemplateSpec[]>(RESUME_TEMPLATES);
    const [accent, setAccent] = useState<string>(RESUME_ACCENT_COLORS[2]);
    const [accent2, setAccent2] = useState<string>(DEFAULT_RESUME_ACCENT_2);
    const [fontId, setFontId] = useState<string>(DEFAULT_RESUME_FONT);
    const [fontScale, setFontScale] = useState<number>(DEFAULT_RESUME_FONT_SCALE);
    const [marginScale, setMarginScale] = useState<number>(DEFAULT_RESUME_MARGIN_SCALE);
    const [data, setData] = useState<ResumeData | null>(null);
    const [status, setStatus] = useState<SaveStatus>("saved");

    const [jobDescription, setJobDescription] = useState("");
    const [showJd, setShowJd] = useState(false);
    const [ats, setAts] = useState<AtsScore | null>(null);
    const [atsBusy, setAtsBusy] = useState(false);
    const [tailor, setTailor] = useState<ResumeAssistResultTailor | null>(null);
    const [tailorBusy, setTailorBusy] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [atsCollapsed, setAtsCollapsed] = useState(false);
    const isMobile = useIsMobile();
    // Field the user is hovering / editing in the preview → form scrolls + highlights it.
    const [activeFieldPath, setActiveFieldPath] = useState<string | null>(null);
    // Whether hovering/editing in the preview links to the form (scroll + highlight).
    const [linkPreview, setLinkPreview] = useState(true);

    useEffect(() => {
        if (typeof localStorage !== "undefined" && localStorage.getItem("resumeLinkPreview") === "0") {
            setLinkPreview(false);
        }
    }, []);

    const toggleLinkPreview = useCallback(() => {
        setLinkPreview((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("resumeLinkPreview", next ? "1" : "0");
            } catch {
                /* ignore */
            }
            if (!next) setActiveFieldPath(null);
            return next;
        });
    }, []);

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipSave = useRef(true);
    const loaded = useRef(false);

    // Load
    useEffect(() => {
        if (!firebaseUser) return;
        let cancelled = false;
        (async () => {
            try {
                const { resume } = await getResume(firebaseUser, resumeId);
                if (cancelled) return;
                setTitle(resume.title);
                setTemplateId(resume.templateId);
                setAccent(resume.accentColor);
                setAccent2(resume.accentColor2);
                setFontId(resume.fontId);
                setFontScale(resume.fontScale);
                setMarginScale(resume.marginScale);
                setData(resume.data);
                setAts(resume.lastAts);
                loaded.current = true;
            } catch (e) {
                if (cancelled) return;
                if (e instanceof ResumeApiError && e.status === 404) setNotFound(true);
                else toast.error(e instanceof Error ? e.message : "Failed to load resume");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [firebaseUser, resumeId, toast]);

    // Load the template list (built-ins + admin-created) for the picker + preview.
    useEffect(() => {
        if (!firebaseUser) return;
        let cancelled = false;
        getResumeTemplates(firebaseUser)
            .then((r) => {
                if (!cancelled && r.templates.length) setTemplates(r.templates);
            })
            .catch(() => {
                /* keep built-in defaults */
            });
        return () => {
            cancelled = true;
        };
    }, [firebaseUser]);

    // Debounced autosave (skips the run triggered by the initial load).
    useEffect(() => {
        if (!loaded.current || !data || !firebaseUser) return;
        if (skipSave.current) {
            skipSave.current = false;
            return;
        }
        setStatus("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            try {
                await saveResume(firebaseUser, resumeId, {
                    title,
                    templateId,
                    accentColor: accent,
                    accentColor2: accent2,
                    fontId,
                    fontScale,
                    marginScale,
                    data,
                });
                setStatus("saved");
            } catch {
                setStatus("error");
            }
        }, 1000);
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, [data, title, templateId, accent, accent2, fontId, fontScale, marginScale, firebaseUser, resumeId]);

    // Commit an inline edit from the preview back into the resume data. Fields
    // that display a comma-joined array (skills, project tech) are split back
    // into an array; everything else is a plain string.
    const onInlineEdit = useCallback((path: string, value: string) => {
        setData((d) => {
            if (!d) return d;
            if (/^(skills\.\d+\.skills|projects\.\d+\.tech)$/.test(path)) {
                return setByPath(d, path, value.split(",").map((s) => s.trim()).filter(Boolean));
            }
            return setByPath(d, path, value);
        });
    }, []);

    const aiError = useCallback(
        (e: unknown) => {
            const msg = e instanceof Error ? e.message : "The AI assistant is unavailable right now.";
            toast.error(msg);
        },
        [toast]
    );

    // AI assist callbacks for the form
    const onImproveBullet = useCallback(
        async (bullet: string, role: string): Promise<string[]> => {
            if (!firebaseUser) return [];
            setAiBusy(true);
            try {
                const { result } = await assist(firebaseUser, { action: "rewrite_bullet", bullet, role });
                return result.action === "rewrite_bullet" ? result.variants : [];
            } catch (e) {
                aiError(e);
                return [];
            } finally {
                setAiBusy(false);
            }
        },
        [firebaseUser, aiError]
    );

    const onGenerateSummary = useCallback(async (): Promise<string | null> => {
        if (!firebaseUser || !data) return null;
        setAiBusy(true);
        try {
            const { result } = await assist(firebaseUser, {
                action: "generate_summary",
                data,
                targetRole: data.contact.headline,
            });
            return result.action === "generate_summary" ? result.summary : null;
        } catch (e) {
            aiError(e);
            return null;
        } finally {
            setAiBusy(false);
        }
    }, [firebaseUser, data, aiError]);

    const runAts = async () => {
        if (!firebaseUser || !data) return;
        setAtsBusy(true);
        try {
            const { score } = await checkAts(firebaseUser, {
                data,
                jobDescription: jobDescription.trim() || undefined,
                resumeId,
            });
            setAts(score);
            toast.success(`ATS score: ${score.overall}/100`);
        } catch (e) {
            aiError(e);
        } finally {
            setAtsBusy(false);
        }
    };

    const runTailor = async () => {
        if (!firebaseUser || !data) return;
        if (jobDescription.trim().length < 40) {
            toast.error("Paste the job description first (a few lines at least).");
            setShowJd(true);
            return;
        }
        setTailorBusy(true);
        try {
            const { result } = await assist(firebaseUser, { action: "tailor", data, jobDescription });
            if (result.action === "tailor") setTailor(result);
        } catch (e) {
            aiError(e);
        } finally {
            setTailorBusy(false);
        }
    };

    const downloadPdf = async () => {
        if (!firebaseUser || !data) return;
        setPdfBusy(true);
        try {
            await downloadResumePdf(firebaseUser, {
                data,
                templateId,
                accentColor: accent,
                accentColor2: accent2,
                fontId,
                fontScale,
                marginScale,
                title,
            });
        } catch (e) {
            aiError(e);
        } finally {
            setPdfBusy(false);
        }
    };

    if (loading) return <PageLoading />;
    if (notFound || !data)
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm text-slate-500">This resume doesn&apos;t exist or isn&apos;t yours.</p>
                <Link href="/student/resume" className="mt-3 inline-block text-sm font-medium text-primary-600">
                    ← Back to Resume Maker
                </Link>
            </div>
        );

    // Phones: build on desktop, but preview + download here (no editing UI).
    if (isMobile)
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <Link href="/student/resume" className="text-sm text-slate-400 hover:text-slate-600">
                        ← All resumes
                    </Link>
                    <Button variant="primary" size="sm" isLoading={pdfBusy} onClick={downloadPdf}>
                        Download PDF
                    </Button>
                </div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    ✏️ Editing is available on a desktop or laptop. Here you can preview and download your resume.
                </div>
                <MobileResumeView
                    data={data}
                    spec={resolveTemplateSpec(templateId, templates)}
                    accent={accent}
                    accent2={accent2}
                    font={resolveResumeFont(fontId)}
                    fontScale={fontScale}
                    marginScale={marginScale}
                />
            </div>
        );

    return (
        <div className="space-y-4">
            {/* Top bar */}
            <div className="flex flex-wrap items-center gap-3">
                <Link href="/student/resume" className="text-sm text-slate-400 hover:text-slate-600">
                    ← All resumes
                </Link>
                <input
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-primary-400 focus:bg-white dark:text-slate-100 dark:hover:border-slate-700"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Resume name"
                />
                <span className="text-xs text-slate-400">
                    {status === "saving" ? "Saving…" : status === "error" ? "Save failed" : "Saved"}
                </span>
                <Button variant="primary" isLoading={pdfBusy} onClick={downloadPdf}>
                    Download PDF
                </Button>
            </div>

            {/* Template + accent controls */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Template</span>
                    <TemplateSelect templates={templates} value={templateId} onChange={setTemplateId} />
                </div>
                <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
                <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Font</span>
                    <FontSelect value={fontId} onChange={setFontId} />
                </div>
                <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Size</span>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                        {RESUME_FONT_SCALES.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setFontScale(s.value)}
                                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                                    Math.abs(fontScale - s.value) < 0.001
                                        ? "bg-primary-600 text-white"
                                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div
                    className="flex items-center gap-2.5"
                    title="Shrink the page margins to fit more on each page — handy for squeezing a resume onto one page."
                >
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Margins</span>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                        {RESUME_MARGIN_SCALES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setMarginScale(m.value)}
                                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                                    Math.abs(marginScale - m.value) < 0.001
                                        ? "bg-primary-600 text-white"
                                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Accent</span>
                    <AccentPicker value={accent} onChange={setAccent} />
                </div>
                {resolveTemplateSpec(templateId, templates).usesAccent2 && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Secondary</span>
                        <AccentPicker value={accent2} onChange={setAccent2} />
                    </div>
                )}
                <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
                <button
                    type="button"
                    onClick={toggleLinkPreview}
                    aria-pressed={linkPreview}
                    title="When on, hovering or editing text on the resume scrolls to and highlights the matching field in the form. Turn off if you find it distracting."
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        linkPreview
                            ? "border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${linkPreview ? "bg-primary-500" : "bg-slate-400"}`} />
                    Sync to form
                </button>
                <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
                <FormatToolbar />
            </div>
            <p className="-mt-1 px-1 text-xs text-slate-400">
                Tip: click into a bullet or the summary (in the form or on the resume), then use the Format controls
                above — or ⌘/Ctrl + B, I, U — to format &amp; align text.
            </p>

            {/* Editor + resizable, sticky, zoom-to-fit preview */}
            <EditorWorkspace
                left={
                    <ResumeEditorForm
                        data={data}
                        onChange={setData}
                        onImproveBullet={onImproveBullet}
                        onGenerateSummary={onGenerateSummary}
                        aiBusy={aiBusy}
                        activePath={activeFieldPath}
                    />
                }
                resume={
                    <ResumePreview
                        data={data}
                        spec={resolveTemplateSpec(templateId, templates)}
                        accent={accent}
                        accent2={accent2}
                        font={resolveResumeFont(fontId)}
                        fontScale={fontScale}
                        marginScale={marginScale}
                        mode="document"
                        editable
                        onInlineEdit={onInlineEdit}
                        onFieldActivate={linkPreview ? setActiveFieldPath : undefined}
                    />
                }
                rightTop={
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">ATS check</h3>
                                {atsCollapsed && ats && (
                                    <span
                                        className={`text-sm font-bold ${
                                            ats.overall >= 80
                                                ? "text-emerald-600"
                                                : ats.overall >= 60
                                                  ? "text-amber-600"
                                                  : "text-rose-600"
                                        }`}
                                    >
                                        {ats.overall}
                                        <span className="text-[10px] font-normal text-slate-400">/100</span>
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {!atsCollapsed && (
                                    <button
                                        onClick={() => setShowJd((s) => !s)}
                                        className="text-xs font-medium text-primary-600 hover:text-primary-700"
                                    >
                                        {showJd ? "Hide" : "+ Add"} target job description
                                    </button>
                                )}
                                <button
                                    onClick={() => setAtsCollapsed((c) => !c)}
                                    aria-label={atsCollapsed ? "Expand ATS check" : "Minimize ATS check"}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    <svg
                                        className={`h-3.5 w-3.5 transition-transform ${atsCollapsed ? "" : "rotate-180"}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                    {atsCollapsed ? "Expand" : "Minimize"}
                                </button>
                            </div>
                        </div>
                        {!atsCollapsed && (
                          <>
                        {showJd && (
                            <textarea
                                className="mt-2 h-28 w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                placeholder="Paste the job description to score + tailor against this specific role…"
                                value={jobDescription}
                                onChange={(e) => setJobDescription(e.target.value)}
                            />
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="primary" isLoading={atsBusy} onClick={runAts}>
                                Check ATS score
                            </Button>
                            <Button variant="outline" isLoading={tailorBusy} onClick={runTailor}>
                                Tailor to job
                            </Button>
                        </div>

                        {ats && (
                            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <AtsScorePanel score={ats} />
                            </div>
                        )}

                        {tailor && (
                            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        Tailoring suggestions
                                    </h4>
                                    <button onClick={() => setTailor(null)} className="text-xs text-slate-400 hover:text-slate-600">
                                        Dismiss
                                    </button>
                                </div>
                                {tailor.missingKeywords.length > 0 && (
                                    <div className="mt-2">
                                        <div className="text-xs font-semibold text-rose-600">Add these keywords</div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {tailor.missingKeywords.map((k, i) => (
                                                <span key={i} className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                                                    {k}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                                    {tailor.suggestions.map((s, i) => (
                                        <li key={i}>
                                            <span className="font-medium text-slate-800 dark:text-slate-100">{s.target}:</span>{" "}
                                            {s.suggestion}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                          </>
                        )}
                    </div>
                }
            />
        </div>
    );
}
