import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { searchUniversities } from "@/lib/server/universities";

/**
 * GET /api/universities/search?q=...
 * Typeahead for the onboarding university picker. Any signed-in user may call
 * it (teachers are mid-signup, so we don't require the teacher role yet).
 * Never hard-fails — returns an empty result so the dropdown degrades to a
 * plain "add new" input.
 */
export async function GET(req: Request) {
    const uid = await getBearerUserId(req).catch(() => null);
    if (!uid) {
        return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").slice(0, 120);

    try {
        const result = await searchUniversities(q);
        return NextResponse.json(result);
    } catch (e) {
        console.error("[universities/search]", e);
        return NextResponse.json(
            { query: q, resolved: null, suggestions: [], canCreate: q.trim().length >= 3 },
            { status: 200 }
        );
    }
}
