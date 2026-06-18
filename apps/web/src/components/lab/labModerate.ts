"use client";

import { auth } from "@/lib/firebase/client";

/**
 * Teacher moderation calls that act on ANOTHER participant — the one thing the
 * sharing UI needs that can't be done from the local LiveKit client alone.
 *
 * `useLabRoom` owns every *self* verb (share / view / spotlight / record); those
 * are local LiveKit operations a participant performs on their own tracks +
 * metadata. Forcibly ENDING someone else's screen share, by contrast, has to
 * happen on the media plane with room-admin authority (the teacher's grant is
 * `roomAdmin`, but the actual `mutePublishedTrack` is a server-side
 * RoomService call), so it goes through the control plane rather than the
 * client hook — exactly like recording does.
 *
 * This is the thin client side of that: a single awaited POST to the lab
 * moderation route with the teacher's Firebase Bearer. It is NOT
 * fire-and-forget — the teacher needs to know if the action failed — so we
 * await it and throw the server's message on a non-2xx for the caller to
 * surface inline (mirroring `recordingApi` inside `useLabRoom`). The server
 * re-resolves the caller's role from class membership and writes the matching
 * `share_end` audit event, so this carries no authority of its own.
 */

/** The moderation verbs the teacher can invoke against a target participant. */
export type LabModerateAction = "end_share";

/**
 * POST /api/lab/sessions/{sessionId}/moderate with `{ action, targetUid }`.
 *
 * @throws Error with the server-provided message (or a friendly fallback) when
 *   the route responds non-2xx, or when the caller isn't signed in.
 */
export async function moderateLab(
    sessionId: string,
    action: LabModerateAction,
    targetUid: string
): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be signed in to moderate this lab.");
    const sid = sessionId.trim();
    const target = targetUid.trim();
    if (!sid || !target) {
        throw new Error("A session and a participant are required.");
    }

    const idToken = await user.getIdToken();
    const res = await fetch(
        `/api/lab/sessions/${encodeURIComponent(sid)}/moderate`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ action, targetUid: target }),
        }
    );
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
            (json as { error?: string })?.error || "Could not end that share."
        );
    }
}

/** Convenience wrapper for the only moderation action the UI uses today. */
export function endParticipantShare(
    sessionId: string,
    targetUid: string
): Promise<void> {
    return moderateLab(sessionId, "end_share", targetUid);
}
