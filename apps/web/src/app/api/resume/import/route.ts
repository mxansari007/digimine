/**
 * POST /api/resume/import  → "bring your own resume": parse an uploaded
 * PDF/DOCX (or pasted text) into structured, editable ResumeData.
 *
 * Metered by the AI-limits system (the structuring step is an AI call). Body:
 *   { text: string }                                  ← pasted resume text, OR
 *   { fileUrl, storagePath, fileName, mimeType }      ← an upload the client
 *                                                       already pushed to
 *                                                       Storage at resumes/{uid}/...
 */
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { objectPathFromUrl } from "@/lib/server/classResources";
import { resolveResumeProvider, RESUME_AI_UNCONFIGURED } from "@/lib/server/resume/provider";
import { enforceResumeAiQuota } from "@/lib/server/resume/gate";
import { resumeStoragePrefix } from "@/lib/server/resume/store";
import {
    RESUME_IMPORT_MAX_BYTES,
    extractResumeText,
    isSupportedResumeMime,
    structureResumeText,
} from "@/lib/server/resume/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// SSRF guard: we fetch the user-supplied `fileUrl` server-side, so it must be a
// real Firebase Storage download URL — NOT an arbitrary internal host. The
// shared `isStorageUrl` also allows localhost/emulator hosts unconditionally,
// which would let an authed user point the fetch at internal services in
// production; here we only allow the emulator hosts when emulator mode is
// explicitly on.
const BUCKET_HOST_RE = /^https:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//;
const EMULATOR_HOST_RE = /^https?:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?\//;

function isFetchableResumeUrl(url: string): boolean {
    if (BUCKET_HOST_RE.test(url)) return true;
    const emulatorOn =
        !!process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
        process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1";
    return emulatorOn && EMULATOR_HOST_RE.test(url);
}

async function fetchFileBytes(url: string): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("Could not download the uploaded file.");
        const len = Number(res.headers.get("content-length") || 0);
        if (len && len > RESUME_IMPORT_MAX_BYTES) {
            throw new Error("That file is too large (max 8 MB).");
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength > RESUME_IMPORT_MAX_BYTES) {
            throw new Error("That file is too large (max 8 MB).");
        }
        return buf;
    } finally {
        clearTimeout(timer);
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const pastedText = typeof body.text === "string" ? body.text.trim() : "";
        const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
        const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
        const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "";
        const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";

        const usingFile = Boolean(fileUrl || storagePath);

        // Validate inputs BEFORE consuming any allowance.
        if (!usingFile && pastedText.length < 30) {
            return NextResponse.json(
                { error: "Paste your resume text (a few lines at least) or upload a file." },
                { status: 400 }
            );
        }
        if (usingFile) {
            const prefix = resumeStoragePrefix(userId);
            if (!storagePath.startsWith(prefix)) {
                return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
            }
            if (!isFetchableResumeUrl(fileUrl) || objectPathFromUrl(fileUrl) !== storagePath) {
                return NextResponse.json(
                    { error: "The file URL doesn't match the upload." },
                    { status: 400 }
                );
            }
            if (!isSupportedResumeMime(mimeType, fileName)) {
                return NextResponse.json(
                    { error: "Unsupported file type. Upload a PDF, DOCX, TXT, or paste your text." },
                    { status: 400 }
                );
            }
        }

        const cfg = await resolveResumeProvider();
        if (!cfg.enabled || !cfg.apiKey) {
            return NextResponse.json({ error: RESUME_AI_UNCONFIGURED, code: "ai_unconfigured" }, { status: 503 });
        }

        const gate = await enforceResumeAiQuota(userId, "a resume import");
        if (!gate.ok) return gate.response;

        // Step 1: get raw text. Extraction/download problems are the user's
        // file, not an AI failure → 422, and we refund the consumed allowance.
        let rawText: string;
        try {
            if (usingFile) {
                const bytes = await fetchFileBytes(fileUrl);
                rawText = await extractResumeText(bytes, mimeType, fileName);
            } else {
                rawText = pastedText.slice(0, 24_000);
            }
        } catch (err) {
            await gate.refundOnFailure();
            const msg = err instanceof Error ? err.message : "Could not read that file.";
            return NextResponse.json({ error: msg, code: "parse_failed" }, { status: 422 });
        }

        // Step 2: structure it with the LLM.
        let data;
        try {
            data = await structureResumeText(rawText, cfg);
        } catch (err) {
            await gate.refundOnFailure();
            console.error("[/api/resume/import] structuring failed:", err);
            return NextResponse.json(
                { error: "The AI importer is busy right now. Please try again.", code: "ai_failed" },
                { status: 502 }
            );
        }

        return NextResponse.json({
            data,
            importedFrom: usingFile ? { fileName, storagePath } : null,
            creditsCharged: gate.creditsCharged,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/import] failed:", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
