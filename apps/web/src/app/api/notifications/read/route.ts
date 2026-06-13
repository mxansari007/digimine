import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { NOTIFICATIONS } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/**
 * Mark notifications read. Body: { ids?: string[] } — specific ones, or all
 * of mine when omitted. Only ever touches docs the caller owns.
 */
export async function POST(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const ids: string[] = Array.isArray(body.ids)
            ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 200)
            : [];
        const now = Timestamp.now();

        if (ids.length > 0) {
            const batch = adminDb.batch();
            const snaps = await Promise.all(
                ids.map((id) => adminDb.collection(NOTIFICATIONS).doc(id).get())
            );
            let touched = 0;
            for (const snap of snaps) {
                if (snap.exists && snap.data()?.userId === userId) {
                    batch.update(snap.ref, { read: true, readAt: now });
                    touched++;
                }
            }
            if (touched > 0) await batch.commit();
            return NextResponse.json({ ok: true, updated: touched });
        }

        // Mark all of mine that are still unread.
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await adminDb
                .collection(NOTIFICATIONS)
                .where("userId", "==", userId)
                .where("read", "==", false)
                .limit(400)
                .get();
        } catch {
            const all = await adminDb
                .collection(NOTIFICATIONS)
                .where("userId", "==", userId)
                .limit(400)
                .get();
            snap = all;
        }
        const unread = snap.docs.filter((d) => d.data()?.read !== true);
        if (unread.length > 0) {
            const batch = adminDb.batch();
            unread.forEach((d) => batch.update(d.ref, { read: true, readAt: now }));
            await batch.commit();
        }
        return NextResponse.json({ ok: true, updated: unread.length });
    } catch (error: any) {
        console.error("Mark notifications read failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
