/**
 * POST /api/ai-interview/start
 *
 * Two modes:
 *   • Begin a booking — body `{ sessionId }`: activate a `scheduled` session
 *     once its join window is open. Quota was already spent at booking time.
 *   • Instant start — body `{ interviewType, difficulty, … }`: start now,
 *     adaptively booking the CURRENT slot if it still has capacity.
 *
 * Gating (strongest-first), shared where possible with /schedule:
 *   1. Auth (401) + a short per-user rate-limit (kills double-submits).
 *   2. Feature gate `ent.features.ai_interview` (402).
 *   3. Reap the caller's stale sessions, then enforce ONE active interview.
 *   4. AI provider configured (503) + a matching problem for coding types (404/402).
 *   5. Capacity: global concurrency backstop + per-slot capacity (instant only).
 *   6. Weekly quota (429) — consumed on instant start (bookings consumed it already).
 */
import { NextResponse } from "next/server";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getEntitlements, checkQuota, refundQuota } from "@/lib/server/entitlements";
import { getAiProviderConfig } from "@/lib/server/aiProvider";
import { serializeProblemPublic } from "@/lib/server/practice";
import { rateLimit } from "@/lib/server/ratelimit";
import {
    AI_INTERVIEW_SESSIONS,
    AI_INTERVIEW_QUOTA,
    pickInterviewProblem,
    providerEndpoint,
    composeInterviewOpening,
    parseInterviewConfig,
} from "@/lib/server/aiInterview";
import {
    getSchedulingConfig,
    reapStaleSessions,
    getActiveSession,
    countActiveGlobal,
    currentSlot,
    reserveSlot,
    releaseSlot,
    computeOpenSlots,
} from "@/lib/server/aiInterviewScheduling";
import type { AIInterviewSession, AIInterviewSchedulingConfig } from "@digimine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Suggest the soonest bookable slot so the client can offer "schedule instead". */
async function nextOpenSlot(now: Date, cfg: AIInterviewSchedulingConfig) {
    const open = await computeOpenSlots(now, cfg, 1);
    return open[0] ?? null;
}

export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) {
            return NextResponse.json({ error: "Sign in" }, { status: 401 });
        }

        // Cheap guard against double-clicked starts racing each other.
        const rl = await rateLimit("aiStart", userId, { limit: 3, windowSeconds: 10 });
        if (!rl.success) {
            return NextResponse.json(
                { error: "You're going too fast — give it a second." },
                { status: 429 }
            );
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

        // Always reap the caller's stale sessions first so an abandoned/no-show
        // interview doesn't falsely count against "one active at a time".
        await reapStaleSessions(userId, cfg, now);

        const aiCfg = await getAiProviderConfig();
        const providerLive = aiCfg.enabled && aiCfg.apiKey && providerEndpoint(aiCfg);

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

        // ─────────────────────────────────────────────────────────────────
        // MODE A — begin a booked (scheduled) session.
        // ─────────────────────────────────────────────────────────────────
        if (sessionId) {
            const ref = adminDb.collection(AI_INTERVIEW_SESSIONS).doc(sessionId);
            const snap = await ref.get();
            if (!snap.exists) {
                return NextResponse.json({ error: "Interview not found" }, { status: 404 });
            }
            const session = snap.data() as AIInterviewSession;
            if (session.userId !== userId) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            if (session.status === "in_progress") {
                // Already live (e.g. the join button was double-tapped) — just
                // hand the room back so the client can resume.
                const problem = session.problemId
                    ? await pickInterviewProblemForResume(session)
                    : null;
                return NextResponse.json({ session, problem });
            }
            if (session.status !== "scheduled") {
                return NextResponse.json(
                    { error: "This booking can no longer be started.", code: "not_scheduled" },
                    { status: 409 }
                );
            }

            // Join window: [start − grace, start + window].
            const start = new Date(session.scheduledAt || session.createdAt);
            const opensAt = new Date(start.getTime() - cfg.joinGraceMin * 60_000);
            const closesAt = new Date(start.getTime() + cfg.joinWindowMin * 60_000);
            if (now < opensAt) {
                return NextResponse.json(
                    {
                        error: `Your interview starts at ${start.toLocaleString()}. You can join a few minutes before.`,
                        code: "too_early",
                        scheduledAt: session.scheduledAt,
                    },
                    { status: 425 }
                );
            }
            if (now > closesAt) {
                // Missed the window — expire it (reaper will also catch this).
                await ref.set(
                    { status: "expired", expiresAt: null, updatedAt: nowIso },
                    { merge: true }
                );
                await releaseSlot(session.slotId);
                return NextResponse.json(
                    { error: "This booking's join window has passed.", code: "expired" },
                    { status: 410 }
                );
            }

            if (!providerLive) {
                return NextResponse.json(
                    { error: "AI interviews are temporarily unavailable. Try again shortly." },
                    { status: 503 }
                );
            }

            // Pick the grounding problem now (coding types). We intentionally
            // don't lock a problem at booking time — content may change over the
            // 72h horizon, and free vs paid eligibility is evaluated at begin.
            const isCoding =
                session.interviewType === "dsa" || session.interviewType === "sql";
            let problem: Awaited<ReturnType<typeof pickInterviewProblem>> = null;
            if (isCoding) {
                problem = await pickInterviewProblem(session.config, { allowPremium: ent.isPaid });
                if (!problem) {
                    return NextResponse.json(
                        {
                            error: "No interview problem is available right now. Please try again in a moment.",
                            code: "no_problem",
                        },
                        { status: 503 }
                    );
                }
            }

            const opening = composeInterviewOpening(session.interviewType, session.config, problem);
            const updated: AIInterviewSession = {
                ...session,
                status: "in_progress",
                problemId: opening.problemId,
                problemSlug: opening.problemSlug,
                problemTitle: opening.problemTitle,
                primaryPattern: opening.primaryPattern,
                difficulty: opening.difficulty,
                language: opening.language,
                transcript: opening.transcript,
                latestCode: opening.latestCode,
                codingUnlocked: false,
                startedAt: nowIso,
                expiresAt: new Date(now.getTime() + cfg.maxRuntimeMin * 60_000).toISOString(),
                updatedAt: nowIso,
            };
            await ref.set(updated);
            const publicProblem = problem ? serializeProblemPublic(problem.id, problem) : null;
            return NextResponse.json({ session: updated, problem: publicProblem });
        }

        // ─────────────────────────────────────────────────────────────────
        // MODE B — instant start (adaptive: book the current slot).
        // ─────────────────────────────────────────────────────────────────

        // One active interview at a time (any type). Blocks a second interview
        // — including the same category — while one is scheduled or live.
        const active = await getActiveSession(userId);
        if (active) {
            const live = active.status === "in_progress";
            return NextResponse.json(
                {
                    error: live
                        ? "You already have an interview in progress. Finish or leave it before starting another."
                        : "You already have an interview scheduled. Cancel it or join it before starting another.",
                    code: live ? "interview_in_progress" : "interview_scheduled",
                    activeSessionId: active.id,
                    activeStatus: active.status,
                },
                { status: 409 }
            );
        }

        if (!providerLive) {
            return NextResponse.json(
                { error: "AI interviews are temporarily unavailable. Try again later." },
                { status: 503 }
            );
        }

        const { interviewType, config } = parseInterviewConfig(body);
        const isCoding = interviewType === "dsa" || interviewType === "sql";
        let problem: Awaited<ReturnType<typeof pickInterviewProblem>> = null;
        if (isCoding) {
            problem = await pickInterviewProblem(config, { allowPremium: ent.isPaid });
            if (!problem) {
                const kindLabel = interviewType === "sql" ? "SQL" : "coding";
                if (!ent.isPaid) {
                    return NextResponse.json(
                        {
                            error: `No free ${kindLabel} interview problems are available right now. Upgrade to unlock the full problem library.`,
                            code: "premium_required",
                            upgradeUrl: "/membership",
                        },
                        { status: 402 }
                    );
                }
                return NextResponse.json(
                    { error: `No ${kindLabel} interview problems are available yet. Please try again later.` },
                    { status: 404 }
                );
            }
        }

        // Global concurrency backstop — protects the providers even when the
        // current slot still shows capacity (e.g. long-runners overlapping from
        // the previous slot). Point the user at the next bookable slot.
        const liveCount = await countActiveGlobal();
        if (liveCount >= cfg.maxConcurrentGlobal) {
            return NextResponse.json(
                {
                    error: "All interview slots are busy right now. Please schedule one for a little later.",
                    code: "capacity_full",
                    nextSlot: await nextOpenSlot(now, cfg),
                },
                { status: 503 }
            );
        }

        // Reserve a unit of the CURRENT slot (adaptive instant start).
        const slot = currentSlot(now, cfg);
        const reserved = await reserveSlot(slot, cfg);
        if (!reserved) {
            return NextResponse.json(
                {
                    error: "This time window is fully booked. Please schedule an interview for a little later.",
                    code: "slot_full",
                    nextSlot: await nextOpenSlot(now, cfg),
                },
                { status: 409 }
            );
        }

        // Weekly quota — consumed only once capacity is secured. Release the
        // slot we just reserved if the user is out of allowance (or the consume
        // itself errors) so a failed start never leaks a slot unit.
        let quota;
        try {
            quota = await checkQuota(userId, AI_INTERVIEW_QUOTA, { consume: true });
        } catch (err) {
            await releaseSlot(slot.slotKey);
            throw err;
        }
        if (!quota.allowed) {
            await releaseSlot(slot.slotKey);
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

        const opening = composeInterviewOpening(interviewType, config, problem);
        const id = crypto.randomUUID();
        const session: AIInterviewSession = {
            id,
            userId,
            status: "in_progress",
            interviewType,
            config,
            problemId: opening.problemId,
            problemSlug: opening.problemSlug,
            problemTitle: opening.problemTitle,
            primaryPattern: opening.primaryPattern,
            difficulty: opening.difficulty,
            language: opening.language,
            transcript: opening.transcript,
            latestCode: opening.latestCode,
            codingUnlocked: false,
            scorecard: null,
            slotId: slot.slotKey,
            scheduledAt: null,
            expiresAt: new Date(now.getTime() + cfg.maxRuntimeMin * 60_000).toISOString(),
            startedAt: nowIso,
            completedAt: null,
            createdAt: nowIso,
            updatedAt: nowIso,
        };
        try {
            await adminDb.collection(AI_INTERVIEW_SESSIONS).doc(id).set(session);
        } catch (err) {
            // Couldn't persist after reserving + charging — undo both.
            await releaseSlot(slot.slotKey);
            await refundQuota(userId, AI_INTERVIEW_QUOTA, now);
            throw err;
        }
        const publicProblem = problem ? serializeProblemPublic(problem.id, problem) : null;
        return NextResponse.json({ session, problem: publicProblem });
    } catch (error) {
        const e = error as Error;
        console.error("[/api/ai-interview/start] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to start interview" },
            { status: 500 }
        );
    }
}

/** Re-serialize the grounding problem for a session being resumed mid-flight. */
async function pickInterviewProblemForResume(session: AIInterviewSession) {
    const { loadProblemById } = await import("@/lib/server/practice");
    const p = await loadProblemById(session.problemId);
    return p ? serializeProblemPublic(p.id, p) : null;
}
