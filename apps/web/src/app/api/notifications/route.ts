import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import { NOTIFICATIONS, serializeNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/** My recent notifications, newest first, with an unread count. */
export async function GET(req: Request) {
    try {
        const userId = await getBearerUserId(req).catch(() => null);
        if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

        // Prefer the indexed query; fall back to an unordered fetch + in-code
        // sort when the (userId, createdAt) composite index isn't built yet
        // (the emulator ignores indexes; prod needs `deploy:indexes`).
        let snap: FirebaseFirestore.QuerySnapshot;
        try {
            snap = await adminDb
                .collection(NOTIFICATIONS)
                .where("userId", "==", userId)
                .orderBy("createdAt", "desc")
                .limit(60)
                .get();
        } catch {
            snap = await adminDb
                .collection(NOTIFICATIONS)
                .where("userId", "==", userId)
                .limit(60)
                .get();
        }

        const docs = snap.docs
            .map((d) => serializeNotification(d))
            .filter((n): n is NonNullable<typeof n> => Boolean(n))
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

        const unreadCount = docs.filter((n) => !n.read).length;

        return NextResponse.json({ notifications: docs, unreadCount });
    } catch (error: any) {
        console.error("List notifications failed:", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
