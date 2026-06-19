/**
 * Virtual Lab — a gamified live lab session that runs inside a class.
 *
 * A lab session is a real-time room where a teacher and their students
 * meet to do hands-on work. It renders a *live map* of student + teacher
 * avatars (seat-gridded), each with a status (on-task / stuck / sharing /
 * watching), and supports several flavours of low-latency media on top:
 *   - the teacher's live broadcast (their cam / screen to the whole room),
 *   - student → teacher screen share (a learner shows their work),
 *   - student ↔ student peer share (pair-programming / "look at mine"),
 *   - optional recording of the whole session for later replay.
 *
 * THREE PLANES (see docs/VIRTUAL_LAB.md for the full RFC):
 *   - Media   — LiveKit Cloud SFU. We never relay A/V ourselves; LiveKit
 *               carries cam/mic/screen tracks + a data channel. Creds come
 *               from env only (LIVEKIT_API_KEY / _SECRET / _URL, and
 *               NEXT_PUBLIC_LIVEKIT_URL for the browser).
 *   - Control — Next.js `/api` routes (admin SDK + Bearer token) mint
 *               LiveKit access tokens, open/close sessions, and persist the
 *               authoritative roster + audit trail to Firestore.
 *   - Agent   — an installable Electron desktop agent that handles
 *               full-screen capture and *remote control* (teacher drives a
 *               student's machine), which the browser sandbox can't do.
 *
 * Firestore (all server-only — admin SDK via `/api` routes; explicit-deny
 * in firestore.rules, no client reads/writes):
 *   labSessions/{sessionId}                       — the session document
 *   labSessions/{sessionId}/participants/{uid}    — authoritative roster row
 *   labSessions/{sessionId}/events/{autoId}       — append-only audit log
 *   labRecordings/{recordingId}                   — one row per recording
 *
 * The *live* map state is driven over LiveKit (participant metadata + data
 * messages) for latency; those signals are mirrored into the `events`
 * subcollection so we keep a durable audit trail + post-hoc analytics
 * without every cursor wiggle hitting Firestore. The `participants` rows are
 * the source of truth for "who is/was here" (joinedAt/leftAt, final status).
 *
 * Dates: documents written via the admin SDK use Firestore `Date`; the
 * fast-moving wire fields that travel over the LiveKit data channel
 * (`handRaisedAt`, `LabEvent.ts`) are epoch millis (`number`) so they
 * serialize cleanly through JSON without a Timestamp dance.
 */

// ─────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────

/**
 * Lifecycle of a lab session.
 *   scheduled — created, room reserved, not yet opened (no infra consumed).
 *   live      — open and joinable; the LiveKit room is active.
 *   ended     — closed; the room is torn down, recording (if any) finalising.
 *
 * NB: this is the SESSION lifecycle. The per-participant *activity* state
 * (on-task / stuck / sharing …) is `LabStatus` below — the contract reserves
 * that name for the live-map status, so the session field is just this inline
 * union typed via `LabSessionStatus`.
 */
export type LabSessionStatus = "scheduled" | "live" | "ended";

/**
 * Per-session toggles the teacher sets at create / open time. Kept small and
 * boolean so they can be flipped from the live control panel mid-session.
 */
export interface LabSessionSettings {
    /** Allow student ↔ student peer screen share (off = teacher-routed only). */
    allowPeerShare: boolean;
    /** Allow the in-room text/data chat. */
    allowChat: boolean;
    /** Begin recording automatically the moment the session goes `live`. */
    autoRecord: boolean;
}

/** Denormalized running counters kept on the session for list/replay views. */
export interface LabSessionStats {
    /** High-water mark of concurrent participants — drives capacity reporting. */
    peakParticipants: number;
}

export interface LabSession {
    id: string;
    /** Class this lab belongs to (`classes/{classId}`). */
    classId: string;
    /** Owning teacher uid — the only `roomAdmin` (plus platform admins). */
    teacherId: string;
    title: string;
    status: LabSessionStatus;
    /** LiveKit room name. Stable for the session's life; the token is scoped to it. */
    livekitRoom: string;
    /** When the session went `live` (null while still `scheduled`). */
    startedAt: Date;
    /** When it transitioned to `ended`. */
    endedAt?: Date;
    /** Set once a recording exists for this session (`labRecordings/{id}`). */
    recordingId?: string;
    settings: LabSessionSettings;
    stats: LabSessionStats;
}

// ─────────────────────────────────────────────────────────────────────
// Participants + live status
// ─────────────────────────────────────────────────────────────────────

/**
 * A participant's capability tier within a session. Maps directly onto the
 * LiveKit grant minted for them (see docs/VIRTUAL_LAB.md → permission model):
 *   teacher  — roomAdmin; publish + subscribe + data; can spotlight, record,
 *              and request remote control.
 *   student  — publish own cam + screen, subscribe, data; can raise a hand
 *              and share to the teacher (or peers when allowPeerShare).
 *   observer — subscribe + (optionally) data only; cannot publish media.
 *              Used for late joiners, auditors, or a TA watching silently.
 */
export type LabRole = "teacher" | "student" | "observer";

/**
 * What a participant is doing right now — the colour/badge of their avatar on
 * the live map. `on_task` / `idle` are self- or heuristically-set; the rest
 * reflect concrete room events (a share opening, the teacher watching, a hand
 * up). This is presence/affordance state, NOT a grade.
 *
 * Named `LabStatus` per the contract (the session lifecycle is
 * `LabSessionStatus`).
 */
export type LabStatus =
    | "on_task"
    | "idle"
    | "needs_help"
    | "sharing"
    | "watching";

export interface LabParticipant {
    uid: string;
    sessionId: string;
    role: LabRole;
    /** Denormalized at join so the map renders without N user reads. */
    displayName: string;
    /**
     * Stable seat index on the live map grid (0-based). Assigned at join and
     * held for the session so an avatar doesn't jump around the room.
     */
    seat: number;
    status: LabStatus;
    /**
     * UIDs this participant is currently sharing their screen to. Empty when
     * not sharing; `[teacherId]` for a student→teacher share; one or more peer
     * uids for peer shares; may be the whole room for the teacher's broadcast.
     */
    sharingTo: string[];
    /**
     * Epoch millis the hand was raised, or null/undefined when down. A number
     * (not a boolean) so the teacher's queue can sort oldest-hand-first.
     */
    handRaisedAt?: number | null;
    joinedAt: Date;
    /** Set when they leave; absent while still present. */
    leftAt?: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Events (audit log + analytics mirror of the live data channel)
// ─────────────────────────────────────────────────────────────────────

/**
 * Every meaningful thing that happens in a session, appended to
 * `labSessions/{id}/events`. Live signals arrive over the LiveKit data
 * channel for latency and are mirrored here for persistence, the consent
 * audit trail, and replay chapter markers.
 *   join / leave            — presence transitions.
 *   share_start / share_end — a screen-share opening/closing (meta: kind, to).
 *   hand_raise / hand_lower — the help queue.
 *   feedback                — a reaction / quick "👍 / 🤔 / stuck" pulse.
 *   control_request         — student/teacher asks for remote control (consent).
 *   control_grant           — the target consented; remote control begins.
 *   control_revoke          — control ended (by either side, or on disconnect).
 *   spotlight               — teacher pinned someone for the whole room.
 *   record_start / record_stop — recording boundaries (also consent-gated).
 */
export type LabEventType =
    | "join"
    | "leave"
    | "share_start"
    | "share_end"
    | "hand_raise"
    | "hand_lower"
    | "feedback"
    | "control_request"
    | "control_grant"
    | "control_revoke"
    | "spotlight"
    | "record_start"
    | "record_stop";

export interface LabEvent {
    id: string;
    sessionId: string;
    type: LabEventType;
    /** UID that performed the action. */
    actorUid: string;
    /** UID the action was aimed at (e.g. share target, control subject). */
    targetUid?: string;
    /** Epoch millis — set client-side on emit, trusted-stamped on persist. */
    ts: number;
    /** Free-form payload (share `kind`, reaction emoji, control session id…). */
    meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────
// Recording / replay
// ─────────────────────────────────────────────────────────────────────

/** Processing state of a session recording (mirrors the egress lifecycle). */
export type LabRecordingStatus = "processing" | "ready" | "failed";

/** A chapter marker on the replay timeline (derived from `LabEvent`s). */
export interface LabRecordingChapter {
    /** Seconds from the start of the recording. */
    tsSec: number;
    title: string;
}

export interface LabRecording {
    id: string;
    sessionId: string;
    /** Denormalized for class-scoped "recordings" lists without a session read. */
    classId: string;
    /** Object-storage path of the rendered file (e.g. GCS/Firebase Storage). */
    storagePath: string;
    /** Signed/public playback URL once `ready`; absent while processing. */
    url?: string;
    durationSec: number;
    status: LabRecordingStatus;
    /** Timeline markers (joins, shares, spotlights) for replay navigation. */
    chapters: LabRecordingChapter[];
    /** Optional transcript/captions track (WebVTT) when generated. */
    captionsUrl?: string;
    createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────
// Live room state (client-facing snapshot)
// ─────────────────────────────────────────────────────────────────────

/**
 * A directed media link between two participants — what the live map draws as
 * a line/arrow between avatars.
 *   peer      — student ↔ student share.
 *   view      — student → teacher share (teacher is watching a learner).
 *   broadcast — teacher → room (the one-to-many live broadcast).
 */
export interface LabConnection {
    fromUid: string;
    toUid: string;
    kind: "peer" | "view" | "broadcast";
}

/**
 * The denormalized snapshot the client renders the room from — assembled from
 * the participant roster + active connections + session flags, with `you`
 * telling the client which avatar is the local user and what it may do.
 */
export interface LabRoomState {
    sessionId: string;
    participants: LabParticipant[];
    connections: LabConnection[];
    /** The teacher's live broadcast is currently on. */
    broadcasting: boolean;
    /** A recording is currently in progress. */
    recording: boolean;
    /**
     * The participant the teacher has spotlit for the whole room (every client
     * foregrounds + subscribes to their screen), or null/undefined when nothing
     * is pinned. Teacher-set; mirrored to every client off the teacher's
     * presence metadata + a `spotlight` data pulse.
     */
    spotlightUid?: string | null;
    you: { uid: string; role: LabRole };
}

// ─────────────────────────────────────────────────────────────────────
// Token exchange (client → control plane → LiveKit)
// ─────────────────────────────────────────────────────────────────────

/** Client asks the control plane to mint a LiveKit token for a session. */
export interface LabTokenRequest {
    sessionId: string;
}

/**
 * The minted LiveKit access token + everything the client needs to connect.
 * The token's grants are derived server-side from the caller's resolved
 * `role` (never trusted from the client) — see the permission model in
 * docs/VIRTUAL_LAB.md.
 */
export interface LabTokenResponse {
    token: string;
    /** LiveKit ws URL to connect to (mirrors NEXT_PUBLIC_LIVEKIT_URL). */
    url: string;
    role: LabRole;
    /** LiveKit participant identity (we use the Firebase uid). */
    identity: string;
    room: string;
}

// ─────────────────────────────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────────────────────────────

/** Guard rails shared by the API + UI. Tune here, not at call sites. */
export const LAB_LIMITS = {
    titleMaxLength: 120,
    /** Hard ceiling on participants per room (matches LiveKit room capacity plan). */
    maxParticipants: 60,
    /** Concurrent student→peer shares the teacher allows on the map at once. */
    maxConcurrentShares: 12,
} as const;

// ─────────────────────────────────────────────────────────────────────
// Analytics + gamification (COMPUTED ON READ from the audit log)
// ─────────────────────────────────────────────────────────────────────
//
// Everything below is *derived* — there is NO new Firestore collection,
// write, or security rule for it. The `/api/lab/analytics`,
// `/api/lab/sessions/{id}/analytics`, and `/api/lab/gamification` routes
// fold the existing `labSessions/{id}/events` audit log (+ the
// `participants` roster as the authoritative who-was-here / joinedAt-leftAt
// source) into these shapes on each request, using the admin SDK behind the
// same class-membership gate as the rest of the control plane.
//
// What the audit log ACTUALLY carries (mirrored from the live data channel
// by POST /api/lab/events) — the only signals these stats may rely on:
//   join / leave                          → presence spans (time in lab)
//   hand_raise / hand_lower               → hands raised + needs-help spans
//   share_start  meta:{ kind:"view"|"peer"|"broadcast", targets?:string[] }
//   share_end    meta:{ kind?, targets? }
//   feedback     meta:{ action:"view_screen" }, targetUid (a "look at theirs")
//   spotlight    targetUid = the spotlit uid (null/absent = cleared)
//   control_request / control_grant / control_revoke
//   record_start / record_stop
// NB: per-participant on_task/idle/needs_help STATUS changes travel over
// LiveKit only and are NOT mirrored to events — so `onTaskMs` is DERIVED
// (in-lab time minus hand-raised "needs help" spans), not read directly, and
// `needsHelpCount` is the count of `hand_raise` events.

/**
 * One student's rolled-up activity. Used as a row inside both a single
 * session's analytics (per that session) and, when summed across a class's
 * sessions, as the basis for that student's gamification totals.
 *
 * All counters are non-negative integers except the `*Ms` durations (epoch
 * millis of elapsed time). `name` is the denormalised display name from the
 * participant roster (falls back to a short uid when unknown).
 */
export interface LabStudentStats {
    uid: string;
    name: string;
    /** Distinct sessions this student joined (≥1 join event / roster row). */
    attendedSessions: number;
    /** Total presence time across counted sessions, from join↔leave spans. */
    timeInLabMs: number;
    /** Count of `hand_raise` events. */
    handsRaised: number;
    /** `share_start` events whose target set includes the session's teacher
     *  (meta.kind === "view"), i.e. the student showed work to the teacher. */
    sharesToTeacher: number;
    /** `share_start` events with meta.kind === "peer" (gave a peer a look). */
    peerSharesGiven: number;
    /** Times this student was the `targetUid` of a non-clearing `spotlight`. */
    spotlights: number;
    /** DERIVED on-task time: timeInLabMs minus hand-raised ("needs help")
     *  spans. Never read from a status event (those aren't persisted). */
    onTaskMs: number;
    /** Count of `hand_raise` events (the help queue). Mirrors handsRaised but
     *  kept distinct so the meaning ("asked for help N times") is explicit. */
    needsHelpCount: number;
}

/**
 * Analytics for a SINGLE lab session — the teacher's "Lab insights" detail for
 * one session, folded from that session's events + participant roster.
 * `endedAt` is absent while the session is still live (stats are partial then).
 */
export interface LabSessionAnalytics {
    sessionId: string;
    classId: string;
    title: string;
    /** ISO date the session went live (mirrors the session `startedAt`). */
    startedAt: string | null;
    /** ISO date it ended; absent/null while still live. */
    endedAt?: string | null;
    /** Distinct students who joined (excludes the teacher). */
    participantCount: number;
    /** High-water mark of concurrent participants (session.stats fallback). */
    peakParticipants: number;
    /** Mean of every counted student's `timeInLabMs`. */
    avgTimeInLabMs: number;
    /** Total `hand_raise` events across all students. */
    totalHands: number;
    /** Total `share_start` events (view + peer + broadcast) across the room. */
    totalShares: number;
    /** Per-student breakdown rows (students only), highest engagement first. */
    students: LabStudentStats[];
}

/** A badge a student may have earned, keyed by a stable `LabBadgeKey`. */
export interface LabBadge {
    key: LabBadgeKey;
    /** Human label for the chip (server-supplied so the UI stays dumb). */
    label: string;
    /** ISO date first earned; absent when not yet earned (locked chip). */
    earnedAt?: string | null;
}

/**
 * A student's class-scoped gamification profile, summed across that class's
 * lab sessions. `rank` is the student's 1-based position on the class
 * leaderboard (present when the route computed the board too).
 */
export interface LabGamification {
    uid: string;
    name: string;
    totalXp: number;
    level: number;
    /** Consecutive distinct calendar days the student attended a lab here. */
    streakDays: number;
    /** Every defined badge, each with `earnedAt` set iff earned (so the UI can
     *  render locked + unlocked together). */
    badges: LabBadge[];
    rank?: number;
}

/**
 * One row of the class lab leaderboard: students ranked by `totalXp`. The full
 * board is visible to the teacher and (rank + identity only) to students; a
 * student's *detailed* breakdown is their own `LabGamification` only.
 */
export interface LabLeaderboardRow {
    uid: string;
    name: string;
    totalXp: number;
    level: number;
    /** 1-based; ties share a rank (standard competition ranking). */
    rank: number;
}

// ── XP / level / streak rules (shared by server compute + any UI hints) ──

/**
 * XP award table. The ONLY place XP amounts live — the gamification route reads
 * these so the values can be tuned in one spot. Per-session caps guard the
 * farmable signals (hands, peer shares, spotlight) so a student can't grind one
 * action; the cap is applied PER SESSION before summing across the class.
 */
export const LAB_XP = {
    /** Joining (attending) a live lab — once per session. */
    joinSession: 10,
    /** Per full 10 minutes of on-task time, per session. */
    onTaskPer10Min: 5,
    /** Per hand raised (engagement), capped per session. */
    raiseHand: 5,
    /** Per screen-share shown to the teacher (kind "view"), capped per session. */
    shareToTeacher: 15,
    /** Per peer share given (kind "peer"), capped per session. */
    peerShare: 10,
    /** Per time spotlighted by the teacher, capped per session. */
    spotlighted: 20,
    /** Per-session anti-farm ceilings (count of award-events that earn XP). */
    perSessionCaps: {
        raiseHand: 5,
        shareToTeacher: 3,
        peerShare: 3,
        spotlighted: 2,
        /** Cap on the number of 10-min on-task blocks rewarded per session. */
        onTaskBlocks: 12,
    },
} as const;

/**
 * Level from cumulative XP: `level = floor(sqrt(totalXp / 50)) + 1`.
 * Bands (XP needed to reach each): L1 0 · L2 50 · L3 200 · L4 450 · L5 800 …
 * Centralised so the route and any client hint agree exactly.
 */
export function labLevelForXp(totalXp: number): number {
    const xp = Number.isFinite(totalXp) && totalXp > 0 ? totalXp : 0;
    return Math.floor(Math.sqrt(xp / 50)) + 1;
}

/** The XP threshold at which a given (1-based) level begins. Inverse of
 *  {@link labLevelForXp}: `xp = 50 * (level - 1)^2`. */
export function labXpForLevel(level: number): number {
    const l = Number.isFinite(level) && level > 1 ? Math.floor(level) : 1;
    return 50 * (l - 1) * (l - 1);
}

// ── Badges ──

/** Stable badge identifiers (the persisted/wire key — never the label). */
export type LabBadgeKey =
    | "first_lab"
    | "regular"
    | "curious"
    | "presenter"
    | "helper"
    | "spotlighted"
    | "marathoner"
    | "perfect_week";

/**
 * Badge catalogue: stable key → label + the threshold that earns it, evaluated
 * against a student's class-summed stats / streak. The gamification route walks
 * this list so adding a badge is a one-line change here.
 *   first_lab    — attended ≥1 lab.
 *   regular      — attended ≥5 labs.
 *   curious      — raised a hand ≥10 times (across labs).
 *   presenter    — shared to the teacher ≥3 times.
 *   helper       — gave ≥3 peer shares.
 *   spotlighted  — featured ≥1 time.
 *   marathoner   — ≥60 min in a SINGLE lab.
 *   perfect_week — a 5-day attendance streak.
 */
export interface LabBadgeDef {
    key: LabBadgeKey;
    label: string;
    /** Short reason shown under the chip in the UI. */
    description: string;
}

export const LAB_BADGES: readonly LabBadgeDef[] = [
    { key: "first_lab", label: "First Lab", description: "Attended your first lab" },
    { key: "regular", label: "Regular", description: "Attended 5 labs" },
    { key: "curious", label: "Curious", description: "Raised your hand 10 times" },
    { key: "presenter", label: "Presenter", description: "Shared to the teacher 3 times" },
    { key: "helper", label: "Helper", description: "Gave 3 peer shares" },
    { key: "spotlighted", label: "Spotlighted", description: "Got featured by the teacher" },
    { key: "marathoner", label: "Marathoner", description: "Spent 60+ minutes in one lab" },
    { key: "perfect_week", label: "Perfect Week", description: "Hit a 5-day attendance streak" },
] as const;

/** Thresholds the badge evaluator compares against (tune here). */
export const LAB_BADGE_THRESHOLDS = {
    regularSessions: 5,
    curiousHands: 10,
    presenterShares: 3,
    helperPeerShares: 3,
    /** Single-session presence (ms) that earns Marathoner. */
    marathonerMs: 60 * 60 * 1000,
    perfectWeekStreak: 5,
} as const;

// ─────────────────────────────────────────────────────────────────────
// Desktop-agent identity
// ─────────────────────────────────────────────────────────────────────

/**
 * A student's desktop AGENT joins the LiveKit room as a SEPARATE participant
 * from their browser (LiveKit identities are unique per room, so the agent
 * can't reuse the student's uid). The agent's identity is the student's uid +
 * this suffix, so any client can derive it and tell the two presences apart
 * (the browser = the student's presence; the agent = their controllable desktop).
 */
export const LAB_AGENT_IDENTITY_SUFFIX = "__agent";

/** The LiveKit identity a student's desktop agent joins under. */
export function labAgentIdentity(studentUid: string): string {
    return `${studentUid}${LAB_AGENT_IDENTITY_SUFFIX}`;
}

/** True when a participant identity is a desktop-agent identity (vs a browser). */
export function isLabAgentIdentity(identity: string): boolean {
    return identity.endsWith(LAB_AGENT_IDENTITY_SUFFIX);
}

/** The base student uid behind an agent identity (or the identity unchanged). */
export function labBaseUid(identity: string): string {
    return identity.endsWith(LAB_AGENT_IDENTITY_SUFFIX)
        ? identity.slice(0, -LAB_AGENT_IDENTITY_SUFFIX.length)
        : identity;
}
