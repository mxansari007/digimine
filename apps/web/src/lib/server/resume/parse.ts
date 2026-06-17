/**
 * "Bring your own resume" import.
 *
 *   1. extractResumeText  — pull raw text out of an uploaded PDF / DOCX / TXT.
 *      PDF via `unpdf` (serverless-friendly pdf.js build), DOCX via `mammoth`.
 *      Both are dynamically imported so they only load on this server path and
 *      never reach the client bundle.
 *   2. structureResumeText — one LLM call that turns the messy extracted text
 *      into our structured ResumeData. Output flows through sanitizeResumeData
 *      so it's id-stamped, bounded, and Firestore-safe.
 */
import type { AiProviderConfig, ResumeData } from "@digimine/types";
import { callChat, safeParseJsonObject } from "@/lib/server/aiInterview";
import { sanitizeResumeData } from "@/lib/server/resume/store";

export const RESUME_IMPORT_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_MIMES = ["text/plain", "text/markdown", "text/x-markdown"];

export function isSupportedResumeMime(mime: string, fileName: string): boolean {
    const m = (mime || "").toLowerCase();
    const name = (fileName || "").toLowerCase();
    return (
        m === PDF_MIME ||
        m === DOCX_MIME ||
        TEXT_MIMES.includes(m) ||
        name.endsWith(".pdf") ||
        name.endsWith(".docx") ||
        name.endsWith(".txt") ||
        name.endsWith(".md")
    );
}

/** Extract raw text from resume file bytes. Throws a user-friendly Error on
 *  unsupported/empty files (the route maps it to a 400/422). */
export async function extractResumeText(
    bytes: ArrayBuffer,
    mimeType: string,
    fileName: string
): Promise<string> {
    const m = (mimeType || "").toLowerCase();
    const name = (fileName || "").toLowerCase();
    let text = "";

    if (m === PDF_MIME || name.endsWith(".pdf")) {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const res = await extractText(pdf, { mergePages: true });
        text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
    } else if (
        m === DOCX_MIME ||
        m === "application/msword" ||
        name.endsWith(".docx")
    ) {
        const mammothMod: any = await import("mammoth");
        const mammoth = mammothMod.default ?? mammothMod;
        const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
        text = result.value || "";
    } else if (TEXT_MIMES.includes(m) || name.endsWith(".txt") || name.endsWith(".md")) {
        text = Buffer.from(bytes).toString("utf-8");
    } else {
        throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT, or paste your resume text.");
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text.replace(/\s/g, "").length < 30) {
        throw new Error(
            "Couldn't read enough text from that file. It may be an image-only/scanned PDF — paste your resume text instead."
        );
    }
    return text.slice(0, 24_000);
}

/** Turn raw resume text into structured, editable ResumeData via the LLM. */
export async function structureResumeText(
    text: string,
    cfg: AiProviderConfig
): Promise<ResumeData> {
    const raw = await callChat(
        [
            {
                role: "system",
                content:
                    "You parse raw resume text into a structured JSON resume. Use ONLY information present in the text — never invent companies, dates, metrics, or skills. Preserve the candidate's wording for bullets (lightly cleaned). Map content to the closest field; put anything that doesn't fit into customSections. Respond with STRICT JSON only.",
            },
            {
                role: "user",
                content: `RAW RESUME TEXT:
${text}

Return JSON in EXACTLY this shape (omit unknown fields as empty string / empty array — do NOT fabricate):
{
  "contact": { "fullName": "", "headline": "", "email": "", "phone": "", "location": "", "links": [ { "label": "GitHub", "url": "" } ] },
  "summary": "",
  "experience": [ { "company": "", "role": "", "location": "", "startDate": "", "endDate": "", "current": false, "bullets": [""] } ],
  "education": [ { "school": "", "degree": "", "field": "", "location": "", "startDate": "", "endDate": "", "grade": "", "details": [""] } ],
  "projects": [ { "name": "", "subtitle": "", "link": "", "tech": [""], "bullets": [""] } ],
  "skills": [ { "category": "Languages", "skills": ["", ""] } ],
  "certifications": [ { "name": "", "issuer": "", "date": "", "link": "" } ],
  "customSections": [ { "title": "Achievements", "bullets": [""] } ]
}`,
            },
        ],
        cfg,
        { json: true, temperature: 0.1 }
    );
    const parsed = safeParseJsonObject(raw) || {};
    return sanitizeResumeData(parsed);
}
