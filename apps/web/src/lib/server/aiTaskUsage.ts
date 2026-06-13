/**
 * Period-aware AI task usage counters — the plan-allowance meter behind
 * the overflow model. Generalises the old daily `aiUsage` counter to any
 * AI task and any admin-chosen window (day / week / month / year).
 *
 * Storage: `aiTaskUsage/{userId}__{task}__{periodKey}` =
 *   { userId, task, period, count, updatedAt }
 *
 * Periods roll on IST boundaries (the user-facing day), matching the rest
 * of the platform. A task's allowance (`{ limit, period }`) comes from the
 * resolved teaching plan; this module only counts and splits a request
 * into the plan-covered part (`fromQuota`) and the part that must be paid
 * with credits (`overflow`). Writes use a transaction so concurrent
 * requests can't over-spend the allowance.
 */
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import type { AiAllowance, AiQuotaPeriod, AiQuotaTask } from "@digimine/types";

const IST_OFFSET_MIN = 330; // UTC+5:30

/** The IST-shifted Date whose UTC fields read as IST wall-clock values. */
function istDate(now: Date): Date {
    return new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
}

function isoWeekKey(ist: Date): string {
    // ISO-8601 week number of the IST date (Mon-based, week containing Thu).
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
    const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // shift to the week's Thursday
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week =
        1 +
        Math.round(
            ((d.getTime() - firstThursday.getTime()) / 86_400_000 -
                3 +
                ((firstThursday.getUTCDay() + 6) % 7)) /
                7
        );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Stable counter key for a period at `now` (IST). */
export function periodKeyFor(period: AiQuotaPeriod, now: Date = new Date()): string {
    const ist = istDate(now);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
    const d = String(ist.getUTCDate()).padStart(2, "0");
    switch (period) {
        case "day":
            return `day-${y}-${m}-${d}`;
        case "week":
            return `week-${isoWeekKey(ist)}`;
        case "month":
            return `month-${y}-${m}`;
        case "year":
            return `year-${y}`;
    }
}

function docId(userId: string, task: AiQuotaTask, periodKey: string): string {
    return `${userId}__${task}__${periodKey}`;
}

export interface AiTaskReservation {
    /** Uses covered by the plan allowance (free). */
    fromQuota: number;
    /** Uses beyond the allowance — must be paid with credits. */
    overflow: number;
    /** The period key the quota was charged against (for refunds). */
    periodKey: string;
    /** Usage count after reserving `fromQuota`. */
    usedAfter: number;
}

/**
 * Reserve up to `count` uses of `task` against the plan allowance for the
 * current period, returning the plan-covered / overflow split. Only the
 * `fromQuota` part is written to the counter; overflow is paid in credits.
 *
 * `allowance.limit`: -1 = unlimited (all from quota), 0 = none (all
 * overflow), > 0 = capped per period.
 */
export async function reserveAiTaskUsage(
    userId: string,
    task: AiQuotaTask,
    count: number,
    allowance: AiAllowance,
    now: Date = new Date()
): Promise<AiTaskReservation> {
    const n = Math.max(0, Math.floor(count));
    const periodKey = periodKeyFor(allowance.period, now);
    const unlimited = allowance.limit < 0;
    const ref = adminDb.collection("aiTaskUsage").doc(docId(userId, task, periodKey));
    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() || {} : {};
        const used = typeof data.count === "number" ? data.count : 0;
        const remaining = unlimited ? n : Math.max(0, allowance.limit - used);
        const fromQuota = Math.min(n, remaining);
        const usedAfter = used + fromQuota;
        if (fromQuota > 0) {
            tx.set(
                ref,
                { userId, task, period: periodKey, count: usedAfter, updatedAt: Timestamp.now() },
                { merge: true }
            );
        }
        return { fromQuota, overflow: n - fromQuota, periodKey, usedAfter };
    });
}

/** Give back `count` plan-quota uses to a specific period (failure path). */
export async function refundAiTaskUsage(
    userId: string,
    task: AiQuotaTask,
    periodKey: string,
    count: number
): Promise<void> {
    const n = Math.floor(count);
    if (n <= 0) return;
    const ref = adminDb.collection("aiTaskUsage").doc(docId(userId, task, periodKey));
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const used = typeof snap.data()?.count === "number" ? snap.data()!.count : 0;
        tx.set(ref, { count: Math.max(0, used - n), updatedAt: Timestamp.now() }, { merge: true });
    });
}

export interface AiTaskUsageSnapshot {
    used: number;
    periodKey: string;
}

/** Current usage for `task` in the allowance's period (display only). */
export async function getAiTaskUsage(
    userId: string,
    task: AiQuotaTask,
    allowance: AiAllowance,
    now: Date = new Date()
): Promise<AiTaskUsageSnapshot> {
    const periodKey = periodKeyFor(allowance.period, now);
    const snap = await adminDb.collection("aiTaskUsage").doc(docId(userId, task, periodKey)).get();
    const used = snap.exists && typeof snap.data()?.count === "number" ? snap.data()!.count : 0;
    return { used, periodKey };
}
