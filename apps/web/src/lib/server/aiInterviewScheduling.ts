/**
 * Slot scheduling + concurrency protection for AI interviews.
 *
 * Live interviews are expensive (LLM per message, code-judge per run, TTS/STT
 * per spoken turn). To keep the infrastructure solid under load we:
 *
 *   1. Bound concurrency with fixed-length time SLOTS, each with a capacity.
 *      One `aiInterviewSlots/{slotKey}` doc per window tracks `booked` vs
 *      `capacity`; reservations are made in a transaction so a slot can never
 *      be over-sold.
 *   2. Allow at most one ACTIVE (scheduled OR in_progress) interview per
 *      student — so a single user can't fan out work, and an in-progress
 *      interview blocks scheduling another.
 *   3. Lazily reap stale sessions on every entry point, so abandoned/no-show
 *      sessions stop occupying the student's one active slot and free capacity.
 *
 * All writes use the admin SDK; clients never touch these docs directly.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    AI_INTERVIEW_ACTIVE_STATUSES,
    DEFAULT_AI_INTERVIEW_SCHEDULING,
    interviewSlotKey,
    interviewSlotStart,
    type AIInterviewSchedulingConfig,
    type AIInterviewSession,
} from "@digimine/types";
import { AI_INTERVIEW_SESSIONS, AI_INTERVIEW_SLOTS, AI_INTERVIEW_QUOTA } from "@/lib/server/aiInterview";
import { refundQuota } from "@/lib/server/entitlements";
import { refundCredits } from "@/lib/server/credits";

const CONFIG_DOC = adminDb.collection("appConfig").doc("aiInterviewScheduling");

function num(v: unknown, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Admin-tunable scheduling config, defaults merged with appConfig override. */
export async function getSchedulingConfig(): Promise<AIInterviewSchedulingConfig> {
    const d = DEFAULT_AI_INTERVIEW_SCHEDULING;
    try {
        const snap = await CONFIG_DOC.get();
        if (!snap.exists) return { ...d };
        const o = snap.data() || {};
        return {
            slotMinutes: num(o.slotMinutes, d.slotMinutes) || d.slotMinutes,
            slotCapacity: num(o.slotCapacity, d.slotCapacity),
            bookingHorizonHours: num(o.bookingHorizonHours, d.bookingHorizonHours),
            joinGraceMin: num(o.joinGraceMin, d.joinGraceMin),
            joinWindowMin: num(o.joinWindowMin, d.joinWindowMin) || d.joinWindowMin,
            maxConcurrentGlobal: num(o.maxConcurrentGlobal, d.maxConcurrentGlobal),
            maxRuntimeMin: num(o.maxRuntimeMin, d.maxRuntimeMin) || d.maxRuntimeMin,
        };
    } catch {
        return { ...d };
    }
}

// ── Slot key <-> window helpers ──────────────────────────────────────────

export interface SlotWindow {
    slotKey: string;
    startsAt: Date;
    endsAt: Date;
}

/** Parse a `YYYY-MM-DDTHHmm` UTC slot key back to its start Date, or null. */
export function parseSlotKey(slotKey: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/.exec(slotKey || "");
    if (!m) return null;
    const [, y, mo, da, h, mi] = m;
    const d = new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function slotWindowFor(start: Date, cfg: AIInterviewSchedulingConfig): SlotWindow {
    const aligned = interviewSlotStart(start, cfg.slotMinutes);
    return {
        slotKey: interviewSlotKey(aligned, cfg.slotMinutes),
        startsAt: aligned,
        endsAt: new Date(aligned.getTime() + cfg.slotMinutes * 60_000),
    };
}

/** The slot containing `now`. */
export function currentSlot(now: Date, cfg: AIInterviewSchedulingConfig): SlotWindow {
    return slotWindowFor(now, cfg);
}

/**
 * Validate a client-supplied slot key: it must be well-formed, grid-aligned,
 * not in the past, and within the booking horizon. Returns the window or null.
 */
export function validateBookableSlot(
    slotKey: string,
    now: Date,
    cfg: AIInterviewSchedulingConfig
): SlotWindow | null {
    const start = parseSlotKey(slotKey);
    if (!start) return null;
    // Must be grid-aligned (re-deriving the key must round-trip).
    if (interviewSlotKey(start, cfg.slotMinutes) !== slotKey) return null;
    const horizon = new Date(now.getTime() + cfg.bookingHorizonHours * 3_600_000);
    // Allow the current slot (start <= now < end) and any future slot up to horizon.
    const win = slotWindowFor(start, cfg);
    if (win.endsAt <= now) return null; // wholly in the past
    if (win.startsAt > horizon) return null; // too far out
    return win;
}

// ── Slot capacity (reserve / release) ────────────────────────────────────

/**
 * Atomically reserve one unit of a slot. Creates the slot doc on first use
 * with capacity snapshotted from config (so later config edits never retro-
 * actively over/under-book a window). Returns false if the slot is full.
 */
export async function reserveSlot(
    win: SlotWindow,
    cfg: AIInterviewSchedulingConfig
): Promise<boolean> {
    const ref = adminDb.collection(AI_INTERVIEW_SLOTS).doc(win.slotKey);
    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
            tx.set(ref, {
                slotKey: win.slotKey,
                startsAt: win.startsAt.toISOString(),
                endsAt: win.endsAt.toISOString(),
                capacity: cfg.slotCapacity,
                booked: 1,
                updatedAt: Timestamp.now(),
            });
            return cfg.slotCapacity >= 1;
        }
        const data = snap.data() || {};
        const capacity = num(data.capacity, cfg.slotCapacity);
        const booked = num(data.booked, 0);
        if (booked >= capacity) return false;
        tx.update(ref, { booked: booked + 1, updatedAt: Timestamp.now() });
        return true;
    });
}

/** Release one unit of a slot (floors at zero). No-op for null/missing slots. */
export async function releaseSlot(slotId: string | null | undefined): Promise<void> {
    if (!slotId) return;
    const ref = adminDb.collection(AI_INTERVIEW_SLOTS).doc(slotId);
    await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const booked = num(snap.data()?.booked, 0);
        if (booked <= 0) return;
        tx.update(ref, { booked: booked - 1, updatedAt: Timestamp.now() });
    });
}

/** Remaining capacity in a slot right now (capacity − booked, floored at 0). */
export async function getSlotRemaining(
    win: SlotWindow,
    cfg: AIInterviewSchedulingConfig
): Promise<number> {
    const snap = await adminDb.collection(AI_INTERVIEW_SLOTS).doc(win.slotKey).get();
    if (!snap.exists) return cfg.slotCapacity;
    const data = snap.data() || {};
    return Math.max(0, num(data.capacity, cfg.slotCapacity) - num(data.booked, 0));
}

export interface OpenSlot {
    slotKey: string;
    startsAt: string;
    remaining: number;
}

/**
 * Upcoming bookable slots (strictly future windows, within the horizon) that
 * still have capacity. Reads the slot docs in one batched getAll.
 */
export async function computeOpenSlots(
    now: Date,
    cfg: AIInterviewSchedulingConfig,
    maxSlots = 48
): Promise<OpenSlot[]> {
    const slotMs = cfg.slotMinutes * 60_000;
    const horizonMs = cfg.bookingHorizonHours * 3_600_000;
    // Start from the NEXT slot after the current one.
    const firstStart = interviewSlotStart(now, cfg.slotMinutes).getTime() + slotMs;
    const windows: SlotWindow[] = [];
    for (let t = firstStart; t <= now.getTime() + horizonMs && windows.length < maxSlots; t += slotMs) {
        windows.push(slotWindowFor(new Date(t), cfg));
    }
    if (windows.length === 0) return [];
    const refs = windows.map((w) => adminDb.collection(AI_INTERVIEW_SLOTS).doc(w.slotKey));
    const snaps = await adminDb.getAll(...refs);
    const out: OpenSlot[] = [];
    windows.forEach((w, i) => {
        const data = snaps[i].exists ? snaps[i].data() || {} : {};
        const remaining = Math.max(0, num(data.capacity, cfg.slotCapacity) - num(data.booked, 0));
        if (remaining > 0) out.push({ slotKey: w.slotKey, startsAt: w.startsAt.toISOString(), remaining });
    });
    return out;
}

// ── Active-session guards ────────────────────────────────────────────────

/** The user's single active (scheduled|in_progress) session, or null. */
export async function getActiveSession(userId: string): Promise<AIInterviewSession | null> {
    const snap = await adminDb
        .collection(AI_INTERVIEW_SESSIONS)
        .where("userId", "==", userId)
        .where("status", "in", AI_INTERVIEW_ACTIVE_STATUSES)
        .limit(1)
        .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as AIInterviewSession;
}

/** Count of interviews live right now — the global concurrency backstop. */
export async function countActiveGlobal(): Promise<number> {
    try {
        const agg = await adminDb
            .collection(AI_INTERVIEW_SESSIONS)
            .where("status", "==", "in_progress")
            .count()
            .get();
        return agg.data().count;
    } catch {
        // If aggregation is unavailable, fall back to a bounded read.
        const snap = await adminDb
            .collection(AI_INTERVIEW_SESSIONS)
            .where("status", "==", "in_progress")
            .limit(1000)
            .get();
        return snap.size;
    }
}

// ── Reaper ────────────────────────────────────────────────────────────────

function addMin(iso: string, min: number): Date {
    return new Date(new Date(iso).getTime() + min * 60_000);
}

/**
 * Effective expiry for a session: prefer the stored `expiresAt`, else derive
 * from the lifecycle timestamps (covers legacy docs written before scheduling).
 */
function effectiveExpiry(s: AIInterviewSession, cfg: AIInterviewSchedulingConfig): Date | null {
    if (s.expiresAt) return new Date(s.expiresAt);
    if (s.status === "in_progress" && s.startedAt) return addMin(s.startedAt, cfg.maxRuntimeMin);
    if (s.status === "scheduled" && s.scheduledAt) return addMin(s.scheduledAt, cfg.joinWindowMin);
    return null;
}

/**
 * Transition one stale session if it's past its effective expiry:
 *   - in_progress past maxRuntime → `abandoned` (+ release slot)
 *   - scheduled past join window  → `expired`   (+ release slot + refund quota)
 * Returns true if it reaped this session.
 */
async function reapOne(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    cfg: AIInterviewSchedulingConfig,
    now: Date
): Promise<boolean> {
    const s = doc.data() as AIInterviewSession;
    const expiry = effectiveExpiry(s, cfg);
    if (!expiry || now <= expiry) return false;

    const nextStatus = s.status === "scheduled" ? "expired" : "abandoned";
    await doc.ref.set(
        { status: nextStatus, expiresAt: null, updatedAt: new Date().toISOString() },
        { merge: true }
    );
    await releaseSlot(s.slotId);
    // A never-joined booking gets its allowance back — credits if it was a
    // credit-paid (over-quota) booking, otherwise the weekly quota unit (never
    // both, since only one paid). An abandoned in-progress interview already
    // consumed real infra, so no refund.
    if (s.status === "scheduled" && s.userId) {
        if ((s.creditsCharged || 0) > 0) {
            await refundCredits({
                userId: s.userId,
                task: "ai_interview",
                amount: s.creditsCharged || 0,
                ref: doc.id,
                note: "Missed booking",
            });
        } else {
            await refundQuota(s.userId, AI_INTERVIEW_QUOTA, new Date(s.createdAt || s.scheduledAt || now));
        }
    }
    return true;
}

/**
 * Lazily transition the caller's stale active sessions so they stop blocking
 * new interviews and free slot capacity. Called at the top of every interview
 * entry point. Returns how many it reaped.
 */
export async function reapStaleSessions(
    userId: string,
    cfg: AIInterviewSchedulingConfig,
    now: Date = new Date()
): Promise<number> {
    const snap = await adminDb
        .collection(AI_INTERVIEW_SESSIONS)
        .where("userId", "==", userId)
        .where("status", "in", AI_INTERVIEW_ACTIVE_STATUSES)
        .get();
    let reaped = 0;
    for (const doc of snap.docs) {
        if (await reapOne(doc, cfg, now)) reaped++;
    }
    return reaped;
}

/**
 * Global sweep (cron) — frees slot capacity leaked by users who abandoned a
 * session and never returned to trigger their own lazy reap. Queries each
 * active status with an `expiresAt <= now` range (needs a (status, expiresAt)
 * composite index). Per-user lazy reap already keeps each student's gating
 * correct; this just self-heals the global slot counts.
 */
export async function reapAllStale(
    cfg: AIInterviewSchedulingConfig,
    now: Date = new Date()
): Promise<number> {
    const nowIso = now.toISOString();
    let reaped = 0;
    for (const status of AI_INTERVIEW_ACTIVE_STATUSES) {
        const snap = await adminDb
            .collection(AI_INTERVIEW_SESSIONS)
            .where("status", "==", status)
            .where("expiresAt", "<=", nowIso)
            .limit(500)
            .get();
        for (const doc of snap.docs) {
            if (await reapOne(doc, cfg, now)) reaped++;
        }
    }
    return reaped;
}
