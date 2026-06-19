/**
 * Virtual Lab — the WIRE PROTOCOL that rides on top of LiveKit.
 *
 * Two distinct channels carry the live-map signals between participants; this
 * module is the single, typed contract for both so `useLabRoom` (producer) and
 * any other reader stay in lock-step:
 *
 *   1. Participant METADATA  (`LabParticipantMeta`) — a small JSON blob each
 *      participant owns and mutates via `localParticipant.setMetadata(...)`.
 *      LiveKit echoes it to every other client (and fires
 *      `RoomEvent.ParticipantMetadataChanged`), so it's the right home for
 *      *current state* that a late joiner must see immediately on connect:
 *      the participant's seat, their `LabStatus`, who they're sharing to, and
 *      whether their hand is up. Think of it as the per-avatar "presence row".
 *
 *   2. DATA MESSAGES  (`LabDataMsg`) — fire-and-forget packets sent over the
 *      room data channel via `localParticipant.publishData(...)` and received
 *      through `RoomEvent.DataReceived`. These are *transient events*
 *      (a hand toggling, a status pulse, a chat line, a share opening/closing)
 *      that the UI reacts to as they happen. Durable state still lives in the
 *      metadata (above) + the Firestore `events` mirror (POST /api/lab/events);
 *      the data channel is purely for low-latency nudges.
 *
 * Everything serialises as JSON via TextEncoder/TextDecoder — LiveKit's data
 * payloads and metadata are both plain strings/bytes, so we keep it boring and
 * debuggable (you can read a packet in the network tab). Keep the shapes SMALL:
 * metadata is re-broadcast on every change and packets fan out to the room.
 *
 * Typed against @digimine/types so the protocol can't drift from the domain
 * model — `status` is the shared `LabStatus`, share `kind` matches
 * `LabConnection["kind"]` (minus `broadcast`, which is derived from the
 * teacher's screen-share track, not a data message).
 */

import type { LabStatus, LabConnection } from "@digimine/types";

// ─────────────────────────────────────────────────────────────────────
// Wire-safety bounds — every value below is attacker-influenced (it rides
// the client-set metadata / data channel), so each is clamped on decode so a
// hand-rolled/patched peer can't smuggle an oversize or absurd value into
// EVERY other client's UI (memory + render DoS). These are intentionally
// generous (well above any legitimate room) but finite.
// ─────────────────────────────────────────────────────────────────────

/** Hard ceiling on a single chat line's length (rendered into every client). */
export const LAB_MAX_CHAT_LEN = 2000;
/** Hard ceiling on a participant's seat index (the map grid is small). */
export const LAB_MAX_SEAT = 256;
/** Hard ceiling on how many uids one share can target / one row can list. */
export const LAB_MAX_SHARE_TARGETS = 64;
/** Hard ceiling on an identity (uid) string length on the wire. */
export const LAB_MAX_UID_LEN = 256;

/** Keep only well-formed, sanely-sized identity strings, de-duped, capped. */
function sanitizeUidList(arr: unknown): string[] {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of arr) {
        if (typeof x !== "string" || !x || x.length > LAB_MAX_UID_LEN) continue;
        if (seen.has(x)) continue;
        seen.add(x);
        out.push(x);
        if (out.length >= LAB_MAX_SHARE_TARGETS) break;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────
// 0. Server-owned room policy (read off LiveKit room metadata)
// ─────────────────────────────────────────────────────────────────────

/**
 * The policy block the CONTROL PLANE stamps into the LiveKit ROOM metadata at
 * session start (and updates via `updateRoomMetadata` when the teacher toggles
 * a setting). Unlike participant metadata, room metadata is SERVER-OWNED — a
 * client cannot mutate it — so it's the authoritative home for the lab's
 * compliance switches. The hook reads `allowPeerShare`/`allowChat` from here
 * (not from a skippable HTTP fetch) to gate peer-share + chat. `recording` is
 * the legacy control-plane flag the room state already OR'd in.
 *
 * Every field is optional + defaulted permissively (`!== false`) so a room that
 * predates the policy stamp behaves exactly as before; the SERVER grant +
 * server-side moderation remain the hard boundary, this is the read side.
 */
export interface LabRoomPolicy {
    /** Peers may receive a student→peer screen share. Default: allowed. */
    allowPeerShare: boolean;
    /** In-room text chat is enabled. Default: allowed. */
    allowChat: boolean;
    /** A session recording (server egress) is in progress (legacy flag). */
    recording: boolean;
}

/**
 * Parse the LiveKit `room.metadata` string into a {@link LabRoomPolicy}. The
 * server writes `{ policy: { allowPeerShare, allowChat }, recording? }`; we read
 * `policy.*` first and fall back to a top-level field (older shape) then to the
 * permissive default. Tolerant of absent/garbage metadata — a room with no
 * metadata yields the fully-permissive policy so nothing a teacher enabled is
 * silently blocked by a parse miss.
 */
export function parseRoomPolicy(raw: string | undefined | null): LabRoomPolicy {
    const def: LabRoomPolicy = { allowPeerShare: true, allowChat: true, recording: false };
    if (!raw) return def;
    let obj: unknown;
    try {
        obj = JSON.parse(raw);
    } catch {
        return def;
    }
    if (!obj || typeof obj !== "object") return def;
    const o = obj as Record<string, unknown>;
    const p = (o.policy && typeof o.policy === "object" ? o.policy : {}) as Record<string, unknown>;
    const read = (key: string): unknown => (key in p ? p[key] : o[key]);
    return {
        // `!== false` semantics, mirroring the rest of the codebase: an absent
        // flag reads as allowed; only an explicit `false` disables.
        allowPeerShare: read("allowPeerShare") !== false,
        allowChat: read("allowChat") !== false,
        recording: read("recording") === true,
    };
}

// ─────────────────────────────────────────────────────────────────────
// 1. Participant metadata (the per-avatar presence row)
// ─────────────────────────────────────────────────────────────────────

/**
 * The JSON we store on each LiveKit participant's `metadata`. It is the
 * authoritative *live* snapshot of that avatar's map state — a newly-connected
 * client reads it off `participant.metadata` to render everyone correctly
 * without waiting for a data packet.
 *
 * NB: `role` and `displayName` are NOT here. Role is baked into the LiveKit
 * grant + the token metadata server-side (never client-trusted), and the
 * display name is `participant.name`. This blob only carries the fields a
 * participant is allowed to mutate about *themselves* mid-session.
 */
export interface LabParticipantMeta {
    /** Stable 0-based seat on the map grid (teacher = 0). Assigned at join. */
    seat: number;
    /** Current live-map activity — drives the avatar colour/badge. */
    status: LabStatus;
    /**
     * UIDs this participant is currently sharing their screen to. Empty when
     * not sharing; `[teacherId]` for a student→teacher "view"; one or more peer
     * uids for a peer share. (The teacher's room-wide broadcast is represented
     * by their screen-share track, not by listing every uid here.)
     */
    sharingTo: string[];
    /** Epoch millis the hand was raised, or null when down (sortable queue). */
    handRaisedAt: number | null;
    /**
     * The participant the TEACHER has spotlit for the whole room, or null/absent
     * when nothing is pinned. Only the teacher ever sets this (it's a room-wide
     * directive that lives on their presence row); every client reads it off the
     * teacher's metadata so a late joiner sees the active spotlight on connect.
     * Always absent/ignored on a student's metadata.
     */
    spotlightUid?: string | null;
}

/** A safe default metadata blob for a freshly-seated participant. */
export function defaultParticipantMeta(seat: number): LabParticipantMeta {
    return { seat, status: "on_task", sharingTo: [], handRaisedAt: null, spotlightUid: null };
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** Serialize participant metadata to the JSON string LiveKit stores verbatim. */
export function encodeParticipantMeta(meta: LabParticipantMeta): string {
    return JSON.stringify(meta);
}

/**
 * Parse a participant's `metadata` string back into `LabParticipantMeta`,
 * tolerating absent/garbage input (a participant who hasn't set metadata yet,
 * or whose token only carries `{ sessionId, role }`). Returns a sane default
 * seeded with `fallbackSeat` rather than throwing, so the map always renders.
 *
 * Defensive on every field: the metadata is attacker-influenced (it's
 * client-set), so we coerce types and never trust the shape blindly.
 */
export function parseParticipantMeta(
    raw: string | undefined | null,
    fallbackSeat = 0
): LabParticipantMeta {
    if (!raw) return defaultParticipantMeta(fallbackSeat);
    let obj: unknown;
    try {
        obj = JSON.parse(raw);
    } catch {
        return defaultParticipantMeta(fallbackSeat);
    }
    if (!obj || typeof obj !== "object") return defaultParticipantMeta(fallbackSeat);
    const o = obj as Record<string, unknown>;
    // Seat is client-set: clamp to a sane finite grid index so a peer can't set
    // `seat: 1e9` / negative / NaN and shove every avatar off the map for
    // everyone. A bad value falls back to the caller's seat hint.
    const rawSeat = o.seat;
    const seat =
        typeof rawSeat === "number" &&
        Number.isInteger(rawSeat) &&
        rawSeat >= 0 &&
        rawSeat <= LAB_MAX_SEAT
            ? rawSeat
            : fallbackSeat;
    return {
        seat,
        status: isLabStatus(o.status) ? o.status : "on_task",
        // Cap the share-target fan-out (uid list) so a single row can't make
        // every recompute iterate thousands of bogus targets.
        sharingTo: sanitizeUidList(o.sharingTo),
        handRaisedAt:
            typeof o.handRaisedAt === "number" && Number.isFinite(o.handRaisedAt)
                ? o.handRaisedAt
                : null,
        spotlightUid:
            typeof o.spotlightUid === "string" && o.spotlightUid.length <= LAB_MAX_UID_LEN
                ? o.spotlightUid
                : null,
    };
}

/** The full set of valid `LabStatus` values — kept here for runtime validation. */
const LAB_STATUSES: readonly LabStatus[] = [
    "on_task",
    "idle",
    "needs_help",
    "sharing",
    "watching",
];

/** Runtime type-guard for `LabStatus` (the wire is untrusted JSON). */
export function isLabStatus(v: unknown): v is LabStatus {
    return typeof v === "string" && (LAB_STATUSES as readonly string[]).includes(v);
}

// ─────────────────────────────────────────────────────────────────────
// 2. Data-channel messages (transient live events)
// ─────────────────────────────────────────────────────────────────────

/**
 * `kind` of a screen share carried in a `share` message. Mirrors
 * `LabConnection["kind"]` minus `broadcast` — a broadcast is inferred from the
 * teacher publishing a screen-share track to the room, so it never travels as a
 * data message.
 */
export type LabShareKind = Exclude<LabConnection["kind"], "broadcast">; // 'peer' | 'view'

/** A hand raise/lower pulse. The authoritative `handRaisedAt` is in metadata. */
export interface LabHandMsg {
    t: "hand";
    /** true = hand went up, false = lowered. */
    raised: boolean;
}

/** A status change pulse. The authoritative status is in metadata. */
export interface LabStatusMsg {
    t: "status";
    status: LabStatus;
}

/** A line of in-room text chat (gated by `session.settings.allowChat`). */
export interface LabChatMsg {
    t: "chat";
    text: string;
}

/**
 * A share opening or closing. `on:true` opens a `view`/`peer` link from the
 * sender to each uid in `targets`; `on:false` tears it down. The receiver also
 * sees this reflected in the sender's metadata `sharingTo`, but the packet lets
 * the UI react the instant it happens.
 */
export interface LabShareMsg {
    t: "share";
    kind: LabShareKind;
    /** UIDs the share is aimed at (the teacher for a `view`, peers for `peer`). */
    targets: string[];
    /** true = share started, false = share ended. */
    on: boolean;
}

/**
 * The teacher started/stopped the session recording. Egress itself is
 * server-side (the control plane drives LiveKit Egress + Firestore), but the
 * completion of `start`/`stop` does NOT echo back to clients on its own — and in
 * dev the egress webhook can't reach localhost — so the teacher broadcasts this
 * pulse the instant the recording API acks. Every client flips its local
 * `recording` flag from it, which is what powers the room-wide "● REC" consent
 * indicator for teacher AND students alike. Consent-relevant, so it rides the
 * reliable data channel like the rest.
 */
export interface LabRecordMsg {
    t: "record";
    /** true = recording started, false = stopped. */
    on: boolean;
}

/**
 * The teacher pinned (or cleared) a participant for the whole room. Spotlight is
 * a TEACHER-only, room-wide directive: every client foregrounds the spotlit
 * participant's screen and subscribes to it. The authoritative value also rides
 * the teacher's own metadata (`spotlightUid`) so a late joiner sees the active
 * spotlight on connect; this packet is the low-latency nudge that flips it the
 * instant the teacher acts. `uid:null` clears the spotlight.
 */
export interface LabSpotlightMsg {
    t: "spotlight";
    /** The spotlit participant's uid, or null to clear the spotlight. */
    uid: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// 2a. Remote-control handshake + input (web ⇄ desktop agent)
// ─────────────────────────────────────────────────────────────────────

/**
 * REMOTE CONTROL rides the SAME data channel as the rest of the lab, but it is a
 * point-to-point conversation between exactly two endpoints — the TEACHER's web
 * client and ONE student's desktop AGENT (apps/lab-agent, a separate Electron
 * app on the SAME LiveKit room). The web student is NOT a party to this: the
 * thing being driven is the student's machine, and only the local agent can
 * inject input, so the web student's browser never sends/handles a grant.
 *
 * SECURITY MODEL (non-negotiable, enforced by the AGENT, mirrored by this type):
 *   • The teacher can only ASK (`ctl_req`). Input (`ctl_in`) is dropped by the
 *     agent unless a grant for the CURRENT request is active.
 *   • The student GRANTS/DENIES explicitly in the agent's consent UI
 *     (`ctl_grant` / `ctl_deny`) and can `ctl_revoke` instantly at any time; a
 *     disconnect implicitly revokes. The agent shows an always-on
 *     "Teacher is viewing / controlling" banner the entire time.
 *   • There is no "start controlling" verb — control is armed ONLY by the
 *     student's grant, never by an inbound input event.
 *
 * Addressing: every handshake message carries `from`/`to` (LiveKit identities)
 * so the agent can verify a grant/input came from the very teacher it answered,
 * and the teacher can verify a grant came from the student it asked. Although the
 * producer also targets these packets with `publishData`'s `destinationIdentities`
 * (so they don't fan out to the room), the embedded `from`/`to` are the
 * authoritative check — a receiver MUST ignore any control message whose `to`
 * isn't its own identity, and the agent MUST ignore input whose `from` isn't the
 * teacher of the active grant.
 */

/** The teacher asks `to`'s agent to begin a remote-control session. */
export interface LabControlRequestMsg {
    t: "ctl_req";
    /** Teacher's identity (the would-be controller). */
    from: string;
    /** Student's identity (whose agent is being asked). */
    to: string;
}

/**
 * The teacher ASKS a student (their BROWSER) to enable remote control — used
 * when the student hasn't connected their desktop agent yet. The student's
 * browser shows a prompt walking them through connecting the agent (OS-level
 * control needs the agent; a browser tab can't be controlled). Distinct from
 * `ctl_req`, which goes to the agent + arms the actual control handshake.
 */
export interface LabControlAskMsg {
    t: "ctl_ask";
    /** Teacher's identity (the would-be controller). */
    from: string;
    /** Student's BROWSER identity being asked to connect their desktop. */
    to: string;
}

/** The student's agent CONSENTED to `to`'s (the teacher's) pending request. */
export interface LabControlGrantMsg {
    t: "ctl_grant";
    /** Student's identity (the controlled machine / grantor). */
    from: string;
    /** Teacher's identity the grant is answering. */
    to: string;
}

/** The student's agent DECLINED `to`'s (the teacher's) pending request. */
export interface LabControlDenyMsg {
    t: "ctl_deny";
    /** Student's identity (who declined). */
    from: string;
    /** Teacher's identity the denial is answering. */
    to: string;
}

/**
 * Control ENDED. Sent by EITHER side: the teacher to stop driving (`from`=teacher),
 * or the student's agent to pull consent mid-session (`from`=student). A
 * disconnect is treated as an implicit revoke by both ends. Idempotent — a
 * receiver that has no active control session simply ignores it.
 */
export interface LabControlRevokeMsg {
    t: "ctl_revoke";
    /** Whoever is ending control (teacher or student). */
    from: string;
    /** The other party. */
    to: string;
}

/**
 * A pointer event in NORMALIZED screen space. `x`/`y` are fractions 0..1 of the
 * shared display's width/height (top-left origin), so they're independent of the
 * agent's real resolution — the agent multiplies by its captured screen size
 * (nut-js `screen.width()/height()`) to get physical pixels. `button` is a
 * 0-based index (0=left, 1=middle, 2=right — DOM `MouseEvent.button`); omit for
 * a plain `move`.
 */
export interface LabControlPointerEvent {
    kind: "pointer";
    action: "move" | "down" | "up";
    /** 0..1 fraction of the shared screen width. */
    x: number;
    /** 0..1 fraction of the shared screen height. */
    y: number;
    /** DOM MouseEvent.button (0=left,1=middle,2=right); absent for `move`. */
    button?: number;
}

/**
 * A scroll/wheel event. `dx`/`dy` are wheel deltas (DOM `WheelEvent.deltaX/Y`,
 * pixels-ish); the agent forwards them to nut-js `mouse.scrollUp/Down/Left/Right`.
 * Not normalized — deltas are relative, not positional.
 */
export interface LabControlScrollEvent {
    kind: "scroll";
    dx: number;
    dy: number;
}

/**
 * A keyboard event. `key` is the DOM `KeyboardEvent.key` (the produced
 * character / named key, e.g. `"a"`, `"Enter"`, `"ArrowLeft"`); `code` is the
 * physical `KeyboardEvent.code` (e.g. `"KeyA"`, `"Enter"`) — the agent prefers
 * `code` for layout-stable mapping and falls back to `key`. `mods` carries the
 * live modifier state so the agent can hold/release Ctrl/Alt/Shift/Meta around
 * the keypress.
 */
export interface LabControlKeyEvent {
    kind: "key";
    action: "down" | "up";
    /** DOM KeyboardEvent.key (character or named key). */
    key: string;
    /** DOM KeyboardEvent.code (physical key, layout-independent). */
    code: string;
    /** Live modifier state at the moment of the event. */
    mods?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
}

/**
 * The NORMALIZED input event carried inside a `ctl_in` — a discriminated union
 * on `kind`. The teacher's web client produces these from raw DOM pointer / wheel
 * / keyboard events over the view stage; the agent replays them via nut-js. The
 * union is deliberately small + device-agnostic so the wire stays simple.
 */
export type LabControlInputEvent =
    | LabControlPointerEvent
    | LabControlScrollEvent
    | LabControlKeyEvent;

/**
 * One unit of remote input from the teacher to the controlled student's agent.
 * Carries only `to` (the agent's identity) — the teacher is the implicit `from`
 * (the sole controller of the active grant; the agent verifies the LiveKit
 * sender identity matches the grant rather than trusting an embedded `from`, so
 * we keep the packet lean for the high-frequency path). The agent MUST drop every
 * `ctl_in` unless a grant for the current request is active.
 */
export interface LabControlInputMsg {
    t: "ctl_in";
    /** Controlled student's identity (the agent that should replay `ev`). */
    to: string;
    /** The normalized input event to replay. */
    ev: LabControlInputEvent;
}

/**
 * Everything sent over the lab data channel — a discriminated union keyed on
 * `t`. Add new packet shapes here (and a case in any consumer's switch) so the
 * compiler keeps every reader exhaustive. The trailing `ctl_*` block is the
 * remote-control contract shared with the desktop agent.
 */
export type LabDataMsg =
    | LabHandMsg
    | LabStatusMsg
    | LabChatMsg
    | LabShareMsg
    | LabRecordMsg
    | LabSpotlightMsg
    | LabControlRequestMsg
    | LabControlAskMsg
    | LabControlGrantMsg
    | LabControlDenyMsg
    | LabControlRevokeMsg
    | LabControlInputMsg;

/** Set of valid `t` discriminants — used to validate decoded packets. */
const LAB_MSG_TYPES: readonly LabDataMsg["t"][] = [
    "hand",
    "status",
    "chat",
    "share",
    "record",
    "spotlight",
    "ctl_req",
    "ctl_ask",
    "ctl_grant",
    "ctl_deny",
    "ctl_revoke",
    "ctl_in",
];

/**
 * Encode a `LabDataMsg` to the bytes LiveKit's `publishData` puts on the wire.
 * JSON + UTF-8; small by construction.
 */
export function encode(msg: LabDataMsg): Uint8Array {
    return TEXT_ENCODER.encode(JSON.stringify(msg));
}

/**
 * Decode a `RoomEvent.DataReceived` payload back into a `LabDataMsg`. Returns
 * `null` for anything that isn't one of our well-formed packets (foreign data,
 * truncated bytes, an unknown `t`) so callers can simply `if (!msg) return`.
 * Per-variant fields are validated so a malformed packet can't smuggle a bad
 * `status`/`text`/`targets` into the UI.
 */
export function decode(payload: Uint8Array): LabDataMsg | null {
    let obj: unknown;
    try {
        obj = JSON.parse(TEXT_DECODER.decode(payload));
    } catch {
        return null;
    }
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.t !== "string" || !(LAB_MSG_TYPES as readonly string[]).includes(o.t)) {
        return null;
    }
    switch (o.t as LabDataMsg["t"]) {
        case "hand":
            return { t: "hand", raised: o.raised === true };
        case "status":
            return isLabStatus(o.status) ? { t: "status", status: o.status } : null;
        case "chat": {
            // Untrusted text from a peer, rendered into EVERY client's message
            // list. Reject a non-string; hard-cap the length so a peer can't
            // shove a multi-MB string over the reliable channel (memory DoS).
            if (typeof o.text !== "string") return null;
            const text = o.text.length > LAB_MAX_CHAT_LEN ? o.text.slice(0, LAB_MAX_CHAT_LEN) : o.text;
            return { t: "chat", text };
        }
        case "share": {
            const kind = o.kind === "peer" || o.kind === "view" ? (o.kind as LabShareKind) : null;
            if (!kind) return null;
            // Cap + de-dupe the target uids (see sanitizeUidList) so a `share`
            // can't announce thousands of targets and amplify every recompute.
            const targets = sanitizeUidList(o.targets);
            return { t: "share", kind, targets, on: o.on === true };
        }
        case "record":
            return { t: "record", on: o.on === true };
        case "spotlight":
            // `uid` is a participant identity or null (clear). Anything else
            // (numbers, objects, an oversize string) is coerced to a clear so a
            // malformed packet can't pin a bogus avatar.
            return {
                t: "spotlight",
                uid: typeof o.uid === "string" && o.uid.length <= LAB_MAX_UID_LEN ? o.uid : null,
            };
        case "ctl_req":
        case "ctl_ask":
        case "ctl_grant":
        case "ctl_deny":
        case "ctl_revoke": {
            // All five handshake messages share the `{ from, to }` shape. Both
            // must be non-empty identities or the packet is meaningless (and a
            // missing `to` would let a control message be mis-addressed) — drop
            // it rather than honour a half-formed grant/revoke. `t` is taken from
            // the validated discriminant (not the raw `o.t`) so it narrows to the
            // exact literal union member.
            const t = o.t as "ctl_req" | "ctl_ask" | "ctl_grant" | "ctl_deny" | "ctl_revoke";
            if (typeof o.from !== "string" || !o.from) return null;
            if (typeof o.to !== "string" || !o.to) return null;
            return { t, from: o.from, to: o.to };
        }
        case "ctl_in": {
            // Directed input: `to` must be a real identity and `ev` a well-formed
            // normalized event. A malformed `ev` is dropped whole — we never
            // replay a partially-decoded input (e.g. a key with no `code`, or a
            // pointer with a NaN coordinate) on someone's machine.
            if (typeof o.to !== "string" || !o.to) return null;
            const ev = decodeControlInputEvent(o.ev);
            return ev ? { t: "ctl_in", to: o.to, ev } : null;
        }
        default:
            return null;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Control helpers — constructors + the normalized-event validator
// ─────────────────────────────────────────────────────────────────────

/** A finite number in [0,1] (normalized screen coordinate). */
function isUnit(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** A finite number (scroll delta) — clamps NaN/Infinity out of the input path. */
function isFiniteNum(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

/**
 * Validate + narrow an untrusted value into a `LabControlInputEvent`, or null.
 * This is the security-critical gate for the high-frequency input path: the
 * agent calls it (mirrored in its own protocol) before ANYTHING reaches nut-js,
 * so a coordinate must be a real 0..1 fraction, a key event must carry both
 * `key` and `code`, and unknown `kind`s are rejected. Exported so the agent's
 * decoder can reuse the exact same shape check.
 */
export function decodeControlInputEvent(raw: unknown): LabControlInputEvent | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    switch (o.kind) {
        case "pointer": {
            const action = o.action;
            if (action !== "move" && action !== "down" && action !== "up") return null;
            if (!isUnit(o.x) || !isUnit(o.y)) return null;
            const ev: LabControlPointerEvent = { kind: "pointer", action, x: o.x, y: o.y };
            // `button` is only meaningful for down/up; keep it when it's a sane
            // 0-based index, drop it otherwise (a `move` never carries one).
            if (typeof o.button === "number" && Number.isInteger(o.button) && o.button >= 0) {
                ev.button = o.button;
            }
            return ev;
        }
        case "scroll":
            if (!isFiniteNum(o.dx) || !isFiniteNum(o.dy)) return null;
            return { kind: "scroll", dx: o.dx, dy: o.dy };
        case "key": {
            const action = o.action;
            if (action !== "down" && action !== "up") return null;
            if (typeof o.key !== "string" || typeof o.code !== "string") return null;
            const ev: LabControlKeyEvent = { kind: "key", action, key: o.key, code: o.code };
            if (o.mods && typeof o.mods === "object") {
                const m = o.mods as Record<string, unknown>;
                ev.mods = {
                    ctrl: m.ctrl === true,
                    alt: m.alt === true,
                    shift: m.shift === true,
                    meta: m.meta === true,
                };
            }
            return ev;
        }
        default:
            return null;
    }
}

/** Build a `ctl_req` (teacher → student's agent). */
export function controlRequest(from: string, to: string): LabControlRequestMsg {
    return { t: "ctl_req", from, to };
}

/** Build a `ctl_ask` (teacher → student's BROWSER: "connect your desktop to allow control"). */
export function controlAsk(from: string, to: string): LabControlAskMsg {
    return { t: "ctl_ask", from, to };
}

/** Build a `ctl_grant` (student's agent → teacher). */
export function controlGrant(from: string, to: string): LabControlGrantMsg {
    return { t: "ctl_grant", from, to };
}

/** Build a `ctl_deny` (student's agent → teacher). */
export function controlDeny(from: string, to: string): LabControlDenyMsg {
    return { t: "ctl_deny", from, to };
}

/** Build a `ctl_revoke` (either side ends control). */
export function controlRevoke(from: string, to: string): LabControlRevokeMsg {
    return { t: "ctl_revoke", from, to };
}

/** Build a `ctl_in` (teacher → controlled student's agent). */
export function controlInput(to: string, ev: LabControlInputEvent): LabControlInputMsg {
    return { t: "ctl_in", to, ev };
}

/** Narrow a decoded `LabDataMsg` to the remote-control subset (handshake + input). */
export function isControlMsg(
    msg: LabDataMsg
): msg is
    | LabControlAskMsg
    | LabControlRequestMsg
    | LabControlGrantMsg
    | LabControlDenyMsg
    | LabControlRevokeMsg
    | LabControlInputMsg {
    return (
        msg.t === "ctl_ask" ||
        msg.t === "ctl_req" ||
        msg.t === "ctl_grant" ||
        msg.t === "ctl_deny" ||
        msg.t === "ctl_revoke" ||
        msg.t === "ctl_in"
    );
}
