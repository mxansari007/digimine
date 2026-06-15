import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getSectionById, listGroups } from "@/lib/server/sections";

export const dynamic = "force-dynamic";

/**
 * GET /api/sections/{sectionId}/groups
 * Groups under a section, so the create-class form can offer existing groups to
 * target (or combine) once the teacher reuses a section.
 */
export async function GET(req: Request, { params }: { params: { sectionId: string } }) {
    const uid = await getBearerUserId(req).catch(() => null);
    if (!uid) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const section = await getSectionById(params.sectionId);
    if (!section) {
        return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    const groups = await listGroups(section.id);
    return NextResponse.json({ section, groups });
}
