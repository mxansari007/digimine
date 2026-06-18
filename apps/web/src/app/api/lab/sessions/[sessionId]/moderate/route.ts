import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { TrackSource } from "livekit-server-sdk";
import type { ParticipantInfo, TrackInfo } from "livekit-server-sdk";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    LAB_EVENTS,
    getLabSessionById,
    labSessionRef,
    resolveClassLabRole,
} from "@/lib/server/labStore";
import { getRoomServiceClient } from "@/lib/server/livekit";
import type { LabEventType } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teacher MODERATION — the SERVER authority over screen-shares + spotlight.
 *
 * This is the control plane's enforcement arm. The live room (useLabRoom +
 * LiveKit data channel + participant metadata) is *cooperative*: a student
 * publishes their `lab-share` track and announces it; the teacher's UI reacts.
 * That's fine for the happy path, but it can't STOP a student who keeps sharing
 * — the student owns their own publish. So when the teacher pulls the plug we
 * go around the client entirely and command the SFU directly over the
 * RoomService REST API (mute / revoke-publish), which the student cannot
 * countermand. The matching client verbs (`stopSharing`, `spotlight`) are the
 * polite path; THIS route is the authoritative one.
 *
 *   POST /api/lab/sessions/[sessionId]/moderate
 *   Body: { action: 'end_share' | 'mute' | 'spotlight', targetUid?: string }
 *
 *   - 'end_share' / 'mute' — authoritatively silence the target's screen-share
 *      publication in the LiveKit room. We look the participant up over the
 *      RoomService API, find their screen-share track (by SCREEN_SHARE source,
 *      falling back to the `lab-share` / `lab-broadcast` track names the client
 *      publishes under), and `mutePublishedTrack(... muted=true)`. If they have
 *      no screen-share track to mute we fall back to `updateParticipant` to
 *      strip ScreenShare from their publishable sources (and, for `end_share`,
 *      drop `canPublish` for screen) so a fresh share can't be started — the
 *      permission write is atomic, so we echo the participant's CURRENT
 *      permission and only narrow the screen-share bits. Mirrors a `share_end`
 *      audit event with the verified teacher as `actorUid`.
 *   - 'spotlight' — record the room-wide spotlight on the session doc so it
 *      survives reconnects / late joiners (the live nudge still rides the
 *      teacher's metadata + a `spotlight` data pulse from the client). A null/
 *      absent targetUid CLEARS the spotlight. Mirrors a `spotlight` audit event
 *      and returns the new `spotlightUid`.
 *
 * TEACHER-ONLY: the caller must resolve to the `teacher` role for the session's
 * class (resolveClassLabRole); anyone else is 403. The actor on every audit
 * event is the verified token's uid, NEVER the body.
 */

/** The moderation verbs this route accepts. */
type ModerateAction = "end_share" | "mute" | "spotlight";

function isModerateAction(value: unknown): value is ModerateAction {
    return value === "end_share" || value === "mute" || value === "spotlight";
}

/**
 * The client publishes a student's share under `lab-share` and the teacher's
 * broadcast under `lab-broadcast` (see useLabRoom's track-name constants). We
 * resolve a screen-share track by source first (the canonical signal), then by
 * those names so we still catch it the instant it's published but before the
 * SFU has classified its source.
 */
const LAB_SHARE_TRACK_NAME = "lab-share";
const LAB_BROADCAST_TRACK_NAME = "lab-broadcast";

/**
 * Find the target participant's screen-share `TrackInfo`, or undefined. Keyed on
 * the SCREEN_SHARE source first, then the known publish names as a fallback.
 */
function findScreenShareTrack(p: ParticipantInfo): TrackInfo | undefined {
    const tracks = Array.isArray(p.tracks) ? p.tracks : [];
    return (
        tracks.find((t) => t.source === TrackSource.SCREEN_SHARE) ??
        tracks.find(
            (t) =>
                t.name === LAB_SHARE_TRACK_NAME ||
                t.name === LAB_BROADCAST_TRACK_NAME
        )
    );
}

/**
 * Append one moderation event to the session's audit log with the actor stamped
 * from the verified teacher (NEVER the body). Best-effort — a failed log write
 * must not fail the moderation action itself, so callers swallow the throw.
 */
async function appendModerationEvent(
    sessionId: string,
    type: Extract<LabEventType, "share_end" | "spotlight">,
    actorUid: string,
    targetUid: string | null,
    meta: Record<string, unknown>
): Promise<void> {
    const now = Timestamp.now();
    const event: Record<string, unknown> = {
        sessionId,
        type,
        actorUid,
        // `ts` travels as epoch millis per the LabEvent wire contract; the
        // server-stamped `createdAt` Timestamp is the durable ordering key.
        ts: now.toMillis(),
        meta,
        createdAt: now,
    };
    if (targetUid) event.targetUid = targetUid;
    await labSessionRef(sessionId).collection(LAB_EVENTS).add(event);
}

export async function POST(
    req: Request,
    { params }: { params: { sessionId: string } }
) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const sessionId = (params.sessionId || "").trim();
        if (!sessionId) {
            return NextResponse.json(
                { error: "sessionId is required." },
                { status: 400 }
            );
        }

        const session = await getLabSessionById(sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Teacher-only: the caller MUST resolve to the `teacher` role for this
        // class. This is the security choke point — a student can never moderate.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved || resolved.role !== "teacher") {
            return NextResponse.json(
                { error: "Only the class teacher can moderate this lab." },
                { status: 403 }
            );
        }

        const body = await req.json().catch(() => ({}));
        if (!isModerateAction(body.action)) {
            return NextResponse.json(
                { error: "Unsupported action. Use 'end_share', 'mute', or 'spotlight'." },
                { status: 400 }
            );
        }
        const action = body.action as ModerateAction;
        const targetUid =
            typeof body.targetUid === "string" && body.targetUid.trim()
                ? body.targetUid.trim()
                : null;

        // ── spotlight: durable room-wide pin (survives reconnects) ──────────
        if (action === "spotlight") {
            // A null target clears the spotlight. We persist it on the session
            // doc so a reconnecting/late client can recover it from the control
            // plane even if it missed the teacher's live `spotlight` data pulse
            // and metadata. Empty self-pin guarded by the truthiness check.
            const spotlightUid = targetUid;
            await labSessionRef(sessionId).set(
                { spotlightUid, updatedAt: Timestamp.now() },
                { merge: true }
            );

            await appendModerationEvent(
                sessionId,
                "spotlight",
                auth.userId,
                spotlightUid,
                { spotlightUid }
            ).catch((e) =>
                console.warn("spotlight event log (non-fatal):", e)
            );

            return NextResponse.json({ ok: true, spotlightUid });
        }

        // ── end_share / mute: authoritatively silence the target's share ────
        // Both require a target to act on.
        if (!targetUid) {
            return NextResponse.json(
                { error: "targetUid is required for this action." },
                { status: 400 }
            );
        }
        // Defensive: a teacher cancelling their OWN broadcast goes through the
        // client (`stopBroadcast`); this route is for stopping SOMEONE ELSE.
        if (targetUid === auth.userId) {
            return NextResponse.json(
                { error: "Use the broadcast controls to stop your own share." },
                { status: 400 }
            );
        }

        const room = session.livekitRoom;
        if (typeof room !== "string" || !room) {
            return NextResponse.json(
                { error: "This session has no live room." },
                { status: 409 }
            );
        }

        const svc = getRoomServiceClient();

        // Look the participant up in the live room. If they aren't connected,
        // there's nothing to mute — surface a clean 404 rather than a 500.
        let participant: ParticipantInfo;
        try {
            participant = await svc.getParticipant(room, targetUid);
        } catch {
            return NextResponse.json(
                { error: "That participant is not in the live room." },
                { status: 404 }
            );
        }

        const screenTrack = findScreenShareTrack(participant);
        let stopped: "muted" | "revoked" | "none" = "none";

        if (screenTrack?.sid) {
            // Authoritative stop: mute the published screen-share track at the
            // SFU. The student cannot un-mute a server-muted track, so the share
            // is genuinely cut — not just hidden on the teacher's client.
            try {
                await svc.mutePublishedTrack(room, targetUid, screenTrack.sid, true);
                stopped = "muted";
            } catch (e) {
                console.error("mutePublishedTrack failed:", e);
                return NextResponse.json(
                    { error: "Could not stop that share. Try again." },
                    { status: 502 }
                );
            }
        }

        // For `end_share` (a hard cut, not just a mute), ALSO revoke the
        // target's ability to (re)publish a screen share so they can't simply
        // start a new one. `updateParticipant` replaces permissions ATOMICALLY,
        // so we echo their CURRENT permission and only narrow the screen-share
        // bits — preserving camera/mic publish, subscribe, and data. When there
        // was no live track to mute, this revoke is the sole enforcement.
        //
        // Students are now minted with an EXPLICIT source allow-list
        // ([camera, microphone, screen_share(+audio)] — see grantForRole), so
        // `perm.canPublishSources` is populated and this filter deterministically
        // narrows it to [camera, microphone]. The `[CAMERA, MICROPHONE]` fallback
        // below only applies to a participant whose SFU permission carries no
        // explicit source list at all (e.g. a future role or a manually-granted
        // token); in that case we set an explicit list that omits ScreenShare,
        // which is what actually blocks a fresh share while keeping A/V — the
        // intended "block screen-share, keep cam/mic" semantics.
        if (action === "end_share") {
            const perm = participant.permission;
            // Keep every other publishable source; drop only ScreenShare(+audio).
            const keptSources = (perm?.canPublishSources ?? []).filter(
                (s) =>
                    s !== TrackSource.SCREEN_SHARE &&
                    s !== TrackSource.SCREEN_SHARE_AUDIO
            );
            try {
                await svc.updateParticipant(room, targetUid, {
                    permission: {
                        canSubscribe: perm?.canSubscribe ?? true,
                        canPublishData: perm?.canPublishData ?? true,
                        // If the SFU was enforcing a source allow-list, narrow it
                        // (ScreenShare removed). If it was empty (publish-any),
                        // setting an explicit list that omits ScreenShare is what
                        // blocks a fresh share while still allowing cam/mic.
                        canPublishSources:
                            keptSources.length > 0
                                ? keptSources
                                : [TrackSource.CAMERA, TrackSource.MICROPHONE],
                        canPublish: perm?.canPublish ?? true,
                    },
                });
                if (stopped === "none") stopped = "revoked";
            } catch (e) {
                // If we already muted the live track, the share IS stopped; a
                // failed permission narrowing shouldn't 500 the whole call —
                // log it and report the mute as the outcome.
                console.warn("updateParticipant (revoke screen-share) failed:", e);
                if (stopped === "none") {
                    return NextResponse.json(
                        { error: "Could not stop that share. Try again." },
                        { status: 502 }
                    );
                }
            }
        }

        // Nothing to act on at all (no live track AND a plain `mute` with no
        // track): report a clean 409 so the teacher's UI can settle its state.
        if (stopped === "none") {
            return NextResponse.json(
                { error: "That participant is not sharing their screen." },
                { status: 409 }
            );
        }

        await appendModerationEvent(
            sessionId,
            "share_end",
            auth.userId,
            targetUid,
            { action, enforcement: stopped, trackSid: screenTrack?.sid ?? null }
        ).catch((e) => console.warn("share_end event log (non-fatal):", e));

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Lab moderation action failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to moderate lab" },
            { status: 500 }
        );
    }
}
