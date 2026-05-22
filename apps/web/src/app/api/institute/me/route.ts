import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { findInstituteForAdmin, serializeInstitute } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

/**
 * Resolve the institute the calling user administers. Returns `{ institute: null }`
 * when the caller isn't an admin anywhere — the UI uses this to route them to
 * the onboarding flow.
 */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ institute: null }, { status: 401 });
        const institute = await findInstituteForAdmin(userId);
        if (!institute) return NextResponse.json({ institute: null });
        return NextResponse.json({
            institute: serializeInstitute({ id: institute.id, ...institute }),
        });
    } catch (error: any) {
        console.error("Institute me failed:", error);
        return NextResponse.json({ institute: null, error: error?.message }, { status: 500 });
    }
}
