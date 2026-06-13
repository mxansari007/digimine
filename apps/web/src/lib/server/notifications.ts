/**
 * Notifications + push delivery.
 *
 * Every user-facing event (a DM, a class announcement, a reply to your thread,
 * a shared resource, a report routed to a teacher) writes a notifications/{id}
 * doc for the recipient (the in-app feed) and best-effort sends a push to their
 * registered devices.
 *
 * Push is delivered via **FCM** through firebase-admin — the mobile app
 * registers its native FCM device token (apps/mobile/lib/push.ts). Per-user
 * preferences (notificationPrefs/{uid}) can MUTE a category: a muted category
 * writes NO doc and sends NO push. All collections are server-only (admin SDK);
 * see firestore.rules.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { adminApp, adminDb } from "@/lib/firebase/admin";
import { toIsoDate } from "@/lib/server/classroomAccess";

export const NOTIFICATIONS = "notifications";
export const DEVICE_TOKENS = "deviceTokens";
export const NOTIFICATION_PREFS = "notificationPrefs";

export type NotificationType =
    | "dm"
    | "announcement"
    | "thread_reply"
    | "answer_marked"
    | "report"
    | "resource_shared";

/**
 * Categories a user can mute from the app. `report` is intentionally NOT here
 * — it's a teacher-safety alert that always delivers. Each maps to a
 * notificationPrefs boolean; an absent doc/key means enabled.
 */
export const MUTABLE_TYPES: NotificationType[] = [
    "dm",
    "announcement",
    "thread_reply",
    "answer_marked",
    "resource_shared",
];

export interface NotificationInput {
    type: NotificationType;
    title: string;
    body: string;
    /** Deep-link payload the client uses to route on tap. */
    data?: Record<string, any>;
    actorId?: string | null;
    actorName?: string | null;
}

function notifDoc(userId: string, input: NotificationInput, now: Timestamp) {
    return {
        userId,
        type: input.type,
        title: input.title.slice(0, 160),
        body: input.body.slice(0, 400),
        data: input.data || {},
        actorId: input.actorId || null,
        actorName: input.actorName || null,
        read: false,
        createdAt: now,
    };
}

/** Fill defaults (everything enabled) over a stored prefs doc. */
export function serializeNotificationPrefs(data: any): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const t of MUTABLE_TYPES) out[t] = data?.[t] !== false; // default ON
    return out;
}

/** The recipients who have NOT muted this notification type (default = allowed). */
async function allowedRecipients(
    userIds: string[],
    type: NotificationType
): Promise<string[]> {
    const ids = Array.from(new Set(userIds)).filter(Boolean);
    if (ids.length === 0 || !MUTABLE_TYPES.includes(type)) return ids;
    const refs = ids.map((id) => adminDb.collection(NOTIFICATION_PREFS).doc(id));
    const snaps = await adminDb.getAll(...refs);
    return ids.filter((_, i) => snaps[i].data()?.[type] !== false);
}

/** Notify one recipient (skips self-notifications and muted categories). */
export async function createNotification(
    userId: string,
    input: NotificationInput
): Promise<void> {
    if (!userId || userId === input.actorId) return;
    const allowed = await allowedRecipients([userId], input.type);
    if (allowed.length === 0) return; // user muted this category
    const now = Timestamp.now();
    await adminDb.collection(NOTIFICATIONS).doc().set(notifDoc(userId, input, now));
    void sendPushToUsers([userId], input);
}

/** Fan a single event out to many recipients (e.g. a class announcement). */
export async function createNotifications(
    userIds: string[],
    input: NotificationInput
): Promise<void> {
    const recipients = await allowedRecipients(
        userIds.filter((id) => id && id !== input.actorId),
        input.type
    );
    if (recipients.length === 0) return;
    const now = Timestamp.now();
    for (let i = 0; i < recipients.length; i += 400) {
        const batch = adminDb.batch();
        for (const userId of recipients.slice(i, i + 400)) {
            batch.set(adminDb.collection(NOTIFICATIONS).doc(), notifDoc(userId, input, now));
        }
        await batch.commit();
    }
    void sendPushToUsers(recipients, input);
}

export function serializeNotification(doc: any) {
    const data = doc?.data ? doc.data() : doc;
    if (!data) return null;
    return {
        id: doc.id || data.id,
        type: data.type || "dm",
        title: data.title || "",
        body: data.body || "",
        data: data.data || {},
        actorId: data.actorId ?? null,
        actorName: data.actorName ?? null,
        read: Boolean(data.read),
        createdAt: toIsoDate(data.createdAt),
    };
}

// ── Push (FCM via firebase-admin) ─────────────────────────────────────────

/** Doc id from a push token (brackets/colons aren't great keys). */
export function deviceDocId(token: string): string {
    return token.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 200);
}

/** Collect every recipient's FCM device tokens (skips legacy Expo tokens). */
async function fcmTokensFor(userIds: string[]): Promise<string[]> {
    const lists = await Promise.all(
        Array.from(new Set(userIds)).map(async (uid) => {
            const snap = await adminDb
                .collection(DEVICE_TOKENS)
                .where("userId", "==", uid)
                .get();
            return snap.docs
                .map((d) => d.data()?.token)
                .filter(
                    (t): t is string =>
                        Boolean(t) && !String(t).startsWith("ExponentPushToken")
                );
        })
    );
    return lists.flat();
}

/**
 * Best-effort FCM push to every device of every user. No-ops when nobody has a
 * registered token. Prunes tokens FCM reports as permanently invalid so the
 * collection stays clean.
 */
export async function sendPushToUsers(
    userIds: string[],
    input: NotificationInput
): Promise<void> {
    try {
        const tokens = await fcmTokensFor(userIds);
        if (tokens.length === 0) return;

        // FCM data values MUST be strings.
        const data: Record<string, string> = { type: input.type };
        for (const [k, v] of Object.entries(input.data || {})) {
            data[k] = typeof v === "string" ? v : JSON.stringify(v);
        }

        const messaging = getMessaging(adminApp);
        for (let i = 0; i < tokens.length; i += 500) {
            const slice = tokens.slice(i, i + 500);
            const res = await messaging.sendEachForMulticast({
                tokens: slice,
                notification: { title: input.title, body: input.body },
                data,
                android: {
                    priority: "high",
                    notification: { channelId: "default", sound: "default" },
                },
            });
            // Drop tokens FCM says are dead so we don't keep retrying them.
            const dead: string[] = [];
            res.responses.forEach((r, j) => {
                const code = r.success ? "" : r.error?.code || "";
                if (
                    code.includes("registration-token-not-registered") ||
                    code.includes("invalid-registration-token") ||
                    code.includes("invalid-argument")
                ) {
                    dead.push(slice[j]);
                }
            });
            await Promise.all(
                dead.map((t) =>
                    adminDb.collection(DEVICE_TOKENS).doc(deviceDocId(t)).delete().catch(() => {})
                )
            );
        }
    } catch (err) {
        console.error("sendPush (FCM) failed (non-fatal):", err);
    }
}
