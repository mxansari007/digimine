/**
 * Virtual Lab — analytics + gamification aggregation (COMPUTED ON READ).
 *
 * The control plane never persists analytics: there is NO new Firestore
 * collection, write, or security rule behind any of this. Every figure here is
 * folded, on each request, from the two durable artefacts a session already
 * leaves behind —
 *
 *   labSessions/{id}/events       — the append-only audit log mirrored from the
 *                                   LiveKit data channel by POST /api/lab/events.
 *   labSessions/{id}/participants — the authoritative roster (who was here,
 *                                   joinedAt / leftAt, final status).
 *
 * The three `/api/lab/*` analytics routes are thin wrappers around the three
 * `compute*` functions below, behind the same admin-SDK + class-membership gate
 * as the rest of the lab control plane.
 *
 * ── What the audit log ACTUALLY carries (the only signals we may trust) ──
 *   join / leave                          → presence spans (time in lab)
 *   hand_raise / hand_lower               → hands raised + "needs help" spans
 *   share_start meta:{ kind:"view"|"peer"|"broadcast", targets?:string[] }
 *   share_end   meta:{ kind?, targets? }
 *   feedback    meta:{ action:"view_screen" }, targetUid (a "look at theirs")
 *   spotlight   targetUid = the spotlit uid (absent/undefined = cleared)
 *   control_request / control_grant / control_revoke
 *   record_start / record_stop
 *
 * CRITICAL: per-participant on_task/idle/needs_help STATUS changes travel over
 * LiveKit ONLY — they are NOT mirrored to events (`setStatus` does not call
 * `postEvent`). So `onTaskMs` is DERIVED (presence time minus hand-raised
 * "needs help" spans) and `needsHelpCount` is the count of `hand_raise` events.
 * Authoritative presence (joinedAt/leftAt) lives on the roster and is the
 * fallback when join/leave events are missing (e.g. an unclean disconnect).
 */

import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import {
    LAB_EVENTS,
    LAB_PARTICIPANTS,
    LAB_SESSIONS,
    getLabSessionById,
    labSessionRef,
} from "@/lib/server/labStore";
import {
    LAB_BADGES,
    LAB_BADGE_THRESHOLDS,
    LAB_XP,
    labLevelForXp,
    type LabBadge,
    type LabBadgeKey,
    type LabGamification,
    type LabLeaderboardRow,
    type LabSessionAnalytics,
    type LabStudentStats,
} from "@digimine/types";

// ─────────────────────────────────────────────────────────────────────
// Small time helpers
// ─────────────────────────────────────────────────────────────────────

const TEN_MIN_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Coerce any Firestore/ISO/epoch date-ish value to epoch millis, or null. */
function toMillis(value: any): number | null {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value?.toMillis === "function") {
        const m = value.toMillis();
        return Number.isFinite(m) ? m : null;
    }
    if (typeof value?.toDate === "function") {
        const t = value.toDate().getTime();
        return Number.isFinite(t) ? t : null;
    }
    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isFinite(t) ? t : null;
    }
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    if (typeof value === "string") {
        const t = new Date(value).getTime();
        return Number.isFinite(t) ? t : null;
    }
    return null;
}

/** A half-open presence/activity interval in epoch millis ([start, end)). */
interface Interval {
    start: number;
    end: number;
}

/** Sum of a set of intervals after merging overlaps (so double-joins, or a
 *  hand-raised span that straddles two presence spans, never double-count). */
function mergedDurationMs(intervals: Interval[]): number {
    const valid = intervals
        .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
        .sort((a, b) => a.start - b.start);
    if (valid.length === 0) return 0;
    let total = 0;
    let curStart = valid[0].start;
    let curEnd = valid[0].end;
    for (let i = 1; i < valid.length; i++) {
        const iv = valid[i];
        if (iv.start <= curEnd) {
            if (iv.end > curEnd) curEnd = iv.end;
        } else {
            total += curEnd - curStart;
            curStart = iv.start;
            curEnd = iv.end;
        }
    }
    total += curEnd - curStart;
    return total;
}

/** Intersection of one interval with a [lo, hi) clamp window, or null. */
function clampInterval(iv: Interval, lo: number, hi: number): Interval | null {
    const start = Math.max(iv.start, lo);
    const end = Math.min(iv.end, hi);
    return end > start ? { start, end } : null;
}

/** Calendar-day key (UTC) for a timestamp, used for the attendance streak. */
function dayKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─────────────────────────────────────────────────────────────────────
// Per-session, per-student fold
// ─────────────────────────────────────────────────────────────────────

/**
 * The raw, UNCAPPED per-student tallies for ONE session, plus the side-channel
 * the gamification layer needs (the day this student attended, and the single
 * longest presence in this one session for the Marathoner badge). The session
 * analytics shape (`LabStudentStats`) is the capped/public projection of this.
 */
interface SessionStudentFold {
    uid: string;
    name: string;
    attended: boolean;
    timeInLabMs: number;
    onTaskMs: number;
    handsRaised: number;
    sharesToTeacher: number;
    peerSharesGiven: number;
    spotlights: number;
    /** Day (YYYY-MM-DD) this student attended, for the streak. Null if unknown. */
    attendedDay: string | null;
}

/** Everything one session yields: the session's own row + per-student folds. */
interface SessionFold {
    analytics: LabSessionAnalytics;
    /** Per-student raw tallies for THIS session, keyed by uid (students only). */
    students: Map<string, SessionStudentFold>;
}

interface RosterRow {
    uid: string;
    role: string;
    name: string;
    joinedAtMs: number | null;
    leftAtMs: number | null;
}

interface EventRow {
    type: string;
    actorUid: string;
    targetUid: string | null;
    ts: number;
    meta: Record<string, unknown> | null;
}

/**
 * Read a session's roster + events and fold them into the per-session shape.
 * `sessionDoc` is the already-loaded session document (id + data).
 *
 * Presence model: a student's time-in-lab is the merged duration of their
 * join↔leave spans, clamped to the session window. When join/leave events are
 * missing (unclean disconnect, or pre-existing data), we fall back to the
 * roster's joinedAt/leftAt span. on-task time is that presence minus the
 * intersected hand-raised ("needs help") spans.
 */
async function foldSession(sessionDoc: any): Promise<SessionFold> {
    const sessionId: string = sessionDoc.id;
    const classId: string = sessionDoc.classId;
    const title: string = sessionDoc.title || "Lab session";
    const teacherId: string = sessionDoc.teacherId || "";

    const startedAtMs = toMillis(sessionDoc.startedAt);
    const endedAtMs = toMillis(sessionDoc.endedAt);
    const isLive = sessionDoc.status === "live" || endedAtMs == null;
    // The clamp window for presence: from session start (or 0 if somehow unset)
    // to session end (or "now" while still live, so an open span has a bound).
    const windowLo = startedAtMs ?? 0;
    const windowHi = endedAtMs ?? Date.now();

    // ── Roster (authoritative who-was-here + presence fallback) ──
    const partSnap = await labSessionRef(sessionId).collection(LAB_PARTICIPANTS).get();
    const roster = new Map<string, RosterRow>();
    partSnap.docs.forEach((d) => {
        const data = d.data() || {};
        const uid = d.id || data.uid;
        if (!uid) return;
        roster.set(uid, {
            uid,
            role: data.role || "student",
            name: typeof data.displayName === "string" && data.displayName ? data.displayName : "",
            joinedAtMs: toMillis(data.joinedAt),
            leftAtMs: toMillis(data.leftAt),
        });
    });

    // ── Events (presence spans + engagement signals) ──
    // Safety cap: one event-spammed session must not OOM/slow the on-read fold
    // that runs on every analytics/gamification/export call. Normal sessions are
    // far under this; the events route is rate-limited so this is only a backstop.
    const evSnap = await labSessionRef(sessionId).collection(LAB_EVENTS).limit(5000).get();
    const events: EventRow[] = evSnap.docs
        .map((d) => {
            const data = d.data() || {};
            const ts = toMillis(data.ts) ?? toMillis(data.createdAt) ?? 0;
            return {
                type: typeof data.type === "string" ? data.type : "",
                actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
                targetUid: typeof data.targetUid === "string" ? data.targetUid : null,
                ts,
                meta:
                    data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
                        ? (data.meta as Record<string, unknown>)
                        : null,
            };
        })
        // Chronological so join/leave + hand_raise/hand_lower pair correctly.
        .sort((a, b) => a.ts - b.ts);

    // Per-uid event buckets, so each student's spans pair within their own stream.
    const byActor = new Map<string, EventRow[]>();
    for (const ev of events) {
        if (!ev.actorUid) continue;
        const arr = byActor.get(ev.actorUid);
        if (arr) arr.push(ev);
        else byActor.set(ev.actorUid, [ev]);
    }

    // The set of uids we know about = roster ∪ event actors ∪ spotlight targets.
    // (A spotlight targets a student who may, in pathological data, lack a row.)
    const allUids = new Set<string>([...roster.keys(), ...byActor.keys()]);
    for (const ev of events) {
        if (ev.type === "spotlight" && ev.targetUid) allUids.add(ev.targetUid);
    }

    // Who is the teacher? Prefer the session's own teacherId; also treat any
    // roster row whose role === "teacher" as a teacher (defensive). Students are
    // everyone else — the analytics rows + leaderboard are students-only.
    const teacherUids = new Set<string>();
    if (teacherId) teacherUids.add(teacherId);
    roster.forEach((r) => {
        if (r.role === "teacher") teacherUids.add(r.uid);
    });

    const students = new Map<string, SessionStudentFold>();
    let peakFromEvents = 0;

    // Pre-compute a presence-interval list per uid from join/leave events. We
    // pair each `join` with the next `leave`; a dangling `join` is clamped to
    // the window end (windowHi). This is used both for the live concurrency
    // high-water mark and for each student's own time-in-lab.
    const presenceByUid = new Map<string, Interval[]>();
    for (const [uid, evs] of byActor) {
        const spans: Interval[] = [];
        let openStart: number | null = null;
        for (const ev of evs) {
            if (ev.type === "join") {
                // A second join without a leave restarts the clock from the later
                // join (we don't want to count the gap twice); close any open one.
                if (openStart != null) spans.push({ start: openStart, end: ev.ts });
                openStart = ev.ts;
            } else if (ev.type === "leave") {
                if (openStart != null) {
                    spans.push({ start: openStart, end: ev.ts });
                    openStart = null;
                }
            }
        }
        if (openStart != null) spans.push({ start: openStart, end: windowHi });
        if (spans.length > 0) presenceByUid.set(uid, spans);
    }

    // Peak concurrent participants via a sweep over join/leave edges (all uids,
    // teacher included — capacity reporting is about the whole room). Falls back
    // to the stored session high-water mark when there are no presence edges.
    {
        const edges: Array<{ t: number; delta: number }> = [];
        for (const spans of presenceByUid.values()) {
            for (const s of spans) {
                edges.push({ t: s.start, delta: 1 });
                edges.push({ t: s.end, delta: -1 });
            }
        }
        // Process starts before ends at the same instant so a back-to-back
        // join/leave at one timestamp still registers an occupant.
        edges.sort((a, b) => (a.t - b.t) || (b.delta - a.delta));
        let cur = 0;
        for (const e of edges) {
            cur += e.delta;
            if (cur > peakFromEvents) peakFromEvents = cur;
        }
    }

    // Build each student's fold.
    for (const uid of allUids) {
        if (teacherUids.has(uid)) continue; // students-only rows
        const rosterRow = roster.get(uid);
        const evs = byActor.get(uid) || [];

        // ── Presence / time-in-lab ──
        // Prefer event-derived spans; fall back to the roster span when there
        // are no join/leave events for this uid (unclean disconnect / old data).
        let presenceSpans = presenceByUid.get(uid) || [];
        if (presenceSpans.length === 0 && rosterRow?.joinedAtMs != null) {
            presenceSpans = [
                { start: rosterRow.joinedAtMs, end: rosterRow.leftAtMs ?? windowHi },
            ];
        }
        // Clamp every span to the session window before measuring.
        const clamped = presenceSpans
            .map((s) => clampInterval(s, windowLo, windowHi))
            .filter((s): s is Interval => s !== null);
        const timeInLabMs = mergedDurationMs(clamped);

        // Attendance: a join event OR a roster row counts as attended.
        const attended =
            evs.some((e) => e.type === "join") || rosterRow != null || clamped.length > 0;
        if (!attended) continue;

        // ── "Needs help" (hand-raised) spans → subtract from on-task time ──
        // Pair each hand_raise with the next hand_lower in this student's stream;
        // a dangling raise runs to the window end. Intersect with presence so a
        // hand left up after leaving doesn't over-subtract.
        const helpSpans: Interval[] = [];
        let raisedAt: number | null = null;
        for (const ev of evs) {
            if (ev.type === "hand_raise") {
                if (raisedAt == null) raisedAt = ev.ts;
            } else if (ev.type === "hand_lower") {
                if (raisedAt != null) {
                    helpSpans.push({ start: raisedAt, end: ev.ts });
                    raisedAt = null;
                }
            }
        }
        if (raisedAt != null) helpSpans.push({ start: raisedAt, end: windowHi });
        // On-task = presence minus (presence ∩ help). Computed by clamping the
        // help spans into each presence span, then subtracting the merged total.
        const helpWithinPresence: Interval[] = [];
        for (const h of helpSpans) {
            for (const p of clamped) {
                const x = clampInterval(h, p.start, p.end);
                if (x) helpWithinPresence.push(x);
            }
        }
        const helpMs = mergedDurationMs(helpWithinPresence);
        const onTaskMs = Math.max(0, timeInLabMs - helpMs);

        // ── Engagement counters ──
        const handsRaised = evs.filter((e) => e.type === "hand_raise").length;
        let sharesToTeacher = 0;
        let peerSharesGiven = 0;
        for (const ev of evs) {
            if (ev.type !== "share_start") continue;
            const kind = typeof ev.meta?.kind === "string" ? ev.meta.kind : "";
            if (kind === "view") sharesToTeacher++;
            else if (kind === "peer") peerSharesGiven++;
            // kind "broadcast" is the teacher's own; never attributed to a student.
        }
        // Spotlights are counted by TARGET: this student was spotlit. A spotlight
        // event with no targetUid is a "clear" and is ignored.
        const spotlights = events.filter(
            (e) => e.type === "spotlight" && e.targetUid === uid
        ).length;

        // Attendance day for the streak: earliest join event, else roster joinedAt,
        // else the session start. Null only if truly nothing is known.
        const firstJoin = evs.find((e) => e.type === "join")?.ts ?? null;
        const dayMs = firstJoin ?? rosterRow?.joinedAtMs ?? startedAtMs ?? null;
        const attendedDay = dayMs != null ? dayKey(dayMs) : null;

        const name =
            rosterRow?.name ||
            (typeof uid === "string" && uid.length > 6 ? `${uid.slice(0, 6)}…` : uid);

        students.set(uid, {
            uid,
            name,
            attended: true,
            timeInLabMs,
            onTaskMs,
            handsRaised,
            sharesToTeacher,
            peerSharesGiven,
            spotlights,
            attendedDay,
        });
    }

    // ── Session-level roll-ups (students only) ──
    const studentList = [...students.values()];
    const participantCount = studentList.length;
    const totalHands = studentList.reduce((s, x) => s + x.handsRaised, 0);
    // totalShares = every share_start across the room (view + peer + broadcast),
    // including the teacher's broadcasts — it's a room-activity figure.
    const totalShares = events.filter((e) => e.type === "share_start").length;
    const avgTimeInLabMs =
        participantCount > 0
            ? Math.round(studentList.reduce((s, x) => s + x.timeInLabMs, 0) / participantCount)
            : 0;
    // Peak: the live sweep if it saw anyone, else the stored high-water mark.
    const storedPeak =
        typeof sessionDoc.stats?.peakParticipants === "number"
            ? sessionDoc.stats.peakParticipants
            : 0;
    const peakParticipants = Math.max(peakFromEvents, storedPeak);

    // Public per-student rows, highest engagement (on-task time) first.
    const rows: LabStudentStats[] = studentList
        .map((s) => ({
            uid: s.uid,
            name: s.name,
            attendedSessions: 1,
            timeInLabMs: s.timeInLabMs,
            handsRaised: s.handsRaised,
            sharesToTeacher: s.sharesToTeacher,
            peerSharesGiven: s.peerSharesGiven,
            spotlights: s.spotlights,
            onTaskMs: s.onTaskMs,
            needsHelpCount: s.handsRaised,
        }))
        .sort((a, b) => b.onTaskMs - a.onTaskMs || b.timeInLabMs - a.timeInLabMs);

    const analytics: LabSessionAnalytics = {
        sessionId,
        classId,
        title,
        startedAt: toIsoDate(sessionDoc.startedAt),
        endedAt: isLive ? null : toIsoDate(sessionDoc.endedAt),
        participantCount,
        peakParticipants,
        avgTimeInLabMs,
        totalHands,
        totalShares,
        students: rows,
    };

    return { analytics, students };
}

// ─────────────────────────────────────────────────────────────────────
// Public: single-session analytics
// ─────────────────────────────────────────────────────────────────────

/**
 * Fold ONE session's events + roster into `LabSessionAnalytics`. Returns null
 * when the session doesn't exist (so the route can 404). The caller is
 * responsible for the class-membership / teacher gate before invoking this.
 */
export async function computeSessionAnalytics(
    sessionId: string
): Promise<LabSessionAnalytics | null> {
    const session = await getLabSessionById(sessionId);
    if (!session) return null;
    const { analytics } = await foldSession(session);
    return analytics;
}

// ─────────────────────────────────────────────────────────────────────
// Class session enumeration (shared by the roll-up + gamification)
// ─────────────────────────────────────────────────────────────────────

/**
 * Load + fold every session of a class, newest-first by `startedAt`. Folding is
 * fanned out in parallel (each session is an independent two-subcollection
 * read). Capped at a generous bound so a pathological class can't OOM the route.
 */
async function foldClassSessions(classId: string): Promise<SessionFold[]> {
    const snap = await adminDb
        .collection(LAB_SESSIONS)
        .where("classId", "==", classId)
        .orderBy("startedAt", "desc")
        .limit(200)
        .get();
    const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const folds = await Promise.all(sessions.map((s) => foldSession(s)));
    return folds;
}

// ─────────────────────────────────────────────────────────────────────
// Public: class analytics roll-up (teacher)
// ─────────────────────────────────────────────────────────────────────

/**
 * Roll a class's sessions up into the teacher "Lab insights" payload: every
 * session's analytics (newest first) + a per-student total summed across all of
 * the class's sessions. `attendedSessions` counts the distinct sessions each
 * student joined; the `*Ms` + counters are plain sums (these are reporting
 * totals — the anti-farm per-session caps apply to the gamification XP only).
 */
export async function computeClassAnalytics(classId: string): Promise<{
    sessions: LabSessionAnalytics[];
    students: LabStudentStats[];
}> {
    const folds = await foldClassSessions(classId);
    const sessions = folds.map((f) => f.analytics); // already newest-first

    // Sum each student across sessions.
    const totals = new Map<string, LabStudentStats>();
    for (const fold of folds) {
        for (const s of fold.students.values()) {
            const cur = totals.get(s.uid);
            if (!cur) {
                totals.set(s.uid, {
                    uid: s.uid,
                    name: s.name,
                    attendedSessions: 1,
                    timeInLabMs: s.timeInLabMs,
                    handsRaised: s.handsRaised,
                    sharesToTeacher: s.sharesToTeacher,
                    peerSharesGiven: s.peerSharesGiven,
                    spotlights: s.spotlights,
                    onTaskMs: s.onTaskMs,
                    needsHelpCount: s.handsRaised,
                });
            } else {
                cur.attendedSessions += 1;
                cur.timeInLabMs += s.timeInLabMs;
                cur.handsRaised += s.handsRaised;
                cur.sharesToTeacher += s.sharesToTeacher;
                cur.peerSharesGiven += s.peerSharesGiven;
                cur.spotlights += s.spotlights;
                cur.onTaskMs += s.onTaskMs;
                cur.needsHelpCount += s.handsRaised;
                // Keep the most informative name we've seen.
                if (!cur.name && s.name) cur.name = s.name;
            }
        }
    }

    const students = [...totals.values()].sort(
        (a, b) => b.onTaskMs - a.onTaskMs || b.timeInLabMs - a.timeInLabMs
    );
    return { sessions, students };
}

// ─────────────────────────────────────────────────────────────────────
// Gamification — XP / level / streak / badges (class-scoped, on read)
// ─────────────────────────────────────────────────────────────────────

/** The accumulator we build per student while walking the class's sessions. */
interface GamiAccum {
    uid: string;
    name: string;
    /** XP summed across sessions AFTER per-session caps are applied. */
    totalXp: number;
    attendedSessions: number;
    handsRaised: number;
    sharesToTeacher: number;
    peerSharesGiven: number;
    spotlights: number;
    /** Longest single-session presence (ms), for the Marathoner badge. */
    bestSessionMs: number;
    /** Distinct calendar days attended (YYYY-MM-DD), for the streak. */
    days: Set<string>;
}

/**
 * XP earned from ONE session's fold for ONE student, with the per-session
 * anti-farm caps from `LAB_XP.perSessionCaps` applied BEFORE the value is added
 * to the running total — so no single signal can be ground out in one session.
 *
 *   join              +10 (once / session)
 *   on-task           +5 per full 10-min block, capped at onTaskBlocks blocks
 *   hand_raise        +5 each, capped at raiseHand events
 *   share to teacher  +15 each (kind "view"), capped at shareToTeacher events
 *   peer share        +10 each (kind "peer"), capped at peerShare events
 *   spotlighted       +20 each, capped at spotlighted events
 */
function sessionXp(s: SessionStudentFold): number {
    const caps = LAB_XP.perSessionCaps;
    let xp = 0;
    // Attendance.
    xp += LAB_XP.joinSession;
    // On-task: full 10-minute blocks, capped.
    const blocks = Math.min(Math.floor(s.onTaskMs / TEN_MIN_MS), caps.onTaskBlocks);
    xp += blocks * LAB_XP.onTaskPer10Min;
    // Capped engagement signals.
    xp += Math.min(s.handsRaised, caps.raiseHand) * LAB_XP.raiseHand;
    xp += Math.min(s.sharesToTeacher, caps.shareToTeacher) * LAB_XP.shareToTeacher;
    xp += Math.min(s.peerSharesGiven, caps.peerShare) * LAB_XP.peerShare;
    xp += Math.min(s.spotlights, caps.spotlighted) * LAB_XP.spotlighted;
    return xp;
}

/** Longest run of consecutive distinct calendar days in a set of YYYY-MM-DD. */
function longestDayStreak(days: Set<string>): number {
    if (days.size === 0) return 0;
    const sorted = [...days].sort();
    // Work in day-index space so "consecutive" is a +1 step regardless of month.
    const indices = sorted.map((d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS));
    let best = 1;
    let run = 1;
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === indices[i - 1] + 1) {
            run += 1;
            if (run > best) best = run;
        } else if (indices[i] !== indices[i - 1]) {
            run = 1;
        }
    }
    return best;
}

/** Evaluate the full badge catalogue against a student's class-summed accum.
 *  Every badge is returned (locked ones get `earnedAt: null`) so the UI renders
 *  locked + unlocked together. `earnedAt` is best-effort — we don't persist the
 *  earn instant, so an earned badge reports null (the UI shows it unlocked). */
function evaluateBadges(accum: GamiAccum, streakDays: number): LabBadge[] {
    const t = LAB_BADGE_THRESHOLDS;
    const earned: Record<LabBadgeKey, boolean> = {
        first_lab: accum.attendedSessions >= 1,
        regular: accum.attendedSessions >= t.regularSessions,
        curious: accum.handsRaised >= t.curiousHands,
        presenter: accum.sharesToTeacher >= t.presenterShares,
        helper: accum.peerSharesGiven >= t.helperPeerShares,
        spotlighted: accum.spotlights >= 1,
        marathoner: accum.bestSessionMs >= t.marathonerMs,
        perfect_week: streakDays >= t.perfectWeekStreak,
    };
    // Walk the catalogue (display order) so the UI gets a stable, labelled list.
    return LAB_BADGES.map((def) => ({
        key: def.key,
        label: def.label,
        earnedAt: earned[def.key] ? null : undefined,
    }));
}

/**
 * Compute a class's gamification: every student's class-scoped XP/level/streak/
 * badges (summed across the class's sessions with per-session XP caps), and the
 * ranked leaderboard (by totalXp, ties share a rank).
 *
 * `forUid` (optional) is the caller when they're a student — we return their
 * full `LabGamification` as `me` (with their leaderboard `rank` stitched in). A
 * teacher passes no `forUid` and gets `me: null` + the full board. A student
 * MUST only ever receive their OWN detailed breakdown, never a peer's — so the
 * route passes the caller's uid and we never build a `me` for anyone else.
 */
export async function computeClassGamification(
    classId: string,
    forUid?: string | null
): Promise<{ me: LabGamification | null; leaderboard: LabLeaderboardRow[] }> {
    const folds = await foldClassSessions(classId);

    // Accumulate per student across every session (caps applied per session).
    const accums = new Map<string, GamiAccum>();
    for (const fold of folds) {
        for (const s of fold.students.values()) {
            let acc = accums.get(s.uid);
            if (!acc) {
                acc = {
                    uid: s.uid,
                    name: s.name,
                    totalXp: 0,
                    attendedSessions: 0,
                    handsRaised: 0,
                    sharesToTeacher: 0,
                    peerSharesGiven: 0,
                    spotlights: 0,
                    bestSessionMs: 0,
                    days: new Set<string>(),
                };
                accums.set(s.uid, acc);
            }
            acc.totalXp += sessionXp(s);
            acc.attendedSessions += 1;
            acc.handsRaised += s.handsRaised;
            acc.sharesToTeacher += s.sharesToTeacher;
            acc.peerSharesGiven += s.peerSharesGiven;
            acc.spotlights += s.spotlights;
            if (s.timeInLabMs > acc.bestSessionMs) acc.bestSessionMs = s.timeInLabMs;
            if (s.attendedDay) acc.days.add(s.attendedDay);
            if (!acc.name && s.name) acc.name = s.name;
        }
    }

    // Rank by totalXp desc; standard competition ranking (ties share a rank, the
    // next rank skips). Tie-break the *order* by name for a stable board.
    const ranked = [...accums.values()].sort(
        (a, b) => b.totalXp - a.totalXp || a.name.localeCompare(b.name)
    );
    const leaderboard: LabLeaderboardRow[] = [];
    const rankByUid = new Map<string, number>();
    let lastXp: number | null = null;
    let lastRank = 0;
    ranked.forEach((acc, idx) => {
        const rank = lastXp !== null && acc.totalXp === lastXp ? lastRank : idx + 1;
        lastXp = acc.totalXp;
        lastRank = rank;
        rankByUid.set(acc.uid, rank);
        leaderboard.push({
            uid: acc.uid,
            name: acc.name,
            totalXp: acc.totalXp,
            level: labLevelForXp(acc.totalXp),
            rank,
        });
    });

    // The caller's own detailed profile (students only). Absent when the caller
    // is a teacher, or a student who has no lab history in this class yet.
    let me: LabGamification | null = null;
    if (forUid) {
        const acc = accums.get(forUid);
        if (acc) {
            const streakDays = longestDayStreak(acc.days);
            me = {
                uid: acc.uid,
                name: acc.name,
                totalXp: acc.totalXp,
                level: labLevelForXp(acc.totalXp),
                streakDays,
                badges: evaluateBadges(acc, streakDays),
                rank: rankByUid.get(acc.uid),
            };
        }
    }

    return { me, leaderboard };
}
