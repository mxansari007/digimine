/**
 * Per-user daily AI question quota tracking.
 *
 * Storage: `aiUsage/{userId}` = { date: "YYYY-MM-DD", count: N, updatedAt }
 * The counter resets when the local IST date changes — we deliberately use
 * IST (the user-facing day boundary) rather than UTC so a teacher creating
 * questions at 11pm IST doesn't accidentally burn two days of quota.
 *
 * Concurrency: writes use a transaction so two parallel requests can't
 * over-spend the cap.
 */
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

const IST_OFFSET_MIN = 330; // UTC+5:30

function istDateString(now: Date = new Date()): string {
    const ms = now.getTime() + IST_OFFSET_MIN * 60_000;
    const ist = new Date(ms);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
    const d = String(ist.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export interface AiUsageSnapshot {
    /** Today's IST date string. */
    date: string;
    /** Questions generated today so far. */
    used: number;
}

export async function getAiUsageToday(userId: string): Promise<AiUsageSnapshot> {
    const ref = adminDb.collection("aiUsage").doc(userId);
    const snap = await ref.get();
    const today = istDateString();
    if (!snap.exists) return { date: today, used: 0 };
    const data = snap.data() || {};
    if (data.date !== today) return { date: today, used: 0 };
    return { date: today, used: typeof data.count === "number" ? data.count : 0 };
}

export type AiUsageCommitResult =
    | { ok: true; used: number }
    | { ok: false; reason: "would_exceed"; used: number; cap: number };

/**
 * Atomically reserve `count` questions against the user's daily quota.
 *
 * - `cap === null`  → unlimited; we still record usage for analytics.
 * - `cap === 0`     → always rejects.
 * - `cap > 0`       → rejects if `used + count > cap`.
 *
 * Caller should invoke this BEFORE making the upstream AI call so we
 * don't spend cents on a request we're about to throw away. If the
 * upstream call fails after a successful commit, see `refundAiUsage`.
 */
export async function commitAiUsage(
    userId: string,
    count: number,
    cap: number | null
): Promise<AiUsageCommitResult> {
    if (cap === 0) {
        return { ok: false, reason: "would_exceed", used: 0, cap: 0 };
    }
    const ref = adminDb.collection("aiUsage").doc(userId);
    const today = istDateString();
    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() || {} : {};
        const usedToday = data.date === today && typeof data.count === "number" ? data.count : 0;
        if (cap !== null && usedToday + count > cap) {
            return {
                ok: false as const,
                reason: "would_exceed" as const,
                used: usedToday,
                cap,
            };
        }
        const nextUsed = usedToday + count;
        tx.set(
            ref,
            {
                date: today,
                count: nextUsed,
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        );
        return { ok: true as const, used: nextUsed };
    });
}

/**
 * Decrement a previously-committed reservation. Use when the upstream
 * AI call failed after `commitAiUsage` succeeded so the user isn't
 * charged for a generation they never received.
 */
export async function refundAiUsage(userId: string, count: number): Promise<void> {
    const ref = adminDb.collection("aiUsage").doc(userId);
    const today = istDateString();
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (data.date !== today) return; // day rolled over; nothing to refund
        const usedToday = typeof data.count === "number" ? data.count : 0;
        const nextUsed = Math.max(0, usedToday - count);
        tx.set(ref, { date: today, count: nextUsed, updatedAt: Timestamp.now() }, { merge: true });
    });
}
