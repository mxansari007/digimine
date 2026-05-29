/**
 * GET /api/ai-interview/sessions
 *
 * Dashboard payload: the user's recent interview sessions (summaries) + their
 * readiness rollup (trend + dimension averages + weak spots).
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import {
    AI_INTERVIEW_SESSIONS,
    getReadiness,
    toSessionSummary,
} from "@/lib/server/aiInterview";
import type { AIInterviewSession } from "@digimine/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        const snap = await adminDb
            .collection(AI_INTERVIEW_SESSIONS)
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        const sessions = snap.docs
            .map((d) => toSessionSummary(d.data() as AIInterviewSession))
            .filter(Boolean);

        const readiness = await getReadiness(userId);

        return NextResponse.json({ sessions, readiness });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/sessions] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to load interviews" },
            { status: 500 }
        );
    }
}
