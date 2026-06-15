import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveOrCreateUniversity } from "@/lib/server/universities";

/**
 * POST /api/universities  { name }
 * Resolve free text to a canonical university, creating one only if nothing
 * matches. Returns { university, created }. Used as a server-side safety net
 * so duplicates collapse even when the teacher didn't pick from the dropdown.
 */
export async function POST(req: Request) {
    const auth = await requireVerifiedUser(req);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 2) {
        return NextResponse.json({ error: "Enter a university name." }, { status: 400 });
    }

    try {
        const { university, created } = await resolveOrCreateUniversity(name, auth.userId);
        return NextResponse.json({ university, created });
    } catch (e: any) {
        console.error("[universities] resolve failed:", e);
        return NextResponse.json({ error: e?.message || "Could not resolve university." }, { status: 500 });
    }
}
