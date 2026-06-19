"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ConnectionQuality,
    ConnectionState,
    DisconnectReason,
    Participant,
    RemoteParticipant,
    RemoteTrackPublication as RemoteTrackPublicationClass,
    Room,
    RoomEvent,
    Track,
    createLocalScreenTracks,
    type DataPacket_Kind,
    type LocalTrackPublication,
    type RemoteTrack,
    type RemoteTrackPublication,
    type TrackPublication,
} from "livekit-client";
import { auth } from "@/lib/firebase/client";
import type {
    LabConnection,
    LabParticipant,
    LabRole,
    LabRoomState,
    LabStatus,
    LabTokenResponse,
} from "@digimine/types";
import {
    controlInput,
    controlRequest,
    controlRevoke,
    decode,
    encode,
    parseParticipantMeta,
    parseRoomPolicy,
    LAB_MAX_CHAT_LEN,
    type LabControlInputEvent,
    type LabDataMsg,
    type LabParticipantMeta,
    type LabRoomPolicy,
    type LabShareKind,
} from "./labProtocol";

/**
 * useLabRoom — the client hook that owns ONE lab session's live state, bound to
 * LiveKit. This is the central realtime layer of the Virtual Lab: the rest of
 * Phase 1 (LabMap, the room pages, the per-student action menus) reads `state`
 * and calls `actions` from here and never touches LiveKit directly.
 *
 * Lifecycle (all inside one effect keyed on `sessionId`):
 *   1. POST /api/lab/token with the Firebase Bearer → { token, url, role, identity }.
 *      The server re-resolves the caller's role from class membership and mints
 *      a role-scoped grant; we never tell it who we are.
 *   2. `new Room()` + `room.connect(url, token)` against NEXT_PUBLIC_LIVEKIT_URL
 *      (the token's `url` mirrors it; we use the token's value).
 *   3. Subscribe to the RoomEvents that move the map and recompute `LabRoomState`
 *      from the live roster on every one (cheap: it's ≤ LAB_LIMITS.maxParticipants
 *      rows). Firestore is NOT read here — the durable mirror is written
 *      best-effort via POST /api/lab/events.
 *
 * State derivation (see `buildRoomState`):
 *   • participants — local + every remote, each merged with its parsed
 *     `LabParticipantMeta` (seat/status/sharingTo/handRaisedAt) and
 *     `participant.name` as displayName. Role comes from the token-baked
 *     participant metadata (`{ role }`), never the client.
 *   • connections — derived from (a) the teacher's screen-share track ⇒ a
 *     `broadcast` link to every other participant, and (b) each participant's
 *     metadata `sharingTo` ⇒ `view` (target is a teacher) or `peer` links.
 *   • broadcasting — true when the teacher is publishing a screen-share track.
 *   • recording — true while a session recording (server-side LiveKit Egress)
 *     is in progress, reflected to EVERYONE (teacher + students) so the room-wide
 *     "● REC" consent indicator shows for all. Three converging signals feed one
 *     client-side flag (`recordingRef`): (a) the teacher's optimistic local set
 *     when they hit Record/Stop, (b) a reliable `record` data packet the teacher
 *     broadcasts so every peer learns the instant it toggles, (c) the room's
 *     `session.recordingId` re-read on connect so a LATE joiner sees an in-flight
 *     recording, plus the legacy room-metadata `recording` flag if the control
 *     plane ever sets it. Egress is driven server-side via POST
 *     /api/lab/sessions/[sessionId]/recording — the hook only consumes that API
 *     and mirrors the resulting state; it never touches LiveKit Egress.
 *
 * Fast signals over the data channel, durable mirror over /api: hand raises,
 * status pulses, chat, and share open/close travel as `publishData` packets for
 * latency AND are POSTed to /api/lab/events so the audit trail / analytics /
 * replay chapters survive. The map renders off LiveKit; Firestore is the source
 * of truth for "who was here".
 *
 * The returned `{ state, actions, connected, error }` shape is a superset of the
 * old mock's contract, so existing consumers (LabRoom.tsx, LabMap) keep working
 * unchanged while new UI can use the richer surface (status / messages /
 * getVideoTrack / attach).
 */

// ─────────────────────────────────────────────────────────────────────
// Screen-share track names
// ─────────────────────────────────────────────────────────────────────

/**
 * Distinct LiveKit track *names* for the two kinds of screen share so they
 * never collide on the wire or in the derivation. Both use the
 * `Track.Source.ScreenShare` source (a display capture has no other source),
 * but the name disambiguates intent for the audit log + any UI that lists
 * publications:
 *   • the TEACHER's room-wide broadcast publishes `lab-broadcast`;
 *   • a STUDENT's share-to-teacher/peer publishes `lab-share`.
 * Derivation still keys broadcast off the publisher's *role* (a teacher's
 * screen ⇒ broadcast) and view/peer off the publisher's `sharingTo` metadata,
 * so these names are about clarity + collision-safety, not the link kind.
 */
const LAB_BROADCAST_TRACK_NAME = "lab-broadcast";
const LAB_SHARE_TRACK_NAME = "lab-share";

// ─────────────────────────────────────────────────────────────────────
// Public types (the contract the UI + API agents build against)
// ─────────────────────────────────────────────────────────────────────

/** Coarse connection state for a banner/spinner. `connected` mirrors `=== "connected"`. */
export type LabConnectionStatus =
    | "idle" // before the effect runs / no session id
    | "connecting" // minting token + opening the room
    | "connected" // joined and live
    | "reconnecting" // transient SFU reconnect in progress
    | "disconnected" // cleanly left or dropped
    | "error"; // token mint or connect failed (see `error`)

/**
 * Per-participant link health, surfaced from LiveKit's
 * `connectionQualityChanged`. A client-only transport signal (NOT room state —
 * it isn't persisted or replayed) the UI can use for a "weak connection" badge.
 * Mirrors `livekit-client`'s `ConnectionQuality` string union.
 */
export type LabConnectionQuality = "excellent" | "good" | "poor" | "lost" | "unknown";

/** Narrow LiveKit's `ConnectionQuality` enum to our string union (defensive). */
function toLabQuality(q: ConnectionQuality): LabConnectionQuality {
    switch (q) {
        case ConnectionQuality.Excellent:
            return "excellent";
        case ConnectionQuality.Good:
            return "good";
        case ConnectionQuality.Poor:
            return "poor";
        case ConnectionQuality.Lost:
            return "lost";
        default:
            return "unknown";
    }
}

/** One received chat line, in arrival order. `you` flags the local sender. */
export interface LabChatMessage {
    /** Stable-ish id for React keys (uid + arrival counter). */
    id: string;
    /** Sender uid (LiveKit identity). */
    fromUid: string;
    /** Sender display name at send time (best-effort from the roster). */
    fromName: string;
    text: string;
    /** Epoch millis the message was received locally. */
    at: number;
    /** True when the local participant sent it. */
    you: boolean;
}

/**
 * The TEACHER's live remote-control state for the one student they're currently
 * driving (the web is only ever the controller; the controlled machine is the
 * student's desktop agent). Null/`phase:"idle"` means no control in flight.
 *
 *   requested — `ctl_req` sent; awaiting the agent's grant/deny. UI shows
 *               "Requesting…" and offers Cancel (which `endControl()`s).
 *   active    — the agent granted; the teacher may now `sendControlInput`. UI
 *               shows "Controlling {name}" + an always-visible Stop.
 *   denied    — the agent declined (or no agent answered). Terminal; the UI
 *               shows "Declined" briefly, then the caller clears via a fresh
 *               `requestControl` or by reading `targetUid:null` after a reset.
 *
 * Only one control session exists at a time — requesting a new target while one
 * is in flight supersedes it (the old one is revoked first).
 */
export type LabControlPhase = "idle" | "requested" | "active" | "denied";

export interface LabControlState {
    /** The student whose agent is being asked / driven, or null when idle. */
    targetUid: string | null;
    /** Where the handshake is. `idle` ⇔ `targetUid === null`. */
    phase: LabControlPhase;
}

/**
 * A subscribed video track for one participant + source, plus DOM
 * attach/detach helpers so the UI can render it into a `<video>` without
 * importing livekit-client. `attach(el)` wires the MediaStream to the element;
 * `detach(el)` unbinds it. Omit `el` to use the helper's managed element.
 */
export interface LabVideoHandle {
    uid: string;
    source: "camera" | "screen";
    /** Attach the track to (or into) an element; returns the bound media element. */
    attach: (el?: HTMLMediaElement) => HTMLMediaElement | undefined;
    /** Detach from a specific element, or from all if none given. */
    detach: (el?: HTMLMediaElement) => void;
}

/**
 * The action surface a lab page wires up. Every method is a fire-and-forget
 * intent — the resulting change arrives back through `state`. Required members
 * (per the realtime contract) are grouped first; the trailing block preserves
 * the verbs the existing LabMap/LabRoom shell already calls so nothing breaks.
 */
export interface LabRoomActions {
    // ── Core realtime contract ──────────────────────────────────────
    /** Teacher: publish camera + screen-share to the whole room (a broadcast). */
    startBroadcast: () => Promise<void>;
    /** Teacher: stop the broadcast (unpublish camera + screen). */
    stopBroadcast: () => Promise<void>;
    /** Teacher: turn your own camera on/off independently of the screen broadcast. */
    setCamera: (on: boolean) => Promise<void>;
    /**
     * Teacher: END the whole lab session via the control plane (PATCH
     * action:'end' → status 'ended' + endedAt), stop local media, and leave the
     * room. No-op for non-teachers; the page navigates away once it resolves.
     */
    endSession: () => Promise<void>;
    /** Set your own live-map status (metadata + data pulse + event mirror). */
    setStatus: (status: LabStatus) => Promise<void>;
    /** Raise your hand (stamps handRaisedAt now). */
    raiseHand: () => Promise<void>;
    /** Lower your hand. */
    lowerHand: () => Promise<void>;
    /** Send a line of in-room chat to everyone. */
    sendChat: (text: string) => Promise<void>;
    /**
     * Get a handle to a participant's video track for `<video>` rendering, or
     * null if they aren't publishing that source. Defaults to their screen
     * share when present, else their camera.
     */
    getVideoTrack: (uid: string, source?: "camera" | "screen") => LabVideoHandle | null;

    // ── Sharing (student → teacher / peer) ──────────────────────────
    /**
     * Share your screen up to the teacher (a "view" connection). Captures the
     * display (getDisplayMedia), publishes it under the distinct
     * `lab-share` track name (so it never collides with the teacher's
     * `lab-broadcast`), and sets your metadata `sharingTo=[teacherUid]`,
     * `status='sharing'`. The teacher auto-subscribes (the room joins with
     * `autoSubscribe`). No-op (resolves) if there's no teacher in the room.
     */
    shareToTeacher: () => Promise<void>;
    /**
     * Share your screen to one or more peers (a "peer" connection). Same publish
     * as {@link shareToTeacher} but `sharingTo=[...targets]`. ONLY allowed when
     * `session.settings.allowPeerShare !== false`; otherwise it's a no-op that
     * rejects with a friendly error the caller can surface. Accepts a single uid
     * or an array.
     */
    shareToPeer: (targets: string | string[]) => Promise<void>;
    /**
     * Stop sharing your screen to anyone: unpublish + stop the `lab-share`
     * track, clear `sharingTo`, and set `status` back to `on_task`.
     */
    stopSharing: () => Promise<void>;

    // ── Viewing / spotlight ─────────────────────────────────────────
    /**
     * Subscribe to a participant's shared screen and return a {@link LabVideoHandle}
     * to render it (or null if they aren't sharing / you may not view them).
     * The teacher may view ANY student; a student may view a peer who is sharing
     * to them or who is currently spotlit. Sets your `status` to `watching`.
     */
    viewScreen: (uid: string) => LabVideoHandle | null;
    /**
     * TEACHER-only: spotlight a participant for the whole room (every client
     * foregrounds + subscribes to their screen), or pass null to clear it.
     * Carried via a `spotlight` data pulse + the teacher's metadata
     * (`spotlightUid`) and reflected in `state.spotlightUid`. A no-op for
     * non-teachers. Fire-and-forget.
     */
    spotlight: (uid: string | null) => void;

    // ── Remote control (teacher → a student's desktop agent) ────────
    /**
     * TEACHER-only: ask `uid`'s desktop agent for remote control. Sends a
     * directed `ctl_req` and moves `state.control` to `{ targetUid: uid,
     * phase: "requested" }`. The student GRANTS in their agent (never in the
     * web) — the web only ever controls. If a control session is already in
     * flight it's revoked first so only one exists at a time. A no-op for
     * non-teachers, for self, or for a uid not in the room. Fire-and-forget;
     * the phase advances to "active"/"denied" as the agent answers.
     */
    requestControl: (uid: string) => void;
    /**
     * End the current control session (or cancel a pending request): sends a
     * `ctl_revoke` to the target's agent and clears `state.control` back to
     * idle. Safe to call in any phase / when there's nothing in flight.
     */
    endControl: () => void;
    /**
     * Send ONE normalized input event to the controlled agent. No-op unless
     * `state.control.phase === "active"` (the agent also drops anything that
     * arrives without an active grant). The teacher's view stage produces these
     * from raw DOM pointer/wheel/key events; coordinates must already be
     * normalized 0..1 of the shared screen. High-frequency + directed (only the
     * target agent receives it). Fire-and-forget.
     */
    sendControlInput: (ev: LabControlInputEvent) => void;
    /**
     * @deprecated Use {@link requestControl}. Retained so the existing shell that
     * called `requestRemoteAssist(uid)` keeps compiling; it now forwards to
     * `requestControl` (and writes the same `control_request` audit event).
     */
    requestRemoteAssist: (targetUid?: string) => void;
    /**
     * Teacher: start the session recording. POSTs to the recording API (which
     * fires LiveKit Egress + writes `labRecordings/{id}` + links the session),
     * optimistically flips the local `recording` flag, and broadcasts a `record`
     * pulse so every other client lights up the "● REC" consent indicator. The
     * server also writes a `record_start` audit event. Resolves once the API acks.
     */
    startRecording: () => Promise<void>;
    /** Teacher: stop the session recording (mirror of {@link startRecording}). */
    stopRecording: () => Promise<void>;
    /** Respond to a pending record/control consent prompt. Event-only. */
    respondConsent: (kind: "record" | "control", accept: boolean) => void;
}

/**
 * The room snapshot the hook returns: the shared domain `LabRoomState` plus the
 * web-only `control` slice. `control` is the TEACHER's live remote-control
 * handshake state and is intentionally NOT part of `@digimine/types`'
 * `LabRoomState` — it's transport/UI state for the desktop-agent control flow,
 * not a field of the persisted/replayed room model. The UI reads
 * `state.control` to render "Requesting… / Controlling / Declined".
 */
export type LabRoomStateView = LabRoomState & {
    control: LabControlState;
    /**
     * Per-participant link health keyed by uid (the local user + every remote),
     * derived from LiveKit's `connectionQualityChanged`. Client-only/transient —
     * intentionally NOT part of `@digimine/types`' `LabRoomState` (it's transport
     * health, not persisted room state). Absent uids read as `"unknown"`.
     */
    qualities: Record<string, LabConnectionQuality>;
    /**
     * The server-owned compliance policy read off the LiveKit ROOM metadata
     * (`allowPeerShare` / `allowChat`), so the UI can reflect/disable controls
     * without a separate fetch. Authoritative source is the control plane (it
     * stamps + updates room metadata); the hard boundary is the server grant +
     * server-side moderation. Defaults permissive when unset.
     */
    policy: LabRoomPolicy;
};

export interface UseLabRoomResult {
    /** The live room snapshot to feed `LabMap` (+ the `control` slice). */
    state: LabRoomStateView;
    /** Intent callbacks bound to the live room. */
    actions: LabRoomActions;
    /** Coarse connection state for banners/spinners. */
    status: LabConnectionStatus;
    /** True once joined to the LiveKit room (=== status "connected"). */
    connected: boolean;
    /** A connect/runtime error to surface, or null. */
    error: string | null;
    /** In-room chat, oldest first. */
    messages: LabChatMessage[];
    /** Your resolved role (server-minted), or null until the token arrives. */
    role: LabRole | null;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — token, role, metadata, state derivation
// ─────────────────────────────────────────────────────────────────────

/**
 * The role baked into a participant's token metadata server-side. We read it
 * off `participant.metadata` (`{ sessionId, role }`) rather than trusting any
 * client signal. Defaults to "student" when absent so an avatar still renders.
 */
function roleFromParticipant(p: Participant): LabRole {
    try {
        if (p.metadata) {
            const meta = JSON.parse(p.metadata) as { role?: unknown };
            if (meta.role === "teacher" || meta.role === "student" || meta.role === "observer") {
                return meta.role;
            }
        }
    } catch {
        /* fall through to default */
    }
    return "student";
}

/**
 * The lab metadata blob ({ seat, status, sharingTo, handRaisedAt }) lives in the
 * SAME `participant.metadata` JSON as the server's `{ sessionId, role }`. We
 * read the lab fields from that merged object, falling back to a seated default.
 * `fallbackSeat` keeps avatars from stacking on seat 0 before metadata is set.
 */
function labMetaFromParticipant(p: Participant, fallbackSeat: number): LabParticipantMeta {
    return parseParticipantMeta(p.metadata, fallbackSeat);
}

/**
 * The participant's screen-share publication, regardless of which name it was
 * published under (`lab-broadcast` for a teacher, `lab-share` for a student).
 * Resolves by source first (the canonical lookup), then falls back to the named
 * publications so we still find it the instant it's published but before its
 * source is wired up. Returns the publication even when the local track isn't
 * subscribed yet (so a watcher can call `.setSubscribed(true)` on it).
 */
function screenSharePub(p: Participant): TrackPublication | undefined {
    return (
        p.getTrackPublication(Track.Source.ScreenShare) ??
        p.getTrackPublicationByName(LAB_SHARE_TRACK_NAME) ??
        p.getTrackPublicationByName(LAB_BROADCAST_TRACK_NAME)
    );
}

/** True when the participant is currently publishing a screen-share track. */
function hasScreenShare(p: Participant): boolean {
    const pub = screenSharePub(p);
    // A publication exists from the moment it's announced; we don't require the
    // media track to be locally subscribed (the teacher may be unsubscribed from
    // a given student, yet the share link should still draw on the map).
    return Boolean(pub);
}

/** Find the (first) teacher participant in the room, or undefined. */
function findTeacherParticipant(room: Room): Participant | undefined {
    return [room.localParticipant, ...room.remoteParticipants.values()].find(
        (p) => roleFromParticipant(p) === "teacher"
    );
}

/** Map a LiveKit participant (+ derived role/meta) to our domain `LabParticipant`. */
function toLabParticipant(
    p: Participant,
    sessionId: string,
    role: LabRole,
    meta: LabParticipantMeta
): LabParticipant {
    return {
        uid: p.identity,
        sessionId,
        role,
        // Display name is the SFU-side `participant.name` (set from the token).
        // Fall back to a role-appropriate placeholder if it's somehow empty.
        displayName: p.name || (role === "teacher" ? "Teacher" : "Student"),
        seat: meta.seat,
        status: meta.status,
        sharingTo: meta.sharingTo,
        handRaisedAt: meta.handRaisedAt,
        // joinedAt isn't carried on the wire; LabMap doesn't use it for layout,
        // so a stable client-side stamp (now) is fine for the live snapshot. The
        // durable joinedAt lives on the Firestore roster row.
        joinedAt: new Date(),
    };
}

/**
 * Derive the full `LabRoomState` from the room's live roster + tracks.
 *
 * Connections:
 *   • broadcast — if a teacher is publishing a screen share, draw a `broadcast`
 *     link from them to every OTHER participant (LabMap collapses these into one
 *     "to the room" rail row and highlights the lines).
 *   • view / peer — from each participant's metadata `sharingTo`: a target that
 *     is a teacher ⇒ `view` (student showing the teacher); otherwise ⇒ `peer`.
 *   • view (teacher → student) — additionally, when the teacher is actively
 *     SUBSCRIBED to a student's screen-share track (the teacher hit "view"), we
 *     draw a `view` line teacher→student so the map shows who the teacher is
 *     watching even if the student didn't explicitly `sharingTo` the teacher.
 *
 * Spotlight: read off the teacher's metadata `spotlightUid` (the room-wide pin),
 * surfaced as `state.spotlightUid` so every client foregrounds that screen.
 *
 * Defensive: only emits connections whose endpoints are present in the roster,
 * and de-dupes a teacher↔student pair so a mutual share/view draws one line.
 */
function buildRoomState(
    room: Room,
    sessionId: string,
    youUid: string,
    youRole: LabRole,
    recordingFlag: boolean
): LabRoomState {
    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];

    // First pass: resolve role + metadata once per participant.
    const rows = all.map((p, i) => {
        const role = roleFromParticipant(p);
        const meta = labMetaFromParticipant(p, role === "teacher" ? 0 : i);
        return { p, role, meta, participant: toLabParticipant(p, sessionId, role, meta) };
    });
    const present = new Set(rows.map((r) => r.participant.uid));
    const teacherUids = new Set(rows.filter((r) => r.role === "teacher").map((r) => r.p.identity));

    const participants = rows.map((r) => r.participant);

    // Connections. We de-dupe so the same media link never draws twice:
    //   • an exact (from,to,kind) is emitted at most once;
    //   • a `view` between a teacher and a student de-dupes by the unordered
    //     pair, so a student sharing-to-teacher AND the teacher viewing-back the
    //     same student collapse to one line.
    const connections: LabConnection[] = [];
    const seenExact = new Set<string>();
    const seenViewPair = new Set<string>();
    const pushConn = (c: LabConnection) => {
        if (c.kind === "view") {
            const pair = [c.fromUid, c.toUid].sort().join("|");
            if (seenViewPair.has(pair)) return;
            seenViewPair.add(pair);
        }
        const key = `${c.fromUid}>${c.toUid}:${c.kind}`;
        if (seenExact.has(key)) return;
        seenExact.add(key);
        connections.push(c);
    };

    // (a) Broadcast: any teacher publishing a screen share → the whole room.
    let broadcasting = false;
    for (const r of rows) {
        if (r.role === "teacher" && hasScreenShare(r.p)) {
            broadcasting = true;
            for (const other of rows) {
                if (other.p.identity === r.p.identity) continue;
                pushConn({ fromUid: r.p.identity, toUid: other.p.identity, kind: "broadcast" });
            }
        }
    }

    // (b) view / peer from metadata sharingTo (the sharer's declared targets).
    for (const r of rows) {
        for (const targetUid of r.meta.sharingTo) {
            if (!present.has(targetUid)) continue; // target already left
            if (targetUid === r.p.identity) continue; // never self
            const kind: LabConnection["kind"] = teacherUids.has(targetUid) ? "view" : "peer";
            pushConn({ fromUid: r.p.identity, toUid: targetUid, kind });
        }
    }

    // (c) view (teacher → student): the teacher is actively SUBSCRIBED to a
    // student's screen-share track (they hit "view"). Draw teacher→student so
    // the map shows who the teacher is watching even when the student didn't
    // list the teacher in `sharingTo`. De-dup (above) folds this into the
    // student→teacher line when they're already sharing up.
    for (const t of rows) {
        if (t.role !== "teacher") continue;
        for (const s of rows) {
            if (s.role === "teacher") continue;
            const pub = screenSharePub(s.p);
            // `isSubscribed` is only meaningful for a remote publication; the
            // teacher viewing their own screen is nonsensical, so skip locals.
            if (
                pub instanceof RemoteTrackPublicationClass &&
                pub.isSubscribed &&
                present.has(s.p.identity)
            ) {
                pushConn({ fromUid: t.p.identity, toUid: s.p.identity, kind: "view" });
            }
        }
    }

    // Recording: the client-side flag (optimistic local set + `record` data
    // pulse + the session's recordingId re-read on connect) OR'd with the
    // server-owned room-metadata `recording` flag (parsed via the shared
    // `parseRoomPolicy` so the room-metadata shape is read in ONE place). The
    // client flag is the authoritative everyone-sees-it source; metadata is a
    // belt-and-braces fallback.
    const recording = recordingFlag || parseRoomPolicy(room.metadata).recording;

    // Spotlight: the room-wide pin lives on the TEACHER's metadata. Read it off
    // whichever participant is the teacher (the directive is teacher-only), and
    // only honour it while the pinned participant is still present.
    let spotlightUid: string | null = null;
    for (const r of rows) {
        if (r.role === "teacher" && r.meta.spotlightUid && present.has(r.meta.spotlightUid)) {
            spotlightUid = r.meta.spotlightUid;
            break;
        }
    }

    return {
        sessionId,
        participants,
        connections,
        broadcasting,
        recording,
        spotlightUid,
        you: { uid: youUid, role: youRole },
    };
}

/** POST /api/lab/token with the Firebase Bearer; returns the minted grant. */
async function mintToken(sessionId: string): Promise<LabTokenResponse> {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be signed in to join the lab.");
    const idToken = await user.getIdToken();
    const res = await fetch("/api/lab/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ sessionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error((json as { error?: string })?.error || "Could not join this lab.");
    }
    return json as LabTokenResponse;
}

/**
 * Drive the session recording via the control plane. POSTs
 * /api/lab/sessions/{sessionId}/recording with the Firebase Bearer and an
 * `{ action: 'start' | 'stop' }` body (the recording API owns the egress +
 * Firestore writes). Unlike `postEvent`, this is NOT fire-and-forget: the
 * teacher needs to know if recording failed to start/stop, so we await it and
 * throw the server's error message on a non-2xx for the caller to surface.
 */
async function recordingApi(sessionId: string, action: "start" | "stop"): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be signed in to control recording.");
    const idToken = await user.getIdToken();
    const res = await fetch(
        `/api/lab/sessions/${encodeURIComponent(sessionId)}/recording`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ action }),
        }
    );
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
            (json as { error?: string })?.error ||
                (action === "start"
                    ? "Could not start recording."
                    : "Could not stop recording.")
        );
    }
}

/**
 * End the whole session via the control plane: PATCH /api/lab/sessions/{id} with
 * { action: 'end' } + the Firebase Bearer (the route is teacher-only server-side
 * — a student's call 403s). Awaited so the teacher learns of a failure; throws
 * the server's message on a non-2xx for the caller to surface.
 */
async function endSessionApi(sessionId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be signed in to end the session.");
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/lab/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "end" }),
    });
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
            (json as { error?: string })?.error || "Could not end the session."
        );
    }
}

/**
 * Best-effort durable mirror of a live signal into the Firestore events log.
 * Fire-and-forget: a failed/absent /api/lab/events route must NEVER break the
 * live room (the map runs off LiveKit). We swallow everything.
 */
function postEvent(
    type: string,
    body: { targetUid?: string; meta?: Record<string, unknown> } = {}
): void {
    const user = auth.currentUser;
    if (!user) return;
    void user
        .getIdToken()
        .then((idToken) =>
            fetch("/api/lab/events", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ type, ...body }),
                keepalive: true, // survive an unmount/navigation
            })
        )
        .catch(() => {
            /* best-effort; durable mirror only */
        });
}

// ─────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────

/**
 * @param sessionId the lab session to join. The token mint is scoped to it; a
 *   change re-runs the whole connect lifecycle (old room is disconnected first).
 */
export function useLabRoom(sessionId: string): UseLabRoomResult {
    // The live room object lives in a ref so re-renders never recreate it; React
    // state below is just the *derived* snapshot the UI paints.
    const roomRef = useRef<Room | null>(null);
    // Our own identity/role from the token, kept in a ref so action callbacks
    // (which close over a stable identity) and the state-builder agree.
    const youRef = useRef<{ uid: string; role: LabRole }>({ uid: "", role: "student" });
    // Our own metadata mirror so partial updates (status vs hand vs share) don't
    // clobber each other — we always setMetadata the full merged blob.
    const myMetaRef = useRef<LabParticipantMeta>({
        seat: 0,
        status: "on_task",
        sharingTo: [],
        handRaisedAt: null,
        spotlightUid: null,
    });
    // The server-owned room policy (allowPeerShare / allowChat / recording),
    // read off LiveKit ROOM metadata — authoritative + unskippable (a client
    // can't mutate room metadata), re-derived on RoomMetadataChanged and on
    // reconnect. `shareToPeer` / `sendChat` gate on it; the SERVER grant +
    // server-side moderation remain the hard boundary. Defaults permissive so a
    // room minted before the control plane stamps a policy behaves as before.
    const policyRef = useRef<LabRoomPolicy>({
        allowPeerShare: true,
        allowChat: true,
        recording: false,
    });
    // Per-participant link health (uid → quality), updated from LiveKit's
    // `connectionQualityChanged`. Held in a ref so the (stable) recompute folds
    // it into the snapshot without re-subscribing; pruned as participants leave.
    const qualitiesRef = useRef<Record<string, LabConnectionQuality>>({});
    // The local STUDENT screen-share publication (the `lab-share` track), held so
    // `stopSharing` can unpublish exactly the track we published — never the
    // teacher's broadcast, and without disturbing camera. Null when not sharing.
    const sharePubRef = useRef<LocalTrackPublication | null>(null);
    // The kind + targets of the share currently up (or null when not sharing),
    // remembered so a reconnect can RE-ASSERT the same subscription-permission
    // restriction (teacher-only when peer-share is off) — the SFU does not
    // re-apply our permissions across a full signal reconnect.
    const shareInfoRef = useRef<{ kind: LabShareKind; targets: string[] } | null>(null);
    // Latest "apply the share subscription-permission for the current share"
    // closure, mirrored from the connect effect so the action closures
    // (startSharing/stopSharing) can re-assert without re-subscribing the room.
    const applySharePermsRef = useRef<(() => void) | null>(null);
    // Guards the Disconnected→re-mint path so a single drop triggers at most one
    // token re-mint + reconnect attempt in flight at a time.
    const reconnectingTokenRef = useRef(false);
    // Makes effect cleanup idempotent: a second teardown (Fast Refresh racing a
    // sessionId change) must not double-disconnect / double-postEvent.
    const teardownDoneRef = useRef(false);
    // Monotonic counter for stable chat message ids.
    const chatSeq = useRef(0);
    // The room-wide recording flag, kept in a ref so the (stable) state-builder
    // and action callbacks agree without re-subscribing. Fed by the teacher's
    // optimistic local set, inbound `record` data pulses, and the session's
    // recordingId on connect; `buildRoomState` reflects it to every client.
    const recordingRef = useRef(false);
    // Latest `publish` fn, mirrored into a ref so the long-lived connect effect's
    // event handlers (e.g. re-announcing `record` to a late joiner) can call it
    // without taking `publish` as a dep (which would re-run the whole connect).
    const publishRef = useRef<((msg: LabDataMsg) => Promise<void>) | null>(null);
    // The TEACHER's live remote-control handshake (the student they're driving).
    // Held in a ref so the connect effect's DataReceived handler can advance the
    // phase on an inbound grant/deny/revoke, and the (stable) action callbacks can
    // gate `sendControlInput` on it, without either taking it as a dep. The UI sees
    // it via `state.control`, which `recompute()` folds in from this ref — so the
    // single writer below just updates the ref and recomputes.
    const controlRef = useRef<LabControlState>({ targetUid: null, phase: "idle" });
    const setControl = useRef<(next: LabControlState) => void>(() => {});

    const [state, setState] = useState<LabRoomStateView>(() => ({
        sessionId,
        participants: [],
        connections: [],
        broadcasting: false,
        recording: false,
        spotlightUid: null,
        you: { uid: "", role: "student" },
        control: { targetUid: null, phase: "idle" },
        qualities: {},
        policy: { allowPeerShare: true, allowChat: true, recording: false },
    }));
    const [status, setStatusState] = useState<LabConnectionStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<LabChatMessage[]>([]);
    const [role, setRole] = useState<LabRole | null>(null);

    // Latest derived snapshot, mirrored into a ref so the (referentially stable)
    // action callbacks can read live fields (e.g. `spotlightUid` for a student's
    // view-permission check) without taking `state` as a dep — which would
    // rebuild the action bag on every roster change and re-render LabMap.
    const stateRef = useRef<LabRoomStateView>(state);

    /** Recompute the snapshot from the live room. Cheap; called on every event. */
    const recompute = useCallback(() => {
        const room = roomRef.current;
        if (!room) return;
        const { uid, role } = youRef.current;
        // Keep our own metadata mirror in sync with what's actually on the wire
        // (covers the case where setMetadata round-trips and re-fires the event).
        const me = room.localParticipant;
        myMetaRef.current = parseParticipantMeta(me.metadata, myMetaRef.current.seat);
        // Refresh the server-owned policy from room metadata on every recompute
        // (cheap; RoomMetadataChanged also drives one). This is the single,
        // authoritative read the peer-share + chat gates consult.
        policyRef.current = parseRoomPolicy(room.metadata);
        const base = buildRoomState(room, sessionId, uid, role, recordingRef.current);
        // If the participant we're controlling/requesting has left the room, the
        // control session is implicitly over — clear it so the UI doesn't show
        // "Controlling {ghost}". (A disconnect is an implicit revoke on both ends.)
        if (
            controlRef.current.targetUid &&
            !room.remoteParticipants.has(controlRef.current.targetUid)
        ) {
            // Clear the ref in place; we're mid-recompute, so the `next` built
            // just below already picks up the cleared value (no re-entrant call).
            controlRef.current = { targetUid: null, phase: "idle" };
        }
        // Prune the per-participant quality map to who's actually present (so a
        // departed uid doesn't linger), then fold it + the server policy in.
        const present = new Set(base.participants.map((p) => p.uid));
        const qualities: Record<string, LabConnectionQuality> = {};
        for (const u of Object.keys(qualitiesRef.current)) {
            if (present.has(u)) qualities[u] = qualitiesRef.current[u];
        }
        qualitiesRef.current = qualities;
        const next: LabRoomStateView = {
            ...base,
            control: controlRef.current,
            qualities,
            policy: policyRef.current,
        };
        // Spotlight is a room-wide directive: every client (except the spotlit
        // participant viewing their own screen) subscribes to the spotlit
        // participant's screen-share track so the UI can foreground it. This runs
        // on every recompute so a LATE joiner who reads the teacher's
        // `spotlightUid` metadata on connect also subscribes, not just the
        // clients that caught the live `spotlight` data pulse. `autoSubscribe`
        // usually has it already; this makes it explicit + robust.
        if (next.spotlightUid && next.spotlightUid !== uid) {
            const target = room.remoteParticipants.get(next.spotlightUid);
            const pub = target ? screenSharePub(target) : undefined;
            if (pub instanceof RemoteTrackPublicationClass && !pub.isSubscribed) {
                try {
                    pub.setSubscribed(true);
                } catch {
                    /* best-effort; the map still reflects the pin */
                }
            }
        }
        stateRef.current = next; // keep the action-readable mirror in lock-step
        setState(next);
    }, [sessionId]);

    /** Append one chat line to `messages`. Stable across renders. */
    const appendChat = useCallback(
        (text: string, fromUid: string, fromName: string, you: boolean) => {
            chatSeq.current += 1;
            const entry: LabChatMessage = {
                id: `${fromUid}:${chatSeq.current}`,
                fromUid,
                fromName,
                text,
                at: Date.now(),
                you,
            };
            setMessages((prev) => [...prev, entry]);
        },
        []
    );

    /**
     * Encode our participant metadata PRESERVING the server-baked identity
     * ({ sessionId, role }) in the SAME `participant.metadata` JSON that
     * `roleFromParticipant` reads. Without this, any metadata update (status /
     * share / spotlight) overwrites metadata with lab-only fields and DROPS our
     * role — so the map stops recognizing the teacher (the stage shows
     * "waiting", broadcasting reads false). The role is the token-resolved one.
     */
    const encodeIdentityMeta = useCallback(
        (m: LabParticipantMeta): string =>
            JSON.stringify({ sessionId, role: youRef.current.role, ...m }),
        [sessionId]
    );

    // ── Connect / teardown ──────────────────────────────────────────
    useEffect(() => {
        if (!sessionId) {
            setStatusState("idle");
            return;
        }
        let cancelled = false;
        // Fresh session ⇒ no recording is known yet. A late joiner learns of an
        // in-flight recording from the teacher's `record` re-announce (fired on
        // ParticipantConnected while recording) — see onParticipantJoin below.
        recordingRef.current = false;
        // Fresh connect lifecycle: clear per-session transient refs so a previous
        // session's state can't bleed across a sessionId change / Fast Refresh.
        reconnectingTokenRef.current = false;
        teardownDoneRef.current = false;
        shareInfoRef.current = null;
        sharePubRef.current = null;
        qualitiesRef.current = {};
        policyRef.current = { allowPeerShare: true, allowChat: true, recording: false };
        const room = new Room({
            adaptiveStream: true, // auto-manage subscribed video quality
            dynacast: true, // pause layers nobody is watching
        });
        roomRef.current = room;

        const setStatus_ = (s: LabConnectionStatus) => {
            if (!cancelled) setStatusState(s);
        };

        // Recompute the map on every roster/track/metadata change. One handler,
        // many events — the snapshot is fully derived so we never patch in place.
        const onChange = () => {
            if (!cancelled) recompute();
        };

        // Incoming data packets: chat is appended to `messages`; hand/status/share
        // are already reflected via the sender's metadata (which fires its own
        // ParticipantMetadataChanged), so we just nudge a recompute for them.
        const onData = (
            payload: Uint8Array,
            participant?: RemoteParticipant,
            _kind?: DataPacket_Kind,
            _topic?: string
        ) => {
            const msg = decode(payload);
            if (!msg) return;
            if (msg.t === "chat") {
                // Honour the server-owned chat policy: when chat is disabled,
                // drop inbound lines too (not just outbound) so a patched peer
                // can't inject into everyone's transcript. `decode` already
                // length-caps the text.
                if (policyRef.current.allowChat === false) return;
                appendChat(msg.text, participant?.identity ?? "?", participant?.name ?? "", false);
            } else if (msg.t === "record") {
                // The teacher toggled recording — reflect it for THIS client so the
                // room-wide "● REC" consent indicator lights up for everyone, then
                // recompute to push the flag into LabRoomState. Only a TEACHER may
                // flip this safety/consent signal: ignore a forged `record` pulse
                // from a student so a peer can't fake (or clear) the "● REC"
                // indicator for the room. The authoritative egress is server-driven.
                if (participant && roleFromParticipant(participant) !== "teacher") return;
                recordingRef.current = msg.on;
                onChange();
            } else if (
                msg.t === "ctl_grant" ||
                msg.t === "ctl_deny" ||
                msg.t === "ctl_revoke"
            ) {
                // Remote-control answers from a student's AGENT. We only care about
                // ones addressed to US (`to === my uid`) AND about the very target
                // we have a session with (`from === our targetUid`) — anything else
                // is for another teacher or a stale/foreign packet, so drop it. The
                // web never handles `ctl_req`/`ctl_in` (those are the agent's job;
                // the web student isn't the controlled party).
                const me = youRef.current.uid;
                const ctl = controlRef.current;
                if (msg.to !== me) return;
                if (!ctl.targetUid || msg.from !== ctl.targetUid) return;
                if (msg.t === "ctl_grant") {
                    setControl.current({ targetUid: ctl.targetUid, phase: "active" });
                    postEvent("control_grant", { targetUid: ctl.targetUid });
                } else if (msg.t === "ctl_deny") {
                    setControl.current({ targetUid: ctl.targetUid, phase: "denied" });
                    postEvent("control_revoke", { targetUid: ctl.targetUid });
                } else {
                    // ctl_revoke: the student ended control from their agent. Clear.
                    setControl.current({ targetUid: null, phase: "idle" });
                    postEvent("control_revoke", { targetUid: ctl.targetUid });
                }
            } else {
                // hand / status / share / spotlight — the sender's metadata is
                // authoritative (and fires its own ParticipantMetadataChanged);
                // the packet is just the low-latency nudge, so recompute. For
                // `spotlight`, recompute also triggers the subscribe-to-spotlit
                // side effect above.
                onChange();
            }
        };

        // Track (un)subscribe also flips broadcasting / share lines → recompute.
        const onTrack = (
            _track: RemoteTrack,
            _pub: RemoteTrackPublication,
            _participant: RemoteParticipant
        ) => onChange();

        const onMetadata = (_prev: string | undefined, _participant: Participant) => onChange();

        // When a new participant joins, re-announce any room-wide directives that
        // travel as one-shot data pulses (which aren't replayed to clients that
        // connect after they were sent):
        //   • `record` — so the late joiner's "● REC" consent indicator lights up
        //     (only the teacher who owns the recording re-emits);
        //   • `spotlight` — so the late joiner immediately foregrounds the pinned
        //     screen (only the teacher, who owns the spotlight, re-emits).
        // The authoritative state for both also rides the teacher's metadata
        // (which IS replayed on join), so this is belt-and-braces for latency.
        const onParticipantJoin = (_participant: RemoteParticipant) => {
            onChange();
            if (recordingRef.current) {
                void publishRef.current?.({ t: "record", on: true });
            }
            const spot = myMetaRef.current.spotlightUid;
            if (youRef.current.role === "teacher" && spot) {
                void publishRef.current?.({ t: "spotlight", uid: spot });
            }
        };

        // Per-participant link health → ref + recompute. LiveKit fires this for
        // the local user AND remotes; we map the enum to our string union and
        // store it keyed by identity (recompute prunes departed uids).
        const onQuality = (q: ConnectionQuality, p: Participant) => {
            if (cancelled || !p.identity) return;
            qualitiesRef.current = {
                ...qualitiesRef.current,
                [p.identity]: toLabQuality(q),
            };
            onChange();
        };

        /**
         * Apply the screen-share subscription permission for the CURRENT local
         * share given the live policy: when peer-share is OFF (or the share is a
         * student→teacher "view"), restrict who may subscribe to the local
         * participant's tracks to the teacher ONLY — so peers physically cannot
         * pull the screen track at the SFU even if they call setSubscribed(true).
         * When peer-share is allowed, open subscription back up. Share-to-teacher
         * always keeps working because the teacher stays whitelisted. No-op when
         * we aren't sharing. Re-callable (idempotent) — used on share start AND
         * on reconnect, since the SFU does not re-apply our permissions across a
         * full signal reconnect.
         */
        const applyShareSubscriptionPermissions = () => {
            const info = shareInfoRef.current;
            const lp = room.localParticipant;
            if (!info) {
                // Not sharing: ensure permissions are open so a later broadcast/
                // camera isn't unexpectedly restricted by a stale call.
                try {
                    lp.setTrackSubscriptionPermissions(true);
                } catch {
                    /* best-effort */
                }
                return;
            }
            const restrictToTeacher =
                policyRef.current.allowPeerShare === false || info.kind === "view";
            try {
                if (restrictToTeacher) {
                    const teacherId = findTeacherParticipant(room)?.identity;
                    if (teacherId) {
                        lp.setTrackSubscriptionPermissions(false, [
                            { participantIdentity: teacherId, allowAll: true },
                        ]);
                    } else {
                        // No teacher present to whitelist → allow none (closed),
                        // so a peer can't subscribe while peer-share is off.
                        lp.setTrackSubscriptionPermissions(false, []);
                    }
                } else {
                    lp.setTrackSubscriptionPermissions(true);
                }
            } catch {
                /* best-effort; the events-route refusal + server moderation are
                   the authoritative backstops if this client-side call fails */
            }
        };
        // Mirror into the ref so the action closures (startSharing/stopSharing)
        // can re-assert permissions without re-subscribing the room.
        applySharePermsRef.current = applyShareSubscriptionPermissions;

        /**
         * Restore our durable, non-auto-replayed state after a FULL reconnect.
         * livekit-client auto-resumes existing PUBLICATIONS (camera / screen /
         * lab-share) on a soft reconnect, so we never republish them. What does
         * NOT auto-replay and must be re-asserted: our merged metadata, the
         * one-shot teacher `record`/`spotlight` data pulses, and the share
         * subscription-permission restriction (which the SFU drops on a signal
         * reconnect). Then recompute off the now-fresh roster/metadata.
         */
        const restoreAfterReconnect = () => {
            if (cancelled) return;
            // Re-derive policy first so the permission re-assert below reads fresh.
            policyRef.current = parseRoomPolicy(room.metadata);
            // (a) re-assert our own metadata (status/seat/sharingTo/hand/spotlight).
            void room.localParticipant
                .setMetadata(encodeIdentityMeta(myMetaRef.current))
                .catch(() => {});
            // (b) teacher-owned one-shot directives that don't auto-replay.
            if (youRef.current.role === "teacher") {
                if (recordingRef.current) void publishRef.current?.({ t: "record", on: true });
                const spot = myMetaRef.current.spotlightUid;
                if (spot) void publishRef.current?.({ t: "spotlight", uid: spot });
            }
            // (c) re-apply the peer-share subscription restriction on a live share.
            applyShareSubscriptionPermissions();
            recompute();
        };

        room
            .on(RoomEvent.Connected, onChange)
            .on(RoomEvent.ParticipantConnected, onParticipantJoin)
            .on(RoomEvent.ParticipantDisconnected, onChange)
            .on(RoomEvent.TrackSubscribed, onTrack)
            .on(RoomEvent.TrackUnsubscribed, onTrack)
            .on(RoomEvent.LocalTrackPublished, onChange)
            .on(RoomEvent.LocalTrackUnpublished, onChange)
            .on(RoomEvent.ParticipantMetadataChanged, onMetadata)
            .on(RoomEvent.RoomMetadataChanged, onChange)
            .on(RoomEvent.DataReceived, onData)
            .on(RoomEvent.ConnectionQualityChanged, onQuality)
            .on(RoomEvent.Reconnecting, () => setStatus_("reconnecting"))
            .on(RoomEvent.Reconnected, () => {
                setStatus_("connected");
                restoreAfterReconnect();
            })
            .on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
                // Surface transient reconnects so the page can show a banner.
                // (Reconnecting/Reconnected above own the restore; this keeps the
                // coarse status in lock-step for any state we didn't catch.)
                if (cs === ConnectionState.Reconnecting) setStatus_("reconnecting");
                else if (cs === ConnectionState.Connected) setStatus_("connected");
            })
            .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
                if (cancelled) return;
                setStatus_("disconnected");
                onChange();
                // A clean local leave (CLIENT_INITIATED) or our own teardown is
                // terminal — do nothing. Any OTHER drop after we were connected
                // (e.g. the 4h token TTL expiring mid-lab, a transient signal
                // close auto-reconnect couldn't recover) gets ONE re-mint +
                // reconnect so a long session self-heals. `livekit-client` has no
                // dedicated TOKEN_EXPIRED reason in this version, so we re-mint on
                // any non-client-initiated disconnect (the fresh token also
                // re-resolves role against live membership server-side).
                if (reason === DisconnectReason.CLIENT_INITIATED) return;
                if (reconnectingTokenRef.current) return; // a re-mint already in flight
                reconnectingTokenRef.current = true;
                (async () => {
                    try {
                        setStatus_("connecting");
                        const tok = await mintToken(sessionId);
                        if (cancelled) return;
                        youRef.current = { uid: tok.identity, role: tok.role };
                        await room.connect(tok.url, tok.token, { autoSubscribe: true });
                        if (cancelled) {
                            void room.disconnect();
                            return;
                        }
                        setStatus_("connected");
                        restoreAfterReconnect();
                    } catch (e: unknown) {
                        if (cancelled) return;
                        setError(
                            e instanceof Error ? e.message : "Lost connection to the lab."
                        );
                        setStatus_("error");
                    } finally {
                        reconnectingTokenRef.current = false;
                    }
                })();
            });

        (async () => {
            try {
                setStatus_("connecting");
                setError(null);
                const tok = await mintToken(sessionId);
                if (cancelled) return;

                youRef.current = { uid: tok.identity, role: tok.role };
                setRole(tok.role);

                // Connect to the SFU. We use the token's `url` (mirrors
                // NEXT_PUBLIC_LIVEKIT_URL) and auto-subscribe so the map reflects
                // every published track without per-track plumbing.
                await room.connect(tok.url, tok.token, { autoSubscribe: true });
                if (cancelled) {
                    // Effect was torn down mid-connect: disconnect and bail.
                    void room.disconnect();
                    return;
                }

                // Seed the server-owned policy from the now-available ROOM
                // metadata (authoritative + unskippable). RoomMetadataChanged +
                // every recompute keep it fresh thereafter; `shareToPeer`/
                // `sendChat` gate on it. Falls back permissive if the control
                // plane hasn't stamped a policy (older room) — the server grant +
                // server-side moderation are the hard boundary.
                policyRef.current = parseRoomPolicy(room.metadata);

                // Seed our own metadata: keep the seat the server assigned (it's in
                // the token-baked metadata) and reset transient fields. setMetadata
                // requires the canUpdateOwnMetadata grant (the token route sets it).
                const seeded = parseParticipantMeta(
                    room.localParticipant.metadata,
                    tok.role === "teacher" ? 0 : 1
                );
                myMetaRef.current = seeded;
                // (No write needed if metadata already present; only push if empty.)
                if (!room.localParticipant.metadata) {
                    await room.localParticipant.setMetadata(encodeIdentityMeta(seeded));
                }

                setStatus_("connected");
                recompute();
                postEvent("join");
            } catch (e: unknown) {
                if (cancelled) return;
                const message = e instanceof Error ? e.message : "Failed to join the lab.";
                setError(message);
                setStatus_("error");
            }
        })();

        // Cleanup: leave the room + drop every listener. `removeAllListeners`
        // guards against leaks across Fast Refresh / sessionId changes. Made
        // IDEMPOTENT via `teardownDoneRef` so a doubled teardown (Strict-Mode /
        // Fast Refresh racing a sessionId change) can't double-disconnect or
        // double-post the `leave` event.
        return () => {
            cancelled = true;
            if (teardownDoneRef.current) return;
            teardownDoneRef.current = true;
            reconnectingTokenRef.current = false;
            applySharePermsRef.current = null;
            postEvent("leave");
            try {
                room.removeAllListeners();
                void room.disconnect();
            } catch {
                /* already gone */
            }
            if (roomRef.current === room) roomRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]); // recompute/appendChat are stable for a given sessionId

    // ── Metadata mutation helper ─────────────────────────────────────
    /**
     * Merge a partial change into our own metadata and push the full blob to
     * LiveKit (setMetadata replaces wholesale, so we always send the merge).
     * Returns the new metadata so callers can act on it.
     */
    const patchMyMeta = useCallback(
        async (patch: Partial<LabParticipantMeta>): Promise<LabParticipantMeta> => {
            const next: LabParticipantMeta = { ...myMetaRef.current, ...patch };
            myMetaRef.current = next;
            const room = roomRef.current;
            if (room && room.state === ConnectionState.Connected) {
                await room.localParticipant.setMetadata(encodeIdentityMeta(next));
                recompute(); // reflect our own change immediately (no echo wait)
            }
            return next;
        },
        [recompute, encodeIdentityMeta]
    );

    /**
     * Publish a data packet to the room (reliable). No-op until connected.
     * Pass `to` (one or more identities) to DIRECT the packet at specific
     * participants instead of broadcasting — used for the point-to-point
     * remote-control handshake + input so control traffic never fans out to the
     * whole room (the embedded `from`/`to` are still the authoritative check;
     * this is the transport-level narrowing). `reliable` defaults true; the
     * high-frequency `ctl_in` path passes `reliable:false` (lossy/UDP-like) so a
     * dropped cursor sample doesn't head-of-line-block the next one.
     */
    const publish = useCallback(
        async (msg: LabDataMsg, opts?: { to?: string | string[]; reliable?: boolean }) => {
            const room = roomRef.current;
            if (!room || room.state !== ConnectionState.Connected) return;
            const destinationIdentities = opts?.to
                ? Array.isArray(opts.to)
                    ? opts.to
                    : [opts.to]
                : undefined;
            // livekit-client v2: publishData(data, { reliable, destinationIdentities? }).
            // Reliable (default) so hand/status/chat/share/record/handshake signals
            // can't silently drop; lossy for the streamed input path.
            await room.localParticipant.publishData(encode(msg), {
                reliable: opts?.reliable ?? true,
                ...(destinationIdentities ? { destinationIdentities } : {}),
            });
        },
        []
    );
    // Mirror `publish` into a ref so the connect effect's handlers can reach the
    // current impl without re-subscribing the room on every render.
    useEffect(() => {
        publishRef.current = publish;
    }, [publish]);

    // The single writer for the control slice: update the ref (handlers + actions
    // read it) and recompute, which calls setState with the folded-in `control`
    // so the UI re-renders. Stored in a ref so the connect effect's inbound
    // handler can call it without taking it as a dep.
    useEffect(() => {
        setControl.current = (next: LabControlState) => {
            controlRef.current = next;
            recompute();
        };
    }, [recompute]);

    // ── Actions ──────────────────────────────────────────────────────
    const actions = useMemo<LabRoomActions>(() => {
        const localParticipant = () => roomRef.current?.localParticipant ?? null;

        // Build a LabVideoHandle around a participant's track publication.
        const videoHandle = (
            uid: string,
            source: "camera" | "screen"
        ): LabVideoHandle | null => {
            const room = roomRef.current;
            if (!room) return null;
            const p: Participant | undefined =
                room.localParticipant.identity === uid
                    ? room.localParticipant
                    : room.remoteParticipants.get(uid);
            if (!p) return null;
            // Screen lookups go through `screenSharePub` so we resolve the named
            // `lab-share` / `lab-broadcast` track too, not just source-keyed.
            const pub: TrackPublication | undefined =
                source === "screen"
                    ? screenSharePub(p)
                    : p.getTrackPublication(Track.Source.Camera);
            const track = pub?.track;
            if (!track) return null;
            return {
                uid,
                source,
                // LiveKit's Track.attach(el?) binds the MediaStream to `el` (or
                // creates+returns a fresh element when none is passed).
                attach: (el?: HTMLMediaElement) =>
                    el ? track.attach(el) : track.attach(),
                // detach(el) unbinds one element; detach() unbinds them all.
                detach: (el?: HTMLMediaElement) => {
                    if (el) track.detach(el);
                    else track.detach();
                },
            };
        };

        /**
         * Publish the local screen as the STUDENT `lab-share` track and announce
         * the share. Uses createLocalScreenTracks + publishTrack with a DISTINCT
         * name/source so it never collides with the teacher's broadcast track,
         * and stashes the publication so stopSharing can unpublish exactly it.
         * Re-targeting an existing share (e.g. add a peer) reuses the live track
         * and only updates metadata + re-announces — no second getDisplayMedia
         * prompt. Throws if the user cancels the OS picker so the caller can
         * surface it; metadata is only set once a track is actually live.
         */
        const startSharing = async (kind: LabShareKind, targets: string[]) => {
            const lp = localParticipant();
            if (!lp) return;

            // Already sharing? Just re-aim: update targets + re-announce, keep the
            // live track (avoids a fresh OS capture prompt). Re-record the share
            // info + re-assert the subscription restriction (the audience may have
            // changed view↔peer, and the teacher to whitelist may differ).
            if (sharePubRef.current && sharePubRef.current.track) {
                shareInfoRef.current = { kind, targets };
                await patchMyMeta({ sharingTo: targets, status: "sharing" });
                applySharePermsRef.current?.();
                await publish({ t: "share", kind, targets, on: true });
                postEvent("share_start", { meta: { kind, targets } });
                return;
            }

            // Capture the display. getDisplayMedia (inside createLocalScreenTracks)
            // throws/ rejects if the user dismisses the picker — let it propagate
            // so we DON'T flip metadata to "sharing" for a share that never began.
            const tracks = await createLocalScreenTracks({ audio: false });
            const screenTrack = tracks.find((t) => t.kind === Track.Kind.Video) ?? tracks[0];
            if (!screenTrack) {
                // Nothing usable came back; stop any stray tracks and bail.
                tracks.forEach((t) => t.stop());
                return;
            }
            // Publish under the distinct lab-share name; simulcast off (screen
            // content wants full-res, single layer) — matches LiveKit guidance.
            const pub = await lp.publishTrack(screenTrack, {
                name: LAB_SHARE_TRACK_NAME,
                source: Track.Source.ScreenShare,
                simulcast: false,
            });
            sharePubRef.current = pub;
            shareInfoRef.current = { kind, targets };

            // COMPLIANCE: restrict who may SUBSCRIBE to our just-published screen
            // track BEFORE we announce it. When peer-share is off (or this is a
            // student→teacher "view"), only the teacher is whitelisted, so peers
            // physically cannot pull the track at the SFU even if they ignore the
            // UI and call setSubscribed(true). Share-to-teacher keeps working
            // because the teacher stays whitelisted. The server grant + the
            // events-route peer-share refusal + server-side moderation remain the
            // authoritative backstops; this is the media-layer enforcement.
            applySharePermsRef.current?.();

            // If the user clicks the browser's native "Stop sharing" chrome, the
            // track ends out-of-band — tear our state down so the map + metadata
            // don't claim a share that's gone.
            screenTrack.mediaStreamTrack.addEventListener("ended", () => {
                void stopSharing();
            });

            await patchMyMeta({ sharingTo: targets, status: "sharing" });
            await publish({ t: "share", kind, targets, on: true });
            postEvent("share_start", { meta: { kind, targets } });
        };

        /**
         * Teacher → student-agent: ask for remote control of `uid`'s machine.
         * Defined as a local closure (like startSharing/stopSharing) so the
         * back-compat `requestRemoteAssist` shim can reuse it without reaching
         * into the not-yet-built `actions` object. No-op for non-teachers / self /
         * an absent target; supersedes any in-flight session.
         */
        const requestControl = (uid: string) => {
            if (youRef.current.role !== "teacher") return;
            const room = roomRef.current;
            const me = youRef.current.uid;
            if (!uid || uid === me || !room?.remoteParticipants.has(uid)) return;

            const prev = controlRef.current.targetUid;
            if (prev && prev !== uid) {
                void publish(controlRevoke(me, prev), { to: prev });
            }
            setControl.current({ targetUid: uid, phase: "requested" });
            void publish(controlRequest(me, uid), { to: uid });
            postEvent("control_request", { targetUid: uid });
        };

        const stopSharing = async () => {
            const lp = localParticipant();
            const prevTargets = myMetaRef.current.sharingTo;
            // Unpublish exactly our lab-share track (stop=true releases the OS
            // capture); never touches the camera or anyone else's track.
            const pub = sharePubRef.current;
            sharePubRef.current = null;
            shareInfoRef.current = null;
            if (lp && pub?.track) {
                try {
                    await lp.unpublishTrack(pub.track, true);
                } catch {
                    /* track may already be gone (native stop / disconnect) */
                }
            }
            // Re-open our track subscription permissions now that the restricted
            // share is gone, so a later broadcast/camera isn't left locked to the
            // teacher-only whitelist from the previous share. No-op when there's
            // no share (the helper checks shareInfoRef, now null).
            applySharePermsRef.current?.();
            // Only meaningful if we actually had a share up; clear targets + reset
            // status, then announce the teardown.
            await patchMyMeta({ sharingTo: [], status: "on_task" });
            await publish({ t: "share", kind: "view", targets: prevTargets, on: false });
            if (prevTargets.length > 0) {
                postEvent("share_end", { meta: { targets: prevTargets } });
            }
        };

        return {
            // ── Core realtime contract ──
            startBroadcast: async () => {
                const lp = localParticipant();
                if (!lp) return;
                // The SCREEN is the broadcast — publish it FIRST and on its own so
                // a missing/denied camera can't abort the share. Screen audio is
                // best-effort: macOS frequently can't capture it and forcing it
                // (`{ audio: true }`) can fail the whole publish, so we don't.
                await lp.setScreenShareEnabled(true);
                // Camera rides along best-effort; the teacher can toggle it off via
                // setCamera. A camera error must NOT break the screen broadcast.
                try {
                    await lp.setCameraEnabled(true);
                } catch {
                    /* no camera / permission denied — the screen broadcast still goes */
                }
                await patchMyMeta({ status: "sharing" });
                postEvent("share_start", { meta: { kind: "broadcast" } });
                recompute();
            },
            stopBroadcast: async () => {
                const lp = localParticipant();
                if (!lp) return;
                await lp.setScreenShareEnabled(false);
                try {
                    await lp.setCameraEnabled(false);
                } catch {
                    /* camera may already be off */
                }
                await patchMyMeta({ status: "on_task" });
                postEvent("share_end", { meta: { kind: "broadcast" } });
                recompute();
            },
            setCamera: async (on: boolean) => {
                const lp = localParticipant();
                if (!lp) return;
                try {
                    await lp.setCameraEnabled(on);
                } catch {
                    /* best-effort: no camera / permission denied */
                }
                recompute();
            },
            endSession: async () => {
                // Teacher-only. End the session server-side (PATCH action:'end'),
                // then stop our local media + leave the room. The page navigates
                // away once this resolves.
                if (youRef.current.role !== "teacher") return;
                const lp = localParticipant();
                if (lp) {
                    try {
                        await lp.setScreenShareEnabled(false);
                        await lp.setCameraEnabled(false);
                    } catch {
                        /* best-effort local cleanup */
                    }
                }
                await endSessionApi(sessionId);
                try {
                    await roomRef.current?.disconnect();
                } catch {
                    /* already gone */
                }
            },
            setStatus: async (s: LabStatus) => {
                await patchMyMeta({ status: s });
                await publish({ t: "status", status: s });
            },
            raiseHand: async () => {
                const at = Date.now();
                await patchMyMeta({ handRaisedAt: at, status: "needs_help" });
                await publish({ t: "hand", raised: true });
                postEvent("hand_raise");
            },
            lowerHand: async () => {
                await patchMyMeta({ handRaisedAt: null });
                await publish({ t: "hand", raised: false });
                postEvent("hand_lower");
            },
            sendChat: async (text: string) => {
                // Honour the server-owned chat policy (read off room metadata):
                // when chat is disabled, sending is a no-op. The inbound handler
                // drops incoming lines symmetrically.
                if (policyRef.current.allowChat === false) return;
                const trimmed = text.trim();
                if (!trimmed) return;
                // Hard-cap the outbound line to the same bound `decode` enforces,
                // so we never put an oversize string on the reliable channel.
                const capped =
                    trimmed.length > LAB_MAX_CHAT_LEN ? trimmed.slice(0, LAB_MAX_CHAT_LEN) : trimmed;
                await publish({ t: "chat", text: capped });
                // Optimistically echo our own line (publishData doesn't loop back).
                appendChat(capped, youRef.current.uid, localParticipant()?.name ?? "You", true);
            },
            getVideoTrack: (uid: string, source?: "camera" | "screen") => {
                // Default: prefer a live screen share, else the camera.
                if (source) return videoHandle(uid, source);
                return videoHandle(uid, "screen") ?? videoHandle(uid, "camera");
            },

            // ── Sharing ──
            shareToTeacher: async () => {
                // Resolve the teacher from the LIVE roster (not React state) so this
                // callback stays referentially stable and doesn't re-render the map.
                const room = roomRef.current;
                const teacherUid = room ? findTeacherParticipant(room)?.identity : undefined;
                // No teacher in the room ⇒ nothing to show; no-op (resolves).
                if (!teacherUid) return;
                await startSharing("view", [teacherUid]);
            },
            shareToPeer: async (targets: string | string[]) => {
                // Gate on the SERVER-OWNED policy read off the LiveKit room
                // metadata (not a skippable HTTP fetch / local-only boolean):
                // peer share is a no-op + friendly error when it's disabled. This
                // is the UX guard; the media-layer enforcement is the teacher-only
                // subscription permission applied in startSharing, and the
                // server-authoritative backstops are the events-route refusal +
                // server-side moderation.
                if (policyRef.current.allowPeerShare === false) {
                    throw new Error("Peer-to-peer screen sharing is turned off for this lab.");
                }
                const list = (Array.isArray(targets) ? targets : [targets]).filter(
                    (uid): uid is string => typeof uid === "string" && uid.length > 0
                );
                if (list.length === 0) return;
                await startSharing("peer", list);
            },
            stopSharing,

            // ── Viewing / spotlight ──
            viewScreen: (uid: string): LabVideoHandle | null => {
                const room = roomRef.current;
                if (!room || !uid || uid === youRef.current.uid) return null;
                const target = room.remoteParticipants.get(uid);
                if (!target) return null;

                // Permission: a teacher may view ANY participant; a student may
                // only view a peer who is sharing TO them or who is spotlit.
                const iAmTeacher = youRef.current.role === "teacher";
                if (!iAmTeacher) {
                    const meta = parseParticipantMeta(target.metadata, 0);
                    const sharedToMe = meta.sharingTo.includes(youRef.current.uid);
                    const isSpotlit = stateRef.current.spotlightUid === uid;
                    if (!sharedToMe && !isSpotlit) return null;
                }

                // Ensure we're subscribed to their screen-share track (autoSubscribe
                // usually has it; make it explicit so a paused/dynacast layer
                // resumes), then mark ourselves "watching" + emit the audit signal.
                const pub = screenSharePub(target);
                if (pub instanceof RemoteTrackPublicationClass && !pub.isSubscribed) {
                    try {
                        pub.setSubscribed(true);
                    } catch {
                        /* best-effort */
                    }
                }
                void patchMyMeta({ status: "watching" });
                postEvent("feedback", { targetUid: uid, meta: { action: "view_screen" } });

                // Return a handle for immediate <video> attach. May be null for a
                // beat until the track lands; the caller can re-query via
                // getVideoTrack(uid, "screen") on the next TrackSubscribed.
                return videoHandle(uid, "screen");
            },
            spotlight: (uid: string | null) => {
                // TEACHER-only, room-wide. Non-teachers no-op.
                if (youRef.current.role !== "teacher") return;
                const room = roomRef.current;
                // Resolve to a uid we can actually pin (a present remote, or the
                // teacher themselves), else clear. Guards against pinning a ghost.
                const present =
                    !!uid &&
                    (uid === youRef.current.uid || !!room?.remoteParticipants.has(uid));
                const next = present ? uid : null;
                // Carry via the teacher's metadata (authoritative + replayed to
                // late joiners) AND a low-latency data pulse to the whole room.
                void patchMyMeta({ spotlightUid: next });
                void publish({ t: "spotlight", uid: next });
                postEvent("spotlight", { targetUid: next ?? undefined });
            },
            // ── Remote control (teacher → a student's desktop agent) ──
            requestControl,
            endControl: () => {
                // Stop driving / cancel a pending request. Idempotent.
                const ctl = controlRef.current;
                if (!ctl.targetUid) {
                    if (ctl.phase !== "idle") {
                        setControl.current({ targetUid: null, phase: "idle" });
                    }
                    return;
                }
                const me = youRef.current.uid;
                void publish(controlRevoke(me, ctl.targetUid), { to: ctl.targetUid });
                postEvent("control_revoke", { targetUid: ctl.targetUid });
                setControl.current({ targetUid: null, phase: "idle" });
            },
            sendControlInput: (ev: LabControlInputEvent) => {
                // Only stream input while a grant is ACTIVE — the agent also drops
                // anything without an active grant, but we never put input on the
                // wire before the student consented. Directed + lossy (the input
                // path is high-frequency; a dropped sample mustn't stall the next).
                const ctl = controlRef.current;
                if (ctl.phase !== "active" || !ctl.targetUid) return;
                void publish(controlInput(ctl.targetUid, ev), {
                    to: ctl.targetUid,
                    reliable: false,
                });
            },
            requestRemoteAssist: (targetUid?: string) => {
                // Back-compat shim for the existing shell. Forward to the real
                // handshake when we have a concrete target; otherwise just mirror
                // the legacy audit event so nothing regresses.
                if (targetUid) requestControl(targetUid);
                else postEvent("control_request", {});
            },
            startRecording: async () => {
                // Optimistically light up "● REC" for the whole room: flip the
                // local flag, recompute, and broadcast the `record` pulse so every
                // peer's indicator lights up immediately. Then POST to the control
                // plane (which fires Egress + writes the `record_start` audit event
                // server-side — so we don't postEvent here too). On failure, roll
                // the flag back and re-broadcast the corrected (off) state.
                if (recordingRef.current) return; // already recording — no-op
                recordingRef.current = true;
                recompute();
                await publish({ t: "record", on: true });
                try {
                    await recordingApi(sessionId, "start");
                } catch (e) {
                    recordingRef.current = false;
                    recompute();
                    await publish({ t: "record", on: false });
                    throw e;
                }
            },
            stopRecording: async () => {
                // Mirror of startRecording: optimistically clear, tell the room,
                // POST stop. On failure restore the (on) state so the indicator
                // keeps reflecting the still-running egress.
                if (!recordingRef.current) return; // not recording — no-op
                recordingRef.current = false;
                recompute();
                await publish({ t: "record", on: false });
                try {
                    await recordingApi(sessionId, "stop");
                } catch (e) {
                    recordingRef.current = true;
                    recompute();
                    await publish({ t: "record", on: true });
                    throw e;
                }
            },
            respondConsent: (kind: "record" | "control", accept: boolean) => {
                // Map onto the LabEventType audit vocabulary: control has explicit
                // grant/revoke events; record reuses its start/stop boundaries.
                const type =
                    kind === "control"
                        ? accept
                            ? "control_grant"
                            : "control_revoke"
                        : accept
                          ? "record_start"
                          : "record_stop";
                postEvent(type);
            },
        };
        // `state.participants` is intentionally NOT a dep: every action resolves
        // live data from `roomRef`, so the action bag stays referentially stable
        // and never re-renders LabMap on a roster change. `sessionId` IS a dep —
        // the recording actions POST to a session-scoped route.
    }, [appendChat, patchMyMeta, publish, recompute, sessionId]);

    return {
        state,
        actions,
        status,
        connected: status === "connected",
        error,
        messages,
        role,
    };
}
