/**
 * POST /api/onboarding/otp-send
 *
 * Server-side precheck called by `usePhoneOtp` *before* it fires
 * `signInWithPhoneNumber` against Firebase. Purpose: rate-limit OTP sends
 * across (uid, phone, IP) so attackers can't drain our SMS quota by
 * scripting against the client-side 30s countdown.
 *
 * This endpoint does NOT send the SMS itself — Firebase Auth's client SDK
 * does that. We sit in front of it to enforce a per-account / per-IP cap
 * and log every attempt for audit.
 *
 * Rate-limit thresholds (chosen for placement-prep usage patterns):
 *   - 30s minimum between attempts per (uid, phone) pair
 *   - 5 attempts per hour per uid
 *   - 10 attempts per hour per IP-hash
 *
 * Counter storage: `otp_attempts/{auto}` documents with `{ uid, phone,
 * ipHash, createdAt }`. Reads use a `createdAt >= now-1h` range query — a
 * simple-but-correct fixed-window limiter. We don't need a sliding window
 * at this scale.
 *
 * Auth: Bearer Firebase ID token. The caller must be the same uid whose
 * counter we're checking. Unauthenticated callers get 401.
 *
 * Responses:
 *   200  { ok: true }
 *   400  { error }                           // bad phone
 *   401  { error }                           // missing/expired token
 *   429  { error, retryAfterSeconds, reason } // rate-limited
 *   500  { error }
 */
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getBearerUserId } from "@/lib/server/classroomAccess";
import {
    getRequestIp,
    getRequestUserAgent,
    hashIp,
    normalisePhone,
} from "@/lib/server/abuse";

export const dynamic = "force-dynamic";

// Rate-limit thresholds. Tune in one place if abuse patterns shift.
const MIN_GAP_SECONDS_PER_UID_PHONE = 30;
const MAX_PER_UID_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 10;

type RateLimitReason =
    | "cooldown_active"
    | "per_uid_hourly_cap"
    | "per_ip_hourly_cap";

export async function POST(req: Request) {
    const ip = getRequestIp(req);
    const ipHash = hashIp(ip);
    const userAgent = getRequestUserAgent(req);

    try {
        const uid = await getBearerUserId(req).catch(() => null);
        if (!uid) {
            return NextResponse.json(
                { error: "Sign in to request an OTP." },
                { status: 401 }
            );
        }

        const body = (await req.json().catch(() => ({}))) as { phone?: unknown };
        const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
        const phone = normalisePhone(rawPhone);
        if (!phone || !/^\+[1-9]\d{7,15}$/.test(phone)) {
            return NextResponse.json(
                { error: "Invalid phone number." },
                { status: 400 }
            );
        }

        const now = Date.now();
        const oneHourAgo = Timestamp.fromMillis(now - 60 * 60 * 1000);
        const cooldownThreshold = Timestamp.fromMillis(
            now - MIN_GAP_SECONDS_PER_UID_PHONE * 1000
        );

        // 1. Per-(uid,phone) cooldown — strictest, checked first.
        const recentSameTarget = await adminDb
            .collection("otp_attempts")
            .where("uid", "==", uid)
            .where("phone", "==", phone)
            .where("createdAt", ">=", cooldownThreshold)
            .limit(1)
            .get();

        if (!recentSameTarget.empty) {
            const lastAt = recentSameTarget.docs[0].data().createdAt as Timestamp;
            const elapsedMs = now - lastAt.toMillis();
            const retryAfter = Math.max(
                1,
                Math.ceil((MIN_GAP_SECONDS_PER_UID_PHONE * 1000 - elapsedMs) / 1000)
            );
            return rateLimited(
                "Please wait before requesting another OTP for this number.",
                retryAfter,
                "cooldown_active"
            );
        }

        // 2. Per-uid hourly cap — catches "spray different numbers" abuse.
        const uidSnap = await adminDb
            .collection("otp_attempts")
            .where("uid", "==", uid)
            .where("createdAt", ">=", oneHourAgo)
            .get();
        if (uidSnap.size >= MAX_PER_UID_PER_HOUR) {
            return rateLimited(
                "Too many OTP requests. Please try again in an hour.",
                60 * 60,
                "per_uid_hourly_cap"
            );
        }

        // 3. Per-IP hourly cap — catches "same-IP many-accounts" abuse.
        const ipSnap = await adminDb
            .collection("otp_attempts")
            .where("ipHash", "==", ipHash)
            .where("createdAt", ">=", oneHourAgo)
            .get();
        if (ipSnap.size >= MAX_PER_IP_PER_HOUR) {
            return rateLimited(
                "Too many OTP requests from this network. Try again later.",
                60 * 60,
                "per_ip_hourly_cap"
            );
        }

        // Record the attempt BEFORE we tell the client to call Firebase. The
        // worst that can happen is the client decides not to call Firebase
        // (or Firebase fails downstream) and we over-count by one — which
        // makes the limiter slightly more conservative, which is fine.
        await adminDb.collection("otp_attempts").add({
            uid,
            phone,
            ipHash,
            userAgent,
            createdAt: Timestamp.fromMillis(now),
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        const e = err as { message?: string };
        console.error("[/api/onboarding/otp-send] failed", e);
        return NextResponse.json(
            { error: e.message || "OTP precheck failed." },
            { status: 500 }
        );
    }
}

function rateLimited(
    error: string,
    retryAfterSeconds: number,
    reason: RateLimitReason
) {
    return NextResponse.json(
        { error, retryAfterSeconds, reason, code: "rate_limited" },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) },
        }
    );
}
