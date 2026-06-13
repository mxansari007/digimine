import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { DEVICE_TOKENS, deviceDocId } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/**
 * Register this device's Expo push token under the signed-in user. Keyed by
 * the token itself so re-registering is idempotent and one token never maps
 * to two users (a shared device that switched accounts re-points cleanly).
 * Body: { token, platform? }.
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const token = typeof body.token === "string" ? body.token.trim() : "";
        // Accept native FCM device tokens (the current path) and legacy Expo
        // tokens. FCM tokens are long opaque strings; just sanity-check length.
        if (token.length < 20 || token.length > 4096) {
            return NextResponse.json({ error: "Invalid push token." }, { status: 400 });
        }
        const platform = typeof body.platform === "string" ? body.platform.slice(0, 20) : "unknown";

        await adminDb
            .collection(DEVICE_TOKENS)
            .doc(deviceDocId(token))
            .set(
                { userId, token, platform, updatedAt: Timestamp.now() },
                { merge: true }
            );
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Register device failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/** Unregister on sign-out. Body: { token }. */
export async function DELETE(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

        const ref = adminDb.collection(DEVICE_TOKENS).doc(deviceDocId(token));
        const snap = await ref.get();
        // Only delete a token that belongs to the caller.
        if (snap.exists && snap.data()?.userId === userId) await ref.delete();
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Unregister device failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
