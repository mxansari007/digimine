/**
 * Virtual Lab — recording CORE (LiveKit Egress → Firebase Storage / GCS).
 *
 * This is the lowest layer of the recording stack: it drives LiveKit Cloud
 * Egress to capture a room composite to an MP4, uploads that MP4 straight to
 * the project's GCS bucket, mirrors the lifecycle into Firestore
 * (`labRecordings/{id}`), reconciles egress status, and mints short-lived
 * signed playback URLs. The `/api/lab/*` routes + the room UI build on the
 * functions exported here; nothing in this module talks to the client.
 *
 * THREE THINGS WORTH KNOWING (the non-obvious bits):
 *
 *  1. UPLOAD CREDENTIALS. LiveKit's GCPUpload needs a *service-account
 *     credentials.json string* (it writes to GCS on our behalf from the cloud).
 *     We synthesise that JSON from the SAME env we already feed firebase-admin
 *     (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) — see `buildGcpCredentials`.
 *     The SA must have objectAdmin on the bucket. Secrets are env-only; we never
 *     hard-code or log them.
 *
 *  2. STATUS IS POLL-FIRST. LiveKit Cloud's Egress completion *webhook* can't
 *     reach localhost in dev, so the PRIMARY path is poll-on-stop: after
 *     `stopEgress` we `listEgress({ egressId })` a few times until the status
 *     settles (COMPLETE / ENDING-then-COMPLETE / FAILED) and write the result.
 *     The webhook (`reconcileRecording`) is the prod / crash-recovery path that
 *     finalises anything still `processing`. Both converge on the same writer.
 *
 *  3. PLAYBACK READS THE *REAL* BUCKET. A FIREBASE_STORAGE_EMULATOR_HOST is set
 *     in dev, which makes the shared firebase-admin Storage SDK (via
 *     @google-cloud/storage) route everything to the local emulator. But Egress
 *     uploaded the MP4 to REAL GCS, so a signed URL MUST target real GCS.
 *     `getRecordingPlaybackUrl` therefore signs via a dedicated, separately-
 *     initialised firebase-admin app pinned to real GCS — never the emulator.
 *
 * Mirrors the existing lab server style (lib/server/livekit.ts + labStore.ts):
 * env read at call time so a mis-provisioned deploy fails loudly on the specific
 * request; Firestore Timestamps in; clear operator-facing errors.
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
    EgressClient,
    EncodedFileOutput,
    EncodedFileType,
    EgressStatus,
    GCPUpload,
    type EgressInfo,
} from "livekit-server-sdk";
import { adminDb } from "@/lib/firebase/admin";
import { getLiveKitWsUrl } from "@/lib/server/livekit";
import type { LabRecording } from "@digimine/types";

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/** Top-level collection: one document per recording (mirrors @digimine/types). */
export const LAB_RECORDINGS = "labRecordings";

/**
 * The REAL Firebase Storage / GCS bucket recordings land in. Egress uploads
 * here from the cloud and playback signs against here — NEVER the emulator.
 * Defaults to the known prod bucket; env override keeps it configurable.
 */
const RECORDINGS_BUCKET =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "digimine-1c33f.firebasestorage.app";

/** Signed playback URL lifetime — short-lived; the UI re-fetches as needed. */
const PLAYBACK_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Poll-on-stop reconcile knobs (the localhost-webhook-can't-reach workaround). */
const RECONCILE_MAX_ATTEMPTS = 6;
const RECONCILE_DELAY_MS = 1500;

// ─────────────────────────────────────────────────────────────────────
// Reference + small helpers
// ─────────────────────────────────────────────────────────────────────

/** Reference to a recording document. */
export function labRecordingRef(recordingId: string) {
    return adminDb.collection(LAB_RECORDINGS).doc(recordingId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * FileInfo carries durations/sizes as protobuf `bigint`s (ns for duration,
 * bytes for size). Coerce to a finite JS number safely; never throw on a weird
 * value (a bad number must not fail the whole reconcile).
 */
function bigintToNumber(v: bigint | number | undefined | null): number {
    if (v === undefined || v === null) return 0;
    try {
        const n = typeof v === "bigint" ? Number(v) : Number(v);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

/** Egress reports file duration in NANOSECONDS; we persist whole seconds. */
function fileDurationToSec(durationNs: bigint | number | undefined): number {
    const ns = bigintToNumber(durationNs);
    if (ns <= 0) return 0;
    return Math.max(0, Math.round(ns / 1e9));
}

// ─────────────────────────────────────────────────────────────────────
// GCP upload credentials (for LiveKit Egress → GCS)
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the service-account `credentials.json` STRING LiveKit Egress needs to
 * upload to GCS (GCPUpload.credentials). Constructed from the same env we feed
 * firebase-admin, so there's a single SA to provision (it needs objectAdmin on
 * the recordings bucket).
 *
 * Returns a JSON string (not an object) — that's exactly what GCPUpload wants.
 * Throws a clear, operator-facing error if any required env is missing so a
 * mis-provisioned deploy fails loudly instead of starting an egress that can
 * never upload.
 */
export function buildGcpCredentials(): string {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // The PEM arrives with literal "\n"s in env; un-escape to real newlines.
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    const missing: string[] = [];
    if (!projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
    if (missing.length > 0) {
        throw new Error(
            `Lab recording is not configured: missing ${missing.join(", ")}. ` +
                "Set the Firebase service-account credentials in the server environment."
        );
    }

    // Minimal SA JSON: Egress only needs these fields to authenticate the
    // GCS upload. token_uri is required so the SA can mint an access token.
    return JSON.stringify({
        type: "service_account",
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
        token_uri: "https://oauth2.googleapis.com/token",
    });
}

// ─────────────────────────────────────────────────────────────────────
// Egress client + signed-URL storage client
// ─────────────────────────────────────────────────────────────────────

/**
 * An EgressClient bound to the configured LiveKit host + creds. Base must be an
 * http(s) origin; `getLiveKitWsUrl()` may hand back ws(s), so normalise. Creds
 * come from env ONLY (same vars the token route reads).
 */
function getEgressClient(): EgressClient {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
        throw new Error(
            "LiveKit is not configured: missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET."
        );
    }
    // getLiveKitWsUrl prefers ws(s); the Egress REST API wants http(s).
    const host = getLiveKitWsUrl().replace(/^ws(s?):\/\//i, (_m, s) => `http${s}://`);
    return new EgressClient(host, apiKey, apiSecret);
}

/**
 * A dedicated firebase-admin App whose Storage is pinned to REAL GCS for
 * signed-URL generation.
 *
 * Why a separate app? In dev FIREBASE_STORAGE_EMULATOR_HOST is set, which makes
 * the SHARED admin app's Storage SDK (and the @google-cloud/storage client
 * underneath, via STORAGE_EMULATOR_HOST) route to the local emulator. Recording
 * bytes live in REAL GCS (Egress uploaded them from the cloud), so playback must
 * sign against real GCS. The @google-cloud/storage client reads the emulator env
 * once at construction, so we initialise a second, named admin app while that
 * env is stripped — pinning ITS Storage to real GCS — and use explicit SA creds
 * so the v4 signer has the private key it needs. The shared app (and the rest of
 * the app's emulator wiring) is left untouched. Memoised — one app per process.
 */
const RECORDINGS_APP_NAME = "lab-recordings";
let recordingsApp: App | null = null;
function getRecordingsApp(): App {
    if (recordingsApp) return recordingsApp;

    // Reuse if a prior call (or HMR) already created the named app.
    const existing = getApps().find((a) => a.name === RECORDINGS_APP_NAME);
    if (existing) {
        recordingsApp = existing;
        return existing;
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    const missing: string[] = [];
    if (!projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
    if (missing.length > 0) {
        throw new Error(
            `Lab recording playback is not configured: missing ${missing.join(", ")}.`
        );
    }

    // The underlying @google-cloud/storage client reads STORAGE_EMULATOR_HOST at
    // construction. firebase-admin derives that var from
    // FIREBASE_STORAGE_EMULATOR_HOST. Strip BOTH for the duration of init so this
    // app's Storage targets real GCS, then restore them so the shared app's
    // emulator wiring is unaffected.
    const savedStorageEmu = process.env.STORAGE_EMULATOR_HOST;
    const savedFirebaseEmu = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    try {
        if (savedStorageEmu !== undefined) delete process.env.STORAGE_EMULATOR_HOST;
        if (savedFirebaseEmu !== undefined) delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
        recordingsApp = initializeApp(
            {
                credential: cert({ projectId, clientEmail, privateKey }),
                storageBucket: RECORDINGS_BUCKET,
            },
            RECORDINGS_APP_NAME
        );
    } catch (err) {
        // A concurrent init may have raced us; fall back to the existing app.
        const raced = getApps().find((a) => a.name === RECORDINGS_APP_NAME);
        if (raced) {
            recordingsApp = raced;
        } else {
            throw err;
        }
    } finally {
        if (savedStorageEmu !== undefined) process.env.STORAGE_EMULATOR_HOST = savedStorageEmu;
        if (savedFirebaseEmu !== undefined)
            process.env.FIREBASE_STORAGE_EMULATOR_HOST = savedFirebaseEmu;
    }
    return recordingsApp as App;
}

// ─────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────

export interface StartLabRecordingArgs {
    /** LiveKit room name to record (the session's stable `livekitRoom`). */
    room: string;
    /** Owning session (`labSessions/{sessionId}`). */
    sessionId: string;
    /** Owning class — denormalised onto the recording for class-scoped lists. */
    classId: string;
}

export interface StartLabRecordingResult {
    recordingId: string;
    egressId: string;
    storagePath: string;
}

/**
 * Start recording a room: kick off a LiveKit Room Composite Egress that writes
 * an MP4 to GCS, create the `labRecordings/{id}` doc in `processing`, and link
 * it from the session (`labSessions/{sessionId}.recordingId` + an in-progress
 * `egressId`). Returns the ids + storage path so the caller can ack the teacher
 * and later stop it.
 *
 * The MP4 lands at `lab-recordings/{classId}/{sessionId}/{epoch}.mp4` — epoch
 * keeps re-records of the same session from colliding.
 */
export async function startLabRecording(
    args: StartLabRecordingArgs
): Promise<StartLabRecordingResult> {
    const { room, sessionId, classId } = args;
    if (!room || !sessionId || !classId) {
        throw new Error("startLabRecording requires room, sessionId and classId.");
    }

    const epoch = Date.now();
    const storagePath = `lab-recordings/${classId}/${sessionId}/${epoch}.mp4`;

    // Compose the GCS file output: MP4 → GCPUpload(bucket, credentials.json).
    const fileOutput = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: storagePath,
        output: {
            case: "gcp",
            value: new GCPUpload({
                bucket: RECORDINGS_BUCKET,
                credentials: buildGcpCredentials(),
            }),
        },
    });

    // Fire the egress first — if LiveKit/GCS is mis-provisioned we surface that
    // before writing any Firestore state (no orphaned `processing` doc).
    const egress = getEgressClient();
    const info: EgressInfo = await egress.startRoomCompositeEgress(room, fileOutput, {
        layout: "grid",
    });
    const egressId = info.egressId;
    if (!egressId) {
        throw new Error("LiveKit did not return an egressId for the recording.");
    }

    const now = Timestamp.now();
    const ref = adminDb.collection(LAB_RECORDINGS).doc();

    // The recording document (contract — see module footer note in the
    // workflow output). status 'processing' until reconcile flips it.
    await ref.set({
        sessionId,
        classId,
        storagePath,
        status: "processing" as LabRecording["status"],
        durationSec: 0,
        chapters: [],
        egressId,
        createdAt: now,
        updatedAt: now,
    });

    // Link the recording onto the session + stash the in-progress egressId so a
    // stop/reconcile can find it even without the recordingId in hand.
    await adminDb
        .collection("labSessions")
        .doc(sessionId)
        .set(
            { recordingId: ref.id, egressId, updatedAt: now },
            { merge: true }
        );

    return { recordingId: ref.id, egressId, storagePath };
}

// ─────────────────────────────────────────────────────────────────────
// Reconcile (shared writer for poll-on-stop + webhook)
// ─────────────────────────────────────────────────────────────────────

/** Map a settled EgressInfo onto the fields we persist; null if not settled. */
function egressToUpdate(info: EgressInfo | undefined):
    | { status: LabRecording["status"]; durationSec: number }
    | null {
    if (!info) return null;
    switch (info.status) {
        case EgressStatus.EGRESS_COMPLETE: {
            // Prefer the (non-deprecated) fileResults; fall back to the
            // deprecated single `result.file` for older servers.
            const file =
                info.fileResults?.[0] ??
                (info.result?.case === "file" ? info.result.value : undefined);
            return {
                status: "ready",
                durationSec: fileDurationToSec(file?.duration),
            };
        }
        case EgressStatus.EGRESS_FAILED:
        case EgressStatus.EGRESS_ABORTED:
            return { status: "failed", durationSec: 0 };
        default:
            // STARTING / ACTIVE / ENDING / LIMIT_REACHED — not settled yet.
            return null;
    }
}

/**
 * Re-poll LiveKit for one egress and update the recording doc to match. Used by
 * the webhook (prod/crash recovery) and a GET refresh. Idempotent and resilient:
 * a still-running egress leaves the doc as-is (`processing`); a missing egress
 * or transient error is swallowed (logged) so callers never 500 on reconcile.
 *
 * Returns the latest serialisable view of the recording (or null if unknown).
 */
export async function reconcileRecording(
    recordingId: string
): Promise<{ status: LabRecording["status"]; durationSec: number } | null> {
    if (!recordingId) return null;
    const ref = labRecordingRef(recordingId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() as any;

    const current: LabRecording["status"] = data?.status ?? "processing";
    const egressId: string | undefined = data?.egressId;
    // Already terminal, or never had an egress — nothing to reconcile.
    if (current === "ready" || current === "failed") {
        return { status: current, durationSec: data?.durationSec ?? 0 };
    }
    if (!egressId) return { status: current, durationSec: data?.durationSec ?? 0 };

    try {
        const egress = getEgressClient();
        const list = await egress.listEgress({ egressId });
        const update = egressToUpdate(list?.[0]);
        if (!update) {
            // Still processing — leave for the next poll / the webhook.
            return { status: current, durationSec: data?.durationSec ?? 0 };
        }
        await ref.set(
            {
                status: update.status,
                durationSec: update.durationSec,
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        );
        return update;
    } catch (err) {
        // Reconcile is best-effort; never surface a transient LiveKit hiccup.
        console.warn(`reconcileRecording(${recordingId}) skipped:`, err);
        return { status: current, durationSec: data?.durationSec ?? 0 };
    }
}

// ─────────────────────────────────────────────────────────────────────
// Stop (poll-first finalisation)
// ─────────────────────────────────────────────────────────────────────

export interface StopLabRecordingResult {
    recordingId: string;
    status: LabRecording["status"];
    durationSec: number;
}

/**
 * Stop a recording and finalise its status by POLLING (the primary path, since
 * the completion webhook can't reach localhost in dev):
 *   1. load the doc → its egressId,
 *   2. stopEgress(egressId) (best-effort: a finished/unknown egress isn't fatal),
 *   3. listEgress({ egressId }) a few times with short waits until status
 *      settles → write 'ready' (+ durationSec) or 'failed'.
 * If it's still processing after the attempts we leave the doc `processing` for
 * the webhook to finalise. Resilient throughout — a teacher's "stop" click must
 * not 500 just because reconcile is slow.
 */
export async function stopLabRecording(args: {
    recordingId: string;
}): Promise<StopLabRecordingResult> {
    const { recordingId } = args;
    if (!recordingId) throw new Error("stopLabRecording requires a recordingId.");

    const ref = labRecordingRef(recordingId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new Error("Recording not found.");
    }
    const data = snap.data() as any;
    const egressId: string | undefined = data?.egressId;
    let status: LabRecording["status"] = data?.status ?? "processing";
    let durationSec: number = data?.durationSec ?? 0;

    // Already terminal — idempotent stop.
    if (status === "ready" || status === "failed") {
        return { recordingId, status, durationSec };
    }
    if (!egressId) {
        // No egress to stop; mark failed so the UI doesn't spin forever.
        await ref.set(
            { status: "failed", updatedAt: Timestamp.now() },
            { merge: true }
        );
        return { recordingId, status: "failed", durationSec: 0 };
    }

    const egress = getEgressClient();

    // (2) Ask LiveKit to stop. Best-effort: if it already ended (or the id is
    // unknown) that's fine — we still reconcile below.
    try {
        await egress.stopEgress(egressId);
    } catch (err) {
        console.warn(`stopEgress(${egressId}) non-fatal:`, err);
    }

    // (3) Poll until the egress settles or we run out of attempts.
    for (let attempt = 0; attempt < RECONCILE_MAX_ATTEMPTS; attempt++) {
        try {
            const list = await egress.listEgress({ egressId });
            const update = egressToUpdate(list?.[0]);
            if (update) {
                status = update.status;
                durationSec = update.durationSec;
                break;
            }
        } catch (err) {
            console.warn(`listEgress(${egressId}) attempt ${attempt} failed:`, err);
        }
        await sleep(RECONCILE_DELAY_MS);
    }

    // Persist whatever we settled on. If we never settled, status is still
    // 'processing' and the webhook (reconcileRecording) will finalise it later.
    await ref.set(
        { status, durationSec, updatedAt: Timestamp.now() },
        { merge: true }
    );

    return { recordingId, status, durationSec };
}

// ─────────────────────────────────────────────────────────────────────
// Signed playback URL (REAL bucket — never the emulator)
// ─────────────────────────────────────────────────────────────────────

/**
 * Mint a short-lived (15 min) SIGNED READ url for a recording's MP4. Targets
 * REAL GCS via the dedicated `getRecordingsApp()` Storage (NOT the storage
 * emulator), because Egress uploaded the bytes to real GCS. Returns the URL
 * string; the route/serializer puts it on `LabRecording.url`.
 */
export async function getRecordingPlaybackUrl(storagePath: string): Promise<string> {
    if (!storagePath) throw new Error("getRecordingPlaybackUrl requires a storagePath.");
    const [url] = await getStorage(getRecordingsApp())
        .bucket(RECORDINGS_BUCKET)
        .file(storagePath)
        .getSignedUrl({
            action: "read",
            expires: Date.now() + PLAYBACK_URL_TTL_MS,
            version: "v4",
        });
    return url;
}
