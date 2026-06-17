/**
 * Admin management of custom resume templates (stored at
 * appConfig/resumeTemplates).
 *   GET → { custom, builtins }
 *   PUT → { templates } replaces the full custom set; returns the cleaned set.
 * Admin-only (requireAdmin).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/middleware/requireAdmin";
import { BUILTIN_RESUME_TEMPLATES } from "@digimine/types";
import { getCustomTemplates, saveCustomTemplates } from "@/lib/server/resume/templates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const custom = await getCustomTemplates();
        return NextResponse.json({ custom, builtins: BUILTIN_RESUME_TEMPLATES });
    } catch (error) {
        const e = error as Error;
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    try {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const custom = await saveCustomTemplates(body.templates, auth.uid);
        return NextResponse.json({ custom, builtins: BUILTIN_RESUME_TEMPLATES });
    } catch (error) {
        const e = error as Error;
        return NextResponse.json({ error: e.message || "Failed to save" }, { status: 500 });
    }
}
