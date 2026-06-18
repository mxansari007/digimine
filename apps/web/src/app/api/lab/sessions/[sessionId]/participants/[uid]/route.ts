import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    getLabSessionById,
    labParticipantRef,
    resolveClassLabRole,
    serializeLabParticipant,
} from "@/lib/server/labStore";
import type { LabStatus } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The live-map activity states a participant row may hold (`LabStatus`). */
const LAB_STATUSES: ReadonlySet<LabStatus> = new Set<LabStatus>([
    "on_task",
    "idle",
    "needs_help",
    "sharing",
    "watching",
]);

function isLabStatus(value: unknown): value is LabStatus {
    return typeof value === "string" && LAB_STATUSES.has(value as LabStatus);
}

/**
 * PATCH /api/lab/sessions/[sessionId]/participants/[uid] — update one roster
 * row's mutable live fields.
 *
 * Authorization:
 *   - a STUDENT may patch ONLY their own row (caller uid === path uid);
 *   - the class TEACHER (resolveClassLabRole === 'teacher') may patch ANY row.
 *   - everyone else (non-members) is rejected.
 * `role` is never mutable here — it's re-derived from class membership at token
 * mint time and must not be settable from a row patch.
 *
 * Body (all optional, only the provided keys are written):
 *   { status?: LabStatus, seat?: number, leftAt?: string | number | null,
 *     handRaisedAt?: number | null }
 *
 * Returns the updated participant via `serializeLabParticipant`.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { sessionId: string; uid: string } }
) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const sessionId = (params.sessionId || "").trim();
        const targetUid = (params.uid || "").trim();
        if (!sessionId || !targetUid) {
            return NextResponse.json(
                { error: "sessionId and uid are required." },
                { status: 400 }
            );
        }

        const session = await getLabSessionById(sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Membership gate first: the caller must belong to the session's class.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }
        // A student may only patch their own row; a teacher may patch anyone's.
        const isTeacher = resolved.role === "teacher";
        if (!isTeacher && auth.userId !== targetUid) {
            return NextResponse.json(
                { error: "You can only update your own participant." },
                { status: 403 }
            );
        }

        // The row must already exist (created at token-mint / join time); this
        // route updates a roster entry, it does not create one.
        const partRef = labParticipantRef(sessionId, targetUid);
        const partSnap = await partRef.get();
        if (!partSnap.exists) {
            return NextResponse.json(
                { error: "Participant not found in this session." },
                { status: 404 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const updates: Record<string, unknown> = {};

        // status — validated against the LabStatus union.
        if (body.status !== undefined) {
            if (!isLabStatus(body.status)) {
                return NextResponse.json({ error: "Invalid status." }, { status: 400 });
            }
            updates.status = body.status;
        }

        // seat — 0-based grid index; must be a non-negative integer.
        if (body.seat !== undefined) {
            const seat = body.seat;
            if (typeof seat !== "number" || !Number.isInteger(seat) || seat < 0) {
                return NextResponse.json(
                    { error: "seat must be a non-negative integer." },
                    { status: 400 }
                );
            }
            updates.seat = seat;
        }

        // handRaisedAt — epoch millis (number) when up, or null when lowered.
        if (body.handRaisedAt !== undefined) {
            const raised = body.handRaisedAt;
            if (raised === null) {
                updates.handRaisedAt = null;
            } else if (typeof raised === "number" && Number.isFinite(raised)) {
                updates.handRaisedAt = raised;
            } else {
                return NextResponse.json(
                    { error: "handRaisedAt must be epoch millis or null." },
                    { status: 400 }
                );
            }
        }

        // leftAt — presence transition. null clears it (a rejoin), a string/number
        // sets the departure time as a Firestore Timestamp.
        if (body.leftAt !== undefined) {
            const leftAt = body.leftAt;
            if (leftAt === null) {
                updates.leftAt = null;
            } else if (typeof leftAt === "number" && Number.isFinite(leftAt)) {
                updates.leftAt = Timestamp.fromMillis(leftAt);
            } else if (typeof leftAt === "string") {
                const parsed = new Date(leftAt);
                if (Number.isNaN(parsed.getTime())) {
                    return NextResponse.json({ error: "Invalid leftAt." }, { status: 400 });
                }
                updates.leftAt = Timestamp.fromDate(parsed);
            } else {
                return NextResponse.json({ error: "Invalid leftAt." }, { status: 400 });
            }
        }

        // Nothing valid to write → 400 rather than a no-op success, so callers
        // notice a malformed/empty patch. (`role` and other fields are ignored
        // by construction — they're never copied into `updates`.)
        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: "No updatable fields provided." },
                { status: 400 }
            );
        }

        updates.updatedAt = Timestamp.now();
        await partRef.set(updates, { merge: true });

        const fresh = await partRef.get();
        return NextResponse.json({
            participant: serializeLabParticipant(fresh),
        });
    } catch (error: any) {
        console.error("Update lab participant failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to update participant" },
            { status: 500 }
        );
    }
}
