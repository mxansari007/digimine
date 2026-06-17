/**
 * GET    /api/resume/[resumeId]  → fetch one owned resume (full).
 * PUT    /api/resume/[resumeId]  → save edits (title/template/accent/data).
 * DELETE /api/resume/[resumeId]  → delete it.
 *
 * Ownership: the doc's `userId` must equal the verified caller; otherwise 404
 * (don't leak existence).
 */
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    deleteResume,
    getResumeDoc,
    ResumeTooLargeError,
    serializeResume,
    updateResume,
} from "@/lib/server/resume/store";

export const dynamic = "force-dynamic";

async function loadOwned(req: Request, resumeId: string) {
    const auth = await requireVerifiedUser(req);
    if (!auth.ok) {
        return { error: NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status }) };
    }
    const snap = await getResumeDoc(resumeId);
    if (!snap || snap.data()?.userId !== auth.userId) {
        return { error: NextResponse.json({ error: "Resume not found." }, { status: 404 }) };
    }
    return { userId: auth.userId, snap };
}

export async function GET(req: Request, { params }: { params: { resumeId: string } }) {
    try {
        const owned = await loadOwned(req, params.resumeId);
        if (owned.error) return owned.error;
        return NextResponse.json({ resume: serializeResume(owned.snap) });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/[id] GET] failed:", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: { resumeId: string } }) {
    try {
        const owned = await loadOwned(req, params.resumeId);
        if (owned.error) return owned.error;

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        await updateResume(params.resumeId, {
            title: typeof body.title === "string" ? body.title : undefined,
            templateId: body.templateId !== undefined ? (body.templateId as never) : undefined,
            accentColor: body.accentColor !== undefined ? (body.accentColor as never) : undefined,
            accentColor2: body.accentColor2 !== undefined ? (body.accentColor2 as never) : undefined,
            fontId: body.fontId !== undefined ? (body.fontId as never) : undefined,
            fontScale: body.fontScale !== undefined ? (body.fontScale as never) : undefined,
            marginScale: body.marginScale !== undefined ? (body.marginScale as never) : undefined,
            data: body.data !== undefined ? (body.data as never) : undefined,
        });
        const snap = await getResumeDoc(params.resumeId);
        return NextResponse.json({ resume: serializeResume(snap) });
    } catch (error) {
        if (error instanceof ResumeTooLargeError) {
            return NextResponse.json({ error: error.message, code: "resume_too_large" }, { status: 413 });
        }
        const e = error as Error;
        console.error("[/api/resume/[id] PUT] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to save" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { resumeId: string } }) {
    try {
        const owned = await loadOwned(req, params.resumeId);
        if (owned.error) return owned.error;
        await deleteResume(params.resumeId);
        return NextResponse.json({ ok: true });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/[id] DELETE] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to delete" }, { status: 500 });
    }
}
