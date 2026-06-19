import { randomBytes } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Desktop-agent pairing codes.
 *
 * The web app and the installable Lab Agent can't share a Firebase login, so we
 * bridge them with a short-lived, single-use PAIRING CODE:
 *   1. The signed-in student (already in the lab) asks the web for a code; we
 *      mint one tied to { sessionId, studentUid } with a 10-min TTL.
 *   2. The student types it into the agent; the agent POSTs it to the PUBLIC
 *      `/api/lab/agent/pair` route, which redeems it (atomically, once) and
 *      mints a LiveKit token for the student's *desktop-agent* identity.
 *
 * The code is the only secret the agent ever holds, and it expires + burns on
 * first use, so a leaked code is low-value. Codes live in `labAgentPairings`
 * (doc id = the normalized code), written/read with the admin SDK only.
 */

const COLLECTION = "labAgentPairings";
const TTL_MS = 10 * 60 * 1000; // 10 minutes
// Crockford-ish alphabet: no 0/O/1/I so a student can't mistype a code.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;

/** A fresh random code (uppercase, no separator). */
function freshCode(): string {
    const bytes = randomBytes(CODE_LEN);
    let out = "";
    for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

/** "ABCD-EFGH" for display. */
export function formatPairingCode(code: string): string {
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Normalize a user-typed code (strip spaces/dashes, uppercase) → the doc id. */
function normalizeCode(input: string): string {
    return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface PairingRecord {
    code: string;
    sessionId: string;
    studentUid: string;
    studentName: string;
    createdAt: Timestamp;
    expiresAt: Timestamp;
    usedAt: Timestamp | null;
}

/**
 * Create a pairing code for { sessionId, studentUid }. Retries on the
 * (astronomically unlikely) doc-id collision. Returns the DISPLAY code (dashed)
 * plus its TTL.
 */
export async function createPairingCode(
    sessionId: string,
    studentUid: string,
    studentName: string
): Promise<{ code: string; expiresInSec: number }> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = freshCode();
        const ref = adminDb.collection(COLLECTION).doc(code);
        const now = Timestamp.now();
        try {
            // `create` fails if the doc already exists → treat as a collision.
            await ref.create({
                code,
                sessionId,
                studentUid,
                studentName,
                createdAt: now,
                expiresAt: Timestamp.fromMillis(now.toMillis() + TTL_MS),
                usedAt: null,
            });
            return { code: formatPairingCode(code), expiresInSec: Math.round(TTL_MS / 1000) };
        } catch {
            /* collision — try a new code */
        }
    }
    throw new Error("Could not allocate a pairing code. Please try again.");
}

/**
 * Redeem a pairing code, ATOMICALLY and ONCE (a transaction claims `usedAt`).
 * Throws a friendly message when the code is invalid / used / expired.
 */
export async function redeemPairingCode(
    rawCode: string
): Promise<{ sessionId: string; studentUid: string; studentName: string }> {
    const code = normalizeCode(rawCode);
    if (code.length !== CODE_LEN) {
        throw new Error("Enter the pairing code shown in the web app.");
    }
    const ref = adminDb.collection(COLLECTION).doc(code);
    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error("That pairing code is invalid or has expired.");
        const data = snap.data() as PairingRecord;
        if (data.usedAt) {
            throw new Error("That pairing code was already used. Generate a new one in the web app.");
        }
        if (data.expiresAt.toMillis() < Date.now()) {
            throw new Error("That pairing code has expired. Generate a new one in the web app.");
        }
        tx.update(ref, { usedAt: Timestamp.now() });
        return {
            sessionId: data.sessionId,
            studentUid: data.studentUid,
            studentName: data.studentName || "Student",
        };
    });
}
