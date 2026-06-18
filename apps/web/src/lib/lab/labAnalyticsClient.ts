"use client";

/**
 * Virtual Lab — analytics + gamification client fetchers.
 *
 * Companion to `labClient.ts`: same Firebase-Bearer GET dance, same "swallow on
 * the caller's side" contract, but for the *computed-on-read* analytics surface.
 * The teacher "Lab insights" page and the student lab-stats tile read everything
 * through these — they never touch Firestore and trust the server for the role.
 *
 * Each fetcher hits a GET route the control-plane lane implements in parallel:
 *   fetchSessionAnalytics(id)   → GET /api/lab/sessions/{id}/analytics
 *   fetchClassAnalytics(classId)→ GET /api/lab/analytics?classId=...
 *   fetchLabGamification(classId)→ GET /api/lab/gamification?classId=...
 * All three fold the existing `labSessions/{id}/events` audit log (+ the
 * participant roster) into the wire shapes from `@digimine/types`. There are NO
 * new Firestore writes/collections/rules behind them — pure read aggregation
 * behind the usual class-membership gate.
 */

import type { User } from "firebase/auth";
import type {
    LabRole,
    LabSessionAnalytics,
    LabStudentStats,
    LabGamification,
    LabLeaderboardRow,
} from "@digimine/types";

/**
 * Attach the caller's Firebase bearer and GET a lab API route. Returns the
 * parsed JSON body; throws with the server's error message on a non-2xx so
 * callers can decide whether to surface or swallow it. (Same helper shape as
 * `labClient.ts` — kept local so the two fetcher modules stay independent.)
 */
async function labGet<T>(user: User, path: string): Promise<T> {
    const token = await user.getIdToken();
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
        throw new Error((body as { error?: string })?.error || "Lab request failed.");
    }
    return body as T;
}

// ─────────────────────────────────────────────────────────────────────
// Session analytics (teacher: one session's breakdown)
// ─────────────────────────────────────────────────────────────────────

/**
 * The wire shape returned by `GET /api/lab/sessions/{id}/analytics`: the folded
 * `LabSessionAnalytics` for that session plus the caller's resolved `role`
 * (teacher detail view; a student gets the room totals but the route may scope
 * the per-student rows — the caller decides what to render by `role`).
 */
export interface SessionAnalyticsResponse {
    analytics: LabSessionAnalytics;
    role: LabRole;
}

/**
 * Fetch a single session's analytics (membership-gated). Used by the teacher
 * "Lab insights" drill-down for one session. Returns `null` when there's no
 * user/sessionId so a tile can render an empty state without throwing.
 */
export async function fetchSessionAnalytics(
    user: User | null | undefined,
    sessionId: string
): Promise<SessionAnalyticsResponse | null> {
    if (!user || !sessionId) return null;
    return labGet<SessionAnalyticsResponse>(
        user,
        `/api/lab/sessions/${encodeURIComponent(sessionId)}/analytics`
    );
}

// ─────────────────────────────────────────────────────────────────────
// Class analytics (teacher: roll-up across every session)
// ─────────────────────────────────────────────────────────────────────

/**
 * The wire shape returned by `GET /api/lab/analytics?classId=...`: one
 * `LabSessionAnalytics` per session (newest first) plus a class-summed
 * per-student roll-up and the caller's `role`. The teacher "Lab insights" page
 * renders `sessions` as a timeline and `students` as the engagement table.
 */
export interface ClassAnalyticsResponse {
    /** Every analysed session for the class, newest first. */
    sessions: LabSessionAnalytics[];
    /** Per-student totals summed across all of the class's sessions. */
    students: LabStudentStats[];
    role: LabRole;
}

/**
 * Fetch a class's lab analytics roll-up (membership-gated). Returns an empty
 * shape when there's no user/classId so the caller can render an empty state
 * without a try/catch.
 */
export async function fetchClassAnalytics(
    user: User | null | undefined,
    classId: string
): Promise<ClassAnalyticsResponse> {
    if (!user || !classId) {
        return { sessions: [], students: [], role: null as unknown as LabRole };
    }
    const data = await labGet<{
        sessions?: LabSessionAnalytics[];
        students?: LabStudentStats[];
        role?: LabRole;
    }>(user, `/api/lab/analytics?classId=${encodeURIComponent(classId)}`);
    return {
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
        students: Array.isArray(data.students) ? data.students : [],
        role: (data.role ?? null) as LabRole,
    };
}

// ─────────────────────────────────────────────────────────────────────
// Gamification (caller's own stats + the class leaderboard)
// ─────────────────────────────────────────────────────────────────────

/**
 * The wire shape returned by `GET /api/lab/gamification?classId=...`:
 *   - `me`          — the CALLER's own class-scoped gamification profile (XP,
 *                     level, streak, badges, rank). Null for a teacher (the
 *                     teacher isn't ranked) — they read the board instead.
 *   - `leaderboard` — the class students ranked by `totalXp`. The teacher sees
 *                     every row; a student sees the ranked board (rank +
 *                     identity + xp/level) but their *detailed* breakdown is
 *                     `me` only.
 *   - `role`        — the caller's resolved role.
 */
export interface LabGamificationResponse {
    me: LabGamification | null;
    leaderboard: LabLeaderboardRow[];
    role: LabRole;
}

/**
 * Fetch the caller's lab gamification (own stats) + the class leaderboard
 * (membership-gated). Returns an empty shape when there's no user/classId.
 */
export async function fetchLabGamification(
    user: User | null | undefined,
    classId: string
): Promise<LabGamificationResponse> {
    if (!user || !classId) {
        return { me: null, leaderboard: [], role: null as unknown as LabRole };
    }
    const data = await labGet<{
        me?: LabGamification | null;
        leaderboard?: LabLeaderboardRow[];
        role?: LabRole;
    }>(user, `/api/lab/gamification?classId=${encodeURIComponent(classId)}`);
    return {
        me: data.me ?? null,
        leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard : [],
        role: (data.role ?? null) as LabRole,
    };
}

// ─────────────────────────────────────────────────────────────────────
// Evidence export (teacher: download the class participation CSV)
// ─────────────────────────────────────────────────────────────────────

/** Pull a `filename="..."` out of a Content-Disposition header, if present. */
function filenameFromDisposition(header: string | null): string | null {
    if (!header) return null;
    // Handle both `filename="x.csv"` and the RFC5987 `filename*=UTF-8''x.csv`.
    const star = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1].replace(/^"|"$/g, "").trim());
        } catch {
            /* fall through to the plain form */
        }
    }
    const plain = header.match(/filename="?([^";]+)"?/i);
    return plain?.[1]?.trim() || null;
}

/**
 * Download the class's lab participation CSV (NAAC/NBA accreditation evidence)
 * via `GET /api/lab/analytics/export?classId=...` with the caller's Firebase
 * bearer, then trigger a browser save. TEACHER-ONLY on the server (a non-teacher
 * gets 403, surfaced as a thrown Error here).
 *
 * The token is sent as an `Authorization` header (never in the URL), the body is
 * read as a Blob, and an off-DOM `<a download>` click saves it. The filename
 * comes from the server's `Content-Disposition` when present, else a sensible
 * local default. No-ops when there's no user/classId.
 */
export async function downloadClassAnalyticsCsv(
    user: User | null | undefined,
    classId: string,
    fallbackName = "lab-participation"
): Promise<void> {
    if (!user || !classId) return;

    const token = await user.getIdToken();
    const res = await fetch(
        `/api/lab/analytics/export?classId=${encodeURIComponent(classId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
        // Error responses are JSON ({ error }); the CSV success body is text.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error || "Could not export lab evidence.");
    }

    const blob = await res.blob();
    const filename =
        filenameFromDisposition(res.headers.get("Content-Disposition")) ||
        `${fallbackName}-${new Date().toISOString().slice(0, 10)}.csv`;

    const objectUrl = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        // Revoke on the next tick so the click has a chance to start the save.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
}
