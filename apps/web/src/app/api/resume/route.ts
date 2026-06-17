/**
 * GET  /api/resume  → list the caller's resumes (summaries).
 * POST /api/resume  → create a new resume (blank, or with initial/imported data).
 *
 * Bearer-token auth (firebase-admin); the `resumes` collection is server-only.
 */
import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { createResume, listResumesForUser, ResumeTooLargeError } from "@/lib/server/resume/store";
import { emptyResumeData } from "@digimine/types";

export const dynamic = "force-dynamic";

const MAX_RESUMES_PER_USER = 30;

export async function GET(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const resumes = await listResumesForUser(auth.userId);
        return NextResponse.json({ resumes });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume GET] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to load resumes" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
        }
        const userId = auth.userId;

        const existing = await listResumesForUser(userId);
        if (existing.length >= MAX_RESUMES_PER_USER) {
            return NextResponse.json(
                { error: `You can keep up to ${MAX_RESUMES_PER_USER} resumes. Delete one to add another.` },
                { status: 400 }
            );
        }

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const imp = body.importedFrom as Record<string, unknown> | undefined;
        const importedFrom =
            imp && typeof imp === "object"
                ? {
                      fileName: String(imp.fileName || "").slice(0, 200),
                      storagePath: String(imp.storagePath || "").slice(0, 400),
                  }
                : null;

        const resume = await createResume(userId, {
            title: typeof body.title === "string" ? body.title : "Untitled resume",
            templateId: body.templateId as never,
            accentColor: body.accentColor as never,
            accentColor2: body.accentColor2 as never,
            data: (body.data as never) ?? emptyResumeData(),
            importedFrom,
        });
        return NextResponse.json({ resume });
    } catch (error) {
        if (error instanceof ResumeTooLargeError) {
            return NextResponse.json({ error: error.message, code: "resume_too_large" }, { status: 413 });
        }
        const e = error as Error;
        console.error("[/api/resume POST] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to create resume" }, { status: 500 });
    }
}
