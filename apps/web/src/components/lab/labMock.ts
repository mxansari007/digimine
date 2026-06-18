/**
 * A realistic mock `LabRoomState` so `LabMap` (and the lab room pages) render
 * standalone before the LiveKit/control planes exist. The shape matches what
 * the real `/api/lab/sessions/[sessionId]` snapshot + `useLabRoom` will emit:
 * a teacher, ~10 students on a seat grid, a couple of peer shares, one student
 * sharing up to the teacher (a "view"), the teacher broadcasting to the room,
 * and a recording in progress — plus a few raised hands and a spread of
 * statuses so every avatar colour and every connection `kind` is exercised.
 *
 * Pure data, no imports beyond the shared type. Swap this out for live state
 * by reading `useLabRoom()` instead of importing the mock.
 */

import type { LabParticipant, LabRoomState } from "@digimine/types";

const SESSION_ID = "lab_mock_session";

/** Stable ids so connections can reference participants by uid. */
const T = "teacher_maya"; // the teacher (seat 0)
const S = (n: number) => `student_${n}`; // students 1..10

/** Fixed "now" anchor so hand-raise ages are deterministic in stories/tests. */
const NOW = Date.UTC(2026, 5, 17, 10, 30, 0); // 2026-06-17T10:30:00Z
const minsAgo = (m: number) => NOW - m * 60_000;

/**
 * Build a participant row with sensible defaults; the per-row overrides below
 * keep the mock readable (only the interesting fields are spelled out).
 */
function p(
    overrides: Partial<LabParticipant> & Pick<LabParticipant, "uid" | "seat" | "displayName">
): LabParticipant {
    return {
        sessionId: SESSION_ID,
        role: "student",
        status: "on_task",
        sharingTo: [],
        handRaisedAt: null,
        joinedAt: new Date(minsAgo(28)),
        ...overrides,
    };
}

const participants: LabParticipant[] = [
    // Teacher — seat 0, broadcasting to the whole room (sharingTo = everyone),
    // and currently watching one student's shared screen.
    p({
        uid: T,
        seat: 0,
        displayName: "Maya Krishnan",
        role: "teacher",
        status: "sharing",
        sharingTo: [S(1), S(2), S(3), S(4), S(5), S(6), S(7), S(8), S(9), S(10)],
        joinedAt: new Date(minsAgo(30)),
    }),

    // A student sharing UP to the teacher (the "view" connection).
    p({ uid: S(1), seat: 1, displayName: "Aarav Sharma", status: "sharing", sharingTo: [T] }),

    // Two students in a peer share (pair-programming) — both flagged `sharing`,
    // each pointing at the other; the map draws a single peer line.
    p({ uid: S(2), seat: 2, displayName: "Diya Patel", status: "sharing", sharingTo: [S(3)] }),
    p({ uid: S(3), seat: 3, displayName: "Kabir Nair", status: "sharing", sharingTo: [S(2)] }),

    // A second peer pair further down the grid.
    p({ uid: S(7), seat: 7, displayName: "Ishaan Rao", status: "sharing", sharingTo: [S(8)] }),
    p({ uid: S(8), seat: 8, displayName: "Ananya Iyer", status: "sharing", sharingTo: [S(7)] }),

    // Hands up — oldest first so the teacher's queue ordering is visible.
    p({ uid: S(4), seat: 4, displayName: "Rohan Mehta", status: "needs_help", handRaisedAt: minsAgo(6) }),
    p({ uid: S(9), seat: 9, displayName: "Sara Khan", status: "needs_help", handRaisedAt: minsAgo(2) }),

    // Watching the teacher's broadcast (passive but engaged).
    p({ uid: S(5), seat: 5, displayName: "Vihaan Gupta", status: "watching" }),

    // Heads-down on the task.
    p({ uid: S(6), seat: 6, displayName: "Myra Reddy", status: "on_task" }),

    // Idle — joined but no recent activity (greyed out on the map).
    p({ uid: S(10), seat: 10, displayName: "Arjun Das", status: "idle", joinedAt: new Date(minsAgo(4)) }),
];

/**
 * The mock room state. `you` is the teacher so the "Run the room" control bar
 * shows by default in stories; flip `you.role` to `"student"` to preview the
 * learner view.
 */
export const MOCK_LAB_ROOM_STATE: LabRoomState = {
    sessionId: SESSION_ID,
    participants,
    connections: [
        // Teacher broadcasting to the room (one representative link per
        // student — the map renders these as the highlighted broadcast lines).
        ...[S(1), S(2), S(3), S(4), S(5), S(6), S(7), S(8), S(9), S(10)].map((to) => ({
            fromUid: T,
            toUid: to,
            kind: "broadcast" as const,
        })),
        // Student → teacher view (teacher is watching Aarav's screen).
        { fromUid: S(1), toUid: T, kind: "view" },
        // Two peer shares.
        { fromUid: S(2), toUid: S(3), kind: "peer" },
        { fromUid: S(7), toUid: S(8), kind: "peer" },
    ],
    broadcasting: true,
    recording: true,
    you: { uid: T, role: "teacher" },
};

/** Convenience: the same room seen as a student (no control bar). */
export const MOCK_LAB_ROOM_STATE_AS_STUDENT: LabRoomState = {
    ...MOCK_LAB_ROOM_STATE,
    you: { uid: S(4), role: "student" },
};
