import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { rateLimit } from "@/lib/server/ratelimit";
import {
    LAB_EVENTS,
    getLabSessionById,
    labSessionRef,
    resolveClassLabRole,
    serializeLabRecording,
} from "@/lib/server/labStore";
import {
    labRecordingRef,
    startLabRecording,
    stopLabRecording,
} from "@/lib/server/labRecording";
import type { LabEventType } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append one event to the session's audit log with the actor stamped from the
 * verified token (NEVER the body). Best-effort — a failed log write must not
 * fail the recording action itself, so callers swallow the throw.
 */
async function appendRecordingEvent(
    sessionId: string,
    type: Extract<LabEventType, "record_start" | "record_stop">,
    actorUid: string,
    meta: Record<string, unknown>
): Promise<void> {
    const now = Timestamp.now();
    await labSessionRef(sessionId)
        .collection(LAB_EVENTS)
        .add({
            sessionId,
            type,
            actorUid,
            ts: now.toMillis(),
            meta,
            createdAt: now,
        });
}

/**
 * POST /api/lab/sessions/[sessionId]/recording — start or stop the session's
 * LiveKit Egress recording. TEACHER-ONLY (the class teacher; a student is 403).
 *
 *   1. Verify the bearer token (requireVerifiedUser).
 *   2. Load the session; it must exist.
 *   3. resolveClassLabRole(session.classId, uid) must be 'teacher'.
 *   4. action 'start' → startLabRecording (fires Egress, writes the recording
 *      doc, links it onto the session); action 'stop' → stopLabRecording
 *      (stops Egress + polls status to ready/failed).
 *   5. Mirror a record_start / record_stop event into the audit log.
 *
 * Because startLabRecording fires the egress BEFORE any Firestore write, a
 * mis-provisioned LiveKit/GCS surfaces as a throw with no orphaned `processing`
 * doc — we map that to a 502 ("could not start"), distinct from a 500.
 *
 * Body: { action: 'start' | 'stop' }
 * Returns: { recording: LabRecording }
 */
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
            return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
        }

        const session = await getLabSessionById(sessionId);
        if (!session) {
            return NextResponse.json({ error: "Session not found." }, { status: 404 });
        }

        // Teacher-only: must resolve to the `teacher` role for this class.
        const resolved = await resolveClassLabRole(session.classId, auth.userId);
        if (!resolved || resolved.role !== "teacher") {
            return NextResponse.json(
                { error: "Only the class teacher can control recording." },
                { status: 403 }
            );
        }

        // Egress is an expensive external job — throttle start/stop so a teacher
        // (or a stolen teacher token) can't spam LiveKit Egress. Fail-open.
        const rl = await rateLimit("lab-rec", `${auth.userId}:${sessionId}`, {
            limit: 10,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many recording actions. Please wait a moment.", code: "rate_limited" },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        const body = await req.json().catch(() => ({}));
        const action = typeof body.action === "string" ? body.action : "";

        if (action === "start") {
            // Fire the egress first; a LiveKit/GCS failure surfaces here as a
            // throw (no recording doc written) → 502, not a generic 500.
            let started;
            try {
                started = await startLabRecording({
                    room: session.livekitRoom,
                    sessionId,
                    classId: session.classId,
                });
            } catch (e: any) {
                console.error("Start lab recording (egress) failed:", e);
                return NextResponse.json(
                    { error: e?.message || "Could not start recording. Try again." },
                    { status: 502 }
                );
            }

            await appendRecordingEvent(sessionId, "record_start", auth.userId, {
                recordingId: started.recordingId,
                egressId: started.egressId,
            }).catch((e) => console.warn("record_start event log (non-fatal):", e));

            const snap = await labRecordingRef(started.recordingId).get();
            return NextResponse.json(
                { recording: serializeLabRecording(snap) },
                { status: 201 }
            );
        }

        if (action === "stop") {
            // The recordingId to stop lives on the session link (set at start).
            const recordingId =
                typeof session.recordingId === "string" ? session.recordingId : "";
            if (!recordingId) {
                return NextResponse.json(
                    { error: "No recording is in progress for this session." },
                    { status: 409 }
                );
            }

            const stopped = await stopLabRecording({ recordingId });

            await appendRecordingEvent(sessionId, "record_stop", auth.userId, {
                recordingId: stopped.recordingId,
                status: stopped.status,
                durationSec: stopped.durationSec,
            }).catch((e) => console.warn("record_stop event log (non-fatal):", e));

            const snap = await labRecordingRef(stopped.recordingId).get();
            return NextResponse.json({ recording: serializeLabRecording(snap) });
        }

        return NextResponse.json(
            { error: "Unsupported action. Use 'start' or 'stop'." },
            { status: 400 }
        );
    } catch (error: any) {
        console.error("Lab recording action failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to control recording" },
            { status: 500 }
        );
    }
}
