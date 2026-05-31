/**
 * GET /api/ai-interview/slots
 *
 * Powers the scheduling UI. Reaps the caller's stale sessions first, then
 * returns:
 *   - `activeSession`   — their one scheduled/in_progress session (or null)
 *   - `canStartNow`     — current slot has capacity AND global cap not hit
 *   - `currentRemaining`— seats left in the current slot
 *   - `openSlots`       — upcoming bookable windows with remaining capacity
 *   - `scheduling`      — the public scheduling config (slot length, horizon…)
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { getEntitlements } from "@/lib/server/entitlements";
import { toSessionSummary } from "@/lib/server/aiInterview";
import {
    getSchedulingConfig,
    reapStaleSessions,
    getActiveSession,
    countActiveGlobal,
    currentSlot,
    getSlotRemaining,
    computeOpenSlots,
} from "@/lib/server/aiInterviewScheduling";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const ent = await getEntitlements(userId);
        if (!ent.features.ai_interview) {
            return NextResponse.json({ error: "Premium feature", code: "premium_required" }, { status: 402 });
        }

        const cfg = await getSchedulingConfig();
        const now = new Date();
        await reapStaleSessions(userId, cfg, now);

        const active = await getActiveSession(userId);
        const slot = currentSlot(now, cfg);
        const [currentRemaining, liveCount, openSlots] = await Promise.all([
            getSlotRemaining(slot, cfg),
            countActiveGlobal(),
            computeOpenSlots(now, cfg),
        ]);

        const canStartNow =
            !active && currentRemaining > 0 && liveCount < cfg.maxConcurrentGlobal;

        return NextResponse.json({
            scheduling: {
                slotMinutes: cfg.slotMinutes,
                slotCapacity: cfg.slotCapacity,
                bookingHorizonHours: cfg.bookingHorizonHours,
                joinGraceMin: cfg.joinGraceMin,
                joinWindowMin: cfg.joinWindowMin,
            },
            activeSession: active ? toSessionSummary(active) : null,
            canStartNow,
            currentRemaining,
            currentSlotEndsAt: slot.endsAt.toISOString(),
            openSlots,
        });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/slots] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to load slots" }, { status: 500 });
    }
}
