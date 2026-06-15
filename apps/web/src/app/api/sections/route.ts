import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { searchSections } from "@/lib/server/sections";

export const dynamic = "force-dynamic";

/**
 * GET /api/sections?q=...
 * Sections in the caller-teacher's university, for the class-create typeahead.
 * The university is taken from the teacher's own profile so the client can't
 * scope to someone else's university.
 */
export async function GET(req: Request) {
    const uid = await getBearerUserId(req).catch(() => null);
    if (!uid) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const tSnap = await adminDb.collection("teachers").doc(uid).get();
    const universityId = tSnap.exists ? (tSnap.data()?.profile?.universityId as string) || null : null;
    if (!universityId) {
        return NextResponse.json({ sections: [], universityId: null });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").slice(0, 80);
    const sections = await searchSections(universityId, q);
    return NextResponse.json({ sections, universityId });
}
