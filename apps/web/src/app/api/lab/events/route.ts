import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    LAB_EVENTS,
    getLabSessionById,
    labPolicyFromSession,
    labSessionRef,
    resolveClassLabRole,
} from "@/lib/server/labStore";
import { rateLimit } from "@/lib/server/ratelimit";
import { LAB_LIMITS, type LabEventType } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The audit-log vocabulary, mirrored from `LabEventType`. The live data channel
 * carries these for latency; this route is the durable, append-only mirror that
 * backs the consent trail + replay chapter markers. We validate against this set
 * so a malformed `type` can't pollute the log.
 */
const LAB_EVENT_TYPES: ReadonlySet<LabEventType> = new Set<LabEventType>([
    "join",
    "leave",
    "share_start",
    "share_end",
    "hand_raise",
    "hand_lower",
    "feedback",
    "control_request",
    "control_grant",
    "control_revoke",
    "spotlight",
    "record_start",
    "record_stop",
]);

function isLabEventType(value: unknown): value is LabEventType {
    return typeof value === "string" && LAB_EVENT_TYPES.has(value as LabEventType);
}

/**
 * The only `meta.kind` values the share vocabulary uses (mirrors LabConnection
 * + the analytics fold's documented `share_start meta.kind` contract). Anything
 * else is dropped from `kind` so a client can't smuggle an arbitrary string in.
 */
const LAB_SHARE_KINDS: ReadonlySet<string> = new Set(["view", "peer", "broadcast"]);

/** Upper bound on a single uid string we'll accept from the body (defence-in-depth). */
const UID_MAX_LENGTH = 128;
/** Upper bound on the serialized `meta` blob — keeps one event from ballooning. */
const META_MAX_BYTES = 2048;

/**
 * Validate + bound the free-form `meta` payload. We:
 *   - reject (return null) anything that isn't a plain object;
 *   - normalise `kind` to the known share vocabulary (drop unknown strings);
 *   - clamp `targets` to strings, length-bounded, capped at maxConcurrentShares;
 *   - hard-cap the whole serialized blob so it can't balloon a document.
 * Returns the sanitized meta, or null when it should be omitted entirely.
 */
function sanitizeEventMeta(
    raw: Record<string, unknown>
): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (k === "kind") {
            if (typeof v === "string" && LAB_SHARE_KINDS.has(v)) out.kind = v;
            continue; // unknown kind → dropped
        }
        if (k === "targets") {
            if (Array.isArray(v)) {
                const targets = v
                    .filter(
                        (t): t is string =>
                            typeof t === "string" &&
                            t.length > 0 &&
                            t.length <= UID_MAX_LENGTH
                    )
                    .slice(0, LAB_LIMITS.maxConcurrentShares);
                if (targets.length > 0) out.targets = targets;
            }
            continue;
        }
        // Pass other primitive-ish fields through untouched (reaction emoji,
        // control-session id, …); the byte cap below is the backstop on size.
        out[k] = v;
    }
    if (Object.keys(out).length === 0) return null;
    // Reject the whole meta if it's still oversized after normalisation.
    try {
        if (JSON.stringify(out).length > META_MAX_BYTES) return null;
    } catch {
        // Non-serializable (cycles / BigInt) → refuse rather than persist junk.
        return null;
    }
    return out;
}

/** Read `meta.kind` as a known share kind, or null. */
function metaKind(meta: Record<string, unknown> | null): string | null {
    const k = meta?.kind;
    return typeof k === "string" && LAB_SHARE_KINDS.has(k) ? k : null;
}

/**
 * POST /api/lab/events — append one event to a session's audit log.
 *
 * Best-effort mirror of the LiveKit data channel (the live room calls this
 * fire-and-forget with `keepalive`), so it must be cheap and append-only:
 *   1. Verify the bearer token (requireVerifiedUser).
 *   2. Load the session; it must exist (reject if missing — we never create the
 *      parent here).
 *   3. The caller must be a member of the session's class (resolveClassLabRole
 *      non-null — teacher or actively-enrolled student).
 *   4. Append to labSessions/{sessionId}/events with the actor stamped from the
 *      verified token (NEVER trust an actorUid from the body) and a server
 *      Timestamp. No existing event is ever mutated.
 *
 * Body: { sessionId: string, type: LabEventType, targetUid?: string,
 *         meta?: Record<string, unknown> }
 */
export async function POST(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const body = await req.json().catch(() => ({}));
        const sessionId =
            typeof body.sessionId === "string" ? body.sessionId.trim() : "";
        if (!sessionId) {
            return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
        }

        // Throttle: the live room fires this fire-and-forget on every hand /
        // share / status / spotlight / view, so a malicious member could flood
        // the events log (Firestore cost + a DoS on the analytics fold that
        // reads every event). A generous per-user+session budget leaves normal
        // churn untouched. Keyed by (uid, sessionId). Fail-open if Redis is down.
        const rl = await rateLimit("lab-events", `${auth.userId}:${sessionId}`, {
            limit: 60,
            windowSeconds: 10,
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many events. Slow down.", code: "rate_limited" },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        if (!isLabEventType(body.type)) {
            return NextResponse.json({ error: "A valid event type is required." }, { status: 400 });
        }
        const type = body.type as LabEventType;
        // Bound the target uid (defence-in-depth — it's an opaque id, not free text).
        const rawTarget =
            typeof body.targetUid === "string" ? body.targetUid.trim() : "";
        const targetUid =
            rawTarget && rawTarget.length <= UID_MAX_LENGTH ? rawTarget : null;
        // Validate + bound the free-form meta (kind whitelist, capped targets,
        // size cap). Drops to null when nothing usable / when oversized.
        const meta =
            body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
                ? sanitizeEventMeta(body.meta as Record<string, unknown>)
                : null;

        // Parent must exist — this route is append-only and never creates the
        // session it logs against.
        const session = await getLabSessionById(sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Membership gate: teacher or actively-enrolled student of the session's
        // class. Any class member may log an event they performed.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        // SERVER-AUTHORITATIVE peer-share gate (trail integrity). When the
        // session forbids peer share, REFUSE to log a peer `share_start` — read
        // the policy from the session doc, NEVER trust the body. This keeps the
        // consent audit trail + analytics (peerSharesGiven / XP) honest even
        // against a patched publisher that ignores the room-metadata policy.
        // The teacher's force-end moderation (mutePublishedTrack) remains the
        // live media kill switch; this is the durable-record half.
        if (
            type === "share_start" &&
            metaKind(meta) === "peer" &&
            labPolicyFromSession(session).allowPeerShare === false
        ) {
            return NextResponse.json(
                { error: "Peer sharing is disabled for this session.", code: "peer_share_disabled" },
                { status: 403 }
            );
        }

        // actorUid is always the verified caller — never read from the body.
        const now = Timestamp.now();
        const event: Record<string, unknown> = {
            sessionId,
            type,
            actorUid: auth.userId,
            // `ts` travels as epoch millis per the LabEvent wire contract; the
            // server-stamped `createdAt` Timestamp is the durable ordering key.
            ts: now.toMillis(),
            createdAt: now,
        };
        if (targetUid) event.targetUid = targetUid;
        if (meta) event.meta = meta;

        const ref = await labSessionRef(sessionId)
            .collection(LAB_EVENTS)
            .add(event);

        return NextResponse.json(
            {
                event: {
                    id: ref.id,
                    sessionId,
                    type,
                    actorUid: auth.userId,
                    targetUid: targetUid ?? undefined,
                    ts: now.toMillis(),
                    meta: meta ?? undefined,
                },
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Append lab event failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to record event" },
            { status: 500 }
        );
    }
}
