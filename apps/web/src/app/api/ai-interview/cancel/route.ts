/**
 * POST /api/ai-interview/cancel  { sessionId }
 *
 * Cancel a `scheduled` booking the student no longer wants: frees the reserved
 * slot capacity and refunds the weekly quota unit. Only the owner may cancel,
 * and only while the session is still `scheduled` (an in-progress interview is
 * ended via /finish, not cancelled).
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { refundQuota } from "@/lib/server/entitlements";
import { AI_INTERVIEW_SESSIONS, AI_INTERVIEW_QUOTA } from "@/lib/server/aiInterview";
import { releaseSlot } from "@/lib/server/aiInterviewScheduling";
import type { AIInterviewSession } from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId required" }, { status: 400 });
        }

        const ref = adminDb.collection(AI_INTERVIEW_SESSIONS).doc(sessionId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Interview not found" }, { status: 404 });
        }
        const session = snap.data() as AIInterviewSession;
        if (session.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (session.status !== "scheduled") {
            return NextResponse.json(
                { error: "Only a scheduled interview can be cancelled.", code: "not_scheduled" },
                { status: 409 }
            );
        }

        await ref.set(
            { status: "cancelled", expiresAt: null, updatedAt: new Date().toISOString() },
            { merge: true }
        );
        await releaseSlot(session.slotId);
        await refundQuota(userId, AI_INTERVIEW_QUOTA, new Date(session.createdAt || session.scheduledAt || Date.now()));

        return NextResponse.json({ ok: true });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/cancel] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to cancel" }, { status: 500 });
    }
}
