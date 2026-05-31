/**
 * POST /api/ai-interview/schedule
 *
 * Reserve a FUTURE slot for an interview. Creates a `scheduled` session that
 * the student later begins via /start `{ sessionId }` within the join window.
 *
 * Gating (strongest-first):
 *   1. Auth (401) + short per-user rate-limit.
 *   2. Feature gate (402).
 *   3. Reap stale sessions, then enforce ONE active interview (409).
 *   4. Validate the requested slot (grid-aligned, future, within horizon).
 *   5. Weekly quota (429) — consumed at booking; refunded on cancel/expire.
 *   6. Reserve a slot unit atomically (409 if it just filled).
 *
 * The grounding problem is intentionally NOT chosen here — it's picked when the
 * student begins, so a 3-day-old booking never starts on stale/changed content.
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getEntitlements, checkQuota, refundQuota } from "@/lib/server/entitlements";
import { rateLimit } from "@/lib/server/ratelimit";
import {
    AI_INTERVIEW_SESSIONS,
    AI_INTERVIEW_QUOTA,
    parseInterviewConfig,
} from "@/lib/server/aiInterview";
import {
    getSchedulingConfig,
    reapStaleSessions,
    getActiveSession,
    validateBookableSlot,
    reserveSlot,
    releaseSlot,
    computeOpenSlots,
} from "@/lib/server/aiInterviewScheduling";
import { interviewTypeMeta, type AIInterviewSession } from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }
        const rl = await rateLimit("aiSchedule", userId, { limit: 5, windowSeconds: 10 });
        if (!rl.success) {
            return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
        }

        const ent = await getEntitlements(userId);
        if (!ent.features.ai_interview) {
            return NextResponse.json(
                {
                    error: "AI mock interviews aren't included in your plan. Upgrade to unlock.",
                    code: "premium_required",
                    upgradeUrl: "/membership",
                },
                { status: 402 }
            );
        }

        const cfg = await getSchedulingConfig();
        const now = new Date();
        const nowIso = now.toISOString();
        await reapStaleSessions(userId, cfg, now);

        // One active interview at a time (scheduled OR in_progress).
        const active = await getActiveSession(userId);
        if (active) {
            return NextResponse.json(
                {
                    error:
                        active.status === "in_progress"
                            ? "Finish your in-progress interview before scheduling another."
                            : "You already have an interview scheduled. Cancel it before booking another.",
                    code: active.status === "in_progress" ? "interview_in_progress" : "interview_scheduled",
                    activeSessionId: active.id,
                },
                { status: 409 }
            );
        }

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const slotKey = typeof body.slotKey === "string" ? body.slotKey : "";
        const win = validateBookableSlot(slotKey, now, cfg);
        if (!win) {
            return NextResponse.json(
                { error: "That time slot isn't available to book.", code: "bad_slot" },
                { status: 400 }
            );
        }

        const { interviewType, config } = parseInterviewConfig(body);

        // Consume the weekly quota up-front so a booking reserves the allowance;
        // refunded if the reservation can't be secured (or later on cancel).
        const quota = await checkQuota(userId, AI_INTERVIEW_QUOTA, { consume: true });
        if (!quota.allowed) {
            return NextResponse.json(
                {
                    error:
                        quota.limit === 0
                            ? "Your plan doesn't include AI interviews. Upgrade to unlock."
                            : `You've used this week's ${quota.limit} AI interview${quota.limit === 1 ? "" : "s"}. Come back next week or upgrade for more.`,
                    code: "quota_exceeded",
                    upgradeUrl: "/membership",
                },
                { status: 429 }
            );
        }

        let reserved = false;
        try {
            reserved = await reserveSlot(win, cfg);
        } catch (err) {
            // Reservation errored after we charged the quota — give it back.
            await refundQuota(userId, AI_INTERVIEW_QUOTA, now);
            throw err;
        }
        if (!reserved) {
            await refundQuota(userId, AI_INTERVIEW_QUOTA, now);
            return NextResponse.json(
                {
                    error: "That slot just filled up. Pick another time.",
                    code: "slot_full",
                    openSlots: await computeOpenSlots(now, cfg),
                },
                { status: 409 }
            );
        }

        const id = crypto.randomUUID();
        // Minimal scheduled doc — problem + opening are filled at begin time.
        const session: AIInterviewSession = {
            id,
            userId,
            status: "scheduled",
            interviewType,
            config,
            problemId: "",
            problemSlug: "",
            problemTitle:
                interviewType === "dsa" || interviewType === "sql"
                    ? `${interviewTypeMeta(interviewType).label} interview`
                    : interviewTypeMeta(interviewType).label,
            primaryPattern: null,
            difficulty: config.difficulty,
            language: interviewType === "sql" ? "sql" : "python",
            transcript: [],
            latestCode: "",
            codingUnlocked: false,
            scorecard: null,
            slotId: win.slotKey,
            scheduledAt: win.startsAt.toISOString(),
            expiresAt: new Date(win.startsAt.getTime() + cfg.joinWindowMin * 60_000).toISOString(),
            startedAt: "",
            completedAt: null,
            createdAt: nowIso,
            updatedAt: nowIso,
        };
        try {
            await adminDb.collection(AI_INTERVIEW_SESSIONS).doc(id).set(session);
        } catch (err) {
            // Couldn't persist the booking after reserving — undo both so the
            // student keeps their credit and the slot frees up.
            await releaseSlot(win.slotKey);
            await refundQuota(userId, AI_INTERVIEW_QUOTA, now);
            throw err;
        }
        return NextResponse.json({ session });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/schedule] failed:", e);
        return NextResponse.json({ error: e.message || "Failed to schedule" }, { status: 500 });
    }
}
