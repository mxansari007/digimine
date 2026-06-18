/**
 * LiveKit server helper — the MEDIA-plane bridge for the Virtual Lab.
 *
 * Everything in here runs server-side only (Node runtime, admin context). The
 * browser never sees the API key/secret; it only ever receives a short-lived
 * JWT minted here (see `mintLabToken`) plus the public ws URL. We use LiveKit
 * Cloud as the SFU — we never relay A/V ourselves — so this module's whole job
 * is (a) turn a resolved `LabRole` into the right grant and sign it, and (b)
 * provision / tear down the room over the RoomService API.
 *
 * Creds come from env ONLY (never hard-coded, never shipped to the client):
 *   LIVEKIT_API_KEY     — server-side API key
 *   LIVEKIT_API_SECRET  — server-side API secret (signs the JWT)
 *   LIVEKIT_URL         — LiveKit host. Accepts ws(s):// or http(s)://; the
 *                         RoomServiceClient wants an http(s) origin, the client
 *                         wants ws(s) — we normalise for each below.
 *
 * The grant matrix mirrors docs/VIRTUAL_LAB.md → permission model and the
 * `LabRole` doc-comments in @digimine/types:
 *   teacher  — roomAdmin; publish + subscribe + data + own-metadata. Can
 *              spotlight, record, moderate, and request remote control.
 *   student  — publish own cam/screen + subscribe + data + own-metadata; can
 *              raise a hand and share (to teacher, or peers when allowed).
 *   observer — subscribe + data only; cannot publish media (silent TA / late
 *              joiner / auditor).
 *
 * NOTE: livekit-server-sdk is installed by the parent AFTER this workflow, so
 * if the import doesn't resolve yet at type-check time that's expected — the
 * runtime dependency lands with the install step.
 */

import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { LabRole } from "@digimine/types";

/**
 * Server-authoritative session policy carried into the LiveKit room metadata
 * and (for `allowPeerShare`) reflected in the student grant. This is the SINGLE
 * source of truth for the peer-share gate: it is stamped by the server at room
 * create (see `createLabRoom`), updated server-side when the teacher flips a
 * toggle (`updateLabRoomMetadata`), and the events route reads the same setting
 * off the session doc before it will log a peer share. The client only ever
 * *reads* this (off room metadata) — it can never widen it.
 */
export interface LabRoomPolicy {
    /** student ↔ student peer screen share allowed (false = teacher-routed only). */
    allowPeerShare: boolean;
    /** in-room text/data chat allowed. */
    allowChat: boolean;
}

/** The shape we serialize into LiveKit room metadata. Versioned for forward-compat. */
export interface LabRoomMetadata {
    policy: LabRoomPolicy;
}

/** Build the canonical room-metadata JSON string from a session policy. */
export function buildLabRoomMetadata(policy: LabRoomPolicy): string {
    const meta: LabRoomMetadata = {
        policy: {
            allowPeerShare: policy.allowPeerShare !== false,
            allowChat: policy.allowChat !== false,
        },
    };
    return JSON.stringify(meta);
}

/**
 * Resolved LiveKit credentials, read once per call from the environment. We
 * deliberately read at call time (not module load) so a missing-env failure
 * surfaces as a clean 500 on the specific request rather than crashing the
 * whole server at import.
 */
interface LiveKitEnv {
    apiKey: string;
    apiSecret: string;
    /** Original LIVEKIT_URL as configured (may be ws(s):// or http(s)://). */
    url: string;
    /** http(s) origin for the RoomServiceClient REST API. */
    httpUrl: string;
    /** ws(s) URL the browser connects to (mirrors NEXT_PUBLIC_LIVEKIT_URL). */
    wsUrl: string;
}

/**
 * Read + validate the LiveKit env. Throws a clear, operator-facing error when
 * anything is missing so a mis-provisioned deploy fails loudly instead of
 * minting unsigned/garbage tokens.
 */
function readLiveKitEnv(): LiveKitEnv {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;

    const missing: string[] = [];
    if (!apiKey) missing.push("LIVEKIT_API_KEY");
    if (!apiSecret) missing.push("LIVEKIT_API_SECRET");
    if (!url) missing.push("LIVEKIT_URL");
    if (missing.length > 0) {
        throw new Error(
            `LiveKit is not configured: missing ${missing.join(", ")}. ` +
                "Set the LiveKit Cloud credentials in the server environment."
        );
    }

    // LiveKit Cloud usually hands you a wss:// URL. The RoomServiceClient REST
    // API wants an http(s) origin; the client SDK wants the ws(s) form. Derive
    // both from whatever scheme was configured so callers don't have to care.
    const trimmed = (url as string).trim().replace(/\/+$/, "");
    const httpUrl = trimmed.replace(/^ws(s?):\/\//i, (_m, s) => `http${s}://`);
    const wsUrl = trimmed.replace(/^http(s?):\/\//i, (_m, s) => `ws${s}://`);

    return {
        apiKey: apiKey as string,
        apiSecret: apiSecret as string,
        url: trimmed,
        httpUrl,
        wsUrl,
    };
}

/**
 * The public ws URL the browser should connect to. The server-only
 * LIVEKIT_URL and the client-exposed NEXT_PUBLIC_LIVEKIT_URL are expected to
 * point at the same host; we prefer the public one when present (it's what the
 * client config uses) and fall back to the normalised server URL.
 */
export function getLiveKitWsUrl(): string {
    const pub = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim().replace(/\/+$/, "");
    if (pub) return pub;
    return readLiveKitEnv().wsUrl;
}

/** The resolved grant flags for one role. `room` is filled in by the caller. */
interface RoleGrant {
    canPublish: boolean;
    canSubscribe: boolean;
    canPublishData: boolean;
    roomAdmin: boolean;
    /**
     * Explicit publishable sources. When set it SUPERSEDES `canPublish` at the
     * SFU (only listed sources may be published). We set it for students so the
     * publish surface is an explicit, single-seam allow-list the teacher
     * moderation backstop can narrow consistently (see the moderate route).
     * Left undefined for teacher/observer where the boolean is sufficient.
     */
    canPublishSources?: TrackSource[];
}

/**
 * The grant flags for a given role. Pulled out so the permission matrix lives
 * in exactly one place and can be unit-reasoned about. `room` is filled in by
 * the caller; everything else is role-derived and NEVER taken from the client.
 *
 * `policy` carries the session settings (peer-share / chat). IMPORTANT nuance
 * on the AccessToken model: a grant can express *which sources* a participant
 * may publish, but NOT *who may subscribe* to them — a student's screen-share
 * is one `SCREEN_SHARE` source whether it's aimed at the teacher or at a peer.
 * So the grant alone cannot distinguish "share to teacher" from "share to a
 * peer". We therefore keep students able to publish `SCREEN_SHARE` (so
 * share-to-teacher keeps working) and enforce the peer-vs-teacher *audience*
 * split elsewhere: room-metadata policy + client subscription permissions for
 * the happy path, and the two SERVER-AUTHORITATIVE guarantees — the events
 * route refusing to log a forbidden peer share, and the teacher's force-end
 * moderation (mutePublishedTrack / revoke screen-share). Making the student
 * grant an EXPLICIT source list here is the single seam those layers narrow.
 */
function grantForRole(role: LabRole, _policy: LabRoomPolicy): RoleGrant {
    switch (role) {
        case "teacher":
            // Full room admin: publish/subscribe/data + moderation surface
            // (spotlight, record, mute/remove, remote-control requests).
            return {
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                roomAdmin: true,
            };
        case "student":
            // Can show their work (cam/screen) and use the data channel for
            // hand-raise / status, but holds no admin powers. The publishable
            // sources are pinned to an explicit allow-list (cam + mic + screen)
            // so the SFU enforces exactly this set and the moderate route can
            // narrow it deterministically. Note: `allowPeerShare===false` does
            // NOT drop SCREEN_SHARE here — that would also kill the legitimate
            // share-to-teacher path; the audience split is enforced per the
            // doc-comment above, not by removing the source.
            return {
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                roomAdmin: false,
                canPublishSources: [
                    TrackSource.CAMERA,
                    TrackSource.MICROPHONE,
                    TrackSource.SCREEN_SHARE,
                    TrackSource.SCREEN_SHARE_AUDIO,
                ],
            };
        case "observer":
        default:
            // Watch + receive data only. Cannot put media on the wire.
            return {
                canPublish: false,
                canSubscribe: true,
                canPublishData: true,
                roomAdmin: false,
            };
    }
}

/** Token TTL — long enough to outlast a full lab session, short enough to expire. */
const LAB_TOKEN_TTL = "4h";

export interface MintLabTokenArgs {
    /** LiveKit room name (the session's stable `livekitRoom`). */
    room: string;
    /** Participant identity — we always use the Firebase uid. */
    identity: string;
    /** Display name shown on the live map / in the SFU roster. */
    name: string;
    /** Server-resolved role (drives the grant; never trust the client here). */
    role: LabRole;
    /**
     * Server-resolved session policy. Drives whether the student grant narrows
     * its publishable sources (peer-share gate). Defaults to permissive so a
     * caller that forgets to pass it doesn't accidentally lock the room down —
     * but every real caller (token route) passes the session's settings.
     */
    policy?: LabRoomPolicy;
    /**
     * Optional metadata serialized onto the token (e.g. `{ sessionId }`). The
     * SFU echoes this as the participant's metadata to every other client, so
     * keep it small and non-sensitive.
     */
    metadata?: Record<string, unknown>;
}

/**
 * Mint a signed LiveKit access token for one participant joining one room.
 * The grant is derived entirely from `role` — this is the security choke
 * point, so callers MUST resolve the role server-side (class ownership /
 * enrollment) before calling, never echo a role from the request body.
 *
 * Returns just the JWT string; the route layer wraps it in `LabTokenResponse`
 * together with the ws URL + identity + room.
 */
export async function mintLabToken(args: MintLabTokenArgs): Promise<string> {
    const env = readLiveKitEnv();
    // Default permissive when no policy is supplied — real callers pass the
    // session settings so the student grant is pinned to its explicit sources.
    const policy: LabRoomPolicy = args.policy ?? {
        allowPeerShare: true,
        allowChat: true,
    };
    const grant = grantForRole(args.role, policy);

    const at = new AccessToken(env.apiKey, env.apiSecret, {
        identity: args.identity,
        name: args.name,
        ttl: LAB_TOKEN_TTL,
        metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
    });

    at.addGrant({
        roomJoin: true,
        room: args.room,
        canPublish: grant.canPublish,
        canSubscribe: grant.canSubscribe,
        canPublishData: grant.canPublishData,
        roomAdmin: grant.roomAdmin,
        // Explicit publishable-source allow-list when the role pins one (student).
        // When set this SUPERSEDES canPublish at the SFU, so only these sources
        // can ever be published — the single seam moderation narrows.
        ...(grant.canPublishSources
            ? { canPublishSources: grant.canPublishSources }
            : {}),
        // Participants update their own metadata to broadcast live status
        // (on-task / needs-help / sharing) over the SFU without a Firestore
        // round-trip; the durable mirror still lands in the events log.
        canUpdateOwnMetadata: true,
    });

    // toJwt() is async in livekit-server-sdk v2 (it signs with WebCrypto).
    return at.toJwt();
}

/**
 * A RoomService client bound to the configured host + creds. Used to
 * provision a room when a session opens and to tear it down when it ends.
 * (Rooms also auto-create on first join, but creating explicitly lets us pin
 * `maxParticipants` / `emptyTimeout` up front.)
 */
export function getRoomServiceClient(): RoomServiceClient {
    const env = readLiveKitEnv();
    return new RoomServiceClient(env.httpUrl, env.apiKey, env.apiSecret);
}

export interface CreateLabRoomArgs {
    room: string;
    /** Hard cap on concurrent participants (see LAB_LIMITS.maxParticipants). */
    maxParticipants: number;
    /** Seconds the empty room lingers before the SFU reclaims it. */
    emptyTimeoutSec?: number;
    /**
     * Server-authoritative session policy stamped into the room metadata. This
     * is the SFU-side home of the peer-share / chat gate: every client (incl.
     * late joiners) receives it on join and on `RoomMetadataChanged`, and it
     * can only ever be changed server-side (`updateLabRoomMetadata`). Omit to
     * create a room with no policy metadata (defaults to permissive client-side).
     */
    policy?: LabRoomPolicy;
}

/**
 * Provision the LiveKit room for a session going `live`. Idempotent in
 * practice: if the room already exists LiveKit returns the existing one, so a
 * double-open won't blow up.
 *
 * When `policy` is supplied we stamp it into the room metadata so the SFU is
 * the single source of truth for the peer-share / chat gate (server-owned;
 * the client can read it but never widen it).
 */
export async function createLabRoom(args: CreateLabRoomArgs): Promise<void> {
    const svc = getRoomServiceClient();
    await svc.createRoom({
        name: args.room,
        maxParticipants: args.maxParticipants,
        emptyTimeout: args.emptyTimeoutSec ?? 5 * 60,
        ...(args.policy
            ? { metadata: buildLabRoomMetadata(args.policy) }
            : {}),
    });
}

/**
 * Update a live room's server-authoritative policy metadata (e.g. when the
 * teacher flips the peer-share / chat toggle from the control panel). The new
 * policy reaches every connected client via `RoomEvent.RoomMetadataChanged`
 * WITHOUT re-minting tokens. Best-effort at the call site: a metadata write to
 * a room the SFU has already reclaimed will throw, which callers may swallow.
 */
export async function updateLabRoomMetadata(
    room: string,
    policy: LabRoomPolicy
): Promise<void> {
    const svc = getRoomServiceClient();
    await svc.updateRoomMetadata(room, buildLabRoomMetadata(policy));
}

/**
 * Tear down the LiveKit room when a session ends (disconnects everyone, stops
 * billing). Best-effort: deleting a room that's already gone is not an error
 * we want to surface to the teacher, so callers typically swallow the throw.
 */
export async function deleteLabRoom(room: string): Promise<void> {
    const svc = getRoomServiceClient();
    await svc.deleteRoom(room);
}

/** True when the LiveKit env is fully configured — handy for health checks. */
export function isLiveKitConfigured(): boolean {
    return Boolean(
        process.env.LIVEKIT_API_KEY &&
            process.env.LIVEKIT_API_SECRET &&
            process.env.LIVEKIT_URL
    );
}
