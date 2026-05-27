/**
 * POST /api/institute/[instituteId]/teachers/bulk
 *
 * Bulk-invite teachers to an institute by email. Per-email outcome:
 *
 *   - User exists + has a teacher doc        → "attached" (silently linked,
 *                                                no claim needed)
 *   - User exists but is NOT a teacher       → "skipped" (role conflict)
 *   - User exists + already on another inst. → "skipped" (already affiliated)
 *   - Email already on this institute's roster → "skipped" (already invited
 *                                                or active)
 *   - No matching user                       → "invited" (placeholder row
 *                                                created with a one-time
 *                                                `claimToken`; admin can
 *                                                copy /claim/{token} link
 *                                                or email it to the teacher)
 *
 * The teacher claims a token-only invite at /claim/{token} where they set
 * their password and the server creates their Firebase Auth user + teacher
 * doc + flips the invite row to "active" atomically.
 *
 * Seat limit is enforced once, up-front. If the requested batch would push
 * the institute over its seat allocation, we accept up to the cap and
 * report the rest as "skipped" with reason=seat_limit. This keeps partial
 * success better than failing the whole batch.
 *
 * Returns:
 *   { summary: { attached, invited, skipped }, results: [{ email, outcome, ... }] }
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { assertInstituteAdmin, bumpInstituteCounts } from "@/lib/server/institutes";

export const dynamic = "force-dynamic";

const CLAIM_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Outcome = "attached" | "invited" | "skipped";

interface BulkResultRow {
    email: string;
    outcome: Outcome;
    /** For "attached": the teacher's user id. */
    teacherId?: string;
    /** For "invited": the one-time claim token (also embedded in claimUrl). */
    claimToken?: string;
    /** For "invited": full URL the admin can share with the teacher. */
    claimUrl?: string;
    /** For "skipped": short machine-readable reason; surfaced to the admin. */
    reason?:
        | "wrong_role"
        | "already_other_institute"
        | "already_on_roster"
        | "seat_limit"
        | "invalid_email";
    /** Human-friendly explanation of the outcome. */
    message?: string;
}

function normaliseEmail(raw: unknown): string {
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
}

function dedupe(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of list) {
        if (e && !seen.has(e)) {
            seen.add(e);
            out.push(e);
        }
    }
    return out;
}

function publicOriginFromRequest(req: Request): string {
    // Prefer the configured site origin in prod; fall back to the incoming
    // request's host so locally-generated claim links work in dev/emulator
    // without extra env wiring.
    const envOrigin =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "";
    if (envOrigin) return envOrigin.replace(/\/$/, "");
    try {
        const u = new URL(req.url);
        return `${u.protocol}//${u.host}`;
    } catch {
        return "";
    }
}

export async function POST(req: Request, { params }: { params: { instituteId: string } }) {
    try {
        const auth = await assertInstituteAdmin(req, params.instituteId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => ({}));
        const rawEmails = Array.isArray(body.emails) ? body.emails : [];
        if (rawEmails.length === 0) {
            return NextResponse.json(
                { error: "Provide at least one email." },
                { status: 400 }
            );
        }
        if (rawEmails.length > 200) {
            return NextResponse.json(
                { error: "Cap of 200 emails per batch. Split larger lists." },
                { status: 400 }
            );
        }

        const emails = dedupe(rawEmails.map(normaliseEmail).filter(Boolean));
        const invalidCount = rawEmails.length - emails.length;
        const results: BulkResultRow[] = [];

        // Mark obviously-bad inputs first so the response is comprehensive.
        for (const raw of rawEmails) {
            const e = normaliseEmail(raw);
            if (!e) {
                results.push({
                    email: String(raw || "").slice(0, 80),
                    outcome: "skipped",
                    reason: "invalid_email",
                    message: "Not a valid email address",
                });
            }
        }

        // Snapshot current roster once — we'll do all uniqueness + seat
        // checks against this in-memory list rather than re-querying per email.
        const rosterRef = adminDb
            .collection("institutes")
            .doc(params.instituteId)
            .collection("teachers");
        const rosterSnap = await rosterRef.get();
        const existingByEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        let nonRemovedCount = 0;
        rosterSnap.docs.forEach((d) => {
            const data = d.data() || {};
            if (data.email) existingByEmail.set(String(data.email).toLowerCase(), d);
            if (data.status !== "removed") nonRemovedCount += 1;
        });

        const seats: number = auth.institute.subscription?.seats || 5;
        let seatsAvailable = Math.max(0, seats - nonRemovedCount);

        let attachedCount = 0;
        let invitedCount = 0;
        const origin = publicOriginFromRequest(req);

        for (const email of emails) {
            // 1. Already on this institute's roster — skip.
            if (existingByEmail.has(email)) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "already_on_roster",
                    message: "Already invited or already a member of this institute",
                });
                continue;
            }

            // 2. Look up existing Firebase user + teacher doc by email.
            const userSnap = await adminDb
                .collection("users")
                .where("email", "==", email)
                .limit(1)
                .get();
            const userId = userSnap.empty ? null : userSnap.docs[0].id;
            const userData = userSnap.empty ? null : userSnap.docs[0].data() || {};
            const teacherDocSnap = userId
                ? await adminDb.collection("teachers").doc(userId).get()
                : null;
            const isExistingTeacher = Boolean(teacherDocSnap?.exists);

            // 3. User exists but isn't a teacher → skip with reason.
            if (userId && !isExistingTeacher) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "wrong_role",
                    message: `An account exists with this email but isn't a teacher (role=${userData?.role || "unknown"})`,
                });
                continue;
            }

            // 4. Teacher already linked to a different institute → skip.
            if (
                isExistingTeacher &&
                teacherDocSnap?.data()?.instituteId &&
                teacherDocSnap.data()?.instituteId !== params.instituteId
            ) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "already_other_institute",
                    message: "Already affiliated with another institute",
                });
                continue;
            }

            // Seat capacity gate — accept what fits, skip the rest.
            if (seatsAvailable <= 0) {
                results.push({
                    email,
                    outcome: "skipped",
                    reason: "seat_limit",
                    message: "Institute has reached its seat limit",
                });
                continue;
            }
            seatsAvailable -= 1;

            const now = Timestamp.now();

            if (isExistingTeacher && userId) {
                // ── Attach existing teacher ──
                await rosterRef.doc(userId).set({
                    teacherId: userId,
                    email,
                    name: teacherDocSnap?.data()?.profile?.name || userData?.displayName || null,
                    status: "active",
                    invitedAt: now,
                    invitedBy: auth.userId,
                    joinedAt: now,
                    removedAt: null,
                    claimToken: null,
                    claimTokenExpiresAt: null,
                });
                await adminDb
                    .collection("teachers")
                    .doc(userId)
                    .set(
                        { instituteId: params.instituteId, updatedAt: now },
                        { merge: true }
                    );
                results.push({
                    email,
                    outcome: "attached",
                    teacherId: userId,
                    message: "Linked existing teacher account to your institute",
                });
                attachedCount += 1;
                continue;
            }

            // ── Pending invite with claim token ──
            const claimToken = randomUUID();
            const claimTokenExpiresAt = Timestamp.fromMillis(
                Date.now() + CLAIM_TOKEN_TTL_MS
            );
            const docId = `invite:${email}`;
            await rosterRef.doc(docId).set({
                teacherId: docId,
                email,
                name: null,
                status: "invited",
                invitedAt: now,
                invitedBy: auth.userId,
                joinedAt: null,
                removedAt: null,
                claimToken,
                claimTokenExpiresAt,
            });
            const claimUrl = origin
                ? `${origin}/claim/${claimToken}`
                : `/claim/${claimToken}`;
            results.push({
                email,
                outcome: "invited",
                claimToken,
                claimUrl,
                message: "Pending — share the claim link or wait for the email",
            });
            invitedCount += 1;
        }

        // Bump aggregate counters once at the end so we don't issue N writes.
        if (attachedCount > 0 || invitedCount > 0) {
            await bumpInstituteCounts(params.instituteId, {
                teacherCount: attachedCount + invitedCount,
                activeTeacherCount: attachedCount,
            });
        }

        const summary = {
            attached: attachedCount,
            invited: invitedCount,
            skipped: results.filter((r) => r.outcome === "skipped").length,
            invalid: invalidCount,
            seatsRemaining: Math.max(0, seatsAvailable),
        };

        return NextResponse.json({ summary, results });
    } catch (error) {
        const e = error as Error;
        console.error("[bulk teacher invite] failed:", e);
        return NextResponse.json(
            { error: e.message || "Failed to invite teachers" },
            { status: 500 }
        );
    }
}

export function GET() {
    return NextResponse.json(
        { error: "GET not supported; use the /teachers list endpoint." },
        { status: 405 }
    );
}
