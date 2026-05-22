/**
 * Server-side abuse prevention helpers used by signup / onboarding flows.
 *
 * Defense layers we apply for institutes (teacher onboarding has its own
 * inline checks in /api/teacher/onboard):
 *
 *   1. Identity uniqueness — one user can own at most one institute
 *      (enforced in /api/institute/register via findInstituteForAdmin).
 *   2. Phone verification — caller must have a Firebase-OTP-verified phone
 *      written to users/{uid}.phoneNumber before they reach register.
 *   3. Phone deduplication — the same phone may not own more than one
 *      institute.
 *   4. Disposable email blocklist — common throwaway domains are refused
 *      as the contact email.
 *   5. Velocity caps — per-IP-hash creation budget over 24 h and 7 d.
 *   6. Suspicious-name flagger — obviously throwaway names (test, asdf,
 *      lorem, …) get flagged in the audit log so super_admin can review.
 *   7. Append-only audit log — every attempt (created / blocked / dup)
 *      writes to institute_signup_logs for offline review.
 *
 * None of these are perfect on their own; the point is to stack enough
 * friction that bulk creation becomes uneconomical.
 */
import crypto from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

// ────────────────────────────────────────────────────────────────────
// Request identity
// ────────────────────────────────────────────────────────────────────

export function getRequestIp(req: Request): string {
    const fwd = req.headers.get("x-forwarded-for") || "";
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
    return "unknown";
}

export function hashIp(ip: string): string {
    return crypto.createHash("sha256").update(`digimine:${ip}`).digest("hex").slice(0, 32);
}

export function getRequestUserAgent(req: Request): string {
    return (req.headers.get("user-agent") || "").slice(0, 240);
}

// ────────────────────────────────────────────────────────────────────
// Disposable email domains
// ────────────────────────────────────────────────────────────────────

const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
    "10minutemail.com",
    "10minutemail.net",
    "20minutemail.com",
    "anonbox.net",
    "armyspy.com",
    "binkmail.com",
    "burnermail.io",
    "cuvox.de",
    "dayrep.com",
    "deadaddress.com",
    "discard.email",
    "discardmail.com",
    "dispostable.com",
    "dodgit.com",
    "einrot.com",
    "fakeinbox.com",
    "fakemailgenerator.com",
    "fastacura.com",
    "filzmail.com",
    "freemailto.net",
    "gawab.com",
    "getairmail.com",
    "getnada.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "harakirimail.com",
    "incognitomail.org",
    "inboxbear.com",
    "jetable.org",
    "kasmail.com",
    "klzlk.com",
    "mailcatch.com",
    "mailde.de",
    "mailexpire.com",
    "mailforspam.com",
    "mailimate.com",
    "mailinator.com",
    "mailinator.net",
    "mailinator.org",
    "mailmoat.com",
    "mailnesia.com",
    "mailnull.com",
    "maildrop.cc",
    "moakt.cc",
    "moakt.com",
    "mohmal.com",
    "mytrashmail.com",
    "nada.email",
    "nospam.ze.tc",
    "objectmail.com",
    "putthisinyourspamdatabase.com",
    "rcpt.at",
    "rmqkr.net",
    "sharklasers.com",
    "spam4.me",
    "spamavert.com",
    "spambox.us",
    "spamgourmet.com",
    "spamherelots.com",
    "spamhereplease.com",
    "supermailer.jp",
    "tempinbox.com",
    "tempmail.com",
    "tempmail.net",
    "tempmailaddress.com",
    "tempr.email",
    "throwawaymail.com",
    "trash-mail.com",
    "trashmail.com",
    "trashmail.de",
    "trashmail.net",
    "trbvm.com",
    "tyldd.com",
    "yopmail.com",
    "yopmail.net",
    "zehnminutenmail.de",
]);

export function isDisposableEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    const at = email.lastIndexOf("@");
    if (at < 0) return false;
    const domain = email.slice(at + 1).trim().toLowerCase();
    if (!domain) return false;
    return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

// ────────────────────────────────────────────────────────────────────
// Suspicious name heuristics
// ────────────────────────────────────────────────────────────────────

const SUSPICIOUS_NAME_TOKENS = [
    "test",
    "tester",
    "asdf",
    "qwerty",
    "qweqwe",
    "lorem",
    "ipsum",
    "foo",
    "bar",
    "abc",
    "xyz",
    "delete",
    "demo123",
    "spam",
    "fake",
    "nothing",
];

export function isSuspiciousName(name: string | null | undefined): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    if (trimmed.length < 3) return true;
    // 5+ identical chars in a row, e.g. "aaaaa"
    if (/(.)\1{4,}/.test(trimmed)) return true;
    const lower = trimmed.toLowerCase();
    return SUSPICIOUS_NAME_TOKENS.some(
        (t) => lower === t || lower.startsWith(`${t} `) || lower === `${t}123`
    );
}

// ────────────────────────────────────────────────────────────────────
// Phone helpers
// ────────────────────────────────────────────────────────────────────

export function normalisePhone(phone: string | null | undefined): string {
    if (!phone) return "";
    return phone.replace(/[\s()-]/g, "").trim();
}

export async function getUserPhoneNumber(userId: string): Promise<string> {
    const snap = await adminDb.collection("users").doc(userId).get();
    if (!snap.exists) return "";
    const phone = snap.data()?.phoneNumber;
    return typeof phone === "string" ? phone : "";
}

export async function isInstituteOwnerPhoneTaken(
    phone: string,
    excludeUserId: string
): Promise<boolean> {
    const normalised = normalisePhone(phone);
    if (!normalised) return false;
    const snap = await adminDb
        .collection("institutes")
        .where("ownerPhone", "==", normalised)
        .limit(2)
        .get();
    for (const doc of snap.docs) {
        if (doc.data()?.ownerId !== excludeUserId) return true;
    }
    return false;
}

// ────────────────────────────────────────────────────────────────────
// Velocity caps
// ────────────────────────────────────────────────────────────────────

export interface VelocityWindowResult {
    last24h: number;
    last7d: number;
}

const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D = 7 * 24 * 60 * 60 * 1000;

export async function countRecentInstituteSignups(
    ipHash: string
): Promise<VelocityWindowResult> {
    if (!ipHash) return { last24h: 0, last7d: 0 };
    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - MS_7D);
    const snap = await adminDb
        .collection("institute_signup_logs")
        .where("ipHash", "==", ipHash)
        .where("createdAt", ">=", sevenDaysAgo)
        .get();
    const now = Date.now();
    let last24h = 0;
    let last7d = 0;
    snap.docs.forEach((d) => {
        const data = d.data() || {};
        const ts: Timestamp | undefined = data.createdAt;
        const created = ts?.toMillis ? ts.toMillis() : 0;
        // Only count successful or hard-rejected attempts (skip "duplicate"
        // returns of the same institute — those aren't new creations).
        const outcome = data.outcome || "created";
        if (outcome === "duplicate") return;
        if (now - created <= MS_7D) last7d += 1;
        if (now - created <= MS_24H) last24h += 1;
    });
    return { last24h, last7d };
}

// Per-IP creation budgets. Tuned for organic signups: 3 in 24h, 5 in 7d.
export const INSTITUTE_SIGNUP_CAP_24H = 3;
export const INSTITUTE_SIGNUP_CAP_7D = 5;

// ────────────────────────────────────────────────────────────────────
// Audit log
// ────────────────────────────────────────────────────────────────────

export type InstituteSignupOutcome =
    | "created"
    | "duplicate"
    | "rejected_phone_missing"
    | "rejected_phone_reused"
    | "rejected_disposable_email"
    | "rejected_velocity"
    | "rejected_name"
    | "error";

export interface LogInstituteSignupInput {
    userId: string | null;
    outcome: InstituteSignupOutcome;
    /** Institute id when one was created (or matched). */
    instituteId?: string | null;
    reason?: string | null;
    name?: string | null;
    contactEmail?: string | null;
    ipHash: string;
    userAgent: string;
    flagged?: boolean;
}

export async function logInstituteSignupAttempt(
    input: LogInstituteSignupInput
): Promise<void> {
    try {
        await adminDb.collection("institute_signup_logs").add({
            userId: input.userId || null,
            outcome: input.outcome,
            instituteId: input.instituteId || null,
            reason: input.reason || null,
            name: input.name || null,
            contactEmail: input.contactEmail ? input.contactEmail.toLowerCase() : null,
            ipHash: input.ipHash,
            userAgent: input.userAgent,
            flagged: input.flagged === true,
            createdAt: Timestamp.now(),
        });
    } catch (err) {
        // Audit log failures must never block signup — best effort.
        console.error("logInstituteSignupAttempt failed:", err);
    }
}
