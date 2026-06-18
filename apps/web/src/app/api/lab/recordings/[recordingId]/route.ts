import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import {
    resolveClassLabRole,
    serializeLabRecording,
} from "@/lib/server/labStore";
import {
    labRecordingRef,
    reconcileRecording,
    getRecordingPlaybackUrl,
} from "@/lib/server/labRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/recordings/[recordingId] — fetch one recording with a fresh
 * status + (when ready) a short-lived signed playback URL.
 *
 *   1. Verify the bearer token (requireVerifiedUser).
 *   2. Load the recording; it must exist.
 *   3. The caller must be a member of the recording's class
 *      (resolveClassLabRole(recording.classId) non-null).
 *   4. reconcileRecording — re-poll LiveKit so a `processing` recording flips to
 *      ready/failed even if the completion webhook never reached us (dev). This
 *      is best-effort: a transient hiccup leaves the stored status untouched.
 *   5. Re-read the (possibly updated) doc; mint a v4 signed read URL against
 *      REAL GCS via getRecordingPlaybackUrl ONLY when status === 'ready'.
 *
 * Returns: { recording: LabRecording }  (recording.url present only when ready)
 */
export async function GET(
    req: Request,
    { params }: { params: { recordingId: string } }
) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const recordingId = (params.recordingId || "").trim();
        if (!recordingId) {
            return NextResponse.json(
                { error: "recordingId is required." },
                { status: 400 }
            );
        }

        const ref = labRecordingRef(recordingId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Recording not found." }, { status: 404 });
        }
        const data = snap.data() as any;

        // Membership gate on the recording's denormalised classId.
        const resolved = await resolveClassLabRole(data.classId, auth.userId);
        if (!resolved) {
            return NextResponse.json(
                { error: "You are not a member of this class." },
                { status: 403 }
            );
        }

        // Refresh status from LiveKit (finalises a recording the webhook missed
        // in dev). Best-effort: never fail the read on a reconcile hiccup.
        await reconcileRecording(recordingId);

        // Re-read so the response reflects any status/duration the reconcile
        // just wrote.
        const fresh = await ref.get();
        const freshData = fresh.data() as any;

        // Mint a signed playback URL only once the file actually exists.
        let url: string | null = null;
        if (freshData?.status === "ready" && freshData?.storagePath) {
            try {
                url = await getRecordingPlaybackUrl(freshData.storagePath);
            } catch (e: any) {
                // A signing failure shouldn't 500 the whole read — return the
                // recording without a URL and let the client retry.
                console.warn("Recording playback URL signing (non-fatal):", e?.message || e);
            }
        }

        // The shared serializer omits `url` (it's a transient signed URL, never
        // persisted); attach the freshly-minted one on top — only set when ready.
        const recording = serializeLabRecording(fresh);
        return NextResponse.json({
            recording: recording ? { ...recording, url: url ?? undefined } : null,
        });
    } catch (error: any) {
        console.error("Get lab recording failed:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load recording" },
            { status: 500 }
        );
    }
}
