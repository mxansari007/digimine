/**
 * GET /api/institute/{instituteId}/reports
 *
 * Institute-wide placement-readiness report for the TPO dashboard:
 * per-class readiness distributions, participation, scores, and the
 * at-risk roster. Admin of the institute only (email-verified via
 * assertInstituteAdmin).
 */
import { NextResponse } from "next/server";
import { assertInstituteAdmin } from "@/lib/server/institutes";
import { buildInstituteReport } from "@/lib/server/instituteReports";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const report = await buildInstituteReport(params.instituteId);
        return NextResponse.json({
            institute: { id: params.instituteId, name: (auth.institute as any)?.name || "" },
            ...report,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/institute/reports] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to build report" },
            { status: 500 }
        );
    }
}
