import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveClassLabRole } from "@/lib/server/labStore";
import { computeClassGamification } from "@/lib/server/labAnalytics";
import { rateLimit } from "@/lib/server/ratelimit";
import type { LabLeaderboardRow } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/gamification?classId=... — the class lab leaderboard plus, for a
 * student, their OWN gamification breakdown. Folded on-read from the class's
 * session events + rosters (XP/level/streak/badges; no persisted state, no new
 * writes).
 *
 * MEMBER-gated (teacher OR enrolled student) — unlike the teacher-only analytics
 * routes, every class member may see the ranked board. The privacy boundary:
 *   - a STUDENT receives `me` = their OWN detailed `LabGamification` (XP, level,
 *     streak, badges, rank) and the ranked `leaderboard` (rank + display name +
 *     xp + level). They NEVER receive another student's detailed breakdown — we
 *     pass only the caller's uid to the compute fn, which builds `me` for that
 *     uid alone — AND, per the Lane-C review (C2), a student does NOT receive
 *     classmates' raw Firebase `uid`s on the board (those are identities used to
 *     address control messages / patch participant paths, so leaking the full
 *     roster's uids to a peer is an enumeration risk). The student board carries
 *     only `name`/`totalXp`/`level`/`rank`; the caller's OWN row keeps its uid.
 *   - a TEACHER receives `me: null` (they aren't ranked) and the full board WITH
 *     uids (they already own the roster).
 *
 * Returns: { me: LabGamification | null, leaderboard: LabLeaderboardRow[], role }
 */
export async function GET(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json(
                { error: auth.error, code: auth.code },
                { status: auth.status }
            );
        }

        const url = new URL(req.url);
        const classId = (url.searchParams.get("classId") || "").trim();
        if (!classId) {
            return NextResponse.json({ error: "classId is required." }, { status: 400 });
        }

        // Membership gate: any member (teacher or actively-enrolled student).
        const resolved = await resolveClassLabRole(classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        // Throttle: gamification is MEMBER-gated, so any enrolled student can
        // trigger the class-wide fold (up to 200 sessions × roster+events). Cap
        // per caller. Fail-open if Redis is down.
        const rl = await rateLimit("lab-gamification", `${auth.userId}:${classId}`, {
            limit: 20,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                {
                    error: "You're refreshing too fast. Please wait a few seconds and try again.",
                    code: "rate_limited",
                },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        // A student gets their own breakdown as `me`; a teacher passes no uid so
        // `me` is null and they only get the board. This is the privacy boundary:
        // a student can never request another student's detailed stats because we
        // bind `forUid` to the verified caller, never to anything from the query.
        const forUid = resolved.role === "student" ? auth.userId : null;
        const { me, leaderboard } = await computeClassGamification(classId, forUid);

        // C2: scrub classmates' raw uids from a STUDENT's board. The caller keeps
        // their own uid (it's already theirs, in `me`); every other row is
        // stripped to identity-by-name only. A teacher sees the full board.
        const board: LabLeaderboardRow[] =
            resolved.role === "teacher"
                ? leaderboard
                : leaderboard.map((rowItem) =>
                      rowItem.uid === auth.userId
                          ? rowItem
                          : { ...rowItem, uid: "" }
                  );

        return NextResponse.json({ me, leaderboard: board, role: resolved.role });
    } catch (error: any) {
        console.error("Lab gamification failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load lab gamification" },
            { status: 500 }
        );
    }
}
