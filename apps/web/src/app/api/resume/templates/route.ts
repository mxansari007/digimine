/**
 * GET /api/resume/templates → all templates the student can pick from
 * (built-ins + admin-created), so the gallery and editor stay data-driven.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getAllTemplates } from "@/lib/server/resume/templates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        const templates = await getAllTemplates();
        return NextResponse.json({ templates });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/resume/templates] failed:", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
