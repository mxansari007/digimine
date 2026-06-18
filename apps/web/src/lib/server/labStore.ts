/**
 * Virtual Lab — Firestore store + access helpers (CONTROL plane).
 *
 * All lab collections are SERVER-ONLY (explicit-deny in firestore.rules); every
 * read/write goes through the `/api/lab/*` routes using the admin SDK. This
 * module centralises the bits the routes share — collection names, role
 * resolution against class membership, seat allocation, and the wire
 * serializers — so each route handler stays thin and the membership logic
 * lives in exactly one place.
 *
 * Mirrors the existing `lib/server/classes.ts` + `projectEval/store.ts` style:
 * Firestore `Timestamp`s in, ISO strings out (`toIsoDate`); membership is
 * resolved via the `classes/{classId}/students/{uid}` roster.
 */

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";
import { getClassById, hasActiveClassEnrollment } from "@/lib/server/classes";
import type { LabRole } from "@digimine/types";
import type { LabRoomPolicy } from "@/lib/server/livekit";

/** Top-level collection of session docs. */
export const LAB_SESSIONS = "labSessions";
/** Sub-collection: the authoritative roster row per participant. */
export const LAB_PARTICIPANTS = "participants";
/** Sub-collection: append-only audit log mirrored from the data channel. */
export const LAB_EVENTS = "events";

/** Reference to a session document. */
export function labSessionRef(sessionId: string) {
    return adminDb.collection(LAB_SESSIONS).doc(sessionId);
}

/** Reference to a participant's roster row inside a session. */
export function labParticipantRef(sessionId: string, uid: string) {
    return labSessionRef(sessionId).collection(LAB_PARTICIPANTS).doc(uid);
}

export async function getLabSessionById(
    sessionId: string
): Promise<any | null> {
    if (!sessionId) return null;
    const snap = await labSessionRef(sessionId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
}

/**
 * Extract the server-authoritative room policy from a session doc, applying the
 * SAME defaults as `serializeLabSession` / the create route (`allowPeerShare`
 * and `allowChat` default ON). This is the one place the policy is read off the
 * stored session so the token mint, the room-metadata stamp, and the events
 * peer-share gate can never disagree about what "on/off" means.
 */
export function labPolicyFromSession(session: any): LabRoomPolicy {
    const s = session?.settings ?? {};
    return {
        allowPeerShare: s.allowPeerShare !== false,
        allowChat: s.allowChat !== false,
    };
}

/**
 * Normalise a denormalised display name before it lands on a roster row / token.
 * The source is the user's own profile (`users/{uid}`), so it's attacker-
 * influenced: strip control / bidi-override characters (which can distort the
 * teacher's insights UI or any non-React renderer) and cap the length. React
 * already escapes on render, so this is defence-in-depth, not the only guard.
 */
const DISPLAY_NAME_MAX = 80;
// Built from explicit code points (no literal control chars in source): C0
// controls + DEL, C1 controls, zero-width chars, bidi overrides, BOM/word-joiner.
// We DELIBERATELY match control chars here (that's the whole point — stripping
// them), so the no-control-regex lint is disabled for this one construction.
const UNSAFE_NAME_CHARS = new RegExp(
    // eslint-disable-next-line no-control-regex
    "[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF]",
    "g"
);
export function sanitizeDisplayName(raw: unknown): string {
    if (typeof raw !== "string") return "";
    const cleaned = raw
        // Drop control / zero-width / bidi-override chars, collapse whitespace,
        // trim, then hard-cap so one user can't blow up a table cell.
        .replace(UNSAFE_NAME_CHARS, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned.slice(0, DISPLAY_NAME_MAX);
}

/**
 * Resolve the caller's role *within a class* for lab purposes. This is the
 * single source of truth the token route and presence route lean on — we never
 * trust a role from the request body.
 *
 *   - the class owner (teacherId) → `teacher`
 *   - a denormalised subject teacher (teacherIds[]) → `teacher`
 *   - an actively-enrolled student → `student`
 *   - anyone else → null (no access)
 *
 * `observer` is never auto-assigned here; it's reserved for explicit future
 * use (TA invites / auditors), so the default for a non-teacher is the
 * enrollment check.
 */
export async function resolveClassLabRole(
    classId: string,
    uid: string
): Promise<{ role: LabRole; classDoc: any } | null> {
    if (!classId || !uid) return null;
    const classDoc = await getClassById(classId);
    if (!classDoc) return null;

    const isOwner = classDoc.teacherId === uid;
    const isSubjectTeacher =
        Array.isArray(classDoc.teacherIds) && classDoc.teacherIds.includes(uid);
    if (isOwner || isSubjectTeacher) {
        return { role: "teacher", classDoc };
    }

    const enrolled = await hasActiveClassEnrollment(classId, uid);
    if (enrolled) {
        return { role: "student", classDoc };
    }
    return null;
}

/**
 * Pick a stable seat index for a joining participant. Seats are 0-based and
 * held for the life of the session so an avatar doesn't jump around the grid.
 * We hand the teacher seat 0 and pack students into the lowest free slot.
 *
 * Called inside the same flow that upserts the participant; an existing
 * participant keeps their seat (the caller checks `snap.exists` first), so this
 * only runs on first join.
 */
export async function allocateSeat(
    sessionId: string,
    role: LabRole
): Promise<number> {
    if (role === "teacher") return 0;
    const snap = await labSessionRef(sessionId)
        .collection(LAB_PARTICIPANTS)
        .get();
    const taken = new Set<number>();
    snap.docs.forEach((d) => {
        const seat = d.data()?.seat;
        if (typeof seat === "number") taken.add(seat);
    });
    // Students start at seat 1 (seat 0 is reserved for the teacher).
    let seat = 1;
    while (taken.has(seat)) seat++;
    return seat;
}

/** Serialize a session doc to the JSON wire shape (ISO dates, safe defaults). */
export function serializeLabSession(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        classId: data.classId,
        teacherId: data.teacherId,
        title: data.title,
        status: data.status,
        livekitRoom: data.livekitRoom,
        startedAt: toIsoDate(data.startedAt),
        endedAt: toIsoDate(data.endedAt),
        recordingId: data.recordingId ?? null,
        settings: {
            allowPeerShare: data.settings?.allowPeerShare ?? true,
            allowChat: data.settings?.allowChat ?? true,
            autoRecord: data.settings?.autoRecord ?? false,
        },
        stats: {
            peakParticipants: data.stats?.peakParticipants ?? 0,
        },
    };
}

/**
 * Serialize a recording doc to the JSON wire shape (mirrors the `LabRecording`
 * type). `createdAt` becomes an ISO string; `url` is NOT included here — it's a
 * short-lived signed URL the detail route mints on-read via
 * `getRecordingPlaybackUrl` and attaches separately. The internal control
 * fields (`egressId`, `updatedAt`) are intentionally dropped from the wire.
 */
export function serializeLabRecording(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    const chapters = Array.isArray(data.chapters)
        ? data.chapters
              .map((c: any) => ({
                  tsSec: typeof c?.tsSec === "number" ? c.tsSec : 0,
                  title: typeof c?.title === "string" ? c.title : "",
              }))
              // Chapters render on a timeline, so keep them in start order.
              .sort((a: { tsSec: number }, b: { tsSec: number }) => a.tsSec - b.tsSec)
        : [];
    return {
        id: doc.id || data.id,
        sessionId: data.sessionId,
        classId: data.classId,
        storagePath: data.storagePath,
        status: data.status ?? "processing",
        durationSec: typeof data.durationSec === "number" ? data.durationSec : 0,
        chapters,
        captionsUrl: data.captionsUrl ?? null,
        createdAt: toIsoDate(data.createdAt),
    };
}

/** Serialize a participant roster row to the JSON wire shape. */
export function serializeLabParticipant(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        uid: doc.id || data.uid,
        sessionId: data.sessionId,
        role: data.role,
        displayName: data.displayName ?? "",
        seat: typeof data.seat === "number" ? data.seat : 0,
        status: data.status ?? "on_task",
        sharingTo: Array.isArray(data.sharingTo) ? data.sharingTo : [],
        // handRaisedAt travels as epoch millis (number) per the type contract.
        handRaisedAt: typeof data.handRaisedAt === "number" ? data.handRaisedAt : null,
        joinedAt: toIsoDate(data.joinedAt),
        leftAt: toIsoDate(data.leftAt),
    };
}

/**
 * Bump the session's `peakParticipants` high-water mark to `count` if it's a
 * new high. Cheap merge-write; safe to call on every join.
 */
export async function bumpPeakParticipants(
    sessionId: string,
    count: number
): Promise<void> {
    const session = await getLabSessionById(sessionId);
    const current = session?.stats?.peakParticipants ?? 0;
    if (count > current) {
        await labSessionRef(sessionId).set(
            { stats: { peakParticipants: count }, updatedAt: Timestamp.now() },
            { merge: true }
        );
    }
}
