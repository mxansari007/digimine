import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    MUTABLE_TYPES,
    NOTIFICATION_PREFS,
    serializeNotificationPrefs,
} from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/** Read the caller's notification preferences (defaults: everything ON). */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
        const snap = await adminDb.collection(NOTIFICATION_PREFS).doc(userId).get();
        return NextResponse.json({ prefs: serializeNotificationPrefs(snap.data() || {}) });
    } catch (error: any) {
        console.error("Get notification prefs failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}

/**
 * Update one or more preferences. Body either:
 *   { type: "dm", enabled: false }  — toggle one
 *   { prefs: { dm: false, announcement: true } } — set several
 * Only the known MUTABLE_TYPES are accepted; anything else is ignored.
 */
export async function PATCH(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const update: Record<string, boolean> = {};
        if (typeof body.type === "string" && MUTABLE_TYPES.includes(body.type)) {
            update[body.type] = body.enabled !== false;
        }
        if (body.prefs && typeof body.prefs === "object") {
            for (const t of MUTABLE_TYPES) {
                if (t in body.prefs) update[t] = body.prefs[t] !== false;
            }
        }
        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
        }

        await adminDb
            .collection(NOTIFICATION_PREFS)
            .doc(userId)
            .set({ ...update, updatedAt: Timestamp.now() }, { merge: true });

        const snap = await adminDb.collection(NOTIFICATION_PREFS).doc(userId).get();
        return NextResponse.json({ prefs: serializeNotificationPrefs(snap.data() || {}) });
    } catch (error: any) {
        console.error("Update notification prefs failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
