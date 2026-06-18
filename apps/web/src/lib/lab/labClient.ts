"use client";

/**
 * Virtual Lab — small client helpers shared by the in-class entry points.
 *
 * The lab lives INSIDE a classroom: the teacher class-detail page and the
 * student classroom hub both need to answer "is there a live lab for this
 * class, and what's my role?" before they show a Start/Resume/Join affordance.
 * Rather than duplicate the fetch + bearer dance in both pages, it lives here.
 *
 * Everything goes through the existing `/api/lab/*` control-plane routes (which
 * enforce class membership + `labEnabled` server-side); these helpers never
 * touch Firestore directly and trust the server for the role.
 */

import type { User } from "firebase/auth";
import type {
    LabRole,
    LabSessionStatus,
    LabRecordingChapter,
    LabRecordingStatus,
} from "@digimine/types";

/**
 * The wire shape of a lab session as returned by the `/api/lab/sessions`
 * routes (mirrors `serializeLabSession` in `lib/server/labStore.ts`). Dates are
 * ISO strings; only the fields the entry points actually use are typed here.
 */
export interface LabSessionSummary {
    id: string;
    classId: string;
    teacherId: string;
    title: string;
    status: LabSessionStatus;
    livekitRoom: string;
    startedAt: string | null;
    endedAt: string | null;
    recordingId: string | null;
    settings: {
        allowPeerShare: boolean;
        allowChat: boolean;
        autoRecord: boolean;
    };
    stats: { peakParticipants: number };
}

/** Result of looking up a class's sessions: the live one (if any) + your role. */
export interface ClassLabState {
    /** The single live session for the class, or null when none is open. */
    live: LabSessionSummary | null;
    /** The caller's resolved role for this class (server-minted), or null. */
    role: LabRole | null;
}

/**
 * Attach the caller's Firebase bearer and GET a lab API route. Returns the
 * parsed JSON body; throws with the server's error message on a non-2xx so
 * callers can decide whether to surface or swallow it.
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

/**
 * Fetch a class's lab state: the (at most one) live session plus the caller's
 * role. Used by BOTH the teacher card ("Resume Lab" when live) and the student
 * hub ("Join Live Lab" only when live). The GET route already gates on class
 * membership, so a non-member surfaces as an error the caller can swallow.
 *
 * v1 opens sessions straight to `live` and only one at a time per class, so we
 * pick the first `status === "live"` row (the API already floats live first).
 */
export async function fetchClassLabState(
    user: User | null | undefined,
    classId: string
): Promise<ClassLabState> {
    if (!user || !classId) return { live: null, role: null };
    const data = await labGet<{ sessions?: LabSessionSummary[]; role?: LabRole }>(
        user,
        `/api/lab/sessions?classId=${encodeURIComponent(classId)}`
    );
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const live = sessions.find((s) => s.status === "live") ?? null;
    return { live, role: data.role ?? null };
}

/**
 * Fetch a single session by id (membership-gated) plus the caller's role. The
 * lab room pages use this to verify access + derive the class back-link before
 * mounting the live room.
 */
export async function fetchLabSession(
    user: User | null | undefined,
    sessionId: string
): Promise<{ session: LabSessionSummary; role: LabRole }> {
    if (!user) throw new Error("You must be signed in to join the lab.");
    if (!sessionId) throw new Error("Missing session.");
    const data = await labGet<{ session: LabSessionSummary; role: LabRole }>(
        user,
        `/api/lab/sessions/${encodeURIComponent(sessionId)}`
    );
    return { session: data.session, role: data.role };
}

// ─────────────────────────────────────────────────────────────────────
// Recordings / replay
// ─────────────────────────────────────────────────────────────────────

/**
 * The wire shape of a lab recording as returned by `/api/lab/recordings`
 * (mirrors `serializeLabRecording` in `lib/server/labStore.ts`). `createdAt`
 * is an ISO string; `url` is a short-lived signed playback URL present ONLY on
 * the per-recording detail GET and ONLY when `status === "ready"` (the list
 * endpoint never mints one). `sessionTitle` is denormalised onto the list rows
 * so the library can label each recording without a second lookup.
 */
export interface LabRecordingSummary {
    id: string;
    sessionId: string;
    classId: string;
    storagePath: string;
    status: LabRecordingStatus;
    durationSec: number;
    chapters: LabRecordingChapter[];
    /** Signed MP4 URL — only on the detail GET, only when `ready`. */
    url?: string;
    /** WebVTT captions track, when generated (absent for now). */
    captionsUrl?: string | null;
    createdAt: string | null;
    /** Owning session's title — only present on list rows (denormalised). */
    sessionTitle?: string;
}

/**
 * Fetch a class's lab recordings (newest first) plus the caller's role. The GET
 * route is membership-gated, so a non-member surfaces as an error the caller can
 * swallow. Used by the Lab Library list inside the class hub.
 */
export async function fetchClassRecordings(
    user: User | null | undefined,
    classId: string
): Promise<{ recordings: LabRecordingSummary[]; role: LabRole | null }> {
    if (!user || !classId) return { recordings: [], role: null };
    const data = await labGet<{
        recordings?: LabRecordingSummary[];
        role?: LabRole;
    }>(user, `/api/lab/recordings?classId=${encodeURIComponent(classId)}`);
    return {
        recordings: Array.isArray(data.recordings) ? data.recordings : [],
        role: data.role ?? null,
    };
}

/**
 * Fetch a single recording by id (membership-gated). The detail route
 * reconciles a still-`processing` recording against LiveKit and, once `ready`,
 * attaches a freshly-signed `url`. The replay page calls this on mount and on
 * every manual refresh so playback always uses a non-expired URL.
 */
export async function fetchLabRecording(
    user: User | null | undefined,
    recordingId: string
): Promise<LabRecordingSummary> {
    if (!user) throw new Error("You must be signed in to view this recording.");
    if (!recordingId) throw new Error("Missing recording.");
    const data = await labGet<{ recording: LabRecordingSummary }>(
        user,
        `/api/lab/recordings/${encodeURIComponent(recordingId)}`
    );
    return data.recording;
}
