/**
 * POST /api/resume/pdf  → render a resume to a downloadable PDF.
 *
 * Not metered (deterministic render, no AI). Accepts either an owned
 * `resumeId` (authoritative) or inline editor state:
 *   { resumeId } | { data, templateId, accentColor, title }
 */
import { NextResponse } from "next/server";
import { resolveResumeFont, resolveTemplateSpec } from "@digimine/types";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { renderResumePdf } from "@/lib/server/resume/pdf";
import { getCustomTemplates } from "@/lib/server/resume/templates";
import {
    getResumeDoc,
    sanitizeAccent,
    sanitizeAccent2,
    sanitizeFontId,
    sanitizeFontScale,
    sanitizeMarginScale,
    sanitizeResumeData,
    sanitizeTemplateId,
    sanitizeTitle,
} from "@/lib/server/resume/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function fileSlug(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return slug || "resume";
}

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";

        let data;
        let templateId;
        let accent;
        let accent2;
        let title;
        let fontId;
        let fontScale;
        let marginScale;

        if (resumeId) {
            const snap = await getResumeDoc(resumeId);
            if (!snap || snap.data()?.userId !== userId) {
                return NextResponse.json({ error: "Resume not found." }, { status: 404 });
            }
            const d = snap.data() || {};
            data = sanitizeResumeData(d.data);
            templateId = sanitizeTemplateId(d.templateId);
            accent = sanitizeAccent(d.accentColor);
            accent2 = sanitizeAccent2(d.accentColor2);
            fontId = sanitizeFontId(d.fontId);
            fontScale = sanitizeFontScale(d.fontScale);
            marginScale = sanitizeMarginScale(d.marginScale);
            title = sanitizeTitle(d.title);
        } else {
            data = sanitizeResumeData(body.data);
            templateId = sanitizeTemplateId(body.templateId);
            accent = sanitizeAccent(body.accentColor);
            accent2 = sanitizeAccent2(body.accentColor2);
            fontId = sanitizeFontId(body.fontId);
            fontScale = sanitizeFontScale(body.fontScale);
            marginScale = sanitizeMarginScale(body.marginScale);
            title = sanitizeTitle(body.title);
        }

        const spec = resolveTemplateSpec(templateId, await getCustomTemplates());
        const font = resolveResumeFont(fontId);
        const buffer = await renderResumePdf(data, spec, {
            accent,
            accent2,
            fontStack: font.stack,
            fontScale,
            marginScale,
            fontGoogle: font.google,
        });
        const filename = `${fileSlug(data.contact.fullName || title)}.pdf`;

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/pdf] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to render PDF" }, { status: 500 });
    }
}
