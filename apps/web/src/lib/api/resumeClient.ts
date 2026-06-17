"use client";

/**
 * Client-side API wrapper for the Resume Maker. Every call attaches the
 * caller's Firebase ID token as a bearer (mirrors teacherFetch) and throws an
 * Error carrying the server's `error` message + `code` so the UI can branch on
 * premium_required / quota_exceeded / insufficient_credits.
 */
import type { User } from "firebase/auth";
import type {
    AtsScore,
    Resume,
    ResumeAssistResult,
    ResumeData,
    ResumeSummary,
    ResumeTemplateId,
    ResumeTemplateSpec,
} from "@digimine/types";

export class ResumeApiError extends Error {
    code: string | null;
    status: number;
    extra: Record<string, unknown>;
    constructor(message: string, status: number, code: string | null, extra: Record<string, unknown> = {}) {
        super(message);
        this.name = "ResumeApiError";
        this.code = code;
        this.status = status;
        this.extra = extra;
    }
}

async function req<T>(fb: User, url: string, init?: RequestInit): Promise<T> {
    const token = await fb.getIdToken();
    const res = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init?.headers || {}),
        },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ResumeApiError(
            (json as any)?.error || "Something went wrong.",
            res.status,
            (json as any)?.code ?? null,
            json as Record<string, unknown>
        );
    }
    return json as T;
}

export function listResumes(fb: User) {
    return req<{ resumes: ResumeSummary[] }>(fb, "/api/resume");
}

export function getResumeTemplates(fb: User) {
    return req<{ templates: ResumeTemplateSpec[] }>(fb, "/api/resume/templates");
}

export function createResume(
    fb: User,
    payload: {
        title?: string;
        templateId?: ResumeTemplateId;
        accentColor?: string;
        accentColor2?: string;
        fontId?: string;
        fontScale?: number;
        marginScale?: number;
        data?: ResumeData;
        importedFrom?: { fileName: string; storagePath: string } | null;
    }
) {
    return req<{ resume: Resume }>(fb, "/api/resume", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export function getResume(fb: User, id: string) {
    return req<{ resume: Resume }>(fb, `/api/resume/${id}`);
}

export function saveResume(
    fb: User,
    id: string,
    patch: {
        title?: string;
        templateId?: ResumeTemplateId;
        accentColor?: string;
        accentColor2?: string;
        fontId?: string;
        fontScale?: number;
        marginScale?: number;
        data?: ResumeData;
    }
) {
    return req<{ resume: Resume }>(fb, `/api/resume/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
    });
}

export function deleteResume(fb: User, id: string) {
    return req<{ ok: true }>(fb, `/api/resume/${id}`, { method: "DELETE" });
}

export function checkAts(
    fb: User,
    payload: { data: ResumeData; jobDescription?: string; resumeId?: string }
) {
    return req<{ score: AtsScore; creditsCharged: number }>(fb, "/api/resume/ats", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export function assist(
    fb: User,
    payload:
        | { action: "rewrite_bullet"; bullet: string; role?: string; context?: string }
        | { action: "generate_summary"; data: ResumeData; targetRole?: string }
        | { action: "tailor"; data: ResumeData; jobDescription: string }
) {
    return req<{ result: ResumeAssistResult; creditsCharged: number }>(fb, "/api/resume/assist", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export function importResume(
    fb: User,
    payload:
        | { text: string }
        | { fileUrl: string; storagePath: string; fileName: string; mimeType: string }
) {
    return req<{
        data: ResumeData;
        importedFrom: { fileName: string; storagePath: string } | null;
        creditsCharged: number;
    }>(fb, "/api/resume/import", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/** Request a rendered PDF and trigger a browser download. */
export async function downloadResumePdf(
    fb: User,
    payload: {
        resumeId?: string;
        data?: ResumeData;
        templateId?: ResumeTemplateId;
        accentColor?: string;
        accentColor2?: string;
        fontId?: string;
        fontScale?: number;
        marginScale?: number;
        title?: string;
    }
): Promise<void> {
    const token = await fb.getIdToken();
    const res = await fetch("/api/resume/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new ResumeApiError((json as any)?.error || "Failed to render PDF.", res.status, (json as any)?.code ?? null);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename="?([^"]+)"?/);
    const filename = m?.[1] || "resume.pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
