/**
 * GET /api/ai-interview/sessions?page=&pageSize=
 *
 * Dashboard payload — SERVER-PAGINATED. Returns one page of the user's
 * interview history (newest first) plus the readiness rollup that powers the
 * graphs, so the history table never fetches the whole collection at once.
 * Response: { items, total, page, pageSize, totalPages, readiness }.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { parsePageParams, paginateQuery } from "@/lib/server/pagination";
import {
    AI_INTERVIEW_SESSIONS,
    getReadiness,
    toSessionSummary,
} from "@/lib/server/aiInterview";
import type { AIInterviewSession, AIInterviewSessionSummary } from "@digimine/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const params = parsePageParams(req, { defaultPageSize: 10, maxPageSize: 50 });
        // Newest-first, scoped to the user — served by the existing
        // (userId ASC, createdAt DESC) composite index.
        const query = adminDb
            .collection(AI_INTERVIEW_SESSIONS)
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc");

        const [page, readiness] = await Promise.all([
            paginateQuery<AIInterviewSessionSummary>(query, params, (d) =>
                toSessionSummary(d.data() as AIInterviewSession)
            ),
            getReadiness(userId),
        ]);

        return NextResponse.json({ ...page, readiness });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/sessions] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to load interviews" },
            { status: 500 }
        );
    }
}
