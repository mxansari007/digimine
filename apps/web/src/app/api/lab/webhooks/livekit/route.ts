import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { adminDb } from "@/lib/firebase/admin";
import { LAB_RECORDINGS, reconcileRecording } from "@/lib/server/labRecording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lab/webhooks/livekit — the LiveKit Cloud Egress completion webhook.
 *
 * This is the PROD / crash-recovery path for recording status. In dev the
 * primary path is poll-on-stop (the cloud webhook can't reach localhost); in
 * prod LiveKit POSTs a JWT-signed `egress_ended` / `egress_updated` event here
 * when a recording finishes, and we reconcile the matching `labRecordings` doc.
 *
 * Security: the body is a JWT-signed envelope. We MUST verify it with
 * WebhookReceiver against LIVEKIT_API_KEY/SECRET using the RAW request body +
 * the `Authorization` header — so this route reads `req.text()` (never
 * `req.json()`, which would re-serialise and break the signature) and runs on
 * the nodejs runtime.
 *
 * We map the event's `egressId` back to a recording (egressId is persisted on
 * every recording doc by startLabRecording) and call `reconcileRecording`, the
 * same single-shot writer the GET-refresh uses. Always returns 200 on a verified
 * event — even one we don't recognise — so LiveKit doesn't endlessly retry; only
 * a signature/verification failure returns 401.
 */
export async function POST(req: Request) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
        // Mis-provisioned deploy — we can't verify the signature, so refuse.
        console.error("LiveKit webhook: missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET.");
        return NextResponse.json(
            { error: "LiveKit webhooks are not configured." },
            { status: 500 }
        );
    }

    // RAW body + Authorization header are both required for JWT verification.
    const rawBody = await req.text();
    const authHeader = req.headers.get("authorization") || undefined;

    const receiver = new WebhookReceiver(apiKey, apiSecret);
    let event;
    try {
        event = await receiver.receive(rawBody, authHeader);
    } catch (err) {
        // Signature mismatch / expired token / malformed body.
        console.warn("LiveKit webhook verification failed:", err);
        return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    try {
        // Only egress lifecycle events carry the recording we care about.
        if (event.event === "egress_ended" || event.event === "egress_updated") {
            const egressId = event.egressInfo?.egressId;
            if (egressId) {
                // Map egressId → recording (persisted on the doc at start time).
                const snap = await adminDb
                    .collection(LAB_RECORDINGS)
                    .where("egressId", "==", egressId)
                    .limit(1)
                    .get();
                if (!snap.empty) {
                    await reconcileRecording(snap.docs[0].id);
                } else {
                    // An egress we don't track (or already pruned) — ack anyway.
                    console.warn(
                        `LiveKit webhook: no recording for egressId ${egressId}.`
                    );
                }
            }
        }
    } catch (err) {
        // The event verified fine; a reconcile hiccup shouldn't make LiveKit
        // retry forever. Log and ack — the GET-refresh poll will catch up.
        console.error("LiveKit webhook reconcile failed:", err);
    }

    // Always ack a verified event so LiveKit stops retrying.
    return NextResponse.json({ received: true });
}
